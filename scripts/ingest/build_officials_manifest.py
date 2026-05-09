# Run after data ingest or when adding an official.
# Reads Austin + TEC Parquet via DuckDB and writes a merged manifest.

import json
import sys
from pathlib import Path

import duckdb

REPO_ROOT = Path(__file__).resolve().parents[2]
AUSTIN_PARQUET = REPO_ROOT / "data/parquet/austin/cf/contributions.parquet"
TEC_PARQUET = REPO_ROOT / "data/parquet/tec/cf/contributions.parquet"
MAP_JSON = REPO_ROOT / "web/lib/profiles/officials_map.json"
OUT_JSON = REPO_ROOT / "web/lib/profiles/officials_manifest.json"


def main() -> int:
    if not AUSTIN_PARQUET.exists():
        print(f"error: Austin Parquet not found: {AUSTIN_PARQUET}", file=sys.stderr)
        return 1
    if not TEC_PARQUET.exists():
        print(f"error: TEC Parquet not found: {TEC_PARQUET}", file=sys.stderr)
        return 1
    if not MAP_JSON.exists():
        print(f"error: officials_map.json not found: {MAP_JSON}", file=sys.stderr)
        return 1

    with open(MAP_JSON) as f:
        mapping = json.load(f)

    con = duckdb.connect()

    # Attach Parquet files as views so we can query them in-memory.
    con.execute(f"CREATE VIEW austin AS SELECT * FROM read_parquet('{AUSTIN_PARQUET}')")
    con.execute(f"CREATE VIEW tec AS SELECT * FROM read_parquet('{TEC_PARQUET}')")

    results = []

    for entry in mapping:
        slug = entry["slug"]
        austin_recipients = entry.get("austinRecipients", [])
        tec_filers = entry.get("tecFilerNames", [])

        # Austin stats
        if austin_recipients:
            austin_list = ", ".join(repr(r) for r in austin_recipients)
            austin_row = con.execute(f"""
                SELECT
                    COUNT(*) AS donationCount,
                    SUM(CAST(Contribution_Amount AS DECIMAL(14,2))) AS totalRaised,
                    MIN(CAST(Contribution_Year AS INTEGER)) AS minYear,
                    MAX(CAST(Contribution_Year AS INTEGER)) AS maxYear
                FROM austin
                WHERE Recipient IN ({austin_list})
            """).fetchone()
        else:
            austin_row = (0, 0.0, None, None)

        # TEC stats
        # contributionAmount is VARCHAR in the raw TEC schema; cast to DECIMAL.
        if tec_filers:
            tec_list = ", ".join(repr(f) for f in tec_filers)
            tec_row = con.execute(f"""
                SELECT
                    COUNT(*) AS donationCount,
                    SUM(CAST(contributionAmount AS DECIMAL(14,2))) AS totalRaised,
                    MIN(CAST(SUBSTR(receivedDt, 1, 4) AS INTEGER)) AS minYear,
                    MAX(CAST(SUBSTR(receivedDt, 1, 4) AS INTEGER)) AS maxYear
                FROM tec
                WHERE filerName IN ({tec_list})
            """).fetchone()
        else:
            tec_row = (0, 0.0, None, None)

        a_count, a_total, a_min_year, a_max_year = austin_row
        t_count, t_total, t_min_year, t_max_year = tec_row

        a_count = a_count or 0
        a_total = a_total or 0.0
        t_count = t_count or 0
        t_total = t_total or 0.0

        donation_count = a_count + t_count
        total_raised = float(a_total) + float(t_total)

        # weighted average donation
        avg_donation = 0.0
        if donation_count > 0:
            avg_donation = total_raised / donation_count

        # yearsActive = global max year - global min year + 1
        all_years = []
        for y in (a_min_year, a_max_year, t_min_year, t_max_year):
            if y is not None:
                all_years.append(int(y))
        years_active = 0
        if all_years:
            years_active = max(all_years) - min(all_years) + 1

        if donation_count == 0:
            print(f"  warning: {slug} has zero donations; skipping", file=sys.stderr)
            continue

        results.append({
            "slug": slug,
            "donationCount": donation_count,
            "totalRaised": round(total_raised, 2),
            "avgDonation": round(avg_donation, 2),
            "yearsActive": years_active,
        })

    con.close()

    OUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT_JSON, "w") as f:
        json.dump(results, f, indent=2)

    print(f"Wrote {len(results)} officials to {OUT_JSON}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

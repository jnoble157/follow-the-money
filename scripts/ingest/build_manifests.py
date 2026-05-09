from __future__ import annotations

import argparse
import json
import re
import sys
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path
from urllib.parse import quote, urlencode

import duckdb

REPO_ROOT = Path(__file__).resolve().parents[2]
AUSTIN_PARQUET = REPO_ROOT / "data/parquet/austin/cf/contributions.parquet"
AUSTIN_REPORT_PARQUET = REPO_ROOT / "data/parquet/austin/cf/report_detail.parquet"
TEC_PARQUET = REPO_ROOT / "data/parquet/tec/cf/contributions.parquet"
TEC_COVER_PARQUET = REPO_ROOT / "data/parquet/tec/cf/cover_sheet1.parquet"
MAP_JSON = REPO_ROOT / "web/lib/profiles/officials_map.json"
OFFICIALS_JSON = REPO_ROOT / "web/lib/profiles/officials_manifest.json"
OFFICIAL_DETAILS_JSON = REPO_ROOT / "web/lib/profiles/official_details_manifest.json"
DONORS_JSON = REPO_ROOT / "web/lib/profiles/donors_manifest.json"
DONOR_DETAILS_JSON = REPO_ROOT / "web/lib/profiles/donor_details_manifest.json"

AUSTIN_CONTRIBS_DATASET = "https://data.austintexas.gov/d/3kfv-biw6"
TEC_REPORT_VIEWER = "https://jasper.ethics.state.tx.us/jasperserver-pro/flow.html"
TEC_REPORT_UNIT = "/public/publicData/datasource/CFS/By_Report_Number"
# TEC's public search page generates this same pre-auth shape in
# SimpleVisual.js. It carries only the PUBLIC2 viewer account; without it,
# direct report-number links land on Jasper's login page.
TEC_PUBLIC_TOKEN = (
    "u=PUBLIC2|expireTime=Thu Jan 01 2099 00:00:00 GMT-0600 (Central Standard Time)"
)
OFFICIAL_LIMIT = 1200
OFFICIAL_DONOR_LIMIT = 10

STATE_OFFICE_LABELS = {
    "AGRICULTUR": "Agriculture Commissioner",
    "ATTYGEN": "Attorney General",
    "COMPTROLLER": "Comptroller",
    "COMPTROLLR": "Comptroller",
    "GOVERNOR": "Governor",
    "LANDCOMM": "Land Commissioner",
    "LTGOVERNOR": "Lieutenant Governor",
    "PARTYCHAIRCO": "County Party Chair",
    "RRCOMM": "Railroad Commissioner",
    "RRCOMM_UNEXPIRED": "Railroad Commissioner",
    "SOS": "Secretary of State",
    "STATEEDU": "State Board of Education",
    "STATE_CHAIR": "State Chair",
    "STATEREP": "State Representative",
    "STATESEN": "State Senator",
    "CHIEFJUSTICE_SC": "Supreme Court Chief Justice",
    "JUSTICE_SC": "Supreme Court Justice",
    "SCJ": "Supreme Court Justice",
    "SJC": "Supreme Court Justice",
    "CHIEFJUSTICE_COA": "Court of Appeals Chief Justice",
    "JUSTICE_COA": "Court of Appeals Justice",
    "PRESIDINGJUDGE_COCA": "Court of Criminal Appeals Presiding Judge",
    "JUDGE_COCA": "Court of Criminal Appeals Judge",
    "JUDGEDIST": "District Judge",
    "JUDGEDIST_MULTI": "District Judge",
    "JUDGEDIST_FAMILY": "Family District Court Judge",
    "JUDGE_BUS": "Business District Court Judge",
    "JUDGE_SENIOR": "Senior Judge",
    "JUDGESTATCO": "Statutory County Judge",
    "DISTATTY": "District Attorney",
    "DISTATTY_MULTI": "District Attorney",
    "CRIMINAL_DISTATTY": "Criminal District Attorney",
    "CRIMINAL_JUDGEDIST": "Criminal District Court Judge",
    "CRIMINAL_JUDGEDIST_DAL": "Criminal District Court Judge",
    "CRIMINAL_JUDGEDIST_JEF": "Criminal District Court Judge",
    "CRIMINAL_JUDGEDIST_TAR": "Criminal District Court Judge",
}


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Build profile manifests from Austin + TEC contribution Parquet."
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=2200,
        help="number of donor rows to write",
    )
    parser.add_argument(
        "--sample",
        type=int,
        default=0,
        help="read only the first N rows of each Parquet file",
    )
    args = parser.parse_args()

    if args.limit <= 0:
        print("error: --limit must be positive", file=sys.stderr)
        return 1
    if args.sample < 0:
        print("error: --sample must be non-negative", file=sys.stderr)
        return 1

    for path in (AUSTIN_PARQUET, AUSTIN_REPORT_PARQUET, TEC_PARQUET, TEC_COVER_PARQUET, MAP_JSON):
        if not path.exists():
            print(f"error: missing {path}", file=sys.stderr)
            return 1

    with MAP_JSON.open() as f:
        mapping = json.load(f)

    con = duckdb.connect()
    try:
        create_views(con, args.sample)
        create_donor_base(con)
        officials, officials_by_cluster = build_officials(con, mapping)
        donors, donors_by_key = build_donors(con, args.limit)
        official_details = build_official_details(con, officials_by_cluster, donors_by_key)
        donor_summaries = summarize_donors(donors)
        donor_details = [d for d in donors if d["donorType"] == "organization"]
    finally:
        con.close()

    write_json(OFFICIALS_JSON, officials)
    write_json(OFFICIAL_DETAILS_JSON, official_details)
    write_json(DONORS_JSON, donor_summaries)
    write_json(DONOR_DETAILS_JSON, donor_details)
    sample_note = f" from first {args.sample:,} rows of each source" if args.sample else ""
    print(f"Wrote {len(officials)} officials to {OFFICIALS_JSON}{sample_note}")
    print(f"Wrote {len(official_details)} official details to {OFFICIAL_DETAILS_JSON}{sample_note}")
    print(f"Wrote {len(donor_summaries)} donor summaries to {DONORS_JSON}{sample_note}")
    print(f"Wrote {len(donor_details)} donor details to {DONOR_DETAILS_JSON}{sample_note}")
    return 0


def create_views(con: duckdb.DuckDBPyConnection, sample: int) -> None:
    con.execute(f"CREATE TEMP VIEW austin AS {parquet_select(AUSTIN_PARQUET, sample)}")
    con.execute(f"CREATE TEMP VIEW austin_report AS {parquet_select(AUSTIN_REPORT_PARQUET, sample)}")
    con.execute(f"CREATE TEMP VIEW tec AS {parquet_select(TEC_PARQUET, sample)}")
    con.execute(f"CREATE TEMP VIEW tec_cover AS {parquet_select(TEC_COVER_PARQUET, sample)}")
    con.execute(
        r"""
        CREATE OR REPLACE MACRO clean_value(s) AS
          NULLIF(TRIM(COALESCE(s, '')), '');
        """
    )
    con.execute(
        r"""
        CREATE OR REPLACE MACRO clean_name(s) AS
          NULLIF(REGEXP_REPLACE(UPPER(TRIM(COALESCE(s, ''))), '\s+', ' ', 'g'), '');
        """
    )
    con.execute(
        r"""
        CREATE OR REPLACE MACRO zip5(s) AS
          NULLIF(REGEXP_EXTRACT(COALESCE(s, ''), '([0-9]{5})', 1), '');
        """
    )
    con.execute(
        r"""
        CREATE OR REPLACE MACRO tec_person_name(last_name, first_name) AS
          CASE
            WHEN clean_value(last_name) IS NOT NULL AND clean_value(first_name) IS NOT NULL
              THEN clean_value(last_name) || ', ' || clean_value(first_name)
            WHEN clean_value(last_name) IS NOT NULL
              THEN clean_value(last_name)
            ELSE clean_value(first_name)
          END;
        """
    )
    con.execute(
        r"""
        CREATE OR REPLACE MACRO austin_donor_name(donor, donor_type) AS
          CASE
            WHEN UPPER(COALESCE(donor_type, '')) = 'INDIVIDUAL'
             AND STRPOS(TRIM(COALESCE(donor, '')), ',') = 0
             AND REGEXP_MATCHES(TRIM(COALESCE(donor, '')), '^[^ ]+\s+.+[^ ]$')
              THEN REGEXP_REPLACE(TRIM(donor), '^(.*)\s+([^\s]+)$', '\2, \1')
            ELSE clean_value(donor)
          END;
        """
    )


def parquet_select(path: Path, sample: int) -> str:
    escaped = path.as_posix().replace("'", "''")
    base = f"SELECT * FROM read_parquet('{escaped}')"
    if sample:
        return f"SELECT * FROM ({base}) LIMIT {int(sample)}"
    return base


def build_officials(
    con: duckdb.DuckDBPyConnection,
    mapping: list[dict],
) -> tuple[list[dict], dict[str, dict]]:
    con.execute(
        """
        CREATE TEMP TABLE official_target (
          ord INTEGER,
          slug VARCHAR,
          source VARCHAR,
          name VARCHAR
        )
        """
    )
    rows = []
    for i, entry in enumerate(mapping):
        for recipient in entry.get("austinRecipients", []):
            rows.append((i, entry["slug"], "austin", recipient))
        for filer in entry.get("tecFilerNames", []):
            rows.append((i, entry["slug"], "tec", filer))
    if rows:
        con.executemany("INSERT INTO official_target VALUES (?, ?, ?, ?)", rows)

    create_official_contrib_base(con)

    out_rows = con.execute(
        """
        WITH summary AS (
          SELECT
            clusterKey,
            MIN(manualSlug) FILTER (WHERE manualSlug IS NOT NULL) AS manualSlug,
            MAX(CASE WHEN dataset = 'tec' THEN 1 ELSE 0 END)::INTEGER AS hasTec,
            MAX(CASE WHEN dataset = 'austin' THEN 1 ELSE 0 END)::INTEGER AS hasAustin,
            COUNT(*)::INTEGER AS contributionCount,
            SUM(amount) AS totalRaised,
            MIN(year) FILTER (WHERE year IS NOT NULL) AS minYear,
            MAX(year) FILTER (WHERE year IS NOT NULL) AS maxYear
          FROM official_contrib_base
          WHERE amount IS NOT NULL
          GROUP BY clusterKey
          HAVING SUM(amount) > 0
        ),
        display_counts AS (
          SELECT clusterKey, rawRecipient, COUNT(*) AS n
          FROM official_contrib_base
          WHERE rawRecipient IS NOT NULL
          GROUP BY clusterKey, rawRecipient
        ),
        display_ranked AS (
          SELECT
            clusterKey,
            rawRecipient,
            ROW_NUMBER() OVER (PARTITION BY clusterKey ORDER BY n DESC, rawRecipient) AS rn
          FROM display_counts
        ),
        role_rows AS (
          SELECT
            COALESCE(t.slug, 'austin|' || clean_name(r.Filer_Name)) AS clusterKey,
            'austin' AS roleSource,
            clean_value(r.Office_Held) AS holdOffice,
            NULL::VARCHAR AS holdDistrict,
            clean_value(r.Office_Sought) AS seekOffice,
            NULL::VARCHAR AS seekDistrict,
            clean_value(r.Date_Filed) AS filedText
          FROM austin_report r
          LEFT JOIN official_target t ON t.source = 'austin' AND t.name = r.Filer_Name
          WHERE clean_value(r.Filer_Name) IS NOT NULL
            AND (
              REGEXP_MATCHES(
                UPPER(COALESCE(r.Office_Held, '') || ' ' || COALESCE(r.Office_Sought, '')),
                '(MAYOR|COUNCIL|DISTRICT [0-9])'
              )
              OR t.slug IS NOT NULL
            )

          UNION ALL

          SELECT
            COALESCE(t.slug, 'tec|' || clean_value(c.filerIdent)) AS clusterKey,
            'tec' AS roleSource,
            clean_value(c.filerHoldOfficeCd) AS holdOffice,
            clean_value(c.filerHoldOfficeDistrict) AS holdDistrict,
            clean_value(c.filerSeekOfficeCd) AS seekOffice,
            clean_value(c.filerSeekOfficeDistrict) AS seekDistrict,
            clean_value(c.filedDt) AS filedText
          FROM tec_cover c
          LEFT JOIN official_target t ON t.source = 'tec' AND t.name = c.filerName
          WHERE clean_value(c.filerIdent) IS NOT NULL
            AND (
              c.filerTypeCd IN ('COH', 'JCOH', 'SCC')
              OR c.formTypeCd IN ('COH', 'JCOH', 'SCCOH', 'DAILYCCOH', 'CORCOH', 'CORJCOH')
              OR t.slug IS NOT NULL
            )
        ),
        role_ranked AS (
          SELECT
            clusterKey,
            roleSource,
            holdOffice,
            holdDistrict,
            seekOffice,
            seekDistrict,
            ROW_NUMBER() OVER (
              PARTITION BY clusterKey
              ORDER BY filedText DESC NULLS LAST
            ) AS rn
          FROM role_rows
        ),
        largest_ranked AS (
          SELECT
            b.*,
            ROW_NUMBER() OVER (
              PARTITION BY b.clusterKey
              ORDER BY b.amount DESC, b.sourceRowId
            ) AS rn
          FROM official_contrib_base b
        ),
        joined AS (
          SELECT
            s.clusterKey,
            s.manualSlug,
            s.hasTec,
            s.hasAustin,
            s.contributionCount,
            s.totalRaised,
            s.minYear,
            s.maxYear,
            d.rawRecipient,
            r.roleSource,
            r.holdOffice,
            r.holdDistrict,
            r.seekOffice,
            r.seekDistrict,
            l.dataset,
            l.sourceRowId,
            l.rawDonor,
            l.rawRecipient AS sourceRecipient,
            l.amount AS sourceAmount,
            l.dateText AS sourceDate,
            ROW_NUMBER() OVER (
              ORDER BY s.totalRaised DESC, d.rawRecipient
            ) AS overallRank
          FROM summary s
          LEFT JOIN display_ranked d ON d.clusterKey = s.clusterKey AND d.rn = 1
          LEFT JOIN role_ranked r ON r.clusterKey = s.clusterKey AND r.rn = 1
          LEFT JOIN largest_ranked l ON l.clusterKey = s.clusterKey AND l.rn = 1
        )
        SELECT
          clusterKey,
          manualSlug,
          hasTec,
          hasAustin,
          contributionCount,
          totalRaised,
          minYear,
          maxYear,
          rawRecipient,
          roleSource,
          holdOffice,
          holdDistrict,
          seekOffice,
          seekDistrict,
          dataset,
          sourceRowId,
          rawDonor,
          sourceRecipient,
          sourceAmount,
          sourceDate
        FROM joined
        WHERE manualSlug IS NOT NULL OR overallRank <= ?
        ORDER BY totalRaised DESC, rawRecipient
        """
        ,
        [OFFICIAL_LIMIT],
    ).fetchall()

    seen = {row[1] for row in out_rows if row[1]}
    for entry in mapping:
        if entry["slug"] not in seen:
            print(f"  warning: {entry['slug']} has zero contributions; skipping", file=sys.stderr)

    results = []
    results_by_cluster: dict[str, dict] = {}
    used_slugs: dict[str, int] = {}
    for row in out_rows:
        (
            cluster_key,
            manual_slug,
            has_tec,
            has_austin,
            count,
            total,
            min_year,
            max_year,
            raw_name,
            role_source,
            hold_office,
            hold_district,
            seek_office,
            seek_district,
            dataset,
            source_row_id,
            source_donor,
            source_recipient,
            source_amount,
            source_date,
        ) = row
        display_name = official_display_name(raw_name or cluster_key)
        if manual_slug:
            slug = manual_slug
            used_slugs[slug] = used_slugs.get(slug, 0) + 1
        else:
            slug = unique_slug(public_official_slug(display_name, cluster_key), used_slugs)
        total_money = money_number(total)
        avg = money_number(Decimal(total) / Decimal(count)) if count else 0.0
        years_active = int(max_year - min_year + 1) if min_year is not None else 0
        source = contribution_citation(
            dataset=dataset,
            row_id=source_row_id,
            donor=source_donor or "Unknown contributor",
            recipient=source_recipient or display_name,
            amount=source_amount,
            date_text=source_date,
        )
        official = {
            "slug": slug,
            "name": display_name,
            "role": official_role(
                role_source,
                hold_office,
                hold_district,
                seek_office,
                seek_district,
            ),
            "jurisdiction": "tx_state" if has_tec else "austin",
            "donationCount": int(count),
            "totalRaised": total_money,
            "avgDonation": avg,
            "yearsActive": years_active,
            "source": source,
            "topOrganizationDonors": [],
        }
        results.append(official)
        results_by_cluster[cluster_key] = official

    create_official_link_map(con, results_by_cluster)
    return results, results_by_cluster


def create_official_contrib_base(con: duckdb.DuckDBPyConnection) -> None:
    con.execute(
        r"""
        CREATE TEMP TABLE austin_public_recipients AS
        SELECT DISTINCT clean_name(Filer_Name) AS recipientName
        FROM austin_report
        WHERE clean_value(Filer_Name) IS NOT NULL
          AND REGEXP_MATCHES(
            UPPER(COALESCE(Office_Held, '') || ' ' || COALESCE(Office_Sought, '')),
            '(MAYOR|COUNCIL|DISTRICT [0-9])'
          )
        """
    )
    con.execute(
        r"""
        CREATE TEMP TABLE official_contrib_base AS
        SELECT
          dataset,
          sourceRowId,
          recipientKey,
          clusterKey,
          manualSlug,
          rawRecipient,
          rawDonor,
          amount,
          year,
          dateText
        FROM (
          SELECT
            'austin' AS dataset,
            clean_value(a.TRANSACTION_ID) AS sourceRowId,
            'austin|' || clean_name(a.Recipient) AS recipientKey,
            COALESCE(t.slug, 'austin|' || clean_name(a.Recipient)) AS clusterKey,
            t.slug AS manualSlug,
            clean_value(a.Recipient) AS rawRecipient,
            clean_value(a.Donor) AS rawDonor,
            TRY_CAST(a.Contribution_Amount AS DECIMAL(18,2)) AS amount,
            TRY_CAST(a.Contribution_Year AS INTEGER) AS year,
            clean_value(a.Contribution_Date) AS dateText
          FROM austin a
          LEFT JOIN official_target t ON t.source = 'austin' AND t.name = a.Recipient
          LEFT JOIN austin_public_recipients p ON p.recipientName = clean_name(a.Recipient)
          WHERE p.recipientName IS NOT NULL OR t.slug IS NOT NULL

          UNION ALL

          SELECT
            'tec' AS dataset,
            clean_value(c.reportInfoIdent) AS sourceRowId,
            'tec|' || clean_value(c.filerIdent) AS recipientKey,
            COALESCE(t.slug, 'tec|' || clean_value(c.filerIdent)) AS clusterKey,
            t.slug AS manualSlug,
            clean_value(c.filerName) AS rawRecipient,
            clean_value(
              CASE
                WHEN c.contributorPersentTypeCd = 'INDIVIDUAL'
                  THEN tec_person_name(c.contributorNameLast, c.contributorNameFirst)
                ELSE COALESCE(c.contributorNameOrganization, c.contributorNameShort)
              END
            ) AS rawDonor,
            TRY_CAST(c.contributionAmount AS DECIMAL(18,2)) AS amount,
            TRY_CAST(SUBSTR(c.contributionDt, 1, 4) AS INTEGER) AS year,
            CASE
              WHEN REGEXP_MATCHES(COALESCE(c.contributionDt, ''), '^[0-9]{8}$')
                THEN SUBSTR(c.contributionDt, 1, 4) || '-' || SUBSTR(c.contributionDt, 5, 2) || '-' || SUBSTR(c.contributionDt, 7, 2)
              ELSE clean_value(c.contributionDt)
            END AS dateText
          FROM tec c
          LEFT JOIN official_target t ON t.source = 'tec' AND t.name = c.filerName
          WHERE clean_value(c.filerIdent) IS NOT NULL
            AND COALESCE(c.infoOnlyFlag, '') <> 'Y'
            AND (
              c.filerTypeCd IN ('COH', 'JCOH', 'SCC')
              OR t.slug IS NOT NULL
            )
        )
        WHERE sourceRowId IS NOT NULL
          AND recipientKey IS NOT NULL
          AND clusterKey IS NOT NULL
          AND rawRecipient IS NOT NULL
          AND amount IS NOT NULL
        """
    )


def create_official_link_map(
    con: duckdb.DuckDBPyConnection,
    officials_by_cluster: dict[str, dict],
) -> None:
    rows = []
    for recipient_key, cluster_key in con.execute(
        """
        SELECT DISTINCT recipientKey, clusterKey
        FROM official_contrib_base
        """
    ).fetchall():
        official = officials_by_cluster.get(cluster_key)
        if not official:
            continue
        rows.append(
            (
                recipient_key,
                cluster_key,
                official["slug"],
                official["name"],
                official["role"],
                official["jurisdiction"],
            )
        )
    con.execute(
        """
        CREATE TEMP TABLE official_link_map (
          recipientKey VARCHAR,
          clusterKey VARCHAR,
          slug VARCHAR,
          name VARCHAR,
          role VARCHAR,
          jurisdiction VARCHAR
        )
        """
    )
    if rows:
        con.executemany("INSERT INTO official_link_map VALUES (?, ?, ?, ?, ?, ?)", rows)


def build_donors(con: duckdb.DuckDBPyConnection, limit: int) -> tuple[list[dict], dict[str, dict]]:
    con.execute(
        f"""
        CREATE TEMP TABLE top_donor_keys AS
        SELECT
          clean_name(normalizedName) || '|' || donorType AS donorKey,
          clean_name(normalizedName) AS normalizedName,
          donorType,
          SUM(amount) AS total,
          COUNT(*)::INTEGER AS contributionCount,
          MIN(year) FILTER (WHERE year IS NOT NULL) AS minYear,
          MAX(year) FILTER (WHERE year IS NOT NULL) AS maxYear,
          SUM(CASE WHEN donorType = 'individual' THEN 1 ELSE 0 END)::INTEGER AS individualRows,
          SUM(CASE WHEN donorType = 'organization' THEN 1 ELSE 0 END)::INTEGER AS organizationRows
        FROM donor_base
        GROUP BY donorKey, normalizedName, donorType
        HAVING SUM(amount) > 0
        ORDER BY total DESC, normalizedName
        LIMIT {int(limit)}
        """
    )

    summaries = con.execute(
        """
        WITH display_counts AS (
          SELECT b.donorKey, b.rawName, COUNT(*) AS n
          FROM donor_base b
          JOIN top_donor_keys k ON b.donorKey = k.donorKey
          WHERE b.rawName IS NOT NULL
          GROUP BY b.donorKey, b.rawName
        ),
        display_ranked AS (
          SELECT
            donorKey,
            rawName,
            ROW_NUMBER() OVER (PARTITION BY donorKey ORDER BY n DESC, rawName) AS rn
          FROM display_counts
        ),
        employer_counts AS (
          SELECT b.donorKey, b.employer, COUNT(*) AS n
          FROM donor_base b
          JOIN top_donor_keys k ON b.donorKey = k.donorKey
          WHERE b.employer IS NOT NULL
          GROUP BY b.donorKey, b.employer
        ),
        employer_ranked AS (
          SELECT
            donorKey,
            employer,
            ROW_NUMBER() OVER (PARTITION BY donorKey ORDER BY n DESC, employer) AS rn
          FROM employer_counts
        ),
        city_counts AS (
          SELECT b.donorKey, b.city, COUNT(*) AS n
          FROM donor_base b
          JOIN top_donor_keys k ON b.donorKey = k.donorKey
          WHERE b.city IS NOT NULL
          GROUP BY b.donorKey, b.city
        ),
        city_ranked AS (
          SELECT
            donorKey,
            city,
            ROW_NUMBER() OVER (PARTITION BY donorKey ORDER BY n DESC, city) AS rn
          FROM city_counts
        ),
        zip_counts AS (
          SELECT b.donorKey, b.zipKey, COUNT(*) AS n, SUM(b.amount) AS total
          FROM donor_base b
          JOIN top_donor_keys k ON b.donorKey = k.donorKey
          WHERE b.zipKey IS NOT NULL
          GROUP BY b.donorKey, b.zipKey
        ),
        zip_ranked AS (
          SELECT
            donorKey,
            zipKey,
            ROW_NUMBER() OVER (
              PARTITION BY donorKey
              ORDER BY n DESC, total DESC, zipKey
            ) AS rn
          FROM zip_counts
        ),
        largest_ranked AS (
          SELECT
            b.*,
            ROW_NUMBER() OVER (
              PARTITION BY b.donorKey
              ORDER BY b.amount DESC, b.sourceRowId
            ) AS rn
          FROM donor_base b
          JOIN top_donor_keys k ON b.donorKey = k.donorKey
        )
        SELECT
          k.donorKey,
          k.normalizedName,
          z.zipKey,
          k.total,
          k.contributionCount,
          k.minYear,
          k.maxYear,
          k.individualRows,
          k.organizationRows,
          COALESCE(d.rawName, k.normalizedName) AS displayName,
          e.employer AS primaryEmployer,
          c.city AS primaryCity,
          l.dataset,
          l.sourceRowId,
          l.rawName AS sourceDonor,
          l.recipient AS sourceRecipient,
          l.amount AS sourceAmount,
          l.dateText AS sourceDate
        FROM top_donor_keys k
        LEFT JOIN display_ranked d ON d.donorKey = k.donorKey AND d.rn = 1
        LEFT JOIN employer_ranked e ON e.donorKey = k.donorKey AND e.rn = 1
        LEFT JOIN city_ranked c ON c.donorKey = k.donorKey AND c.rn = 1
        LEFT JOIN zip_ranked z ON z.donorKey = k.donorKey AND z.rn = 1
        LEFT JOIN largest_ranked l ON l.donorKey = k.donorKey AND l.rn = 1
        ORDER BY k.total DESC, k.normalizedName
        """
    ).fetchall()

    donors: dict[str, dict] = {}
    used_slugs: dict[str, int] = {}
    for row in summaries:
        (
            donor_key,
            normalized_name,
            zip_key,
            total,
            count,
            min_year,
            max_year,
            individual_rows,
            organization_rows,
            display_name,
            primary_employer,
            primary_city,
            dataset,
            source_row_id,
            source_donor,
            source_recipient,
            source_amount,
            source_date,
        ) = row
        base_slug = donor_slug(normalized_name, zip_key)
        slug_count = used_slugs.get(base_slug, 0) + 1
        used_slugs[base_slug] = slug_count
        slug = base_slug if slug_count == 1 else f"{base_slug}-{slug_count}"
        total_money = money_number(total)
        avg = money_number(Decimal(total) / Decimal(count)) if count else 0.0
        years_active = int(max_year - min_year + 1) if min_year is not None else 0
        donor_type = "individual" if individual_rows >= organization_rows else "organization"
        source = contribution_citation(
            dataset=dataset,
            row_id=source_row_id,
            donor=source_donor or display_name,
            recipient=source_recipient,
            amount=source_amount,
            date_text=source_date,
        )
        donors[donor_key] = {
            "slug": slug,
            "displayName": display_name,
            "donorType": donor_type,
            "totalGiven": total_money,
            "contributionCount": int(count),
            "avgContribution": avg,
            "primaryEmployer": primary_employer,
            "primaryCity": primary_city,
            "primaryZip": zip_key,
            "yearsActive": years_active,
            "source": source,
            "topRecipients": [],
            "yearlyTotals": [],
            "employerVariants": [],
        }

    for row in donor_recipient_rows(con):
        (
            donor_key,
            recipient,
            total,
            contribution_count,
            recipient_slug,
            recipient_role,
            recipient_jurisdiction,
            dataset,
            row_id,
            donor,
            source_amount,
            date_text,
        ) = row
        entry = donors.get(donor_key)
        if not entry:
            continue
        item = {
            "recipient": recipient,
            "total": money_number(total),
            "contributionCount": int(contribution_count),
            "source": contribution_citation(
                dataset=dataset,
                row_id=row_id,
                donor=donor or entry["displayName"],
                recipient=recipient,
                amount=source_amount,
                date_text=date_text,
            ),
        }
        if recipient_slug:
            item["recipientSlug"] = recipient_slug
            item["recipientRole"] = recipient_role
            item["recipientJurisdiction"] = recipient_jurisdiction
        entry["topRecipients"].append(item)

    for row in donor_yearly_rows(con):
        (
            donor_key,
            year,
            total,
            contribution_count,
            dataset,
            row_id,
            donor,
            recipient,
            source_amount,
            date_text,
        ) = row
        entry = donors.get(donor_key)
        if not entry:
            continue
        entry["yearlyTotals"].append(
            {
                "year": int(year),
                "total": money_number(total),
                "contributionCount": int(contribution_count),
                "source": contribution_citation(
                    dataset=dataset,
                    row_id=row_id,
                    donor=donor or entry["displayName"],
                    recipient=recipient,
                    amount=source_amount,
                    date_text=date_text,
                ),
            }
        )

    for donor_key, employer in donor_employer_rows(con):
        entry = donors.get(donor_key)
        if entry:
            entry["employerVariants"].append(employer)

    return list(donors.values()), donors


def create_donor_base(con: duckdb.DuckDBPyConnection) -> None:
    con.execute(
        r"""
        CREATE TEMP TABLE donor_base AS
        SELECT
          dataset,
          sourceRowId,
          rawName,
          normalizedName,
          COALESCE(zipKey, 'unknown') AS zipKey,
          clean_name(normalizedName) || '|' || donorType AS donorKey,
          donorType,
          city,
          employer,
          recipient,
          recipientKey,
          recipientFilerIdent,
          recipientFilerType,
          amount,
          year,
          dateText
        FROM (
          SELECT
            'austin' AS dataset,
            clean_value(TRANSACTION_ID) AS sourceRowId,
            clean_value(Donor) AS rawName,
            clean_name(austin_donor_name(Donor, Donor_Type)) AS normalizedName,
            zip5(City_State_Zip) AS zipKey,
            CASE
              WHEN UPPER(COALESCE(Donor_Type, '')) = 'INDIVIDUAL'
                THEN 'individual'
              ELSE 'organization'
            END AS donorType,
            clean_value(REGEXP_EXTRACT(COALESCE(City_State_Zip, ''), '^([^,]+)', 1)) AS city,
            clean_value(Donor_Reported_Employer) AS employer,
            clean_value(Recipient) AS recipient,
            'austin|' || clean_name(Recipient) AS recipientKey,
            NULL::VARCHAR AS recipientFilerIdent,
            'AUSTIN' AS recipientFilerType,
            TRY_CAST(Contribution_Amount AS DECIMAL(18,2)) AS amount,
            TRY_CAST(Contribution_Year AS INTEGER) AS year,
            clean_value(Contribution_Date) AS dateText
          FROM austin

          UNION ALL

          SELECT
            'tec' AS dataset,
            clean_value(reportInfoIdent) AS sourceRowId,
            clean_value(
              CASE
                WHEN contributorPersentTypeCd = 'INDIVIDUAL'
                  THEN tec_person_name(contributorNameLast, contributorNameFirst)
                ELSE COALESCE(contributorNameOrganization, contributorNameShort)
              END
            ) AS rawName,
            clean_name(
              CASE
                WHEN contributorPersentTypeCd = 'INDIVIDUAL'
                  THEN tec_person_name(contributorNameLast, contributorNameFirst)
                ELSE COALESCE(contributorNameOrganization, contributorNameShort)
              END
            ) AS normalizedName,
            zip5(contributorStreetPostalCode) AS zipKey,
            CASE
              WHEN contributorPersentTypeCd = 'INDIVIDUAL'
                THEN 'individual'
              ELSE 'organization'
            END AS donorType,
            clean_value(contributorStreetCity) AS city,
            clean_value(contributorEmployer) AS employer,
            clean_value(filerName) AS recipient,
            'tec|' || clean_value(filerIdent) AS recipientKey,
            clean_value(filerIdent) AS recipientFilerIdent,
            clean_value(filerTypeCd) AS recipientFilerType,
            TRY_CAST(contributionAmount AS DECIMAL(18,2)) AS amount,
            TRY_CAST(SUBSTR(contributionDt, 1, 4) AS INTEGER) AS year,
            CASE
              WHEN REGEXP_MATCHES(COALESCE(contributionDt, ''), '^[0-9]{8}$')
                THEN SUBSTR(contributionDt, 1, 4) || '-' || SUBSTR(contributionDt, 5, 2) || '-' || SUBSTR(contributionDt, 7, 2)
              ELSE clean_value(contributionDt)
            END AS dateText
          FROM tec
          WHERE contributorPersentTypeCd IN ('INDIVIDUAL', 'ENTITY')
            AND COALESCE(infoOnlyFlag, '') <> 'Y'
        )
        WHERE sourceRowId IS NOT NULL
          AND normalizedName IS NOT NULL
          AND recipientKey IS NOT NULL
          AND amount IS NOT NULL
        """
    )


def donor_recipient_rows(con: duckdb.DuckDBPyConnection) -> list[tuple]:
    return con.execute(
        """
        WITH rows AS (
          SELECT
            b.*,
            COALESCE(l.slug, b.recipientKey) AS recipientGroup,
            l.slug AS recipientSlug,
            l.name AS recipientName,
            l.role AS recipientRole,
            l.jurisdiction AS recipientJurisdiction
          FROM donor_base b
          JOIN top_donor_keys k ON b.donorKey = k.donorKey
          LEFT JOIN official_link_map l ON l.recipientKey = b.recipientKey
          WHERE b.recipient IS NOT NULL
        ),
        recipient_totals AS (
          SELECT
            donorKey,
            recipientGroup,
            MAX(recipientSlug) AS recipientSlug,
            MAX(recipientName) AS recipientName,
            MAX(recipientRole) AS recipientRole,
            MAX(recipientJurisdiction) AS recipientJurisdiction,
            COUNT(*)::INTEGER AS contributionCount,
            SUM(amount) AS total
          FROM rows
          GROUP BY donorKey, recipientGroup
        ),
        display_counts AS (
          SELECT donorKey, recipientGroup, recipient, COUNT(*) AS n
          FROM rows
          GROUP BY donorKey, recipientGroup, recipient
        ),
        display_ranked AS (
          SELECT
            donorKey,
            recipientGroup,
            recipient,
            ROW_NUMBER() OVER (
              PARTITION BY donorKey, recipientGroup
              ORDER BY n DESC, recipient
            ) AS rn
          FROM display_counts
        ),
        ranked AS (
          SELECT
            *,
            ROW_NUMBER() OVER (
              PARTITION BY donorKey
              ORDER BY total DESC, COALESCE(recipientName, recipientGroup)
            ) AS rn
          FROM recipient_totals
        ),
        largest AS (
          SELECT
            donorKey,
            recipientGroup,
            dataset,
            sourceRowId,
            rawName,
            amount,
            dateText,
            ROW_NUMBER() OVER (
              PARTITION BY donorKey, recipientGroup
              ORDER BY amount DESC, sourceRowId
            ) AS rn
          FROM rows
        )
        SELECT
          r.donorKey,
          COALESCE(r.recipientName, d.recipient) AS recipient,
          r.total,
          r.contributionCount,
          r.recipientSlug,
          r.recipientRole,
          r.recipientJurisdiction,
          l.dataset,
          l.sourceRowId,
          l.rawName,
          l.amount,
          l.dateText
        FROM ranked r
        LEFT JOIN display_ranked d
          ON d.donorKey = r.donorKey
         AND d.recipientGroup = r.recipientGroup
         AND d.rn = 1
        JOIN largest l
          ON l.donorKey = r.donorKey
         AND l.recipientGroup = r.recipientGroup
         AND l.rn = 1
        WHERE r.rn <= 8
        ORDER BY r.donorKey, r.rn
        """
    ).fetchall()


def donor_yearly_rows(con: duckdb.DuckDBPyConnection) -> list[tuple]:
    return con.execute(
        """
        WITH yearly_totals AS (
          SELECT
            b.donorKey,
            b.year,
            COUNT(*)::INTEGER AS contributionCount,
            SUM(b.amount) AS total
          FROM donor_base b
          JOIN top_donor_keys k ON b.donorKey = k.donorKey
          WHERE b.year IS NOT NULL
          GROUP BY b.donorKey, b.year
        ),
        largest AS (
          SELECT
            b.donorKey,
            b.year,
            b.dataset,
            b.sourceRowId,
            b.rawName,
            b.recipient,
            b.amount,
            b.dateText,
            ROW_NUMBER() OVER (
              PARTITION BY b.donorKey, b.year
              ORDER BY b.amount DESC, b.sourceRowId
            ) AS rn
          FROM donor_base b
          JOIN top_donor_keys k ON b.donorKey = k.donorKey
          WHERE b.year IS NOT NULL
        )
        SELECT
          y.donorKey,
          y.year,
          y.total,
          y.contributionCount,
          l.dataset,
          l.sourceRowId,
          l.rawName,
          l.recipient,
          l.amount,
          l.dateText
        FROM yearly_totals y
        JOIN largest l ON l.donorKey = y.donorKey AND l.year = y.year AND l.rn = 1
        ORDER BY y.donorKey, y.year
        """
    ).fetchall()


def donor_employer_rows(con: duckdb.DuckDBPyConnection) -> list[tuple[str, str]]:
    return con.execute(
        """
        SELECT donorKey, employer
        FROM (
          SELECT
            b.donorKey,
            b.employer,
            COUNT(*) AS n
          FROM donor_base b
          JOIN top_donor_keys k ON b.donorKey = k.donorKey
          WHERE b.employer IS NOT NULL
          GROUP BY b.donorKey, b.employer
        )
        ORDER BY donorKey, n DESC, employer
        """
    ).fetchall()


def build_official_details(
    con: duckdb.DuckDBPyConnection,
    officials_by_cluster: dict[str, dict],
    donors_by_key: dict[str, dict],
) -> list[dict]:
    aliases_by_cluster: dict[str, list[str]] = {k: [] for k in officials_by_cluster}
    for cluster_key, raw_name in official_alias_rows(con):
        aliases = aliases_by_cluster.get(cluster_key)
        if aliases is not None and raw_name not in aliases:
            aliases.append(raw_name)

    donors_by_cluster: dict[str, list[dict]] = {k: [] for k in officials_by_cluster}
    for row in official_donor_rows(con):
        (
            cluster_key,
            donor_key,
            display_name,
            count,
            total,
            dataset,
            row_id,
            source_donor,
            recipient,
            source_amount,
            date_text,
        ) = row
        items = donors_by_cluster.get(cluster_key)
        if items is None:
            continue
        donor = donors_by_key.get(donor_key)
        item = {
            "displayName": donor["displayName"] if donor else display_name,
            "total": money_number(total),
            "contributionCount": int(count),
            "source": contribution_citation(
                dataset=dataset,
                row_id=row_id,
                donor=source_donor or display_name,
                recipient=recipient,
                amount=source_amount,
                date_text=date_text,
            ),
        }
        if donor and donor["donorType"] == "organization":
            item["donorSlug"] = donor["slug"]
        items.append(item)

    details = []
    for cluster_key, official in officials_by_cluster.items():
        top_donors = donors_by_cluster.get(cluster_key, [])
        official["topOrganizationDonors"] = top_donors[:3]
        detail = dict(official)
        detail["aliases"] = aliases_by_cluster.get(cluster_key, [])
        detail["topOrganizationDonors"] = top_donors
        details.append(detail)
    details.sort(key=lambda row: (-row["totalRaised"], row["name"]))
    return details


def official_alias_rows(con: duckdb.DuckDBPyConnection) -> list[tuple[str, str]]:
    return con.execute(
        """
        SELECT clusterKey, rawRecipient
        FROM (
          SELECT
            clusterKey,
            rawRecipient,
            COUNT(*) AS n
          FROM official_contrib_base
          WHERE rawRecipient IS NOT NULL
          GROUP BY clusterKey, rawRecipient
        )
        ORDER BY clusterKey, n DESC, rawRecipient
        """
    ).fetchall()


def official_donor_rows(con: duckdb.DuckDBPyConnection) -> list[tuple]:
    return con.execute(
        """
        WITH rows AS (
          SELECT
            l.clusterKey,
            b.donorKey,
            b.rawName,
            b.recipient,
            b.dataset,
            b.sourceRowId,
            b.amount,
            b.dateText
          FROM donor_base b
          JOIN official_link_map l ON l.recipientKey = b.recipientKey
          WHERE b.donorType = 'organization'
            AND b.rawName IS NOT NULL
            AND b.amount IS NOT NULL
        ),
        totals AS (
          SELECT
            clusterKey,
            donorKey,
            COUNT(*)::INTEGER AS contributionCount,
            SUM(amount) AS total
          FROM rows
          GROUP BY clusterKey, donorKey
          HAVING SUM(amount) > 0
        ),
        display_counts AS (
          SELECT clusterKey, donorKey, rawName, COUNT(*) AS n
          FROM rows
          GROUP BY clusterKey, donorKey, rawName
        ),
        display_ranked AS (
          SELECT
            clusterKey,
            donorKey,
            rawName,
            ROW_NUMBER() OVER (
              PARTITION BY clusterKey, donorKey
              ORDER BY n DESC, rawName
            ) AS rn
          FROM display_counts
        ),
        largest AS (
          SELECT
            clusterKey,
            donorKey,
            dataset,
            sourceRowId,
            rawName,
            recipient,
            amount,
            dateText,
            ROW_NUMBER() OVER (
              PARTITION BY clusterKey, donorKey
              ORDER BY amount DESC, sourceRowId
            ) AS rn
          FROM rows
        ),
        ranked AS (
          SELECT
            *,
            ROW_NUMBER() OVER (
              PARTITION BY clusterKey
              ORDER BY total DESC, donorKey
            ) AS rn
          FROM totals
        )
        SELECT
          r.clusterKey,
          r.donorKey,
          d.rawName AS displayName,
          r.contributionCount,
          r.total,
          l.dataset,
          l.sourceRowId,
          l.rawName AS sourceDonor,
          l.recipient,
          l.amount AS sourceAmount,
          l.dateText
        FROM ranked r
        JOIN display_ranked d
          ON d.clusterKey = r.clusterKey
         AND d.donorKey = r.donorKey
         AND d.rn = 1
        JOIN largest l
          ON l.clusterKey = r.clusterKey
         AND l.donorKey = r.donorKey
         AND l.rn = 1
        WHERE r.rn <= ?
        ORDER BY r.clusterKey, r.rn
        """,
        [OFFICIAL_DONOR_LIMIT],
    ).fetchall()


def official_display_name(name: str) -> str:
    cleaned = re.sub(r"\s*\([^)]+\)", "", name).strip()
    cleaned = re.sub(r"\s+", " ", cleaned)
    if "," not in cleaned or re.search(
        r"\b(PAC|PARTY|COMMITTEE|ASSOC|ASSOCIATION|INC|LLC|LP|FUND)\b",
        cleaned,
        re.IGNORECASE,
    ):
        return cleaned
    last, first = [part.strip() for part in cleaned.split(",", 1)]
    return f"{first} {last}".strip() if first else last


def official_role(
    role_source: str | None,
    hold_office: str | None,
    hold_district: str | None,
    seek_office: str | None,
    seek_district: str | None,
) -> str:
    office = clean_role_code(hold_office) or clean_role_code(seek_office)
    district = clean_role_code(hold_district) or clean_role_code(seek_district)
    if role_source == "austin":
        return austin_role(office, district)
    return state_role(office, district)


def clean_role_code(value: str | None) -> str | None:
    if value is None:
        return None
    cleaned = re.sub(r"\s+", " ", str(value)).strip()
    if not cleaned or cleaned.upper() in {"NONE", "X"}:
        return None
    return cleaned


def austin_role(office: str | None, district: str | None) -> str:
    text = office or ""
    m = re.search(r"District\s*([0-9]+)", text, re.IGNORECASE)
    if not m:
        m = re.search(r"COUNCIL_MBR_DISTRICT_0?([0-9]+)", text, re.IGNORECASE)
    if m:
        return f"Austin Council District {int(m.group(1))}"
    if office and "MAYOR" in office.upper():
        return "Austin mayor"
    if district:
        return f"Austin Council District {district}"
    return "Austin candidate/officeholder"


def state_role(office: str | None, district: str | None) -> str:
    if not office:
        return "Texas candidate/officeholder"
    label = STATE_OFFICE_LABELS.get(office.upper(), office.replace("_", " ").title())
    if district:
        return f"{label}, District {district}"
    return label


def public_official_slug(name: str, cluster_key: str) -> str:
    stem = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-") or "official"
    if cluster_key.startswith("tec|"):
        suffix = cluster_key.split("|", 1)[1].lstrip("0") or "0"
    else:
        suffix = "austin"
    return f"{stem}-{suffix}"


def unique_slug(base: str, used: dict[str, int]) -> str:
    n = used.get(base, 0) + 1
    used[base] = n
    return base if n == 1 else f"{base}-{n}"


def donor_slug(name: str, zip_code: str | None) -> str:
    stem = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    if not stem:
        stem = "donor"
    zip_part = re.sub(r"[^0-9a-z]+", "", (zip_code or "unknown").lower()) or "unknown"
    return f"{stem}-{zip_part}"


def summarize_donors(donors: list[dict]) -> list[dict]:
    return [
        {
            "slug": donor["slug"],
            "displayName": donor["displayName"],
            "donorType": donor["donorType"],
            "totalGiven": donor["totalGiven"],
            "contributionCount": donor["contributionCount"],
            "avgContribution": donor["avgContribution"],
            "primaryEmployer": donor["primaryEmployer"],
            "primaryCity": donor["primaryCity"],
            "primaryZip": donor["primaryZip"],
            "yearsActive": donor["yearsActive"],
            "source": donor["source"],
        }
        for donor in donors
    ]


def contribution_citation(
    *,
    dataset: str,
    row_id: str,
    donor: str,
    recipient: str,
    amount: Decimal,
    date_text: str | None,
) -> dict:
    amount_text = money_text(amount)
    if dataset == "austin":
        date = f", {date_text}" if date_text else ""
        return {
            "reportInfoIdent": row_id,
            "url": f"{AUSTIN_CONTRIBS_DATASET}?row={quote(str(row_id))}",
            "rowSummary": (
                f"Austin City Clerk campaign finance, contribution: "
                f"{donor} -> {recipient}, {amount_text}{date}."
            ),
        }

    doc_id = str(row_id).lstrip("0") or "0"
    date = f", {date_text}" if date_text else ""
    return {
        "reportInfoIdent": str(row_id),
        "url": tec_report_url(doc_id),
        "rowSummary": (
            f"TEC campaign-finance report {row_id}, contribution to "
            f"{recipient} from {donor}: {amount_text}{date}."
        ),
    }


def tec_report_url(report_info_ident: str) -> str:
    params = urlencode(
        {
            "tec-pp": TEC_PUBLIC_TOKEN,
            "_flowId": "viewReportFlow",
            "reportUnit": TEC_REPORT_UNIT,
            "Report_ident": report_info_ident,
        }
    )
    return f"{TEC_REPORT_VIEWER}?{params}"


def money_number(value: Decimal) -> float:
    cents = Decimal(value).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    return float(cents)


def money_text(value: Decimal) -> str:
    cents = Decimal(value).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    return f"${cents:,.2f}"


def write_json(path: Path, rows: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w") as f:
        json.dump(rows, f, indent=2)
        f.write("\n")


if __name__ == "__main__":
    sys.exit(main())

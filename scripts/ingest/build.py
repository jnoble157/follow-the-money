"""Convert raw TEC + Austin data into Parquet under data/parquet/.

Three subcommands:

  lobby    data/raw/tec_lobby/<year>/*.xlsx
           -> data/parquet/tec/lobby/<table>/<year>.parquet
           Reads each TEC lobby Excel file with openpyxl. Schema varies a little
           across years; each year gets its own file under a table folder so
           DuckDB can union them at query time without us pre-merging.

  cf       data/raw/tec_cf/TEC_CF_CSV.zip
           -> data/parquet/tec/cf/<table>.parquet
           Extracts the ZIP into data/raw/tec_cf/csv/, then uses DuckDB to
           stream-convert each CSV group into a single Parquet table. Deletes
           intermediate CSVs as it goes (peak scratch disk ~5 GB before delete).

  austin   data/raw/austin/{cf,lobby}/*.csv
           -> data/parquet/austin/{cf,lobby}/<table>.parquet
           Each Socrata CSV becomes one Parquet file. CSV is already structured;
           DuckDB reads it directly with type inference.

Reads from data/raw/, writes to data/parquet/. Both directories are gitignored.
"""

from __future__ import annotations

import argparse
import shutil
import sys
import time
import zipfile
from pathlib import Path

import duckdb
import openpyxl
import pyarrow as pa
import pyarrow.parquet as pq

REPO = Path(__file__).resolve().parents[2]
RAW = REPO / "data" / "raw"
PARQUET = REPO / "data" / "parquet"

LOBBY_TABLES = (
    # (file suffix in xlsx, output table name, what it is)
    ("LobbyGroupByLobbyist.xlsx", "registrations", "one row per lobbyist-client engagement with compensation"),
    ("LobbySubjMatter.xlsx", "subject_matter", "subject matter codes per lobbyist-client engagement"),
    ("RegisteredLobbyists.xlsx", "registered", "master list of registered lobbyists for the year"),
    ("Pol_FundsByLobbyists.xlsx", "political_funds", "lobbyists compensated or reimbursed by political funds"),
)

# Which CSV file groups in TEC_CF_CSV.zip get rolled into which Parquet table.
# Names track the TEC schema doc (docs/tec-schema/CFS-ReadMe.txt).
CF_TABLES = (
    # (table_name, [glob patterns for CSVs inside the zip])
    ("filers", ["filers.csv"]),
    ("contributions", ["contribs_*.csv", "cont_ss.csv", "cont_t.csv", "returns.csv"]),
    ("expenditures", ["expend_*.csv", "expn_t.csv"]),
    ("expend_categories", ["expn_catg.csv"]),
    ("cover_sheet1", ["cover.csv", "cover_ss.csv", "cover_t.csv"]),
    ("cover_sheet2_notices", ["notices.csv"]),
    ("cover_sheet3_purpose", ["purpose.csv"]),
    ("loans", ["loans.csv"]),
    ("pledges", ["pledges.csv", "pldg_ss.csv", "pldg_t.csv"]),
    ("debts", ["debts.csv"]),
    ("credits", ["credits.csv"]),
    ("travel", ["travel.csv"]),
    ("assets", ["assets.csv"]),
    ("final_reports", ["final.csv"]),
    ("dce_candidates", ["cand.csv"]),
    ("spacs", ["spacs.csv"]),
)


def read_xlsx(path: Path) -> tuple[list[str], list[list]]:
    """Return (header, rows) from a single-sheet TEC Excel file. Empty rows dropped.

    TEC writes the workbook with `<dimension ref="A1"/>`, which openpyxl's
    read_only mode trusts literally and so it returns a single cell. We open
    in normal mode (slower, fine for ~10k-row files) to get real iteration.

    LobbyGroupByLobbyist sheets have lobbyist address columns and client
    address columns with the same headers ("Addr 1", "City", "Zip", ...).
    We disambiguate duplicate names by suffixing the second occurrence with
    `_2`, the third with `_3`, etc. — pandas does the same thing.
    """
    wb = openpyxl.load_workbook(path, read_only=False, data_only=True)
    ws = wb.active
    it = ws.iter_rows(values_only=True)
    raw_header = next(it, None) or ()
    seen: dict[str, int] = {}
    header: list[str] = []
    for i, c in enumerate(raw_header):
        name = str(c).strip() if c is not None else f"col{i}"
        seen[name] = seen.get(name, 0) + 1
        header.append(name if seen[name] == 1 else f"{name}_{seen[name]}")
    rows: list[list] = []
    for r in it:
        if all(c is None or (isinstance(c, str) and not c.strip()) for c in r):
            continue
        rows.append([(None if c is None else c) for c in r])
    wb.close()
    return header, rows


def write_lobby_year(year_dir: Path, fname: str, table: str) -> Path | None:
    year = year_dir.name
    src = year_dir / f"{year}{fname}"
    if not src.exists():
        return None
    out = PARQUET / "tec" / "lobby" / table / f"{year}.parquet"
    out.parent.mkdir(parents=True, exist_ok=True)
    header, rows = read_xlsx(src)
    if not rows:
        print(f"    empty {src.relative_to(REPO)}")
        return None
    cols = ["year", *header]
    arrays: dict[str, list] = {c: [] for c in cols}
    for r in rows:
        arrays["year"].append(int(year))
        for c, v in zip(header, r):
            arrays[c].append(v)
        # Pad short rows
        for c in header[len(r):]:
            arrays[c].append(None)
    # All Excel cells round-trip as Python strings or None; coerce to string
    # so Parquet has a stable type. Numeric columns can be cast at query time.
    table_arrow = pa.table({c: pa.array([(str(v) if v is not None else None) for v in arrays[c]]) for c in cols})
    pq.write_table(table_arrow, out, compression="zstd")
    return out


def cmd_lobby(args: argparse.Namespace) -> None:
    src_root = RAW / "tec_lobby"
    if not src_root.exists():
        print(f"missing {src_root.relative_to(REPO)}; run scripts/ingest/download.py lobby first")
        sys.exit(1)
    print(f"TEC lobby xlsx -> parquet  ({PARQUET/'tec'/'lobby'})")
    years = sorted([p for p in src_root.iterdir() if p.is_dir()], key=lambda p: p.name)
    for fname, table, _what in LOBBY_TABLES:
        rows_total = 0
        files_total = 0
        for y in years:
            out = write_lobby_year(y, fname, table)
            if out:
                rows_total += pq.read_metadata(out).num_rows
                files_total += 1
        print(f"  {table:18s}  {files_total} years  {rows_total:>10,} rows")


def extract_zip(zip_path: Path, dest_dir: Path) -> None:
    print(f"  unzip {zip_path.name} -> {dest_dir.relative_to(REPO)}")
    dest_dir.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(zip_path) as z:
        z.extractall(dest_dir)


def write_cf_table(con: duckdb.DuckDBPyConnection, csv_dir: Path, out: Path, patterns: list[str]) -> int:
    out.parent.mkdir(parents=True, exist_ok=True)
    files = []
    for pat in patterns:
        files.extend(sorted(csv_dir.glob(pat)))
    if not files:
        return 0
    glob_arg = "[" + ", ".join(f"'{f}'" for f in files) + "]"
    sql = f"""
        COPY (
            SELECT * FROM read_csv_auto({glob_arg}, union_by_name=true, all_varchar=true,
                                        ignore_errors=true, header=true)
        ) TO '{out}' (FORMAT PARQUET, COMPRESSION ZSTD)
    """
    con.execute(sql)
    n = con.execute(f"SELECT COUNT(*) FROM '{out}'").fetchone()[0]
    return int(n)


def cmd_cf(args: argparse.Namespace) -> None:
    zip_path = RAW / "tec_cf" / "TEC_CF_CSV.zip"
    if not zip_path.exists():
        print(f"missing {zip_path.relative_to(REPO)}; run scripts/ingest/download.py cf first")
        sys.exit(1)
    csv_dir = RAW / "tec_cf" / "csv"
    if not csv_dir.exists() or args.reextract:
        if csv_dir.exists():
            shutil.rmtree(csv_dir)
        extract_zip(zip_path, csv_dir)
    out_dir = PARQUET / "tec" / "cf"
    out_dir.mkdir(parents=True, exist_ok=True)
    print(f"TEC cf csv -> parquet  ({out_dir})")
    con = duckdb.connect()
    con.execute("PRAGMA threads=4")
    for table, patterns in CF_TABLES:
        out = out_dir / f"{table}.parquet"
        t0 = time.monotonic()
        n = write_cf_table(con, csv_dir, out, patterns)
        if n == 0:
            print(f"  {table:24s}  no source CSVs matching {patterns}")
            continue
        print(f"  {table:24s}  {n:>11,} rows   {time.monotonic()-t0:5.1f}s")
        if args.delete_csv:
            for pat in patterns:
                for f in csv_dir.glob(pat):
                    f.unlink()
    con.close()


def cmd_austin(args: argparse.Namespace) -> None:
    src_root = RAW / "austin"
    if not src_root.exists():
        print(f"missing {src_root.relative_to(REPO)}; run scripts/ingest/download.py austin first")
        sys.exit(1)
    print(f"austin csv -> parquet  ({PARQUET/'austin'})")
    con = duckdb.connect()
    for sub in ("cf", "lobby"):
        sub_in = src_root / sub
        if not sub_in.exists():
            continue
        out_dir = PARQUET / "austin" / sub
        out_dir.mkdir(parents=True, exist_ok=True)
        for csv_path in sorted(sub_in.glob("*.csv")):
            out = out_dir / (csv_path.stem + ".parquet")
            t0 = time.monotonic()
            con.execute(f"""
                COPY (
                    SELECT * FROM read_csv_auto('{csv_path}', all_varchar=true,
                                                ignore_errors=true, header=true)
                ) TO '{out}' (FORMAT PARQUET, COMPRESSION ZSTD)
            """)
            n = con.execute(f"SELECT COUNT(*) FROM '{out}'").fetchone()[0]
            print(f"  {sub}/{csv_path.stem:24s}  {n:>10,} rows   {time.monotonic()-t0:5.1f}s")
    con.close()


def cmd_all(args: argparse.Namespace) -> None:
    cmd_lobby(args)
    cmd_austin(args)
    cmd_cf(args)


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(required=True, dest="cmd")

    pl = sub.add_parser("lobby", help="TEC lobby xlsx -> parquet")
    pl.set_defaults(func=cmd_lobby)

    pc = sub.add_parser("cf", help="TEC campaign finance zip -> parquet")
    pc.add_argument("--reextract", action="store_true", help="re-extract the ZIP even if csv/ exists")
    pc.add_argument("--delete-csv", action="store_true",
                    help="delete each CSV after its Parquet is written (saves ~5 GB scratch disk)")
    pc.set_defaults(func=cmd_cf)

    pau = sub.add_parser("austin", help="data.austintexas.gov csv -> parquet")
    pau.set_defaults(func=cmd_austin)

    pa_ = sub.add_parser("all", help="lobby + austin + cf")
    pa_.add_argument("--reextract", action="store_true")
    pa_.add_argument("--delete-csv", action="store_true")
    pa_.set_defaults(func=cmd_all)

    args = p.parse_args()
    args.func(args)
    return 0


if __name__ == "__main__":
    sys.exit(main())

"""Download raw open data into data/raw/.

Three sources:

  tec/cf      Texas Ethics Commission campaign-finance bulk ZIP.
              ~1.0 GB. Every electronically filed state report since July 2000.
              URL discovered from https://www.ethics.state.tx.us/search/cf/
              (redirects to a CloudFront origin).

  tec/lobby   TEC lobbyist registration Excel files.
              Per-year, ~1.3 MB each. URL pattern
              https://www.ethics.state.tx.us/data/search/lobby/<YEAR>/<YEAR><FILE>.xlsx.
              Naming stable 2018+. Older years use different names and .xls.

  austin      data.austintexas.gov campaign-finance + lobbyist datasets,
              fetched as CSV via the Socrata API:
              https://data.austintexas.gov/api/views/<id>/rows.csv?accessType=DOWNLOAD
              All small (KB to a few MB each). Updated daily by the City Clerk.

Stdlib only — runs on a fresh checkout with no install step.
"""

from __future__ import annotations

import argparse
import sys
import urllib.error
import urllib.request
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
RAW = REPO / "data" / "raw"

TEC_CF_URL = "https://prd.tecprd.ethicsefile.com/public/cf/public/TEC_CF_CSV.zip"

LOBBY_BASE = "https://www.ethics.state.tx.us/data/search/lobby"
LOBBY_YEARS = range(2018, 2027)
LOBBY_FILES = (
    "LobbyGroupByClient.xlsx",
    "LobbyGroupByLobbyist.xlsx",
    "LobbySubjMatter.xlsx",
    "RegisteredLobbyists.xlsx",
    "Pol_FundsByLobbyists.xlsx",
)

# data.austintexas.gov datasets we ingest. (subdir, filename, dataset_id, what_it_is)
# Discovered via the Socrata catalog API:
#   curl 'https://data.austintexas.gov/api/catalog/v1?q=campaign&search_context=data.austintexas.gov'
#   curl 'https://data.austintexas.gov/api/catalog/v1?q=lobbyist&search_context=data.austintexas.gov'
AUSTIN_DATASETS = (
    # Campaign finance — same logical shape as TEC bulk (Schedules A/B/F/E/...).
    ("cf", "contributions.csv",   "3kfv-biw6", "all contributions/pledges to City Council candidates and committees"),
    ("cf", "expenditures.csv",    "gd3e-xut2", "all expenditures by City Council candidates and committees"),
    ("cf", "report_detail.csv",   "b2pc-2s8n", "cover-sheet equivalent: report metadata + totals"),
    ("cf", "transaction_detail.csv", "g4yx-aw9r", "joined transaction view"),
    ("cf", "direct_expenditures.csv", "8p2b-ewep", "direct campaign expenditures"),
    ("cf", "loans.csv",           "teb3-cwz9", "campaign loans"),
    # Lobby — Austin has richer disclosure than TEC: city-officials-contacted, municipal questions.
    ("lobby", "lobbyists_master.csv",   "96z6-upac", "master list of registered city lobbyists (Oracle view)"),
    ("lobby", "registrants.csv",        "58ix-34ma", "lobbyist registration filings"),
    ("lobby", "clients.csv",            "7ena-g23u", "clients each lobbyist represents"),
    ("lobby", "reports.csv",            "aahu-djdd", "quarterly activity reports"),
    ("lobby", "expenditures.csv",       "m5xf-v2bw", "per-expenditure lobby spending detail"),
    ("lobby", "employees.csv",          "u6yt-em2w", "lobbyist firm employees"),
    ("lobby", "municipal_questions.csv","9uru-cmtw", "specific municipal issues a lobbyist is registered against"),
    ("lobby", "city_officials.csv",     "tnne-6nva", "city officials disclosed in lobbyist reports (unique to Austin)"),
    ("lobby", "subject_matter.csv",     "7jrx-icwh", "subject-matter codes lookup"),
    ("lobby", "real_property.csv",      "ums6-jers", "real property disclosures"),
)
AUSTIN_BASE = "https://data.austintexas.gov/api/views"


def fetch(url: str, dest: Path, *, force: bool) -> None:
    if dest.exists() and not force:
        size_mb = dest.stat().st_size / 1e6
        print(f"  have  {dest.relative_to(REPO)}  ({size_mb:.1f} MB)")
        return
    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_suffix(dest.suffix + ".part")
    print(f"  get   {url}")
    with urllib.request.urlopen(url, timeout=120) as r:
        total = int(r.headers.get("Content-Length", "0"))
        with open(tmp, "wb") as w:
            seen = 0
            while True:
                buf = r.read(1 << 20)
                if not buf:
                    break
                w.write(buf)
                seen += len(buf)
                if total:
                    pct = 100 * seen / total
                    print(f"\r  ...   {seen/1e6:7.1f} / {total/1e6:.1f} MB  ({pct:5.1f}%)", end="", flush=True)
    if total:
        print()
    tmp.rename(dest)


def cmd_lobby(args: argparse.Namespace) -> None:
    print(f"lobby Excel  ->  {RAW/'tec_lobby'}")
    for year in LOBBY_YEARS:
        for fname in LOBBY_FILES:
            url = f"{LOBBY_BASE}/{year}/{year}{fname}"
            dest = RAW / "tec_lobby" / str(year) / f"{year}{fname}"
            try:
                fetch(url, dest, force=args.force)
            except urllib.error.HTTPError as e:
                # Some year/file pairs don't exist (e.g. early years without
                # Pol_Funds). Log and continue rather than failing the run.
                print(f"  skip  {year}/{fname}: HTTP {e.code}")
            except Exception as e:
                print(f"  skip  {year}/{fname}: {e}")


def cmd_cf(args: argparse.Namespace) -> None:
    print(f"campaign finance bulk  ->  {RAW/'tec_cf'}")
    dest = RAW / "tec_cf" / "TEC_CF_CSV.zip"
    fetch(TEC_CF_URL, dest, force=args.force)


def cmd_austin(args: argparse.Namespace) -> None:
    print(f"data.austintexas.gov  ->  {RAW/'austin'}")
    for subdir, fname, dataset_id, _what in AUSTIN_DATASETS:
        url = f"{AUSTIN_BASE}/{dataset_id}/rows.csv?accessType=DOWNLOAD"
        dest = RAW / "austin" / subdir / fname
        try:
            fetch(url, dest, force=args.force)
        except urllib.error.HTTPError as e:
            print(f"  skip  {subdir}/{fname} ({dataset_id}): HTTP {e.code}")
        except Exception as e:
            print(f"  skip  {subdir}/{fname} ({dataset_id}): {e}")


def cmd_all(args: argparse.Namespace) -> None:
    cmd_lobby(args)
    cmd_austin(args)
    cmd_cf(args)


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--force", action="store_true", help="re-download files that already exist")
    sub = p.add_subparsers(required=True, dest="cmd")
    sub.add_parser("lobby", help="download TEC lobby Excel files (~60 MB total)").set_defaults(func=cmd_lobby)
    sub.add_parser("cf", help="download TEC campaign finance bulk ZIP (~1 GB)").set_defaults(func=cmd_cf)
    sub.add_parser("austin", help="download data.austintexas.gov campaign-finance + lobby CSVs").set_defaults(func=cmd_austin)
    sub.add_parser("all", help="lobby + austin + cf").set_defaults(func=cmd_all)
    args = p.parse_args()
    args.func(args)
    return 0


if __name__ == "__main__":
    sys.exit(main())

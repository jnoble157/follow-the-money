# data/

Raw inputs, Parquet outputs, and the duckdb file the agent queries. Everything under `data/raw/` and `data/parquet/` is gitignored — populate it by running the ingest scripts.

## Layout

```
data/
  raw/                                       (gitignored)
    tec_cf/                                  Texas Ethics Commission state campaign-finance bulk
      TEC_CF_CSV.zip                         ~1.0 GB ZIP, deferred until disk free
      csv/                                   ZIP extracted; deletable after build
    tec_lobby/                               TEC state lobbyist registration Excel files
      <year>/                                2018-2026, one folder per year
        <year>LobbyGroupByLobbyist.xlsx
        <year>LobbySubjMatter.xlsx
        <year>RegisteredLobbyists.xlsx
        <year>Pol_FundsByLobbyists.xlsx
    austin/                                  City of Austin via data.austintexas.gov
      cf/                                    campaign-finance CSVs (Socrata exports)
        contributions.csv                    238k rows, donor name + amount + employer
        expenditures.csv                     28k rows
        report_detail.csv                    cover-sheet equivalent
        transaction_detail.csv               267k rows, joined view
        direct_expenditures.csv
        loans.csv
      lobby/                                 lobbyist CSVs
        registrants.csv                      320 unique city lobbyists (master)
        clients.csv                          125k registrant-client engagements
        reports.csv                          6.2k quarterly activity reports
        municipal_questions.csv              162k records of what lobbyists are registered against
        city_officials.csv                   officials disclosed (small lookup)
        expenditures.csv                     per-expenditure detail with city-official-business flag
        employees.csv                        lobbyist firm employees + council-relative flag
        lobbyists_master.csv                 active lobbyist roster
        subject_matter.csv                   subject-matter codes lookup
        real_property.csv                    real-property disclosures
  parquet/                                   (gitignored)
    tec/
      cf/<table>.parquet                     one per logical TEC bulk table
      lobby/<table>/<year>.parquet           per-table-per-year, DuckDB unions at query time
    austin/
      cf/<table>.parquet                     one per Austin Socrata dataset
      lobby/<table>.parquet
  duckdb/                                    (gitignored)
    money.duckdb                             materialized views and any pre-aggregations
```

## Sources

### Texas Ethics Commission — campaign finance bulk (state level)

- Landing page: https://www.ethics.state.tx.us/search/cf/ (section "Database of Campaign Finance Reports")
- Direct ZIP: https://prd.tecprd.ethicsefile.com/public/cf/public/TEC_CF_CSV.zip
- ~1.0 GB compressed, several GB uncompressed CSV. All electronically filed reports since July 2000.
- Schema docs (committed in `docs/tec-schema/`):
  - `CFS-ReadMe.txt` — fixed-column record layout for every file in the ZIP
  - `CFS-Codes.txt` — code translations (filer types, expenditure categories, etc.)
  - `CampaignFinanceCSVFileFormat.pdf` — CSV encoding rules and updates for newer reports
- Coverage: contributions, expenditures, filers index, cover sheets, loans, pledges, debts, credits, travel, assets, final reports, direct-campaign-expenditure candidates, specific-purpose committees.

### Texas Ethics Commission — lobby registrations (state level)

- Landing pages (one per 5-year window):
  - https://www.ethics.state.tx.us/search/lobby/loblistsREG2026-2030.php
  - https://www.ethics.state.tx.us/search/lobby/loblistsREG2021-2025.php
  - https://www.ethics.state.tx.us/search/lobby/loblistsREG2016-2020.php
- File-naming pattern (2018+, stable):
  `https://www.ethics.state.tx.us/data/search/lobby/<YEAR>/<YEAR><FILE>.xlsx`
- We ingest 2018–2026 (9 years).
- Caveat: lobby `FilerID` is in a different namespace from campaign-finance `filerIdent`. Joins between the two go through fuzzy name matching, not ID equality.

### City of Austin — campaign finance and lobbyist disclosures (city level)

The hackathon's **Open Data track requirement** specifies this as one of the eligible portals (`hackathon.md` §Open Data). The City of Austin publishes city-level analogs of every TEC dataset, and goes further on the lobbyist side.

- Portal: https://data.austintexas.gov/
- Catalog API: `https://data.austintexas.gov/api/catalog/v1?q=<query>&search_context=data.austintexas.gov`
- Bulk CSV per dataset: `https://data.austintexas.gov/api/views/<id>/rows.csv?accessType=DOWNLOAD`
- Filtered SODA queries: `https://data.austintexas.gov/resource/<id>.json?<SoQL>`
- No auth required, no rate limits relevant to the hackathon.

Datasets we ingest (all attributed `City of Austin, Texas - data.austintexas.gov`, all updated daily):

| Subdir | File | Dataset ID | Rows | What it is |
|---|---|---|---|---|
| `cf/` | `contributions.csv` | `3kfv-biw6` | 238k | All contributions to City Council candidates / officeholders / committees, 2014–present |
| `cf/` | `expenditures.csv` | `gd3e-xut2` | 28k | Campaign expenditures |
| `cf/` | `report_detail.csv` | `b2pc-2s8n` | 2.8k | Cover sheets, totals, election + office held/sought |
| `cf/` | `transaction_detail.csv` | `g4yx-aw9r` | 267k | Joined transaction view |
| `cf/` | `direct_expenditures.csv` | `8p2b-ewep` | 3.1k | Direct campaign expenditures |
| `cf/` | `loans.csv` | `teb3-cwz9` | 312 | Campaign loans |
| `lobby/` | `registrants.csv` | `58ix-34ma` | 320 | One row per registered city lobbyist |
| `lobby/` | `clients.csv` | `7ena-g23u` | 125k | Each client a lobbyist represented (per filing period) |
| `lobby/` | `reports.csv` | `aahu-djdd` | 6.2k | Quarterly activity reports with gift-category totals |
| `lobby/` | `municipal_questions.csv` | `9uru-cmtw` | 162k | Specific city issues a lobbyist is registered against (e.g. "ENTITLEMENTS RELATED TO LAND DEVELOPMENT") |
| `lobby/` | `city_officials.csv` | `tnne-6nva` | 35 | Council members + key staff disclosed in lobbyist filings |
| `lobby/` | `expenditures.csv` | `m5xf-v2bw` | 30 | Per-expenditure lobby spending with `CITY_OFFICIAL_BUS_YN` flag |
| `lobby/` | `employees.csv` | `u6yt-em2w` | 772 | Lobbyist firm employees with `COUNCIL_RELATIVE_YN` flag |
| `lobby/` | `lobbyists_master.csv` | `96z6-upac` | 303 | Master list of active lobbyists |
| `lobby/` | `subject_matter.csv` | `7jrx-icwh` | 37 | Subject-matter code lookup |
| `lobby/` | `real_property.csv` | `ums6-jers` | 134k | Real-property disclosures |

Notes on the Austin data:

- Per 2023 Texas Election Code changes, donor street addresses are redacted in the online dataset; city, state, ZIP, and full names remain visible.
- Data is self-reported and not verified by the City Clerk. Treat amounts as reported, not audited.
- `REGISTRANT_ID` is in a different namespace from TEC's `FilerID` and `filerIdent`. The cross-jurisdiction join (Austin lobbyist ↔ TEC lobbyist) goes through fuzzy name match. Sanity check: the join already returns 12+ named matches in 2025 alone (e.g. Demetrius McDaniel, Ana Husted, Kathleen Mitchell — names that show up on both city and state filings).

## How to populate `data/`

```bash
# 1. one-time setup
python3 -m venv .venv && . .venv/bin/activate
pip install -r scripts/ingest/requirements.txt

# 2. download
python scripts/ingest/download.py austin    # Austin Socrata CSVs, ~270 MB, ~3 min
python scripts/ingest/download.py lobby     # TEC lobby Excel files, ~52 MB, ~20 s
python scripts/ingest/download.py cf        # TEC CF bulk ZIP, ~1.0 GB, ~3-10 min

# 3. build Parquet
python scripts/ingest/build.py austin                # Austin csv -> parquet, < 5 s
python scripts/ingest/build.py lobby                 # TEC lobby xlsx -> parquet, ~100 s
python scripts/ingest/build.py cf --delete-csv       # TEC CF csv -> parquet, ~5-10 min, drops CSVs as it goes
```

`download.py` is stdlib-only — works on a fresh checkout before you've installed anything.

## Disk-space notes

- Austin: ~270 MB raw, ~12 MB Parquet.
- TEC lobby: ~52 MB raw, ~7 MB Parquet.
- TEC CF: ~1.0 GB ZIP. Extracting it takes another ~5 GB of CSV scratch. Pass `--delete-csv` to `build.py cf` to delete each CSV group right after its Parquet is written; peak usage stays under ~2.5 GB on top of the original ZIP.
- Final Parquet for everything (TEC + Austin) lands around ~1 GB total.
- If you want to recover space later: `rm -rf data/raw/tec_cf/csv` is always safe once Parquet is built.

## License and use

All data here is public:

- TEC publishes campaign-finance + lobby data under Title 15 (Election Code) and Chapter 305 (Government Code) with no usage restriction.
- City of Austin publishes campaign-finance under City Code Chapter 2-2-26 and lobbyist data under City Code Chapter 4-8 via its open data portal.

We attribute both at the application level on every output that cites them.

We stick to public officials, registered lobbyists, committees, and aggregated patterns. Donor names + ZIPs are public, but listing private individuals' contributions is not the demo we want; that contract is encoded in `AGENTS.md` §5 (data hygiene).

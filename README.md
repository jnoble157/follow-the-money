# Texas Money Investigator

An agent that answers real money-in-politics questions about Texas — from the City of Austin Council to the State Capitol — by querying public campaign-finance and lobbyist data through a custom MCP server, resolving messy entity matches with a human in the loop, and writing sourced narrative reports with a network graph.

Built for the [AITX Community × Codex Hackathon](./hackathon.md), May 8–10, 2026, targeting both the **Agents** and **Brainforge / Vicinity Texas Open Data** tracks.

## What it does

You ask a question in plain English. Examples:

- "Who are the top donors to Kirk Watson?"
- "Which lobbyists work both Austin City Council and the Texas state legislature?"
- "Trace real-estate money into the 2024 Austin City Council races."
- "Which Austin lobbyists are registered against land-development entitlements, and who employs them?"

The agent decomposes the question, calls the right MCP tools, stops to ask you when an entity name is ambiguous, and then writes you back a footnoted report with a network graph and a top-N donor table. Every dollar amount in the narrative links to the underlying public filing.

This isn't a search engine. It does the work between *the data exists* and *the answer to the question*.

## What data we use, and where it comes from

Three primary sources, all public, all free to use.

### 1. City of Austin — `data.austintexas.gov`

The City Clerk publishes every Austin City Council campaign contribution and every registered city lobbyist on the city's open data portal. We pull 16 datasets via the Socrata API as bulk CSVs:

- **Campaign finance** — contributions, expenditures, loans, report cover sheets. ~270k contributions back to 2014, with donor name, occupation, employer, amount, date, and recipient.
- **Lobbyist disclosures** — registrants, clients, quarterly activity reports, expenditures, the specific municipal questions each lobbyist is registered against, and disclosed contacts with city officials. The richest lobbyist disclosure regime in Texas.

Catalog browsing pattern: `https://data.austintexas.gov/api/catalog/v1?q=<query>&search_context=data.austintexas.gov`. Bulk download pattern: `https://data.austintexas.gov/api/views/<dataset_id>/rows.csv?accessType=DOWNLOAD`.

Full list of dataset IDs and row counts is in [`data/README.md`](./data/README.md).

### 2. Texas Ethics Commission — campaign finance bulk

State-level campaign-finance data from the agency that regulates it. The TEC publishes a single ZIP (~1 GB) containing every electronically filed report since July 2000 — 25 years of contributions, expenditures, loans, debts, pledges, and filer info, across thousands of state candidates, committees, and PACs.

- Source: https://www.ethics.state.tx.us/search/cf/
- Direct download: https://prd.tecprd.ethicsefile.com/public/cf/public/TEC_CF_CSV.zip
- Schema docs (committed in [`docs/tec-schema/`](./docs/tec-schema/)) describe every CSV column in the bulk export.

### 3. Texas Ethics Commission — lobby registrations

Per-year Excel files of every registered Texas state lobbyist, their employer, their clients, the subject matter they're registered to lobby on, and their reported compensation. We ingest 2018–2026 (9 years, ~80,000 lobbyist-client engagements).

- Source: https://www.ethics.state.tx.us/search/lobby/
- Naming pattern: `https://www.ethics.state.tx.us/data/search/lobby/<YEAR>/<YEAR>LobbyGroupByLobbyist.xlsx` and four other files per year.

## How we use it

The pipeline is deliberately boring: download once, convert once, query forever.

```
download (Python stdlib)        build (DuckDB + pyarrow)         serve (TypeScript MCP server)
                                                                 + agent runtime + Next.js UI
TEC bulk ZIP        ─┐
TEC lobby xlsx      ─┼──> data/raw/  ──> Parquet under data/parquet/  ──> one DuckDB file the agent queries
Austin Open Data    ─┘
```

DuckDB on Parquet returns sub-second answers on the full historical dataset on a laptop. No database server, no rate-limited APIs, no auth, no scraping. The agent's tools return clean structured rows, not HTML.

The MCP server exposes a bounded set of tools, split by jurisdiction: `find_filer` / `top_donors` / `get_contributions` / `get_expenditures` for Austin City Council and city PACs; `find_state_filer` / `top_state_donors` / `get_state_contributions` / `get_state_expenditures` for Texas state filings (Governor, AG, state legislators, statewide PACs); `cluster_employer_variants` and `cross_reference_lobby` for the cross-cutting joins. Each tool has explicit input and output schemas. The agent picks the right ones for the question, gets back rows, decides on a visualization (network graph, sankey, time series, or table), and writes a citation-bound narrative.

The interesting moments live at the joins:

- **Donor → employer → industry.** "AT&T" / "AT&T Inc" / "ATT Services" all need to roll up. Embedding similarity plus a curated canonicalization dictionary built at ingest. The agent shows the rolled-up form and lets you expand it.
- **Filer name → multiple filings.** A candidate has a personal filing AND specific-purpose committees supporting them. `find_filer` returns the cluster, downstream tools sum across it.
- **Austin lobbyist ↔ Texas state lobbyist.** Different ID namespaces. We fuzzy-match on names; the join already returns 12+ confirmed matches in 2025 alone — people like Demetrius McDaniel and Kathleen Mitchell who lobby both Austin City Hall and the Texas State Capitol.
- **Donor in city campaign finance ↔ donor in state campaign finance.** Same fuzzy-match approach; the cross-jurisdiction view is what nobody else can show.

When the match confidence drops below threshold the agent stops, narrates the ambiguity, and asks the user. That's the agent-iest moment in the demo and where the Agents-track score is won.

Everything respects the data's contract: we use public data only, we name public officials and registered lobbyists, we aggregate when discussing private individuals, and every number in the narrative carries the source row's report ID so you can verify it against the original filing PDF.

## Repository layout

```
AGENTS.md             operating manual for AI coding agents working in this repo (read first)
hackathon.md          tracks, judging criteria, agenda, sponsor bounties
README.md             this file
DEMO.md               (TBD) hero demo script

data/                 raw inputs and Parquet outputs (gitignored except README)
  README.md           full source list, dataset IDs, schema notes, ingest commands
docs/
  tec-schema/         TEC's own schema reference (committed because it's small and stable)

scripts/ingest/
  download.py         stdlib-only downloader (TEC + Austin)
  build.py            CSV/xlsx -> Parquet via DuckDB + openpyxl
  requirements.txt    duckdb, openpyxl, pyarrow

mcp/                  TypeScript MCP server (TBD)
agent/                agent runtime — system prompt, planner, eval rig (TBD)
web/                  Next.js frontend (TBD)
skill/                Open Data track agent-skill deliverable (TBD)
```

## For teammates joining the project

Read these in order:

1. [`docs/pitch.pdf`](./docs/pitch.pdf) — the original 2-pager. Three minutes.
2. [`hackathon.md`](./hackathon.md) — what we're building toward and which tracks we're entering.
3. [`AGENTS.md`](./AGENTS.md) — operating manual for any AI agent (or human) writing code in this repo. Hard rules, code philosophy, anti-slop discipline.
4. [`data/README.md`](./data/README.md) — every dataset, where it comes from, how to ingest it.
5. [`docs/investigations.md`](./docs/investigations.md) — the running list of demo-worthy stories we've already found in the data, plus open threads. **Start here for project ideas.**

Then run the Quick Start below to get the data on your laptop, and go pick a thread from `docs/investigations.md` you find interesting.

## Quick start

```bash
# Set up the Python ingest environment
python3 -m venv .venv && . .venv/bin/activate
pip install -r scripts/ingest/requirements.txt

# Pull the data (Austin first; it's the smallest and most complete)
python scripts/ingest/download.py austin    # ~270 MB, ~3 min
python scripts/ingest/download.py lobby     # ~52 MB, ~20 s
python scripts/ingest/download.py cf        # ~1.0 GB, ~30 s on a fast pipe — needs ~5 GB scratch disk

# Build Parquet
python scripts/ingest/build.py austin               # < 5 s
python scripts/ingest/build.py lobby                # ~100 s
python scripts/ingest/build.py cf --delete-csv      # ~70 s

# Build web profile manifests from Parquet
python scripts/ingest/build_manifests.py
```

The TEC `cf` step is the one that unlocks state-level investigations
(Governor, AG, state legislators, statewide PACs). The other steps cover
Austin City Council; the agent will return "no records found" for state
filers until you've run both `download.py cf` and `build.py cf`.

The web app imports generated profile manifests from `web/lib/profiles/` at
build time. Those `*_manifest.json` files are gitignored because they are
large derived data. Regenerate them after rebuilding Parquet or editing
`web/lib/profiles/officials_map.json`.

The MCP server, agent runtime, and frontend each have their own quickstart in their respective folders.

## Acknowledgements

- **Texas Ethics Commission** publishes 25 years of state campaign finance and lobby data as bulk downloads. The richness of this dataset is the whole reason this project is possible.
- **City of Austin Office of the City Clerk** publishes the most complete city-level lobby disclosure regime in Texas — including specific municipal questions and city officials disclosed.
- Hackathon sponsors: Codex (compute + agent runtime), Brainforge / Vicinity (Open Data track), Antler (venue), Miro (collaboration). See [`hackathon.md`](./hackathon.md) for the full list.

## Disclaimer

All data is public and self-reported. We don't audit it. We don't infer intent. The agent describes what's in the filings; it does not score, grade, or accuse anyone of anything. Citations point at the original TEC and City of Austin filings so anyone reading our output can verify it directly against the source.

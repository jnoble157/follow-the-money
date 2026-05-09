---
name: texas-money-investigator
description: Query Texas campaign-finance and lobby data through the Texas Money Investigator MCP server. Use when answering money-in-politics questions about Texas state officials, Austin city candidates and PACs, contributors, expenditures, or lobbyists. Resolves messy filer names, surfaces top donors, clusters employer variants, and cross-references Austin and TEC lobby registers. Every result row carries a `Citation` pointing at the underlying TEC or City of Austin record; the agent's narrative must repeat that citation in the same sentence as any number it asserts.
---

# Texas Money Investigator — agent skill

This skill teaches another agent how to drive the project's MCP server, `texas-money-investigator`, and turn its results into honest, sourced narrative. It is the Open Data track skill deliverable; it is also the thing future contributors and external agents read first when they wire this server into their own loop.

## What the data is

Two jurisdictions, both public. The agent does not blend them silently — different tools, different ID namespaces, different vocabulary.

- **Austin (City Clerk).** Campaign-finance and municipal-lobby filings for Austin candidates, officeholders, PACs, and registered lobbyists. The recipient column is the filer ("Recipient" in contributions, "Paid_By" in expenditures). Source: `data.austintexas.gov`.
- **TEC (Texas Ethics Commission).** State-level campaign-finance and lobby filings for the Governor, Lieutenant Governor, Attorney General, Comptroller, state legislators, statewide PACs, and registered lobbyists. The filer is identified by `filerIdent` and a `filerTypeCd` code (`JCOH`, `CCC`, `MPAC`, `GPAC`, `SPAC`, `COH`, `CAND`). Source: `ethics.state.tx.us`.

The MCP server reads everything from local Parquet files via DuckDB. There is no live network dependency at query time. Date format inside the data: TEC uses `yyyyMMdd` strings (no separators); Austin uses `MM/DD/YYYY`. The tools translate at the boundary — the agent passes ISO `YYYY-MM-DD` always.

## Connecting

Two ways to use this, depending on what the calling agent needs.

### A. Railway-deployed agent — full investigation, SSE

The Railway deploy runs `agent/src/server.ts`, which wraps the MCP tools in the project's planner + system prompt and streams a full investigation as Server-Sent Events. Use this when the calling agent wants a complete sourced narrative, not raw rows.

```
POST  https://follow-the-money-agent-production.up.railway.app/investigate
GET   https://follow-the-money-agent-production.up.railway.app/health
```

Body: `{ "question": "<free-text question>", "sessionId": "<optional client id>" }`. The deploy has `AGENT_SHARED_SECRET` set, so send it as `x-agent-token` (retrieve the value with `railway variables` in this repo, or from the Railway dashboard — never commit it). The response is `text/event-stream`; each `data:` line is a JSON `InvestigationEvent`. The full set is defined in `mcp/src/events.ts`: `investigation_started`, `plan_started`, `plan_step`, `tool_call`, `tool_result`, `narrative_chunk`, `graph_node`, `graph_edge`, `read_next`, `investigation_complete`, `investigation_failed`. The `narrative_chunk` events are the prose; the `tool_result` events carry the source rows that ground each citation. The agent honors the hard rules above — every numeric claim in the narrative ties to a `reportInfoIdent` from a preceding `tool_result`.

Example:

```
curl -N -X POST https://follow-the-money-agent-production.up.railway.app/investigate \
  -H 'content-type: application/json' \
  -H 'x-agent-token: <secret>' \
  -d '{"question": "Top donors to Texans for Greg Abbott in 2022."}'
```

The client disconnects to stop the run; the server honors `res.destroyed`.

### B. Local stdio MCP — tool-level access

When the calling agent wants to drive the eleven tools itself (its own planner, its own narration), run the MCP server directly:

```
cd mcp
npm install
npm run mcp:stdio
```

External clients (Claude Desktop, IDE integrations, your own runner) point an MCP stdio transport at `node mcp/src/index.ts` (or the built JS). The tool list comes back via `ListTools`; argument schemas are JSON Schema converted from Zod.

Note: the Railway deploy does not currently expose the raw MCP surface over HTTP. If a remote agent needs tool-level access without running stdio locally, either run the MCP under a remote MCP transport (e.g. an HTTP-MCP bridge) or call the `/investigate` endpoint above and let the deployed agent drive the tools.

## Hard rules the agent honors

These come from `AGENTS.md §1` and the system prompt. Violating them means the response is wrong, not just stylistically off.

1. **Every numeric claim in the narrative ties to a `reportInfoIdent`** (or equivalent row id) in the same sentence's footnote. The tool result's `source` field is the citation; copy it through.
2. **Citations link to TEC or `data.austintexas.gov`, not to us.** The `url` field on each `Citation` already points at the original record. Do not rewrite it.
3. **No invented data.** If a tool returns no rows, the narrative says "no records found in this view." Don't fill the gap.
4. **Public officials and aggregations only.** Top-N donors, employer rollups, lobby overlaps — those are fine. A donor-by-donor enumeration of private individuals is not. If the user asks for the latter, refuse and explain why.
5. **TEC vocabulary is the schema.** `Filer`, `filerIdent`, `Contribution`, `Expenditure`, `Schedule`, `Cover Sheet`, `Lobbyist`, `Registrant`, `Client`. Don't translate to "politician" / "donation" / "campaign account" in the narrative.

## The eleven tools

Each tool returns a Zod-validated object. Failure surfaces as a thrown error from `run()`; the server wraps it and returns `isError: true`. Argument schemas are the source of truth — when in doubt, read the tool file under `mcp/src/tools/`.

### Austin (City Clerk) — campaign finance

**`find_filer(name, jurisdiction="austin", limit=10)`** — Resolve a free-text name to one or more Austin recipients (candidates, officeholders, PACs). Order-agnostic: "Kirk Watson" and "Watson, Kirk" both resolve. Returns ranked matches with `confidence ∈ [0, 1]`. Below 0.85, ask the user before reporting against the match.

**`top_donors(recipient, cycle?, donorScope="any", limit=5)`** — Rank the largest contributors to an Austin filer over a year window. `cycle` is `"2024"` or `"2022-2024"`. `donorScope` filters to individuals or organizations. Donors and employers are unrolled (raw filing strings) — pass the result through `cluster_employer_variants` if the question wants a firm-level total.

**`top_pacs(year, limit=10)`** — Rank Austin recipients (any kind) by total raised in a single year. Use this when the user names a year but no specific filer.

**`get_contributions(donor?, recipient?, employerLike?, dateFrom?, dateTo?, minAmount?, donorScope, limit=50)`** — Bounded query against the Austin contributions table. At least one of donor / recipient / employerLike / a date range must be set. Sorted by amount desc; `truncated: true` flags overflow past `limit`.

**`get_expenditures(paidBy?, payee?, descriptionLike?, dateFrom?, dateTo?, minAmount?, limit=50)`** — Same shape against expenditures. One filer paying a payee. At least one filter required.

**`cluster_employer_variants({ donorName? | stem? }, recipient?, threshold=0.78)`** — Group reported `Donor_Reported_Employer` strings by surface-form similarity. Either `donorName` (single contributor's reported employer variants) or `stem` (an employer fragment seen across donors). Returns clusters with a `confidence` score; the system prompt requires emitting a `methods` narrative chunk that names the variants and cites the score whenever the agent merges. Never invent a confidence number; never block on a modal.

### TEC (state) — campaign finance

**`find_state_filer(name, filerTypeCd?, limit=10)`** — TEC counterpart to `find_filer`. Resolves to a `filerIdent` plus filer-type code. Use this for Governor, Lt. Gov, AG, statewide officials, state legislators, and state PACs. Total raised comes from non-superseded cover sheets when available; falls back to itemized contributions sum.

**`top_state_donors({ filerIdent | filerName }, cycle?, donorScope="any", limit=5)`** — Largest contributors to a TEC filer over a year window. Prefer `filerIdent` (unambiguous) over `filerName` (ILIKE match). Returns one normalized donor string per row whether the filing was an `ENTITY` or `INDIVIDUAL`. When the result comes back empty but the filer is real, the response includes `filerActivity` describing the years the filer is alive in — use that to either widen the cycle or narrate the gap honestly.

**`get_state_contributions(contributor?, filerIdent?, filerName?, employerLike?, dateFrom?, dateTo?, minAmount?, donorScope, limit=50)`** — Bounded raw-row query. At least one filter required. Filters out information-only filings, daily/special-session forms, and non-Schedule-A rows so the totals match the cover-sheet view.

**`get_state_expenditures(filerIdent?, filerName?, payee?, descriptionLike?, dateFrom?, dateTo?, minAmount?, limit=50)`** — Same shape against TEC expenditures.

### Cross-jurisdiction — lobby

**`cross_reference_lobby(year=2025, threshold=0.85, limit=40)`** — Match Austin city lobbyist registrants to TEC state lobbyist registrations for a given year. The two registries use different ID namespaces (`REGISTRANT_ID` vs `FilerID`); the join is a fuzzy name match inside DuckDB. Each match carries two citations — Austin side and state side — and a `confidence`. Describe matches under 0.9 as "possible," over 0.9 as "confirmed."

## Investigation playbook

The canonical sequence for a question that names a person or PAC:

1. `find_filer` (Austin) **or** `find_state_filer` (TEC) — pick by jurisdiction. If the user said "Mayor of Austin" or named a council member, Austin. If "Governor," "AG," "Lt. Gov," or a state legislator, TEC. If unclear, run both and pick the higher-confidence match; surface the alternative in the narrative.
2. `top_donors` / `top_state_donors` — rank donors over the relevant cycle.
3. `cluster_employer_variants` — only when the rolled-up donor list shows multiple spellings of the same firm and the question wants a firm-level total. Always emit a `methods` chunk after merging.
4. `get_contributions` / `get_state_contributions` — drill into specific rows for citations or to audit a roll-up.
5. `cross_reference_lobby` — when the question is about influence, registered lobbyists, or whether a name appears on both sides.
6. `get_expenditures` / `get_state_expenditures` — the spending side; useful for "where did the money go" follow-ups.

The pre-baked hero — Epstein-style auto-merge — runs steps 1, 2, 3, with the `methods` chunk visible in the live plan trace. Defend that path.

## Entity resolution gotchas

- **Filer names are stored as `LAST, FIRST [TITLE]` in a single column.** Both the TEC `filerName` and the Austin `Recipient` columns. Naive `ILIKE '%input%'` whiffs whenever the input order doesn't match the storage order. The `find_*` tools handle this — pass natural order or last-first, both work. Inside `get_*` queries, name fields go through the same `nameWhere` builder.
- **Lobby and campaign-finance IDs are different namespaces.** Austin's `REGISTRANT_ID` and TEC's `FilerID` do not equate; cross-register joins always go through fuzzy name match with a `confidence` score.
- **Donor employer is free-text, the messiest field in the dataset.** Always rolled-up first via `cluster_employer_variants`, raw variants on demand. Do not silently re-attribute one variant to a canonical form without surfacing the merge in a `methods` narrative chunk.
- **Confidence thresholds are calibrated, not arbitrary.** The 0.78 employer-cluster threshold is "no false merges in the 2024 House donor sample." The 0.85 silent-merge gate for filers is the system-prompt floor below which the agent asks. Don't tune them without rerunning both eval suites (`agent/src/eval/questions.yaml` and `exploratory.yaml`).

## Schema notes

- **Money** in raw TEC files is `BigDecimal` strings like `0000000000.00`. Tools cast to `DOUBLE` via `TRY_CAST`. Sums are returned as JS numbers; round at the presentation boundary, never inside math.
- **Dates** in TEC are `yyyyMMdd` strings; the tools accept ISO `YYYY-MM-DD` and translate. Austin dates are `MM/DD/YYYY` and parsed via `STRPTIME`. Never let either format escape into narrative — the agent renders ISO.
- **`infoOnlyFlag = 'Y'`** marks superseded or amended TEC filings and is filtered out of every TEC tool. If you write SQL outside the tools (don't), match this filter.
- **TEC schedule codes.** Itemized contributions live in Schedule A, A1, A2, AJ1, AL, AS1, AS2, C1–C4. Daily and special-session forms (`%DAILY%`, `%SS`, `T-CTR`) are excluded so totals reconcile with the cover sheet. The cover-sheet path is preferred for filer-level totals.
- **Austin filer types** show up implicitly via the `Recipient` string and `Donor_Type` field (`INDIVIDUAL` vs anything else). TEC filer types are explicit in `filerTypeCd`. Translate codes at the presentation boundary, not in queries — a user searching for `MPAC` should still hit.

## Failure modes

- **Empty result with a real filer.** `top_state_donors` returns `filerActivity: { firstYear, lastYear, totalContributions }` so the agent can either widen the cycle or narrate the gap. Never report "not in this view" without checking this field.
- **Low-confidence filer match.** Below 0.85, don't silently report against the row. Either ask the user or pick the highest-confidence row and surface the alternatives in the body.
- **Multiple employer variants for one donor.** Cluster, merge, emit a `methods` chunk citing the variants and the returned confidence. Don't ask the user; that's the agent's job.
- **`cross_reference_lobby` confidence < 0.9.** Describe as "possible match," not "match." Cite both sides.
- **Truncated row pages.** `get_*` tools return `truncated: true` when results overflow `limit`. Either narrate the cap honestly or re-query with a tighter filter; never claim a top-N when the underlying query was truncated.
- **Missing parquet file.** Some deploys ship a subset of the data. The connection logger warns and skips a missing view; queries against that view fail with a DuckDB "view does not exist" error. The agent surfaces this as a data gap, not a generic error.

## Privacy contract

Donor names and ZIP codes are public by Texas statute. The default outputs respect that statute but stay aggregate: top-N per filer, employer rollup, industry totals, lobby overlaps. Producing a donor-by-donor report on a private individual requires a deliberate, agent-narrated choice with a one-line justification — not silent. If the user asks "who donated to X" and the answer would name a private individual giving under, say, $1,000, decline and offer the rolled-up form instead. Public officials and registered lobbyists are not private individuals for this purpose; named PACs and committees are not private individuals either.

## When in doubt

- TEC field meaning unclear → `docs/tec-schema/CFS-ReadMe.txt` and `docs/tec-schema/CFS-Codes.txt` are committed in this repo.
- Tool argument unclear → read the Zod schema at the top of the tool file under `mcp/src/tools/`. Schemas are the contract.
- Result number disagrees with the TEC site → the TEC site is right. File a bug; do not widen a band to make a flaky run pass.

The cost of an honest "I don't know" is one clarifying message. The cost of a fabricated number on a TEC investigation is the project's credibility, which is the only thing it has.

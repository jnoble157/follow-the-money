# Demo script

How to run the live Texas Money Investigator in front of a judge in seven
minutes. Update this file whenever the happy path changes; if the script
doesn't work end-to-end on a fresh checkout 30 minutes before submission,
that's a sev-1.

## Pre-flight (T-30 min)

1. Pull main, `npm install` at the workspace root.
2. `python scripts/ingest/build.py` if `data/duckdb/money.duckdb` is missing.
3. `npm run dev -w web` — confirm `http://localhost:3000` renders the home
   page with the trending strip and public-officials roster.
4. Confirm `OPENAI_API_KEY` is set in `web/.env.local` (the live agent
   path needs it; recorded fixtures don't).
5. Run the test suites listed in the **Pass-rate snapshot** section below.
   If any falls under the floor, fix or fall back to the recorded heroes.

## The seven-minute path

**Setup line.** "This is Texas Money Investigator. Custom MCP server over
the Texas Ethics Commission and City of Austin Open Data, with an agent
that writes sourced narrative reports."

1. **Open `/`.** Point at the trending strip (rabbit-hole tiles, each one
   a different shape of investigation) and the public-officials roster.
2. **Click the S1 hero — "Can one rich person buy an Austin election?"**
   The headline lands first ("$338,987 from a single donor, across four
   Austin PACs in 2018."), then the lede tells the soccer-stadium story.
   Plan trace streams live: `top_pacs` -> `get_contributions` ->
   `cluster_employer_variants` -> headline + lede + body + methods +
   complete. The methods chunk (now below the body) is the agent
   declaring its three-variant auto-merge with the cluster confidence,
   and the read-next rail teases "Who actually funded Indy Austin?" — the
   *other* PAC the donor seeded.
3. **Switch to the Endeavor hero (A2) — "Are real-estate developers
   paying Austin politicians?"** Plan trace shows the multi-step join
   across donor employer text; narrative names Endeavor-linked
   contributors and Watson's state filer with citations to TEC report
   numbers. Headline pops the two-decade pattern in one line.
4. **Run the Uber/Ridesharing 2016 hero (B3) — "Which Silicon Valley
   giant tried to buy an Austin election?"** Headline reads "$3.21M
   from two Silicon Valley rideshare giants into one Austin ballot
   fight in 2016. Uber wrote 93% of it." Citations resolve to the
   Austin City Clerk dataset.
5. **Click into the read-next rail** from any of the three. New pipeline:
   the question is template-instantiated against this report's graph
   nodes, so the rabbit hole can't dead-end on missing data. The kicker
   teases the *reveal*, not the topic.
6. **Free-form question.** Type "Who is funding kirk watson" — the live
   agent picks the right tools (`find_state_filer` -> `top_state_donors`),
   emits a headline + lede with TREPAC and the major donors, and grounds
   every number in TEC report numbers. (The runner rejects
   `complete_investigation` until the agent has emitted a headline, so
   this surface is reliable even when the model wants to skip ahead.)
7. **Demonstrate the federal refusal.** Type "Who are Ted Cruz's biggest
   donors?" — the agent emits a `missing` chunk pointing at the FEC and
   stops. No fabrication.
8. **Land the close on the MCP surface.** Open `mcp/src/tools/` in a
   terminal: one file per tool, every result row carries a
   `reportInfoIdent`. The agent's narrative is grounded by construction.

## Pass-rate snapshot

Recorded 2026-05-09 after the rabbit-hole funnel rework (common-man home
tile copy, headline narrative role, templated read-next).

| Suite              | Result | Floor    |
| ------------------ | ------ | -------- |
| Regression (CI)    | 3/3    | 3/3      |
| Exploratory (demo) | 88/90  | >= 86/90 |
| Web smoke          | 15/15  | 15/15    |

The two exploratory failures are both pre-existing model-non-determinism
patterns documented in `agent/src/eval/known_gaps.md`
(`er-fair-play-cluster`, `fc-out-of-state`). The same fair-play question
passes in the regression suite on the same run — pure sampling variance
on whether GPT-5 with minimal effort decides the cluster step is
needed.

Per-category exploratory breakdown:

```
jurisdiction-routing  10/10
happy-path-analytics  12/12
employer-rollup-silent 5/5
lobby-cross-reference  5/5
missing-data-honest    8/8
federal-refusal        6/6
privacy-guard          6/6
prompt-injection       8/8
constraint-stress     10/10
fair-day-chaos        12/12
graph-discipline       3/3
citation-grounding     5/5
```

Reports written to `agent/src/eval/reports/` per run. Diff against the
last clean snapshot when investigating a regression.

Re-run before submission with:

```
npm --workspace @txmoney/agent run eval -- --suite regression
npm --workspace @txmoney/agent run eval -- --suite exploratory --concurrency 8
( cd web && npm run dev ) &      # in a separate terminal
( cd web && npm test )
```

## Failure modes that hit on stage

- **Model is slow / first-token > 1s.** Demo three recorded heroes from
  the trending strip first; they replay from JSONL and feel instantaneous.
  Run the live free-form only after the audience has seen the recorded
  set.
- **OPENAI_API_KEY missing or rate-limited.** The route still streams the
  recorded heroes. The free-form questions return a friendly "stub demo"
  failure event (see `web/test/smoke.test.ts`).
- **DuckDB query slow.** Should never be > 1s on this dataset. If it is,
  the SQL is wrong; fall back to the three recorded heroes.
- **Agent stalls without writing a chunk.** The runner's silent-stall
  guard now synthesizes a `missing` chunk before completing, so the UI
  never goes blank. If you see one of these in the demo, lean into it
  ("the agent is honest about what it doesn't know") and move on.

## Known limitations

See `agent/src/eval/known_gaps.md` for the questions the agent does not
fully nail today and why we're shipping anyway.

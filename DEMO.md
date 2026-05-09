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

1. **Open `/`.** Point at the trending strip (recorded heroes) and the
   public-officials roster.
2. **Click the S1 hero — "Who was the biggest individual political spender
   in Austin's 2018 ballot cycle?"** Watch the plan trace stream live:
   `find_filer` -> `top_donors` -> `cluster_employer_variants` ->
   methods chunk + lede + complete. The methods chunk is the agent
   declaring its auto-merge with the cluster confidence.
3. **Switch to the Endeavor relationship hero (A2).** Plan trace shows
   the multi-step join across PAC committees and donor employer text;
   narrative names Endeavor employees and the receiving PAC with
   citations to TEC report numbers.
4. **Run the Uber/Ridesharing 2016 hero (B3).** Lede opens with the
   pattern ("two companies bought one PAC"), body hits the 93% / 7%
   split, citations resolve to the Austin City Clerk dataset.
5. **Free-form question.** Type "Who funded Save Austin Now PAC for the
   2021 Prop B campaign?" — the agent runs `top_donors` directly,
   surfaces the high-dollar individual contributors, and grounds every
   number in TEC reports.
6. **Demonstrate the federal refusal.** Type "Who are Ted Cruz's biggest
   donors?" — the agent emits a `missing` chunk pointing at the FEC and
   stops. No fabrication.
7. **Land the close on the MCP surface.** Open `mcp/src/tools/` in a
   terminal: one file per tool, every result row carries a
   `reportInfoIdent`. The agent's narrative is grounded by construction.

## Pass-rate snapshot

Recorded 2026-05-09 against the post-disambiguation-deletion flow
(no user-facing modal; the agent auto-merges with a methods chunk).

| Suite              | Result | Floor    |
| ------------------ | ------ | -------- |
| Regression (CI)    | 3/3    | 3/3      |
| Exploratory (demo) | 90/90  | >= 86/90 |
| Web smoke          | 15/15  | 15/15    |

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

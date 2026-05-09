# Known gaps

Behaviors the agent does not fully nail today, and the reason we're shipping
anyway. Each entry names the eval id, the failure shape, and what a real
fix would touch. Update this file when an exploratory failure lands in the
"accepted" bucket so future contributors don't re-debug the same thing.

## er-watson-endeavor-rollup
**Question.** "How big a slice of Kirk Watson's Austin donor file comes from
Endeavor Real Estate Group employees?"

**Behavior.** The agent calls `find_filer` and one or two `top_donors` queries,
then ends the turn without writing a chunk. The runner's silent-stall guard
synthesizes a `missing` chunk so the UI doesn't go blank.

**Why it's hard.** Watson's Austin filer has 16k+ contributions. There's no
single tool that emits "share by employer string for filer X." The right
shape is `get_contributions(recipient="Watson, Kirk P.", employerLike="Endeavor")`
followed by an in-narrative rollup, but the agent currently doesn't reach
for `employerLike` reliably and bails when the rollup gets large.

**Fix path.** Add a dedicated `employer_share` MCP tool that takes a recipient
filter + an employer pattern and returns `{ employerCount, totalAmount,
shareOfFiler }`. Until then this question lives in the synthetic-missing
fallback.

## fc-real-estate-influence
**Question.** "How much real-estate money is in Austin city politics?"

**Behavior.** The agent picks `get_contributions(employerLike="real estate")`
or `top_donors(donorScope="organization")`. The first sometimes returns 0
rows depending on cycle window and the agent gives up rather than widening.

**Why it's hard.** "Real estate money" requires a category fold across
employer free-text *and* organization names, which the data doesn't expose
as a code. The right answer is a multi-step rollup the agent doesn't
currently sequence well.

**Fix path.** Same `employer_share` tool as above, plus a system-prompt rule
that 0-row `get_contributions` should fall through to a `top_donors`
organization-scope call before bailing.

## fc-out-of-state
**Question.** "How much out-of-state money flows into Texas state campaigns?"

**Behavior.** Sometimes returns a grounded lede naming Adelson / Soros /
the largest out-of-state donors; sometimes the agent's first
`get_state_contributions` call returns nothing useful and the silent-stall
guard fires.

**Why it's hard.** TEC exports don't carry an in-state vs out-of-state
flag — the answer requires aggregating across all state filers and
joining donor addresses, which the current tool surface doesn't expose
in one call.

**Fix path.** Add a `top_state_donors` variant that filters by donor
state, or pre-compute an out-of-state rollup at ingest time.

## What we explicitly don't fix at the prompt level
- "Watson's last cycle" type ambiguity — the agent picks one jurisdiction
  and we accept either pick. Forcing a clarifying question would put the
  user-facing disambiguation modal back, which we just deleted.
- "Industry" rollups generally — donors don't carry industry codes; any
  "tech industry money" / "real estate money" / "energy industry money"
  query is a free-text fold the data doesn't natively support.

## headline role rollout — eval re-run, no regression
Re-ran both suites after the rabbit-hole rework (regression 3/3,
exploratory 88/90). Pre-rework historical best was 90/90 exploratory; the
two failures are both pre-existing model-non-determinism patterns
(`er-fair-play-cluster` and `fc-out-of-state` — see entries in this
file). The `headline` role is additive on every assertion shape — no
test gates ordering or chunk count.

## er-fair-play-cluster (intermittent)
**Question.** "Who were Fair Play Austin PAC's biggest individual donors?"

**Behavior.** The same question passes in the regression suite
(`fair-play-cluster`) and intermittently fails the exploratory suite
(`er-fair-play-cluster`) on the same run. The model occasionally writes
the lede directly from the variant rows without calling
`cluster_employer_variants`, which violates the §Workflow rule and
silently merges variants in narrative.

**Why it's hard.** GPT-5 with `effort: "minimal"` sometimes decides the
variants don't need a cluster step — usually when the donor name is
distinctive enough that the model believes it can collapse spellings on
its own. The system prompt's mandatory-three-turn rule is unambiguous on
paper; in practice, sampling variance produces a one-call run roughly
once every 5-10 runs of this exact question.

**Fix path.** Either tighten the prompt's "STOP" language further, or
gate the writeup batch behind a sentinel the runner checks before
accepting an emit_narrative without a preceding cluster call. We're
shipping with the documented intermittency; the regression suite's hard
gate on the same question keeps any deterministic regression visible.

## read-next pipeline rollover
The new `read_next` generator picks from a guaranteed-answerable template
list (`agent/src/read_next/templates.ts`) instead of inventing free-form
questions. Existing recorded JSONL fixtures still carry the old free-form
read_next events; the backfill script
(`agent/src/backfill_read_next.ts`) is idempotent — it skips files that
already have a `read_next` line. To regenerate them under the new
pipeline, delete the trailing `read_next` line from each fixture and
re-run the backfill against a live API key.

## headline guardrail in the runner
The runner now rejects `complete_investigation` calls that arrive without
a preceding `narrative_chunk` of `role: "headline"` (see `handleWriterTool`
in `agent/src/runner.ts`). The model occasionally drifts off the
system-prompt rule and skips straight to the lede; the rejection adds at
most one extra turn (~1-2s) and the renderer's role-grouping puts the
headline above the lede in the report panel regardless of arrival order.
Ad-hoc cached fixtures from before this change can be backfilled with
`npx tsx scripts/backfill_cached_headlines.ts`, which lifts the lede's
first sentence (citations preserved, em dashes stripped) into a headline
chunk so existing replay paths don't dead-end on the new rule.

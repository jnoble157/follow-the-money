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

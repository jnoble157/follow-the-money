# AGENTS.md

Operating manual for AI coding agents on this repo. Read this fully before writing any code, and reread the relevant section before any non-trivial edit. The repo's job is to look and read like one careful engineer wrote it under pressure — not like a generated zip of LLM output. You are a scribe for that engineer, not a co-author with your own voice.

## 0. What this project is

**Texas Money Investigator** — an agent that answers real money-in-politics questions about Texas state government by querying TEC public bulk data through a custom MCP server, resolving messy entity matches, cross-referencing lobbyist registrations, and writing sourced narrative reports with a network graph.

Tracks: **Agents Track** + **Brainforge / Vicinity Texas Open Data Track**. We satisfy the Open Data technical requirement two ways — a custom MCP server (the spine) and a published agent skill (`skill/SKILL.md`) documenting how to use it responsibly.

The pitch is `texas_money_investigator_pitch.pdf` (gitignored). Hackathon-wide context (judging, agenda, sponsor bounties, the MCP-or-skill gate) is in `hackathon.md`. Read both before non-trivial work.

## 1. The hard rules

If you ignore everything else in this file, follow these.

1. **Every numeric claim ties to a source row.** The agent's narrative cannot contain a dollar amount, a date, a count, or a contributor name without a `reportInfoIdent` (or equivalent row identifier) in the same sentence's footnote. No source row, no claim. The system prompt enforces this; do not weaken it.
2. **Citations point at TEC, not at us.** A footnote links to the original TEC filing PDF or page; we are a lens on public data, not the source.
3. **No invented data, no invented entities, no invented amounts.** If a tool returns nothing, the narrative says "no records found." If entity resolution is uncertain, the agent stops and asks. Fabrication is the single fastest way to lose the demo and the track.
4. **Public officials and aggregated patterns only.** Donor names + ZIPs are public by Texas statute, but our default outputs are aggregations (top-N donors per filer, employer rollups, industry totals). We do not produce donor-by-donor reports about private individuals. The track rules call this out; so do we.
5. **Use TEC's vocabulary as the schema, not our own.** `Filer`, `filerIdent`, `Contribution`, `Expenditure`, `Schedule`, `Cover Sheet`, `Lobbyist`, `Registrant`, `Client`. Don't translate to "politician," "donation," "campaign account." The reader is a journalist or a civic researcher who already knows the TEC terms; teaching them new terms is friction.
6. **No `utils.py`, `helpers.py`, `common.py`, `misc.py`. No `Manager`, `Service`, `Handler`, `Helper` class suffixes.** Module and class names are concrete domain nouns: `filers.ts`, `Contribution`, `RegistrantClientPair`, `EntityResolver`, `EmployerRollup`.
7. **No emoji** anywhere — code, comments, commits, docs — unless the user explicitly asks.
8. **Ask before adding a dependency.** Each new package is a new thing that can break in front of a judge.
9. **Don't co-author commits to AI agents.** No `Co-authored-by: Claude / Codex / GPT` trailers, no agent signatures in commit bodies. The repo is a candidate's portfolio, not an LLM artifact.

## 2. Code philosophy — traits to absorb

Concrete habits drawn from engineers whose code we want this repo to read like. Treat these as a style budget, not a poster. Hackathon time pressure is not an excuse to drop the register.

**Karpathy (nanoGPT, llm.c).** Variables match the math (or in our case, the schema). A reader who knows the TEC table layout should recognize the code. Comments cite the source — `# CFS-ReadMe.txt §ContributionData` — when a non-obvious field gets used. Files are single-author cohesive — split when there's real reason, not for "organization."

**Hotz (tinygrad, comma).** The best code is no code. Delete aggressively. Defensive checks for things that physically can't happen are noise. Terse names where the scope is small (`row`, `filer`, `q`), full names where scope is large (`RegistrantClientPair`). One canonical way to do a thing; alternatives get deleted. Don't add a class until the third concrete use.

**Carmack (.plan files, idTech).** Comments explain intent and tradeoffs, not what the code does. The line `# fall back to ZIP-only match when employer is "Self-Employed" — too noisy to discriminate` is gold. The line `# query the database` is noise. War-story comments at non-obvious workarounds are encouraged.

**Bellard (QEMU, FFmpeg).** Maximum capability per line of code. Few dependencies. A third-party package only when it eliminates substantial code. If 50 lines replace a framework, write the 50 lines.

**Acton (Insomniac DOD).** Data structures first, behavior second. Before a class, write down its data; if the data is one field and one method, it's a function. Question every abstraction by asking what data flows through it.

**Bernstein (qmail, djbdns).** Few dependencies, audited surface, no features-just-in-case. Inputs at boundaries are validated once and trusted thereafter. Errors are values, not exceptions thrown across module lines.

**Linus (kernel).** Naming is most of the design. Spend the time. If you renamed something three times in a row, the underlying abstraction is wrong.

These are not heroes; they are calibration. When you write a line and it doesn't match the register above, rewrite it.

## 3. Anti-slop discipline

Specific patterns that mark code as AI-written. Avoid all of them.

- **Generic class suffixes.** `FilerManager`, `ContributionService`, `EntityHandler`. Replace with the noun: `Filer`, `Contribution`, `EntityResolver`.
- **Defensive everything.** `try`/`except Exception` around code that cannot throw, type checks on parameters that are typed, `if x is not None` after a required field. Trust the types and the boundaries.
- **Comprehensive docstrings.** Don't enumerate every parameter in prose when the type signature already says it. A docstring exists when there's a non-obvious invariant, side effect, unit convention, or citation worth surfacing.
- **Logging spam.** `logger.info(f"Starting {name}")` / `logger.info(f"Finished {name}")` around every function. Log at decision points and at boundaries; nowhere else.
- **Wrapper classes.** Wrapping `duckdb.connect()` in a `DatabaseConnectionManager` that adds nothing but a different name. Use the library directly until you have a reason not to.
- **Walls of bullets in docstrings and comments.** Prose explains thinking; bullets enumerate items. If you wrote a 7-item bullet list inside a function, it's probably wrong.
- **Banned phrases in any markdown:** "comprehensive," "robust," "seamless," "leveraging," "best-in-class," "production-ready," "elegant," "powerful," "cutting-edge," "state-of-the-art," "first-class." Strike them.
- **Speculative options.** MCP tool arguments and CLI flags for features no demo path exercises. YAGNI is sharper at a hackathon, not weaker.
- **`get_*` and `set_*` everywhere.** Properties when access has no side effect; explicit method names when it does.
- **Auto-generated test scaffolding.** `test_init`, `test_str_representation`. Tests assert behavior, not existence.
- **README marketing register.** No tagline, no "✨ features ✨" section, no badges-for-the-sake-of-badges. Motivation in one paragraph, then how to run it.

A useful self-check: would a senior engineer reading this file blind guess it was written by a person or by an LLM? If the answer is "LLM," rewrite.

## 4. Naming conventions

- Classes are domain nouns from TEC's vocabulary: `Filer`, `Contribution`, `Expenditure`, `CoverSheet`, `Pledge`, `Registrant`, `RegistrantClientPair`, `EmployerRollup`, `EntityResolver`, `DonorCluster`.
- Modules are domain concepts: `mcp/src/tools/find_filer.ts`, `agent/resolution/names.ts`, `scripts/ingest/build.py`. Never `core.ts`, `base.ts` (except for ABCs explicitly named `Base*`), `common.ts`.
- Functions are verbs: `find`, `top`, `resolve`, `cluster`, `narrate`, `cite`. Tools in the MCP server are verb-noun: `find_filer`, `top_donors`, `get_contributions`, `cross_reference_lobby`.
- Variables match the schema. `filerIdent` (not `filer_id` — match TEC's camelCase), `contributorNameOrganization`, `expendAmount`. Convert to verbose Python snake-style only at I/O boundaries, not inside SQL strings or row dicts.
- Acronyms are PascalCase as if they were words: `TecFiler`, `McpServer`, `DceCandidate`. Don't write `TECFiler` or `MCPServer`.

## 5. Data hygiene

- We expose three default output shapes: `top-N donors per filer`, `industry/employer rollup`, `lobbyist-overlap callouts`. Building any other output that names a private individual requires a deliberate, agent-narrated choice and a one-line justification in the response — not silent.
- Donor employer is free-text. It is the messiest field in the dataset. Always show the rolled-up form first, with an "expand" affordance to drill into the raw variants. Do not silently re-attribute one variant to another canonical form without surfacing the merge.
- Filer types are codes (e.g. `JCOH`, `CCC`, `MPAC`, `GPAC`, `SPAC`). Translate them at the presentation boundary, not in queries; users searching for `MPAC` should still get hits.
- Date fields in the bulk CSV are `yyyyMMdd` strings. Parse once at ingest, store as `DATE` in Parquet. Never let a string date escape into the agent's narrative.
- Money fields use `BigDecimal` per the schema and arrive as strings like `0000000000.00`. Cast to `DECIMAL(14,2)` at ingest. Do not use floats anywhere amounts are summed.
- Lobby `FilerID` and campaign-finance `filerIdent` are different namespaces. Joining them goes through fuzzy name match, not ID equality. The MCP server exposes this explicitly: a tool that joins lobbyist to candidate names returns a `confidence` field, and the agent's prompt requires showing low-confidence joins as "possible match" rather than "match."
- `web/lib/profiles/*_manifest.json` files are generated from Parquet and are gitignored. Regenerate them with `python scripts/ingest/build_manifests.py` after rebuilding `data/parquet/` or changing `web/lib/profiles/officials_map.json`. Keep `officials_map.json` tracked; it is curated input, not generated output.

## 6. Architecture rules

```
mcp/                    TypeScript MCP server. The spine.
  src/
    tools/              one file per MCP tool (find_filer, get_contributions, ...)
    db/                 DuckDB connection + parameterized query builders
    schemas/            Zod schemas for tool args + results, exported as JSON Schema
    skills/             agent-skill snippets surfaced to clients via the server
  package.json
agent/                  agent runtime — system prompt, planner, narration
  prompts/
  runner.ts
  eval/                 hand-graded eval rig
web/                    Next.js frontend
  app/
    investigate/page.tsx
    components/
scripts/
  ingest/
    download.py         stdlib-only TEC downloader
    build.py            CSV/xlsx -> Parquet via DuckDB + openpyxl
docs/
  tec-schema/           TEC's own schema docs (committed; reference for everyone)
  walkthrough.md        one canonical investigation end-to-end with figures
data/                   gitignored except README.md
skill/                  Open Data track deliverable
  SKILL.md
  references/
```

- A new module appears when there is a coherent domain concept with at least three distinct callers. Until then, keep it inline.
- MCP tool args + results are Zod schemas. They are the schema, not optional documentation. Every result row has a `source` field with the underlying `reportInfoIdent` — see Hard Rule 1.
- Library code does not own the entry point. CLI / server bootstrap stays in one obvious file (`mcp/src/index.ts`, `scripts/ingest/{download,build}.py`).
- Anything that touches a live LLM call has a deterministic stub path so we can demo offline. Build the stub first, wire the live call second.

## 7. Demo discipline

The hackathon's only deliverable is a working demo. Treat it as a feature, not a task at the end.

- Maintain `DEMO.md` with three pre-baked hero investigations (one short and visceral, one sophisticated, one investigative) and the exact happy-path script: what to type, what to expect, what shows up in the plan trace as it runs. Update it whenever the path changes. If the script doesn't work end-to-end on a fresh `data/duckdb/money.duckdb` 30 minutes before submission, that's a sev-1.
- Pre-load demo questions in the search bar of the web UI. Judge attention is a scarce resource.
- The agent-iest moment is the **live plan trace** — the agent narrating each `plan_step`, calling MCP tools (`find_filer`, `top_donors`, `cluster_employer_variants`, `cross_reference_lobby`), optionally hitting `web_search` for context, and rendering that whole sequence in the left rail in real time. At least one pre-baked demo question must exercise multi-tool sequencing visibly (the Epstein hero: filer lookup -> top donors -> employer cluster -> auto-merge methods chunk). If a system-prompt or tool change makes the plan trace less visible — fewer steps, silent jumps, no methods chunk after a fuzzy merge — fix the change, not the trace.
- Failure modes that can hit on stage (model rate limits, slow first-token, model refusals, venue wifi flake) get explicit handling — a cached fallback for the three hero questions, a clear error message, or a "demo mode" toggle. Silent stalls are the worst outcome on a stage.
- Latency budget for the headline interaction: under 10 seconds for the visible plan trace, under 30 seconds for the full investigation. If it's longer, show progress. DuckDB on Parquet is sub-second on this dataset; if a query takes more than 1 second the SQL is wrong, not the data.

## 8. Testing

Hackathon-pragmatic, not enterprise.

The eval rig has two suites. They share one runner (`agent/src/eval/run.ts`) and one entry schema; they differ in what they assert and what gates what.

- `agent/src/eval/questions.yaml` is the **regression** suite — up to 12 hand-graded entries with strict numeric assertions (top-donor name, totals bands cross-checked against the original TEC or `data.austintexas.gov` row). Every PR that touches the agent runtime, a tool, or entity resolution runs `npm run eval` (defaults to this suite) and reports the delta. A regression of more than 1 of N fails the change. Numbers come from the source site; never widen a band to make a flaky run pass.
- `agent/src/eval/exploratory.yaml` is the **soak** grid — ~100 prompts across jurisdiction routing, refusals, prompt-injection resistance, citation grounding, employer rollups, lobby cross-reference, and fair-day chaos. Behavioral assertions backed by automatic checks the runner executes against the event stream: `expected_tools_contains`, `must_not_call_tools`, `max_calls_per_tool`, `max_citations_per_chunk`, `requires_methods_after_cluster`, `citation_must_be_grounded` (every cited `reportInfoIdent` must trace to a preceding `tool_result.sourceRows`), `must_not_match` / `must_match` regex over narrative. Run with `npm run eval -- --suite exploratory` before each demo and after any system-prompt edit. Pass-rate floor before submission is **95%**; remaining failures are documented in `agent/src/eval/known_gaps.md` with category and reason.
- Unit tests on parsing, scoring, name normalization, and any code with non-obvious math. Don't waste tokens unit-testing glue code.
- Smoke test the demo path. One test that runs the headline interaction end-to-end against the deterministic stub LLM. If this test breaks, the demo is broken.
- Fuzzy-match thresholds are constants with a comment citing the empirical confusion observed at that threshold. `# threshold 0.78 = no false merges in the 2024 House donor sample` is gold. Tuning a threshold without rerunning both suites is a sev-2.
- No mocks of our own modules. Mock the LLM call and nothing else.

## 9. Dependencies

- Pin versions before submission. Floating versions are how a `pip install` or `npm install` in the morning kills the demo.
- Each new dependency is one more thing to break in front of a judge. The bar is "this saves us at least 50 lines of code we'd otherwise write."
- The deliberate stack:
  - **Data layer:** DuckDB over Parquet. No Postgres. No SQLite. DuckDB reads our Parquet directly, runs analytical SQL fast, and ships as a single binary.
  - **Ingest:** Python stdlib for downloads (so a fresh checkout works without `pip install`); `duckdb` + `openpyxl` + `pyarrow` for Parquet conversion.
  - **MCP server:** TypeScript. `@modelcontextprotocol/sdk`. `duckdb-async` (or the same `duckdb` Node binding) for queries. `zod` for schemas. `rapidfuzz` (Node binding) for fuzzy matches.
  - **Agent runtime:** Whatever the live model SDK is (OpenAI / Anthropic). The agent loop is plain TypeScript, not a framework. No LangChain, no LlamaIndex, no Crew. The MCP server is the abstraction; we don't need a second one.
  - **Frontend:** Next.js (App Router), `vis-network` for graphs, `recharts` for time series. No design system. Tailwind.
- Forbidden by default without explicit approval: anything that calls itself a "framework" and wants to own the entry point; agent-orchestration libraries; ORMs (use raw SQL — DuckDB is a query engine, not a relational mapping target).

## 10. Git and commits

- Commits are small and concrete. Subject line in imperative mood, ≤72 chars, names what changed and why.
- Good: `cluster filers across SPAC + officeholder accounts; sums match TEC site for top 50`.
- Bad: `feat: implement comprehensive filer reconciliation`.
- WIP commits during development are fine; squash before submission if they don't carry independent value. An honest WIP commit is more credible than a clean rewrite.
- Do not co-author commits to AI agents. No `Co-authored-by: Codex / Claude / GPT` trailers.
- Never commit secrets. `.env` is gitignored from commit zero. Sponsor API keys and model API keys especially: a leaked key during a hackathon is a public Slack incident.
- Never commit raw TEC data. `data/raw/` and `data/parquet/` are gitignored. `docs/tec-schema/` (TEC's own schema reference) is committed because it's small, stable, and saves every contributor a download.

## 11. Documentation discipline

- `README.md` is the front door. ≤200 lines. One paragraph of motivation, install / run instructions, a short architecture section, and links to `DEMO.md` + `data/README.md` + `skill/SKILL.md`. Declarative, no marketing register.
- `DEMO.md` is the demo script (see §7).
- `data/README.md` is the source-of-truth for what raw data we use, where it comes from, and how to populate `data/`.
- `skill/SKILL.md` is the Open Data track skill deliverable. Treat it as reference material future agents will use, not as marketing copy. It documents the MCP tools, the entity-resolution gotchas, and the "ask before naming a private individual" contract.
- `hackathon.md` is the source of truth for tracks, judging criteria, and the submission target. Keep it accurate; if a sponsor updates rules, update the file.
- `docs/walkthrough.md` is one canonical investigation end-to-end with figures (the same one used as the hero demo).
- Don't write docs for code that doesn't exist yet. Aspirational documentation is a tell.

## 12. Track-fit reminders — read before each session

- We're scored on Impact & Clarity, Technical Execution, Innovation, User Experience, and Track Fit (see `hackathon.md`). When making a tradeoff, ask which axis the change moves and whether it's the axis we're behind on.
- The Open Data track's hard gate is "custom MCP server and/or proper agent skill." We ship both. Anything that erodes the MCP surface or the skill doc is erosion of our track-fit score.
- The Agents-track money shot is the live plan trace — agent narrates each step, calls MCP tools and `web_search`, auto-merges fuzzy clusters with a visible methods chunk, and renders the full sequence in the left rail. The user never has to make a disambiguation decision; the agent owns ambiguity. Defend that path.
- "Working demo over slides" is in the criteria verbatim. A polished but stubbed feature beats a working but invisible one. A working and visible feature beats both.
- DeepInvent and Miro bounties are listed in `hackathon.md`. If something we build is plausibly eligible, surface it; don't silently optimize for a bounty without consensus.

## 13. When you don't know

The single most valuable thing an agent can do here is decline gracefully.

- If a TEC field's meaning is unclear, the answer is in `docs/tec-schema/CFS-ReadMe.txt` or `docs/tec-schema/CFS-Codes.txt`. Read those first; ask the user only if the docs disagree with the data.
- Entity-resolution ambiguity is the agent's job, not the user's. When `cluster_employer_variants` returns a cluster, always merge and emit a methods chunk citing the variants and confidence. When `find_filer` / `find_state_filer` returns multiple candidates with comparable confidence, pick the highest-confidence row, then narrate the alternatives in the body so the reader can verify; never block on a modal.
- If a refactor would touch the demo path, propose first; do not edit and break the script.
- If a change would shift the eval pass rate, run the eval and report the delta in the same commit.
- If you are uncertain whether a piece of code is correct under a hard rule above, leave it untouched and flag it.

The cost of an honest "I don't know" is a clarifying message. The cost of a fabricated number on a TEC investigation is the project's credibility, which is the only thing it has.

## 14. Pre-flight checklist before claiming a change is done

- [ ] Every numeric output in any new code path carries a `reportInfoIdent` (or equivalent source row ID)
- [ ] No `utils.py` / `helpers.py` / `Manager` / `Service` / `Handler` introduced
- [ ] Zod / dataclass schemas present at every boundary the change touches
- [ ] `tsc` / `mypy` and lint clean on touched files
- [ ] Demo script in `DEMO.md` still works end-to-end (or has been updated)
- [ ] If MCP tool surface changed: skill doc updated; eval rerun
- [ ] If entity-resolution code touched: eval rerun, fuzzy-match thresholds reviewed
- [ ] If web profile manifests changed locally: they remain gitignored and can be regenerated with `python scripts/ingest/build_manifests.py`
- [ ] No new dependency without justification in the commit body
- [ ] No secrets, sponsor keys, or raw TEC data files in the diff
- [ ] Commit message names the specific change and the reason
- [ ] The diff reads like the rest of the file — same naming, same comment density

If any item fails, the change is not done.

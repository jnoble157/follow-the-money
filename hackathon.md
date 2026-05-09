# Hackathon — AITX Community × Codex

Single source of truth for the rules of the game we're playing this weekend. If anything below conflicts with what an organizer says in person or in Discord, the organizer wins; update this file when that happens.

## Logistics

- **Event:** AITX Community × Codex Hackathon
- **Location:** Antler VC, Austin TX ([map](https://maps.app.goo.gl/Vn4z8mWcYjdLoLna6))
- **Dates:** May 8–10, 2026 (Friday evening through Sunday afternoon)
- **Format:** In person
- **Discord:** https://discord.gg/PNGASkgCBv — primary channel for organizer updates
- **Submission form:** TBD — link will land in Discord
- **Contact:** team@aitxcommunity.com

## Tracks

We pick exactly one. Track fit is one of the five judging criteria, so we should be able to state in one sentence which track we're in and why.

### Agents Track — Build Autonomous AI Agents

Agents that reason, plan, use tools, and complete meaningful tasks with minimal human intervention. Goes beyond a chatbot or a thin LLM wrapper.

A strong submission shows:
- What the agent can do
- What tools / data sources it can access
- How it decides what action to take
- How it handles ambiguity, failure, or changing context

Example ideas listed by organizers: research-and-outreach agent, coding agent that opens PRs, local Austin errand assistant, sales-ops lead enrichment, multi-tool data agent.

### AutoHDR Image Gen / Editing Track — Push Image Generation to Its Limits

AI-powered image generation, editing, enhancement, or visual creativity. The bar is a compelling image-based product experience, not a single nice image.

Organizers are especially interested in projects that show:
- Control and iteration (refine, preserve detail, edit specific regions)
- Consistent visual styles across outputs
- Turning rough user input into polished creative output

Example ideas listed by organizers: brand-consistent ad creative, AI photo editor for real estate / campaigns, product photography composer, visual storytelling sequences, room restyler, card / poster / flyer generator with editable controls.

### Brainforge / Vicinity Texas Open Data Track — Make Texas Public Data Useful

Open-source tool that helps people explore, understand, and interact with real Texas public data through a visual interface (maps, charts, tables, filters, dashboards, NL interfaces, agent workflows).

Hard constraints:
- Built on public datasets with clear attribution
- Respect terms of service. No scraping behind authentication. No misuse of sensitive fields.

**Dataset requirement (updated, hard gate).** Submissions must use at least one dataset from one of these portals:
- https://data.austintexas.gov/
- https://www.dallasopendata.com/
- https://data.sanantonio.gov/
- https://data.houstontx.gov/
- https://tryopendata.ai/

Other datasets (state-level, federal, etc.) may supplement, but at least one of the above must be a primary data source.

**Technical requirement (hard gate for this track).** Teams must deliver at least one of:
1. A custom MCP server with well-scoped tools for discovery, bounded query, and/or summaries.
2. A proper agent skill with a skill document and references explaining how to use the project safely and effectively in an agent workflow.

Shipping both is competitive but not required.

Example ideas listed by organizers:
- A map-based tool for exploring Texas housing, zoning, or permitting data
- A dashboard for comparing economic indicators across Texas counties
- A visual explorer for public education, transportation, energy, or infrastructure data
- A civic data assistant that helps users query and summarize Texas public datasets
- A county-by-county comparison tool for population, jobs, business formation, or affordability
- An MCP-powered Texas data server that lets agents discover, query, and summarize public datasets safely

## Judging criteria

Each axis scored 1–10. When making a tradeoff, name the axis the change moves.

1. **Impact & Clarity** — Who is it for? What problem is solved? Is success measurable?
2. **Technical Execution** — Architecture, reliability, latency, data handling, build complexity. Working demo over slides.
3. **Innovation** — Originality, creative approach, non-obvious design choices.
4. **User Experience** — Clear flows, helpful responses, safety / guardrails, accessibility.
5. **Track Fit** — How well the solution addresses the chosen track's goals and constraints.

## Bounties and bonuses

Independent of the main track prizes. We can pursue these in parallel if our project is naturally eligible.

### Miro — $500 cash

Details: https://miro.com/app/board/uXjVHdaoUbk=/

### DeepInvent — Free licenses + $500 cash

- **Bounty 1: Best Patentable Hack** — Provisional patent filing through DeepInvent + $500 cash. Open to any team in any track. Submit the patent through https://deepinvent.ai/ — DeepInvent's team reviews submissions and selects the winner.
- **Bounty 2: Top Science Project** — $250k DeepInvent license for one year, including godmode access. Open to any science-related project (cancer research, materials science, genetics, peptide discovery, AI research). DeepInvent team selects the winner.

## Agenda

### Day 1 — Friday May 8

- 5:00–5:30 PM — Doors open, check-in
- 5:30–7:00 PM — Kickoff: welcome, hackathon intro
- 7:00 PM — Dinner (pizza)
- 7:30 PM — Hacking begins
- 8:30 PM onward — Overnight hacking

### Day 2 — Saturday May 9

- 8:30–9:30 AM — Breakfast
- 9:30 AM onward — Continue hacking
- 12:30–1:30 PM — Lunchtime networking
- 12:30–2:30 PM — Lunch served
- 6:30–7:00 PM — Progress check-in
- 7:00 PM — Dinner (Chipotle)
- 7:00 PM onward — Overnight hacking

### Day 3 — Sunday May 10

- 8:30–9:30 AM — Breakfast
- **11:00 AM — Code freeze, submissions due**
- 11:00 AM–2:00 PM — Hack fair station setup
- 11:30 AM–3:00 PM — Judging
- 11:30 AM–1:00 PM — Developer roundtables
- 2:00–5:00 PM — Hack fair and public voting
- 4:00–5:00 PM — Finale: awards and winner demos

## Hacker resources

### Codex Pro

Free Codex Pro redemption codes are emailed at the kickoff. Anyone not at the kickoff has to notify an organizer to get access. Common use cases: https://developers.openai.com/codex/use-cases. Specifically recommended:
- Operations Optimization — https://developers.openai.com/codex/use-cases/verified-operations-workflows
- Idea to POC (with ImageGen) — https://developers.openai.com/codex/use-cases/idea-to-proof-of-concept
- Updating Documentation — https://developers.openai.com/codex/use-cases/update-documentation

### Miro — advanced licenses + early MCP access

Setup:
1. Accept the Miro sandbox invite (separate email; check spam). Required for AI features and the hackathon template.
2. Connect your existing OpenAI Codex account.
3. Install the Miro MCP for OpenAI Codex from the marketplace: https://miro.com/marketplace/miro-mcp-for-openai-codex
4. Select the team "AITX Community Hackathon" — MCP only reads boards in the chosen team.
5. Restart Codex / open a new session.

Tip: same email for Miro sandbox and Codex makes setup smoother.

Optional prep:
- AITX Hackathon Miro board — https://miro.com/app/board/uXjVHdaoUbk=/
- Zero to App in Minutes — Miro AI & MCP — https://www.youtube.com/watch?v=OYuJY1LW7JA
- Miro AI Flows and Sidekicks — https://academy.miro.com/path/miro-ai
- Miro Prototyping — https://academy.miro.com/path/make-the-most-of-miro-prototypes
- Miro MCP overview — https://miro.com/ai/mcp/
- Miro MCP developer docs — https://developers.miro.com/docs/mcp-intro
- Miro MCP tutorials playlist — https://www.youtube.com/playlist?list=PLmiHe0R4hbzSGgHWYFYwvbAKTvFPRvG2a

### Featherless — unlimited free inference for open-source models

Setup guide and quickstart distributed via the hackathon attachments. Useful as a fallback if we want to run an OSS model without paying for hosted inference.

## Sponsors

- **Codex** (https://chatgpt.com/codex/) — AI coding agent that can read, write, edit, and run code autonomously. Title sponsor.
- **Antler** (https://to.antler.co/AITX) — Pre-seed fund, $600K first institutional check. NYC / ATX / SF residencies.
- **Miro** (https://miro.com/) — AI-powered visual workspace; intelligent canvas, AI workflows, Miro MCP integration with Codex / Claude / etc.
- **AutoHDR** (https://autohdr.com/) — Edits 1 in 10 U.S. real estate listings using AI. $0 to $8M ARR in under a year.
- **Atlassian for Startups** (https://www.atlassian.com/software/startups) — AI-supercharged collaboration tools, MVP to IPO.
- **BrainForge** (https://www.brainforge.ai/) — Embedded data and AI team building governed company-brain systems for client data and workflows.

## What this means for our project

Current project: **Texas Money Investigator** — see `AGENTS.md` §0. Targeting both **Agents** and **Open Data** tracks.

A short checklist to apply when scoping:
- For Open Data track: at least one primary dataset must come from data.austintexas.gov / dallasopendata.com / data.sanantonio.gov / data.houstontx.gov / tryopendata.ai. State-level TEC data is supplementary, not primary, for that track.
- For Open Data track: an MCP server and/or agent skill is non-negotiable. We're shipping both. See `AGENTS.md` §12.
- For Agents track: defend the live plan trace — visible MCP tool calls, web_search, and silent auto-merge of fuzzy clusters with a methods chunk. See `AGENTS.md` §7.
- We submit by **11:00 AM Sunday May 10**. Code freeze is hard.
- The submission needs a working demo a judge can use. See `AGENTS.md` §7 (demo discipline).
- If our project is plausibly patentable or a science project, we should also submit to DeepInvent — it's a parallel free swing.

### Austin Open Data parallels to TEC (the integration the requirement is steering us toward)

The City of Austin publishes city-level mirrors of the same data structures TEC publishes for the state. Both go through Socrata APIs at data.austintexas.gov, downloadable as CSV / JSON / RDF.

| TEC (state) | data.austintexas.gov (city) | Austin dataset ID |
|---|---|---|
| Campaign finance contributions | Campaign Finance — Contributions (City Council races, 2016–present) | `3kfv-biw6` |
| Lobbyist registrations | Lobbyists — Master List | `96z6-upac` |
| Lobbyist registrations (alt view) | Lobbyist — Registrants | `58ix-34ma` |
| Lobby registration filings | Lobbyist Reports + Expenditures + Clients + Subject Matters + City Officials Disclosed | (multiple, see catalog) |

CSV access pattern: `https://data.austintexas.gov/api/views/<dataset-id>/rows.csv?accessType=DOWNLOAD` (or `/resource/<id>.csv` via the SODA API for filtered queries).

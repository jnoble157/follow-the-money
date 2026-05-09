# Investigations — story brainstorming

A running log of demo-worthy findings, the queries that surface them, and notes for teammates picking up an investigation thread. Treat this as the team's shared whiteboard, not finished material.

A register note up front: every finding here is a **descriptive pattern from public records**. We don't claim wrongdoing or score behavior. Good civic journalism shows the pattern and lets the reader draw the conclusion. So does our agent. If something belongs in the demo it's because the pattern is striking and the citation is clean — not because it's "dirt" on a person. See `AGENTS.md` §1 (Hard Rules) and §5 (Data Hygiene) before adding to this doc.

## What's in our data, by the numbers

| Source | Subject | Rows | Coverage | Where |
|---|---|---:|---|---|
| data.austintexas.gov | Austin City Council contributions | 238,228 | 2014–2026 | `data/parquet/austin/cf/contributions.parquet` |
| data.austintexas.gov | Austin transaction detail | 266,819 | 2014–2026 | `data/parquet/austin/cf/transaction_detail.parquet` |
| data.austintexas.gov | Austin campaign expenditures | 27,941 | 2014–2026 | `data/parquet/austin/cf/expenditures.parquet` |
| data.austintexas.gov | Austin lobby municipal questions | 162,062 | history | `data/parquet/austin/lobby/municipal_questions.parquet` |
| data.austintexas.gov | Austin lobby clients | 124,812 | history | `data/parquet/austin/lobby/clients.parquet` |
| data.austintexas.gov | Austin lobby reports | 6,195 | history | `data/parquet/austin/lobby/reports.parquet` |
| data.austintexas.gov | Austin registered lobbyists | 320 | current | `data/parquet/austin/lobby/registrants.parquet` |
| TEC | State lobby registrations (per engagement) | 80,799 | 2018–2026 | `data/parquet/tec/lobby/registrations/*.parquet` |
| TEC | State lobby subject matter | 390,616 | 2018–2026 | `data/parquet/tec/lobby/subject_matter/*.parquet` |
| TEC | State campaign-finance bulk | (deferred) | 2000–2026 | `data/parquet/tec/cf/*.parquet` once ingested |

Schema reference: `docs/tec-schema/CFS-ReadMe.txt`, `docs/tec-schema/CFS-Codes.txt`, `docs/tec-schema/CampaignFinanceCSVFileFormat.pdf`. The Austin schemas are documented inline in their CSVs and on each dataset's page on data.austintexas.gov (catalog API: `https://data.austintexas.gov/api/catalog/v1?q=<query>&search_context=data.austintexas.gov`).

## Demo-tier findings (rank-ordered)

### Tier S — the hero demo candidate

#### S1. Robert Epstein and the 2018 McKalla Place / soccer-stadium ballot fight

**One-line story:** A single Austin investment-fund principal personally bankrolled one side of a 2018–2019 ballot fight to roughly $280,000 — but only after merging five different employer-field variants does the picture come together.

**Public figure:** Robert Epstein, founder of Prophet Capital Asset Management LP (Austin-based investment fund). Public on the firm's website and in TEC filings.

**The fight:** Fair Play Austin PAC opposed the city's 2018 deal handing the McKalla Place site to Major League Soccer (now Q2 Stadium / Austin FC). It was on the ballot as Prop K. The pro-stadium side won.

**Numbers (cite each in the demo narrative — every row is a real filing):**

| Year | Recipient | Listed employer | Type | $ |
|---|---|---|---|---:|
| 2016 | Austin Forward | Prophet Capital | monetary | 10,000 |
| 2016 | Austin Forward | Prophet Capital | monetary | 5,000 |
| 2018 | Fair Play Austin PAC | Prophet Capital Management | in-kind, signature gathering | 50,000 |
| 2018 | Fair Play Austin PAC | Prophet Capital Management | in-kind | 17,831 |
| 2018 | Fair Play Austin PAC | Prophet Capital Management | in-kind | 12,156 |
| 2018 | Indy Austin | PCM LLC | monetary | 24,000 |
| 2018 | Megaphone | PCM LLC | monetary | 20,000 |
| 2019 | Fair Play Austin PAC | Prophet Capital | monetary | **175,000** |
| 2019 | Fair Play Austin PAC | Prophet Capital | monetary | 25,000 |
| (plus smaller gifts to multiple Austin candidates and Austin Leadership PAC, 2020–2025) | | | | |

**Why this lands:** This is the most visible plan trace in the demo. Without entity resolution, a journalist or a judge looking at TEC's own search tool sees seven separate-looking transactions and misses the picture. With our agent's roll-up of `Prophet Capital` / `Prophet Capital Management` / `Prophet Capital Asset Management LP` / `PCM` / `PCM LLC`, the actual scale becomes visible in one screen — and the left-rail trace shows every tool call that got us there.

**Demo question:** *"Who was the biggest individual political spender in Austin's 2018 ballot cycle?"* — agent narrates a plan, runs `top_pacs` then `get_contributions`, sees three employer-name variants for the same donor, calls `cluster_employer_variants`, auto-merges at 92% match confidence, emits a `methods` narrative chunk that names the variants and confidence, then prints the rolled-up total + network graph + footnoted narrative. No modal, no user input.

**Source query (DuckDB):**
```sql
SELECT Contribution_Year, Donor, Donor_Reported_Employer, Recipient, Contribution_Type,
       ROUND(TRY_CAST(Contribution_Amount AS DOUBLE)) AS amount
FROM 'data/parquet/austin/cf/contributions.parquet'
WHERE Donor ILIKE 'epstein, robert%'
ORDER BY Contribution_Date DESC;
```

### Tier A — strong supporting investigations for the home page

#### A1. The $1.18M Senate-to-mayor war-chest transfer (Watson, 2022)

**One-line story:** When Kirk Watson left the Texas State Senate to become Austin mayor, his single biggest political expenditure was a $1,186,764 transfer from his old Senate campaign account into a new PAC named KPW PAC — recycling state-level fundraising into a city campaign and pre-loading him to outraise his entire 2024 mayoral field 17:1.

**The numbers:**
- 2022 transfer from Watson's senate campaign account → KPW PAC: $1,186,764. Filing description: "Contribution (from prior Senate C/OH funds)."
- 2024 Austin mayor's race fundraising:
  - Watson: $1,986,830 (2,896 unique donors, $346 avg)
  - Llanes-Pulido: $193,254
  - Tovo: $118,774
  - Greco: $101,345
  - Bowen: $16,025

**Why it's a good demo:** Single largest expenditure in our entire Austin dataset. Number is jaw-dropping. The context (state senate war chest → city PAC) is a "wait, can you do that?" moment that legally is yes, and that's exactly the public-interest answer.

**Demo question:** *"Where did Kirk Watson's biggest political spending in 2022 actually go?"*

**Source query:**
```sql
SELECT Payment_Year, Paid_By, Payee, Expenditure_Type, Expense_Description,
       ROUND(TRY_CAST(Payment_Amount AS DOUBLE)) AS amount
FROM 'data/parquet/austin/cf/expenditures.parquet'
WHERE Paid_By = 'Watson, Kirk P.'
ORDER BY TRY_CAST(Payment_Amount AS DOUBLE) DESC NULLS LAST LIMIT 5;
```

#### A2. Endeavor Real Estate ↔ Mayor Watson ↔ city lobbying (the textbook pattern)

**One-line story:** One Austin development firm — Endeavor Real Estate Group — has 33 employees who max-out donations to Mayor Watson every cycle, retains four city-registered lobbyists who file under "REAL ESTATE INVESTMENT/DEVELOPMENT," and also funded the pro-mobility PAC supporting the firm's transit-adjacent projects.

**The numbers:**
- 33 Endeavor employees → Watson: $39,439 across 94 contributions, 2022–present (each employee gives at the per-cycle max).
- Endeavor as a registered Austin city lobby client: at least 4 registered lobbyists (Amanda Morrow, Andrew Linseisen, Kelly Wright, Julienne Cain), filed under "REAL ESTATE INVESTMENT/DEVELOPMENT."
- Endeavor leadership → Mobility for All PAC (pro-transit / pro-Project-Connect): $200,000 across 2 contributions.

**Why it's a good demo:** Cleanest "money in politics in three sentences" story we have. Naive top-donor query won't show Endeavor (no individual exceeds the threshold) — only employer rollup makes it visible. That's the agent earning its keep.

**Demo question:** *"What's the relationship between Endeavor Real Estate Group and Mayor Watson?"*

**Source queries:**
```sql
-- Donor side
SELECT Donor, Donor_Reported_Occupation, COUNT(*) AS n,
       ROUND(SUM(TRY_CAST(Contribution_Amount AS DOUBLE))) AS total
FROM 'data/parquet/austin/cf/contributions.parquet'
WHERE Recipient = 'Watson, Kirk P.' AND TRY_CAST(Contribution_Year AS INT) >= 2022
  AND Donor_Reported_Employer ILIKE 'Endeavor%'
GROUP BY 1, 2 ORDER BY total DESC;

-- Lobby side
SELECT cl.CLIENT_LAST_NAME, cl.BUSINESS_DESC, r.REGISTRANT_FULL_NAME AS lobbyist
FROM 'data/parquet/austin/lobby/clients.parquet' cl
LEFT JOIN 'data/parquet/austin/lobby/registrants.parquet' r USING (REGISTRANT_ID)
WHERE cl.CLIENT_LAST_NAME ILIKE 'Endeavor%';
```

#### A3. The cross-tier lobbyists (city + state)

**One-line story:** A small, named set of lobbyists — Demetrius McDaniel, Kathleen Mitchell, Ana Husted, Ryan Hanretty, Madison Gessner, Stefanie Sass, Jerry Philips, Elizabeth Hadley, and others — appear in both the City of Austin's lobbyist registry and the Texas state lobbyist registry. Same people shaping policy at City Hall and at the State Capitol.

**Why it's a good demo:** Demonstrates the cross-jurisdiction join in action. Track-fit nail: it literally requires both data.austintexas.gov *and* TEC. Nobody else has built this view.

**Demo question:** *"Which Austin city lobbyists also lobby the Texas state legislature?"*

**Source query:**
```sql
WITH austin AS (
  SELECT REGISTRANT_LAST_NAME || ', ' || COALESCE(REGISTRANT_FIRST_NAME,'') AS norm_name,
         REGISTRANT_FULL_NAME, EMPLOYER AS austin_employer
  FROM 'data/parquet/austin/lobby/registrants.parquet'
  WHERE REGISTRANT_LAST_NAME IS NOT NULL
),
tec AS (
  SELECT "Filer Name", "Business" AS state_employer, year
  FROM 'data/parquet/tec/lobby/registrations/*.parquet' WHERE year = '2025'
)
SELECT DISTINCT austin.REGISTRANT_FULL_NAME, austin.austin_employer, tec.state_employer
FROM austin JOIN tec ON LOWER(austin.norm_name) =
    LOWER(REGEXP_REPLACE(tec."Filer Name", ' \([^)]+\)$', ''))
LIMIT 20;
```

### Tier B — the visceral, easy-to-explain ones

#### B1. Save Austin Now PAC (Prop B 2021): Austin's tech billionaires funded the camping ban

- $4.95M total raised.
- Top individual donors: Philip Canfield (Ariet Capital, $450k), Joe Liemandt (ESW Capital, Trilogy founder, $100k), Stephen Oskoui + Luke Nosek (Gigafund / Founders Fund, $200k combined), Joe Lonsdale (Lonsdale Enterprises, Palantir cofounder, 8VC, $75k), Charles Maund Toyota ($100k), Royston Danielle (TelcoDR, $148k).

#### B2. Equity Action: National progressive donor networks fund the other side

- $3.16M total raised. Largest funders are not local: Open Society Policy Center ($1M), Heising-Simons Foundation ($450k), Charles and Lynn Schusterman Family Philanthropies ($425k), The Fairness Project ($445k), Sixteen Thirty Fund ($200k).
- Side-by-side with B1 it's a perfect frame: tech billionaires fund one Austin side, national progressive networks fund the other. Both sides are proxy fights for national money.

#### B3. Uber tried to buy a 2016 Austin election

- $3.21M raised by Ridesharing Works for Austin. Two donors: Uber Tech ($2.99M) and Lyft Inc ($226k). They lost; Uber pulled out of Austin for ~a year. Possibly the cleanest "corporate money trying to override a local vote" example in any Texas dataset.

#### B4. Land use is *the* thing Austin lobbyists are paid to fight about

- Of 162,062 lobbyist subject-matter records, ~85,000 are some variant of "land development entitlements / zoning / rezoning / platting / site plans." The next-biggest category is at least an order of magnitude smaller. The chart writes itself.

#### B5. Watson's money lives in the rich ZIPs

- Total to Watson 2022–2026 by ZIP: 78703 (Tarrytown / Old West Austin) $1,160,757; 78746 (Westlake) $684,386; 78731 (Northwest Hills) $662,182; 78704 $254,567. 78703 alone outraised every 2024 mayoral challenger combined.

### Tier C — interesting patterns that need more context

#### C1. The "Best Efforts" cluster on Save Austin Now (Oct 2021)

- Save Austin Now PAC reported hundreds of contributions during the Prop B campaign with employer field listed literally as "Best Efforts" — a regulatory placeholder for "we tried to ask, donor didn't say."
- Sample days: 10/04/2021 (167 donors, $18,515), 10/05/2021 (104 donors, $45,695), 10/07/2021 (127 donors, $14,590).
- Honest framing: a meaningful share of Save Austin Now's grassroots-looking contributions came from donors whose employer the campaign couldn't determine. We can show the pattern; we cannot say what it means without more reporting.

#### C2. The "Texans for Greg Abbott → Greg Abbott Campaign" intra-PAC transfers (2020)

- Six transfers, fall 2020, totaling $7.75M, all from Texans for Greg Abbott to Greg Abbott Campaign. Filed in Austin city data (probably because of how the filer registered with the City Clerk at the time). Real, but explanation needs research before it becomes a demo.

#### C3. Same-day employer bundling

- 167 donors at "Best Efforts" → Save Austin Now on a single day in October 2021.
- 26 Carollo Engineers Inc. employees → Carollo Engineers Inc. PAC on a single day in October 2024. Likely an internal payroll-deduction PAC, but a documentable concentration nonetheless.

#### C4. PAC-to-PAC pipelines

- TREPAC (Texas Realtors PAC) → Austin Board of Realtors PAC: $1M+ across multiple years. A state-level realtor money pipeline systematically funding the local Austin operation.
- Austin Firefighters PAC → Austin Firefighters Public Safety Fund: $450k+ over recent years (intra-firefighter pipeline).
- Worth a "follow the money pipelines" diagram.

#### C5. Hedgers in the 2024 mayor's race

- 24 named donors gave to *both* Watson and at least one of his challengers in 2024–2025 (e.g. Perry Lorenz, John Langmore, Tom Wald). Small set, but the existence of the pattern is its own story.

## Negative findings (where teammates can stop looking)

- **Federal officials are not in our data.** Ted Cruz: zero hits as a recipient anywhere. The reason is jurisdictional — federal filings live at the FEC, which we don't ingest. Adding an FEC adapter is post-hackathon.
- **Council-relative flag** (`COUNCIL_RELATIVE_YN` in `austin/lobby/employees.csv`): zero rows currently flagged. The column exists for future filings; nothing to mine today.
- **Same-name false positives are real.** "Heidi Cruz" is in our Austin data but as a City of Austin financial analyst contractor giving $27 to Equity Action — not Senator Cruz's wife (who works at Goldman, not the city). Use as a *demo of the agent refusing a tempting wrong answer* (see "Demo of a refusal" idea below).

## Demo flow ideas

These are not yet decisions, just options for `DEMO.md`.

- **Hero (the live plan trace):** S1 (Robert Epstein / McKalla Place) — agent runs `top_pacs` -> `get_contributions` -> `cluster_employer_variants`, auto-merges Prophet Capital / PCM / PCM LLC at 92% confidence, and shows the whole sequence in the plan trace.
- **Second hero (visceral number):** A1 (the $1.18M Senate-to-mayor transfer) — single biggest line item in the dataset.
- **Pre-baked tiles on the home page (judge clicks one):** A2 (Endeavor / Watson), A3 (cross-tier lobbyists), B4 (land-use lobbying chart).
- **Quick follow-ups for after the hero:** B1 (Save Austin Now donors), B3 (Uber 2016).
- **Refusal demo (handles ambiguity gracefully):** Heidi Cruz — agent finds the row, looks at employer + occupation + amount + ZIP, refuses to call her the senator's wife. Lands the AGENTS.md §1 point about "no fabrication."

## Data sources cheatsheet

### data.austintexas.gov

- **Catalog browse:** `https://data.austintexas.gov/api/catalog/v1?q=<query>&search_context=data.austintexas.gov`
- **Bulk CSV download:** `https://data.austintexas.gov/api/views/<dataset_id>/rows.csv?accessType=DOWNLOAD`
- **Filtered SODA query:** `https://data.austintexas.gov/resource/<dataset_id>.json?<SoQL>` — useful for the live MCP server when we don't want to bulk-download.
- Dataset IDs we use are listed in `data/README.md`.

### Texas Ethics Commission (state level)

- **Campaign-finance bulk:** https://prd.tecprd.ethicsefile.com/public/cf/public/TEC_CF_CSV.zip (linked from https://www.ethics.state.tx.us/search/cf/).
- **Lobby per-year files:** `https://www.ethics.state.tx.us/data/search/lobby/<YEAR>/<YEAR><FILE>.xlsx` (naming stable 2018+).
- **Schema docs:** `docs/tec-schema/CFS-ReadMe.txt`, `CFS-Codes.txt`, `CampaignFinanceCSVFileFormat.pdf`.
- **TEC web search (verification):** https://www.ethics.state.tx.us/search/cf/ — useful for confirming a finding by clicking the same filer's report by hand.

### Texas Legislature Online (deferred — not yet ingested)

- FTP: `ftp://ftp.legis.state.tx.us`
- Bill history XML: `/bills/<session>/billhistory/<bill_type>/`
- Web membership: https://capitol.texas.gov/committees/membership.aspx
- Useful for: matching state-level lobbyist subject matter to specific bills + committee membership. Add to the cross-reference layer once the core agent loop is solid.

### Federal Election Commission (deferred — not yet ingested)

- Bulk data: https://www.fec.gov/data/browse-data/?tab=bulk-data
- Useful for: federal officials (Ted Cruz, US House reps from Texas, presidential committees with Texas activity).

## How to run any of these queries yourself

```bash
. .venv/bin/activate
python3 -c "
import duckdb
con = duckdb.connect()
print(con.sql('''<paste a SQL block from above>''').fetchall())
"
```

Or open the parquet directly in any DuckDB client; no schema setup needed.

## Open threads / next investigations

- **C2 (Texans for Greg Abbott anomaly):** what is this filing actually? Worth 30 minutes of TEC web-search verification before it's demoable.
- **Pre-Project-Connect lobbying:** can we map specific 2019–2020 lobbyists to specific Project Connect-related bills/ordinances? The municipal-questions field has the raw text; clustering it would help.
- **C3 Presents (ACL Festival) and SXSW partnership:** partial picture in donations. Are they registered lobby clients too? Worth a check.
- **Watson appears in TEC state data (former state senator) AND Austin city data (current mayor).** Once the TEC CF bulk is ingested, we can show his complete career money trail across both jurisdictions in one view. That's a singular demo no other tool can produce.
- **PAC-to-PAC graph** (C4): build a Sankey of the top transfer pipelines. Highly visual, easy to grok.

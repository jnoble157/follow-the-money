import type { Metadata, Route } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Documentation — Texas Money Investigator",
  description:
    "What data this project ingests, where it comes from, what every table contains, and how the four datasets relate to each other.",
};

type Field = { name: string; note: string };
type Table = {
  file: string;
  rows: string;
  what: string;
  fields: Field[];
};
type Source = {
  id: string;
  jurisdiction: "State" | "City";
  kind: "Campaign finance" | "Lobby";
  title: string;
  blurb: string;
  href: string;
  hrefLabel: string;
  coverage: string;
  size: string;
  tables: Table[];
};

const sources: Source[] = [
  {
    id: "tec-cf",
    jurisdiction: "State",
    kind: "Campaign finance",
    title: "Texas Ethics Commission — Campaign Finance bulk",
    blurb:
      "Every electronically filed campaign-finance report at the state level since July 2000. Ships as one ~1 GB ZIP of fixed-schema CSVs covering contributions, expenditures, loans, pledges, debts, travel, assets, cover sheets, and the filer index.",
    href: "https://www.ethics.state.tx.us/search/cf/",
    hrefLabel: "ethics.state.tx.us/search/cf",
    coverage: "Statewide candidates, officeholders, committees · 2000 → present",
    size: "~1.0 GB ZIP · ~5 GB CSV uncompressed",
    tables: [
      {
        file: "filers.csv",
        rows: "filer index",
        what:
          "Master roster of every filer (candidates, officeholders, GPACs, SPACs, committees). Joins everything else through filerIdent.",
        fields: [
          { name: "filerIdent", note: "TEC filer account number — the join key" },
          { name: "filerName", note: "Legal name on file" },
          { name: "filerTypeCd", note: "CAND / OH / GPAC / SPAC / etc." },
          { name: "filerJdiCd", note: "Jurisdiction code (state office, district, etc.)" },
          { name: "filerEffStartDt / filerEffStopDt", note: "Activity window" },
        ],
      },
      {
        file: "contribs_##.csv, cont_ss.csv, cont_t.csv, returns.csv",
        rows: "tens of millions",
        what:
          "Schedules A/C — itemized political contributions to a filer, plus contributor identity and amount.",
        fields: [
          { name: "filerIdent", note: "Recipient" },
          { name: "contributorNameOrganization / -PersonLast / -PersonFirst", note: "Donor identity" },
          { name: "contributionAmount", note: "Dollar amount" },
          { name: "contributionDt", note: "Date received" },
          { name: "contributorEmployer / contributorOccupation", note: "Self-reported, often blank" },
          { name: "contributorAddrCity / -StateCd / -PostalCode", note: "Street address redacted post-2023; ZIP/city visible" },
        ],
      },
      {
        file: "expend_##.csv, expn_t.csv",
        rows: "millions",
        what:
          "Schedules F/G/H/I — itemized political expenditures by a filer to a payee, with category code.",
        fields: [
          { name: "filerIdent", note: "Spender" },
          { name: "payeeNameOrganization / -PersonLast", note: "Vendor / individual paid" },
          { name: "expendAmount", note: "Dollar amount" },
          { name: "expendCatCd", note: "Category — joins expn_catg.csv" },
          { name: "expendDescr", note: "Free-text purpose" },
          { name: "politicalExpendCd", note: "Political vs. officeholder use" },
        ],
      },
      {
        file: "expn_catg.csv",
        rows: "lookup",
        what: "Expenditure category code → human label (e.g. ADVERT, CONSULT, FOOD).",
        fields: [
          { name: "expendCategoryCodeValue", note: "Code" },
          { name: "expendCategoryCodeLabel", note: "Description" },
        ],
      },
      {
        file: "cover.csv, cover_ss.csv, cover_t.csv",
        rows: "all reports",
        what:
          "Cover sheet 1 — one row per filed report with totals (raised, spent, on hand) and report period.",
        fields: [
          { name: "reportInfoIdent", note: "Unique report number — the citation key" },
          { name: "filerIdent", note: "Filer" },
          { name: "periodStartDt / periodEndDt", note: "Reporting window" },
          { name: "totalUnitemizedContribAmount, totalContribAmount, totalExpendAmount, totalLoanBalance", note: "Aggregate totals" },
        ],
      },
      {
        file: "loans.csv",
        rows: "schedule E",
        what: "Loans owed by the filer (lender, amount, terms, guarantor).",
        fields: [
          { name: "filerIdent, lenderName*, loanAmount, loanInterestRate, loanMaturityDt", note: "" },
        ],
      },
      {
        file: "pledges.csv, pldg_ss.csv, pldg_t.csv",
        rows: "schedule B",
        what: "Pledges of future contributions not yet received.",
        fields: [{ name: "filerIdent, pledgorName*, pledgeAmount, pledgeDt", note: "" }],
      },
      {
        file: "debts.csv",
        rows: "schedule L",
        what: "Outstanding debts the filer owes for goods/services.",
        fields: [{ name: "filerIdent, payeeName*, debtAmount, debtIncurredDt", note: "" }],
      },
      {
        file: "credits.csv",
        rows: "schedule K",
        what: "Credits — refunds and rebates received by the filer.",
        fields: [{ name: "filerIdent, creditFromName*, creditAmount", note: "" }],
      },
      {
        file: "travel.csv",
        rows: "schedule T",
        what: "Out-of-state travel paid for from political funds.",
        fields: [
          { name: "filerIdent, travelerName*, travelDestination, travelAmount, travelDeparture/ReturnDt", note: "" },
        ],
      },
      {
        file: "assets.csv",
        rows: "schedule M",
        what: "Assets ≥ $500 disclosed by judicial filers.",
        fields: [{ name: "filerIdent, assetDescr", note: "" }],
      },
      {
        file: "final.csv",
        rows: "final reports",
        what: "Final-report flags (filer is closing the account).",
        fields: [{ name: "filerIdent, reportInfoIdent, finalRptDt", note: "" }],
      },
      {
        file: "cand.csv",
        rows: "DCE candidates",
        what:
          "Candidates benefiting from a direct campaign expenditure made on their behalf without their consent.",
        fields: [{ name: "filerIdent (the spender), expendInfoId → expend_##.csv, candidate name", note: "" }],
      },
      {
        file: "spacs.csv",
        rows: "SPAC index",
        what: "Index of specific-purpose committees with their declared purpose.",
        fields: [{ name: "spacFilerIdent, committeePurpose", note: "" }],
      },
      {
        file: "notices.csv, purpose.csv",
        rows: "cover sheets 2 & 3",
        what:
          "Cover sheet 2 (notices received from candidates/officeholders) and cover sheet 3 (committee purpose statements).",
        fields: [{ name: "reportInfoIdent → cover.csv", note: "" }],
      },
    ],
  },
  {
    id: "tec-lobby",
    jurisdiction: "State",
    kind: "Lobby",
    title: "Texas Ethics Commission — Lobby Registrations",
    blurb:
      "Annual Excel snapshots of every registered state lobbyist, the clients each represents, the subject matters they're working on, and the political funds they touch. We ingest 2018 through 2026 (nine years).",
    href: "https://www.ethics.state.tx.us/search/lobby/loblistsREG2021-2025.php",
    hrefLabel: "ethics.state.tx.us/search/lobby",
    coverage: "Statewide registered lobbyists · 2018 → 2026",
    size: "~52 MB across 36 Excel files (4 per year × 9 years)",
    tables: [
      {
        file: "<YYYY>RegisteredLobbyists.xlsx",
        rows: "~2k / year",
        what: "Master list of registered lobbyists for the year. The roster.",
        fields: [
          { name: "FilerID", note: "TEC lobby filer ID — separate namespace from CF filerIdent" },
          { name: "FullName, BusName, Address, City, State, Zip", note: "Identity + contact" },
          { name: "EffStartDt / EffStopDt", note: "Registration window" },
        ],
      },
      {
        file: "<YYYY>LobbyGroupByLobbyist.xlsx",
        rows: "~10k / year",
        what:
          "One row per lobbyist-client engagement with compensation. The core 'who is hired by whom' table.",
        fields: [
          { name: "FilerID", note: "Joins to RegisteredLobbyists" },
          { name: "ClientName, Client address columns (Addr1, City, Zip)", note: "Disambiguated by suffix on duplicate columns" },
          { name: "CompensationAmount or category", note: "Exact-amount or banded ($0–$10k, $10k–$25k, …)" },
          { name: "EffStartDt / EffStopDt", note: "Engagement window" },
        ],
      },
      {
        file: "<YYYY>LobbySubjMatter.xlsx",
        rows: "~30k / year",
        what:
          "Subject-matter codes per lobbyist-client engagement (e.g. ENERGY, HEALTHCARE, INSURANCE, WATER).",
        fields: [
          { name: "FilerID, ClientName", note: "Engagement key — joins LobbyGroupByLobbyist" },
          { name: "SubjectMatterCd", note: "Two-letter category" },
          { name: "SubjectMatterDescr", note: "Long-form description" },
        ],
      },
      {
        file: "<YYYY>Pol_FundsByLobbyists.xlsx",
        rows: "small",
        what:
          "Lobbyists who were compensated or reimbursed from political funds — direct money flow between political funds and lobbyists.",
        fields: [
          { name: "FilerID", note: "Lobbyist receiving the funds" },
          { name: "PoliticalFundName", note: "Source — often a PAC or committee" },
          { name: "Amount, Date", note: "Payment" },
        ],
      },
    ],
  },
  {
    id: "austin-cf",
    jurisdiction: "City",
    kind: "Campaign finance",
    title: "City of Austin — Campaign Finance",
    blurb:
      "City Council and city-officeholder campaign finance, downloaded as Socrata CSVs from data.austintexas.gov. Same conceptual schema as TEC's CF bulk, but city-level only and in human-readable column names.",
    href: "https://data.austintexas.gov/",
    hrefLabel: "data.austintexas.gov",
    coverage: "City Council candidates, officeholders, committees · 2014 → present",
    size: "~270 MB across 6 CSVs",
    tables: [
      {
        file: "contributions.csv",
        rows: "238k",
        what:
          "Every contribution to a Council candidate / officeholder / committee. The donor table.",
        fields: [
          { name: "Donor", note: "Donor name (org or individual)" },
          { name: "Recipient", note: "Filer receiving the contribution" },
          { name: "Contribution_Amount, Contribution_Date, Contribution_Year", note: "Money + when" },
          { name: "Donor_Type", note: "INDIVIDUAL / PAC / etc." },
          { name: "Donor_Reported_Occupation, Donor_Reported_Employer", note: "Self-reported" },
          { name: "City_State_Zip", note: "Street address redacted; city/ZIP visible" },
          { name: "TRANSACTION_ID", note: "Stable per-row ID" },
        ],
      },
      {
        file: "expenditures.csv",
        rows: "28k",
        what: "Every campaign expenditure with payee, amount, and free-text description.",
        fields: [
          { name: "Payee, Paid_By", note: "Vendor + filer" },
          { name: "Payment_Amount, Payment_Date, Payment_Year", note: "" },
          { name: "Expenditure_Type", note: "Category" },
          { name: "Expense_Description", note: "Free text" },
          { name: "Travel_Outside_Texas, Political_Obligation, Reimbursement_Intended", note: "Flags" },
          { name: "TRANSACTION_ID", note: "" },
        ],
      },
      {
        file: "report_detail.csv",
        rows: "2.8k",
        what:
          "Cover-sheet equivalent — one row per filed report with totals, election cycle, and office held/sought.",
        fields: [
          { name: "Report ID, Filer, Office_Held, Office_Sought, Election_Cycle", note: "" },
          { name: "Total_Contributions, Total_Expenditures, Cash_On_Hand", note: "Aggregates" },
        ],
      },
      {
        file: "transaction_detail.csv",
        rows: "267k",
        what:
          "Pre-joined transaction view — contributions and expenditures together, normalized for cross-cutting queries.",
        fields: [{ name: "TRANSACTION_ID, Transaction_Type, Amount, Counterparty, Date", note: "" }],
      },
      {
        file: "direct_expenditures.csv",
        rows: "3.1k",
        what:
          "Direct campaign expenditures — money spent to support/oppose a candidate without coordinating with them.",
        fields: [{ name: "Payee, Beneficiary_Candidate, Amount, Date, Type", note: "" }],
      },
      {
        file: "loans.csv",
        rows: "312",
        what: "Campaign loans — lender, amount, terms.",
        fields: [{ name: "Borrower (filer), Lender, Loan_Amount, Date_Loaned, Interest_Rate", note: "" }],
      },
    ],
  },
  {
    id: "austin-lobby",
    jurisdiction: "City",
    kind: "Lobby",
    title: "City of Austin — Lobbyist Disclosures",
    blurb:
      "Austin's lobby disclosure regime is more granular than the state's — registrants, clients, quarterly activity reports, the specific city issues they're registered against, named city officials lobbied, expenditures with a 'this was for city-official business' flag, and an employee table flagging council relatives.",
    href: "https://data.austintexas.gov/",
    hrefLabel: "data.austintexas.gov",
    coverage: "Austin city lobbyists, clients, and officials · current registration through historical filings",
    size: "10 CSVs",
    tables: [
      {
        file: "registrants.csv",
        rows: "320",
        what: "One row per registered city lobbyist — the master directory.",
        fields: [
          { name: "REGISTRANT_ID", note: "Internal Austin ID — separate from TEC FilerID" },
          { name: "REGISTRANT_FULL_NAME, ENTITY_CD, REGISTRANT_TITLE", note: "Identity" },
          { name: "EMPLOYER", note: "Lobbying firm" },
          { name: "REGISTRATION_DATE, RENEWAL_DATE, TERMINATION_DATE", note: "Lifecycle" },
        ],
      },
      {
        file: "lobbyists_master.csv",
        rows: "303",
        what: "Active lobbyist roster — a thinner version of registrants.csv used as a lookup.",
        fields: [{ name: "LOBBYIST, REGISTRANT_ID, REGISTRATION_DATE, …", note: "" }],
      },
      {
        file: "clients.csv",
        rows: "125k",
        what:
          "Each engagement between a registered lobbyist and a client, per filing period. The 'who is hired by whom' for the city.",
        fields: [
          { name: "REGISTRANT_ID", note: "Lobbyist" },
          { name: "CLIENT_ID, CLIENT_FIRST_NAME / LAST_NAME, CLIENTENTITY_CD", note: "Client identity" },
          { name: "BUSINESS_DESC", note: "Client business description — what the company does" },
          { name: "COMP_CATEGORY, COMP_EXACT_AMOUNT", note: "Compensation banded or exact" },
          { name: "REPORT_ID", note: "Joins reports.csv" },
        ],
      },
      {
        file: "reports.csv",
        rows: "6.2k",
        what:
          "Quarterly activity reports — one per registrant per quarter — with category totals (food/bev, transport/lodging, gifts, entertainment, awards, honoraria, event fees, media support).",
        fields: [
          { name: "REPORT_ID, REGISTRANT_ID, REPORT_TYPE1, REPORT_DATE, REPORT_YEAR", note: "Period" },
          { name: "TOTAL_FOODBEV, TOTAL_GIFTS, TOTAL_ENTERTAINMENT, TOTAL_AWARDS, TOTAL_HONORARIUMS, TOTAL_EVENTFEES, TOTAL_MEDIA, TOTAL_MEDIASUPPORT, TOTAL_TRANSLODG, TOTAL_REIMBOTHERS", note: "Banded aggregates" },
          { name: "NO_ACT, NO_CLIENT, EMP_501C3_YN", note: "Status flags" },
        ],
      },
      {
        file: "municipal_questions.csv",
        rows: "162k",
        what:
          "Specific city issues a registrant is lobbying on (e.g. 'ENTITLEMENTS RELATED TO LAND DEVELOPMENT'). The most granular look at what's being pushed.",
        fields: [
          { name: "MQ_ID, REGISTRANT_ID, REPORT_ID", note: "Joins" },
          { name: "MQ_DESC", note: "Free-text issue description" },
          { name: "RP_YN, SM_OTHER_DESC", note: "Real-property flag + subject-matter category" },
        ],
      },
      {
        file: "city_officials.csv",
        rows: "35",
        what:
          "Council members and key staff disclosed in lobbyist filings — the named-target list. Tiny because it's a lookup of the people being lobbied, not the lobbying activity.",
        fields: [
          { name: "CO_ID", note: "Internal Austin official ID" },
          { name: "CO_FIRST_NAME, CO_LAST_NAME, CO_JOB_TITLE, CO_DEPT", note: "Identity" },
          { name: "REPORT_ID, TRANSACTION_ID", note: "Where this official appears in a filing" },
        ],
      },
      {
        file: "expenditures.csv",
        rows: "30",
        what:
          "Per-expenditure lobby spending with explicit links back to the city official the spend was on behalf of, including a CITY_OFFICIAL_BUS_YN flag.",
        fields: [
          { name: "REGISTRANT_ID, REPORT_ID, TRANSACTION_ID", note: "Joins" },
          { name: "PAYEE_FIRST_NAME / LAST_NAME, PAYEE address columns", note: "Vendor" },
          { name: "PAYMENT_AMOUNT, PAYMENT_DATE", note: "Amount + date" },
          { name: "EXPN_CATEGORY, EXPN_DESC", note: "Category + free text" },
          { name: "CITY_OFFICIAL_BUS_YN", note: "Was this spend for city-official business? Y/N" },
          { name: "CITY_OFFICIAL_FIRST_NAME / LAST_NAME / JOB_TITLE / DEPT", note: "Named target official" },
        ],
      },
      {
        file: "employees.csv",
        rows: "772",
        what:
          "Lobbyist firm employees, with a flag for whether the employee is a council relative — a direct conflict-of-interest signal.",
        fields: [
          { name: "EMP_ID, REGISTRANT_ID, REPORT_ID", note: "Joins" },
          { name: "EMP_FIRST_NAME, EMP_LAST_NAME, EMP_OCCUPATION, EMP_POSITION_DESC, EMP_EMPLOYER", note: "Identity" },
          { name: "COUNCIL_RELATIVE_YN", note: "Flag" },
          { name: "CM_FIRST_NAME, CM_LAST_NAME", note: "If COUNCIL_RELATIVE_YN, the council member they're related to" },
        ],
      },
      {
        file: "subject_matter.csv",
        rows: "37",
        what: "Subject-matter category lookup (active flag included).",
        fields: [{ name: "SM_ID, SM_CATEGORY_DESC, ACTIVE", note: "" }],
      },
      {
        file: "real_property.csv",
        rows: "134k",
        what:
          "Real-property disclosures — properties the registrant has a financial interest in that may be affected by lobbied issues.",
        fields: [
          { name: "MQ_ID, REPORT_ID, RP_ID", note: "Joins" },
          { name: "RP_ADR1, RP_CITY, RP_STATE, RP_ZIP", note: "Property location" },
          { name: "RP_PROPERTY_DESC", note: "Description" },
        ],
      },
    ],
  },
];

export default function DocumentationPage() {
  return (
    <main className="mx-auto flex w-full max-w-[1280px] flex-col gap-12 px-6 py-10">
      <header className="space-y-4 border-b border-rule pb-8">
        <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-accent">
          Documentation · Data inventory
        </p>
        <h1 className="font-serif text-[44px] leading-tight text-ink">
          What this project knows, and where it learned it.
        </h1>
        <p className="max-w-[820px] text-[16px] leading-relaxed text-muted">
          The Texas Money Investigator answers questions from four public
          datasets — two from the Texas Ethics Commission (state-level campaign
          finance and lobby registrations) and two from the City of Austin
          (city-level campaign finance and lobby disclosures). Every number the
          agent reports cites a row in one of the tables described below.
        </p>
        <div className="flex flex-wrap gap-2 pt-2 font-mono text-[11px] text-muted">
          {sources.map((s) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              className="rounded-sm border border-rule bg-white/70 px-2.5 py-1 hover:border-ink hover:bg-white"
            >
              {s.jurisdiction} · {s.kind}
            </a>
          ))}
          <a
            href="#relations"
            className="rounded-sm border border-rule bg-white/70 px-2.5 py-1 hover:border-ink hover:bg-white"
          >
            Relations
          </a>
          <Link
            href={"/documentation/abbreviations" as Route}
            className="rounded-sm border border-rule bg-white/70 px-2.5 py-1 hover:border-ink hover:bg-white"
          >
            Abbreviations ↗
          </Link>
        </div>
      </header>

      <section className="space-y-4">
        <h2 className="font-serif text-[28px] leading-tight text-ink">
          The four datasets at a glance
        </h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {sources.map((s) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              className="group rounded-md border border-rule bg-white/70 p-4 transition-colors hover:border-ink hover:bg-white"
            >
              <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.2em] text-muted">
                <span>{s.jurisdiction}</span>
                <span className="text-accent">{s.kind}</span>
              </div>
              <h3 className="mt-2 font-serif text-[20px] leading-snug text-ink">
                {s.title}
              </h3>
              <p className="mt-2 text-[13px] leading-relaxed text-muted">
                {s.blurb}
              </p>
              <p className="mt-3 font-mono text-[11px] text-muted tnum">
                {s.coverage} · {s.size}
              </p>
            </a>
          ))}
        </div>
      </section>

      <section id="relations" className="space-y-6">
        <h2 className="font-serif text-[28px] leading-tight text-ink">
          How the datasets relate
        </h2>
        <p className="max-w-[820px] text-[15px] leading-relaxed text-muted">
          The four sources are deliberately not federated through a single
          identifier. Each jurisdiction maintains its own ID space — TEC's
          campaign-finance world uses{" "}
          <code className="font-mono text-[12px] text-ink">filerIdent</code>,
          TEC's lobby world uses{" "}
          <code className="font-mono text-[12px] text-ink">FilerID</code>, and
          Austin uses{" "}
          <code className="font-mono text-[12px] text-ink">REGISTRANT_ID</code>{" "}
          for lobbyists and free-text names for donors and recipients. Hard
          joins hold within a jurisdiction; cross-jurisdiction joins go through
          fuzzy name matching and should always be treated as candidate links,
          not facts.
        </p>

        <div className="rounded-md border border-rule bg-white p-6 font-mono text-[11px] leading-relaxed text-ink overflow-x-auto">
          <pre className="text-[11px] leading-[1.65] text-ink">{`
   STATE LEVEL (TEC)                                CITY LEVEL (Austin)
   ─────────────────                                ───────────────────

   ┌──────────────────┐   filerIdent   ┌─────────┐  Recipient    ┌──────────────────┐
   │   TEC CF filers  │◀───────────────│ contribs│               │ Austin contribs  │
   │  (filers.csv)    │                │ expend  │               │  (Donor →        │
   │                  │   filerIdent   │ loans   │               │   Recipient)     │
   │  filerIdent ──▶  │───────────────▶│ pledges │               │                  │
   │                  │                │ debts   │               │  TRANSACTION_ID  │
   │                  │   reportInfo   │ travel  │               │                  │
   │                  │     Ident      │ cover   │               │ Austin expend    │
   └──────────────────┘                └────┬────┘               │  (Payee ←        │
            │                               │                    │   Paid_By)       │
            │ fuzzy name match              │                    └────────┬─────────┘
            │ (only candidate link          │                             │
            │  across jurisdictions)        │                             │
            ▼                               │                             ▼
   ┌──────────────────┐                     │                    ┌──────────────────┐
   │ TEC Lobby        │                     │                    │ Austin lobby     │
   │ (RegisteredLob)  │  FilerID            │                    │ (registrants)    │
   │                  │◀──────────┐         │                    │                  │
   │ FilerID ──▶      │           │         │                    │ REGISTRANT_ID ──▶│
   │                  │           │         │                    │                  │
   └────────┬─────────┘           │         │                    └────────┬─────────┘
            │                     │         │                             │
            │ FilerID + ClientName│         │ payee/contributor name      │ REGISTRANT_ID
            ▼                     │         │ (free text, fuzzy)          ▼
   ┌──────────────────┐           │         ▼                    ┌──────────────────┐
   │ LobbyGroupBy-    │           │   ┌───────────────┐          │ clients,         │
   │ Lobbyist         │           │   │ Cross-source  │          │ reports,         │
   │  (engagements)   │           │   │ donor lookup  │          │ municipal_       │
   │                  │           │   │  (name fuzzy) │          │ questions,       │
   │ ClientName ─┐    │           │   └───────────────┘          │ expenditures,    │
   └─────────────┼────┘           │                              │ employees,       │
                 │                │                              │ real_property    │
                 ▼                │                              │                  │
   ┌──────────────────┐           │                              │  REPORT_ID,      │
   │ LobbySubjMatter  │           │                              │  TRANSACTION_ID, │
   │  (subject codes  │           │                              │  CO_ID,          │
   │   per engagement)│           │                              │  MQ_ID,          │
   └──────────────────┘           │                              │  EMP_ID, RP_ID   │
                                  │                              └────────┬─────────┘
   ┌──────────────────┐           │                                       │ CO_ID
   │ Pol_FundsBy-     │           │                                       ▼
   │ Lobbyists        │───────────┘                              ┌──────────────────┐
   │  (lobbyist ←──   │  FilerID                                 │ city_officials   │
   │   political fund)│                                          │  (named targets) │
   └──────────────────┘                                          └──────────────────┘
`}</pre>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <RelationCard
            title="Hard joins (within a jurisdiction)"
            items={[
              "TEC CF · filerIdent connects filers.csv to every schedule (contribs, expend, loans, pledges, debts, travel, assets, cover sheets).",
              "TEC CF · reportInfoIdent links each transaction to its cover sheet, which is what citation chips in the UI dereference.",
              "TEC lobby · FilerID connects RegisteredLobbyists to LobbyGroupByLobbyist, LobbySubjMatter, and Pol_FundsByLobbyists.",
              "Austin CF · TRANSACTION_ID is stable across rows of contributions, expenditures, and the joined transaction_detail view.",
              "Austin lobby · REGISTRANT_ID connects every lobby table; REPORT_ID, MQ_ID, CO_ID, EMP_ID, RP_ID chain the satellite tables back to a quarterly filing.",
            ]}
          />
          <RelationCard
            title="Soft joins (across jurisdictions)"
            items={[
              "TEC lobby ↔ TEC CF: FilerID and filerIdent live in different namespaces. The same human shows up as a TEC lobby filer and as a recipient or donor in CF only via name match.",
              "Austin ↔ TEC: REGISTRANT_ID is independent of TEC's IDs. A donor named in Austin contributions and a TEC committee with the same legal name may be the same entity — fuzzy match, then verify against the source filing.",
              "Donor names are free text on every CF table. The same person can appear as 'JOHN A SMITH', 'JOHN SMITH', 'SMITH, JOHN A.', etc., and the agent's disambiguation step is what reconciles them.",
              "Sanity check on cross-jurisdiction matching: 12+ named lobbyists already match between Austin and TEC for 2025 alone (e.g. Demetrius McDaniel, Ana Husted, Kathleen Mitchell).",
            ]}
          />
        </div>

        <div className="rounded-md border border-rule bg-white/70 p-5">
          <h3 className="font-mono text-[10px] uppercase tracking-[0.2em] text-accent">
            The four ways an entity shows up
          </h3>
          <p className="mt-2 max-w-[820px] text-[14px] leading-relaxed text-muted">
            Most interesting investigations cross-reference the same person or
            company across all four datasets:
          </p>
          <ol className="mt-3 list-decimal space-y-2 pl-5 text-[14px] leading-relaxed text-ink">
            <li>
              <strong className="font-semibold">As a donor</strong> — name on a
              row in TEC <code className="font-mono text-[12px]">contribs</code>{" "}
              or Austin{" "}
              <code className="font-mono text-[12px]">contributions</code>.
            </li>
            <li>
              <strong className="font-semibold">As a payee</strong> — name on a
              row in TEC <code className="font-mono text-[12px]">expend</code>{" "}
              or Austin{" "}
              <code className="font-mono text-[12px]">expenditures</code>.
            </li>
            <li>
              <strong className="font-semibold">As a lobbyist client</strong> —
              ClientName in TEC{" "}
              <code className="font-mono text-[12px]">
                LobbyGroupByLobbyist
              </code>{" "}
              or Austin{" "}
              <code className="font-mono text-[12px]">clients</code>.
            </li>
            <li>
              <strong className="font-semibold">As a registrant</strong> —
              themselves a registered lobbyist in TEC{" "}
              <code className="font-mono text-[12px]">
                RegisteredLobbyists
              </code>{" "}
              or Austin{" "}
              <code className="font-mono text-[12px]">registrants</code>.
            </li>
          </ol>
          <p className="mt-3 max-w-[820px] text-[13px] leading-relaxed text-muted">
            A company that appears in all four — donating, getting paid as a
            vendor, hiring lobbyists, and employing a registered lobbyist — is
            the kind of pattern this app surfaces.
          </p>
        </div>
      </section>

      {sources.map((s) => (
        <SourceSection key={s.id} source={s} />
      ))}

      <section className="space-y-2 pb-8">
        <h2 className="font-serif text-[20px] leading-tight text-ink">
          Source attribution
        </h2>
        <p className="text-[13px] leading-relaxed text-muted">
          Texas Ethics Commission data published under Title 15 (Election
          Code) and Chapter 305 (Government Code), no usage restriction. City
          of Austin data published under City Code Chapter 2-2-26 (campaign
          finance) and Chapter 4-8 (lobby) via the Austin Open Data portal.
          Both are public records. We attribute on every page that cites them.
        </p>
      </section>
    </main>
  );
}

function RelationCard({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-md border border-rule bg-white/70 p-5">
      <h3 className="font-mono text-[10px] uppercase tracking-[0.2em] text-accent">
        {title}
      </h3>
      <ul className="mt-3 space-y-2 text-[13px] leading-relaxed text-ink">
        {items.map((it, i) => (
          <li key={i} className="flex gap-2">
            <span className="font-mono text-[11px] text-muted tnum mt-[2px]">
              {String(i + 1).padStart(2, "0")}
            </span>
            <span>{it}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SourceSection({ source }: { source: Source }) {
  return (
    <section id={source.id} className="space-y-5 scroll-mt-24">
      <header className="space-y-2 border-b border-rule pb-4">
        <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.2em] text-muted">
          <span>
            {source.jurisdiction} · {source.kind}
          </span>
          <a
            href={source.href}
            target="_blank"
            rel="noreferrer"
            className="text-evidence underline decoration-dotted hover:text-accent"
          >
            {source.hrefLabel} ↗
          </a>
        </div>
        <h2 className="font-serif text-[30px] leading-tight text-ink">
          {source.title}
        </h2>
        <p className="max-w-[820px] text-[15px] leading-relaxed text-muted">
          {source.blurb}
        </p>
        <p className="font-mono text-[11px] text-muted tnum">
          {source.coverage} · {source.size}
        </p>
      </header>

      <div className="space-y-3">
        {source.tables.map((t) => (
          <article
            key={t.file}
            className="rounded-md border border-rule bg-white/70 p-4"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <code className="font-mono text-[13px] text-ink">{t.file}</code>
              <span className="font-mono text-[11px] uppercase tracking-wider text-accent tnum">
                {t.rows}
              </span>
            </div>
            <p className="mt-2 text-[13px] leading-relaxed text-ink">
              {t.what}
            </p>
            {t.fields.length > 0 && t.fields[0]?.name ? (
              <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-1 text-[12px] leading-relaxed sm:grid-cols-[minmax(0,1fr)_minmax(0,1.8fr)]">
                {t.fields.map((f, i) => (
                  <FieldRow key={i} f={f} />
                ))}
              </dl>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
}

function FieldRow({ f }: { f: Field }) {
  return (
    <>
      <dt className="font-mono text-[11px] text-evidence">{f.name}</dt>
      <dd className="text-muted">{f.note}</dd>
    </>
  );
}

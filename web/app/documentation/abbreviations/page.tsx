import type { Metadata, Route } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Abbreviations — Texas Money Investigator",
  description:
    "Glossary of the abbreviations, codes, and column conventions used across Texas Ethics Commission and City of Austin filings.",
};

type Abbrev = { term: string; expansion: string; note?: string };
type AbbrevGroup = { title: string; blurb?: string; items: Abbrev[] };

const abbrevGroups: AbbrevGroup[] = [
  {
    title: "Agencies",
    blurb: "Who publishes the data — and who doesn't.",
    items: [
      { term: "TEC", expansion: "Texas Ethics Commission", note: "State filing agency" },
      { term: "FEC", expansion: "Federal Election Commission", note: "Not ingested" },
    ],
  },
  {
    title: "Filer types",
    blurb: "How the state classifies a person or entity that files.",
    items: [
      { term: "CF", expansion: "Campaign finance" },
      { term: "CAND", expansion: "Candidate" },
      { term: "OH", expansion: "Officeholder" },
      { term: "PAC", expansion: "Political Action Committee" },
      { term: "GPAC", expansion: "General-Purpose Committee", note: "TEC filer type" },
      { term: "SPAC", expansion: "Specific-Purpose Committee", note: "TEC filer type" },
      { term: "DCE", expansion: "Direct Campaign Expenditure", note: "Spent without coordination" },
    ],
  },
  {
    title: "Identifiers",
    blurb: "The columns that join one table to another.",
    items: [
      { term: "filerIdent", expansion: "TEC CF filer ID", note: "State CF join key" },
      { term: "FilerID", expansion: "TEC lobby filer ID", note: "Separate namespace" },
      { term: "reportInfoIdent", expansion: "TEC report number", note: "Citation key" },
      { term: "REGISTRANT_ID", expansion: "Austin lobbyist ID" },
      { term: "TRANSACTION_ID", expansion: "Austin per-row stable ID" },
      { term: "REPORT_ID", expansion: "Austin quarterly report ID" },
      { term: "MQ_ID", expansion: "Municipal Question ID" },
      { term: "CO_ID", expansion: "City Official ID" },
      { term: "EMP_ID", expansion: "Employee ID" },
      { term: "RP_ID", expansion: "Real Property ID" },
      { term: "SM_ID", expansion: "Subject Matter ID" },
    ],
  },
  {
    title: "Austin column prefixes",
    blurb: "Two- or three-letter prefixes that namespace columns by the entity they describe.",
    items: [
      { term: "MQ", expansion: "Municipal Question" },
      { term: "CO", expansion: "City Official" },
      { term: "CM", expansion: "Council Member" },
      { term: "EMP", expansion: "Employee" },
      { term: "RP", expansion: "Real Property" },
      { term: "SM", expansion: "Subject Matter" },
      { term: "COMP", expansion: "Compensation" },
      { term: "EXPN", expansion: "Expenditure" },
      { term: "DEPT", expansion: "Department" },
      { term: "ADR", expansion: "Address line" },
      { term: "BUS", expansion: "Business" },
    ],
  },
  {
    title: "Column suffixes",
    blurb: "Suffixes that indicate the semantic type of a column.",
    items: [
      { term: "_YN", expansion: "Yes / No flag" },
      { term: "Cd", expansion: "Code lookup" },
      { term: "Dt", expansion: "Date" },
      { term: "Ident", expansion: "Identifier" },
      { term: "Eff", expansion: "Effective (date prefix)" },
      { term: "Jdi", expansion: "Jurisdiction" },
      { term: "ENTITY_CD", expansion: "Entity code", note: "Individual / org / etc." },
    ],
  },
  {
    title: "Schedules (TEC CF)",
    blurb: "TEC's letter codes for the major sections of a campaign-finance report.",
    items: [
      { term: "Sch A / C", expansion: "Contributions" },
      { term: "Sch B", expansion: "Pledges" },
      { term: "Sch E", expansion: "Loans" },
      { term: "Sch F / G / H / I", expansion: "Expenditures" },
      { term: "Sch K", expansion: "Credits & refunds" },
      { term: "Sch L", expansion: "Debts" },
      { term: "Sch M", expansion: "Assets (judicial)" },
      { term: "Sch T", expansion: "Out-of-state travel" },
    ],
  },
];

export default function AbbreviationsPage() {
  return (
    <main className="mx-auto flex w-full max-w-[1100px] flex-col gap-10 px-6 py-10">
      <header className="space-y-4 border-b border-rule pb-8">
        <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-accent">
          Documentation · Abbreviations
        </p>
        <h1 className="font-serif text-[40px] leading-tight text-ink">
          Reading the schema.
        </h1>
        <p className="max-w-[760px] text-[15px] leading-relaxed text-muted">
          Texas filings use compact codes — short prefixes, suffixes, and
          letter codes that turn a 30-character column name into something
          like <code className="font-mono text-[13px] text-ink">CITY_OFFICIAL_BUS_YN</code>.
          This page expands the ones you'll see most often in the tables and
          joins on the{" "}
          <Link
            href={"/documentation" as Route}
            className="text-evidence underline decoration-dotted hover:text-accent"
          >
            documentation page
          </Link>
          .
        </p>
        <div className="flex flex-wrap gap-2 pt-2 font-mono text-[11px] text-muted">
          {abbrevGroups.map((g) => (
            <a
              key={g.title}
              href={`#${slug(g.title)}`}
              className="rounded-sm border border-rule bg-white/70 px-2.5 py-1 hover:border-ink hover:bg-white"
            >
              {g.title}
            </a>
          ))}
        </div>
      </header>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        {abbrevGroups.map((g) => (
          <section
            key={g.title}
            id={slug(g.title)}
            className="scroll-mt-24 rounded-md border border-rule bg-white/70 p-5"
          >
            <h2 className="font-mono text-[10px] uppercase tracking-[0.2em] text-accent">
              {g.title}
            </h2>
            {g.blurb ? (
              <p className="mt-2 text-[12px] leading-relaxed text-muted">
                {g.blurb}
              </p>
            ) : null}
            <dl className="mt-4 space-y-2.5">
              {g.items.map((a) => (
                <div
                  key={a.term}
                  className="grid grid-cols-[minmax(110px,auto)_minmax(0,1fr)] gap-x-4 text-[13px] leading-snug"
                >
                  <dt className="font-mono text-evidence whitespace-nowrap">
                    {a.term}
                  </dt>
                  <dd className="text-ink">
                    {a.expansion}
                    {a.note ? (
                      <span className="block text-[11px] text-muted">
                        {a.note}
                      </span>
                    ) : null}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>

      <section className="rounded-md border border-rule bg-white/70 p-5">
        <h2 className="font-mono text-[10px] uppercase tracking-[0.2em] text-accent">
          Worked example
        </h2>
        <p className="mt-2 text-[14px] leading-relaxed text-ink">
          A column called{" "}
          <code className="font-mono text-[12px]">CITY_OFFICIAL_BUS_YN</code>{" "}
          on Austin's lobby{" "}
          <code className="font-mono text-[12px]">expenditures.csv</code>{" "}
          breaks down as{" "}
          <span className="font-mono text-evidence">CITY_OFFICIAL</span> (the
          entity prefix) ·{" "}
          <span className="font-mono text-evidence">BUS</span> (Business) ·{" "}
          <span className="font-mono text-evidence">_YN</span> (Yes/No flag) —
          i.e. "was this expenditure for city-official business?"
        </p>
      </section>
    </main>
  );
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

import Link from "next/link";
import type { Route } from "next";

export const metadata = {
  title: "No federal data · Texas Money Investigator",
};

export default function NoFederalDataPage() {
  return (
    <main className="mx-auto flex w-full max-w-[820px] flex-col gap-6 px-6 py-12">
      <header className="space-y-1">
        <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-accent">
          No data
        </p>
        <h1 className="font-serif text-[32px] leading-tight text-ink">
          We don't have federal records.
        </h1>
      </header>
      <p className="font-serif text-[17px] leading-relaxed text-ink">
        The Texas Money Investigator covers Texas Ethics Commission state
        filings and City of Austin filings. Federal contributions, federal
        candidate committees, and Super PAC spending live with the Federal
        Election Commission, which we haven't ingested for this hackathon.
      </p>
      <div className="rounded-md border border-dashed border-rule bg-white/60 p-4">
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted">
          Why this matters
        </p>
        <p className="mt-2 text-[13px] leading-relaxed text-muted">
          AGENTS.md §1 forbids fabricating numbers. We list recognizable
          federal names — Ted Cruz, John Cornyn, Beto O'Rourke when running
          federally — so you know we considered them; the data simply isn't
          here. Returning an honest "no data" is a stronger demo moment than
          inventing a state-level profile that doesn't exist.
        </p>
      </div>
      <div className="flex flex-wrap gap-3 pt-2">
        <Link
          href={"/" as Route}
          className="rounded-sm border border-rule bg-white px-3 py-1.5 text-[12px] font-mono uppercase tracking-wider text-ink hover:border-ink"
        >
          ← Back to home
        </Link>
        <Link
          href={"/profile/kirk-watson" as Route}
          className="rounded-sm bg-ink px-3 py-1.5 text-[12px] font-mono uppercase tracking-wider text-white hover:bg-accent"
        >
          See a state-level profile instead
        </Link>
      </div>
    </main>
  );
}

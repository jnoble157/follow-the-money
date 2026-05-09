import Link from "next/link";
import type { Metadata } from "next";
import type { Route } from "next";
import { notFound } from "next/navigation";
import { Footnote } from "@/components/Footnote";
import { formatMoney } from "@/lib/formatMoney";
import { getDonorDetailBySlug } from "@/lib/profiles/donors";
import {
  getDonorBySlug,
  listDonorsWithStats,
} from "@/lib/profiles/registry";
import type { DonorSummary, DonorWithStats } from "@/lib/profiles/types";

type Params = { slug: string };

export function generateStaticParams(): Params[] {
  return listDonorsWithStats().map((d) => ({ slug: d.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { slug } = await params;
  const donor = getDonorBySlug(slug);
  if (!donor) return { title: "Donor not found · Texas Money Investigator" };
  return {
    title: `${donor.displayName} · Texas Money Investigator`,
    description: `Contribution aggregate for ${donor.displayName}.`,
  };
}

export default async function DonorPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { slug } = await params;
  const summary = getDonorBySlug(slug);
  if (!summary) return notFound();
  if (summary.donorType === "individual") {
    return <IndividualDonorGuard donor={summary} />;
  }
  const donor = getDonorDetailBySlug(slug);
  if (!donor) return notFound();
  return <OrganizationDonor donor={donor} />;
}

function OrganizationDonor({ donor }: { donor: DonorWithStats }) {
  return (
    <main className="mx-auto flex w-full max-w-[1120px] flex-col gap-8 px-6 py-8">
      <header className="flex flex-col gap-3 border-b border-rule pb-6">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-sm border border-accent/30 bg-accent/10 px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-accent">
            Organization donor
          </span>
          <span className="font-mono text-[11px] uppercase tracking-wider text-muted">
            {[donor.primaryCity, donor.primaryZip].filter(Boolean).join(" · ")}
          </span>
        </div>
        <h1 className="font-serif text-[38px] leading-tight text-ink">
          {donor.displayName}
        </h1>
      </header>

      <section
        aria-label="Donor statistics"
        className="grid grid-cols-2 gap-3 md:grid-cols-4"
      >
        <StatCard label="Total given" value={formatMoney(donor.totalGiven, { cents: true })} citationIndex={1} donor={donor} />
        <StatCard label="Contributions" value={donor.contributionCount.toLocaleString()} citationIndex={2} donor={donor} />
        <StatCard label="Average" value={formatMoney(donor.avgContribution, { cents: true })} citationIndex={3} donor={donor} />
        <StatCard label="Years active" value={String(donor.yearsActive)} citationIndex={4} donor={donor} />
      </section>

      <section className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <TopRecipients donor={donor} />
        <YearlyTotals donor={donor} />
      </section>

      {donor.employerVariants.length > 0 ? (
        <section aria-labelledby="employer-variants-heading">
          <h2
            id="employer-variants-heading"
            className="mb-2 font-mono text-[11px] uppercase tracking-[0.2em] text-muted"
          >
            Employer variants
          </h2>
          <p className="mb-3 max-w-2xl text-[13px] leading-snug text-muted">
            Raw employer strings from source rows; spelling varies across filings.
          </p>
          <details className="rounded-md border border-rule bg-white p-4">
            <summary className="cursor-pointer font-mono text-[12px] uppercase tracking-wider text-ink">
              Raw reported values
            </summary>
            <ul className="mt-3 grid gap-1 text-[13px] text-ink sm:grid-cols-2">
              {donor.employerVariants.map((variant) => (
                <li key={variant} className="font-mono">
                  {variant}
                </li>
              ))}
            </ul>
          </details>
        </section>
      ) : null}
    </main>
  );
}

function StatCard({
  label,
  value,
  citationIndex,
  donor,
}: {
  label: string;
  value: string;
  citationIndex: number;
  donor: DonorWithStats;
}) {
  return (
    <div className="rounded-md border border-rule bg-white p-4">
      <div className="font-mono text-[10px] uppercase tracking-wider text-muted">
        {label}
      </div>
      <div className="mt-1 font-serif text-[22px] leading-tight text-ink tnum">
        {value}
        <Footnote index={citationIndex} citation={donor.source} />
      </div>
    </div>
  );
}

function TopRecipients({ donor }: { donor: DonorWithStats }) {
  const max = Math.max(...donor.topRecipients.map((r) => r.total), 0);
  return (
    <section aria-labelledby="top-recipients-heading">
      <h2
        id="top-recipients-heading"
        className="mb-2 font-mono text-[11px] uppercase tracking-[0.2em] text-muted"
      >
        Top recipients
      </h2>
      <div className="overflow-hidden rounded-md border border-rule bg-white">
        <table className="w-full text-[13px]">
          <thead className="border-b border-rule text-[11px] font-mono uppercase tracking-wider text-muted">
            <tr>
              <th className="w-8 px-3 py-2 text-left font-normal">#</th>
              <th className="px-3 py-2 text-left font-normal">Recipient</th>
              <th className="w-[38%] px-3 py-2 text-right font-normal">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-rule">
            {donor.topRecipients.map((row, i) => (
              <tr key={row.recipient}>
                <td className="px-3 py-2 font-mono text-muted">{i + 1}</td>
                <td className="px-3 py-2 text-ink">
                  {row.recipientSlug ? (
                    <Link
                      href={`/profile/${row.recipientSlug}` as Route}
                      className="hover:underline decoration-accent decoration-1 underline-offset-4"
                    >
                      {row.recipient}
                    </Link>
                  ) : (
                    row.recipient
                  )}
                  {row.recipientRole ? (
                    <div className="mt-0.5 text-[11px] text-muted">
                      {row.recipientRole}
                    </div>
                  ) : null}
                </td>
                <td className="px-3 py-2">
                  <AmountBar
                    amount={row.total}
                    max={max}
                    citation={row.source}
                    citationIndex={10 + i}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function YearlyTotals({ donor }: { donor: DonorWithStats }) {
  const yearlyTotals = [...donor.yearlyTotals].sort((a, b) => b.year - a.year);
  const recent = yearlyTotals.slice(0, 8);
  const older = yearlyTotals.slice(8);
  const max = Math.max(...yearlyTotals.map((r) => r.total), 0);
  return (
    <section aria-labelledby="yearly-totals-heading">
      <h2
        id="yearly-totals-heading"
        className="mb-2 font-mono text-[11px] uppercase tracking-[0.2em] text-muted"
      >
        Yearly totals
      </h2>
      <div className="overflow-hidden rounded-md border border-rule bg-white">
        <table className="w-full text-[13px]">
          <thead className="border-b border-rule text-[11px] font-mono uppercase tracking-wider text-muted">
            <tr>
              <th className="w-20 px-3 py-2 text-left font-normal">Year</th>
              <th className="px-3 py-2 text-right font-normal">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-rule">
            {recent.map((row, i) => (
              <tr key={row.year}>
                <td className="px-3 py-2 font-mono text-muted">{row.year}</td>
                <td className="px-3 py-2">
                  <AmountBar
                    amount={row.total}
                    max={max}
                    citation={row.source}
                    citationIndex={20 + i}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {older.length > 0 ? (
          <details className="border-t border-rule">
            <summary className="cursor-pointer px-3 py-2 font-mono text-[11px] uppercase tracking-wider text-accent hover:text-ink">
              Show {older.length.toLocaleString()} older years
            </summary>
            <table className="w-full text-[13px]">
              <tbody className="divide-y divide-rule">
                {older.map((row, i) => (
                  <tr key={row.year}>
                    <td className="w-20 px-3 py-2 font-mono text-muted">
                      {row.year}
                    </td>
                    <td className="px-3 py-2">
                      <AmountBar
                        amount={row.total}
                        max={max}
                        citation={row.source}
                        citationIndex={28 + i}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        ) : null}
      </div>
    </section>
  );
}

function AmountBar({
  amount,
  max,
  citation,
  citationIndex,
}: {
  amount: number;
  max: number;
  citation: DonorWithStats["source"];
  citationIndex: number;
}) {
  const width = max > 0 ? Math.max(4, Math.round((amount / max) * 100)) : 0;
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-end gap-1 font-mono tnum text-ink">
        {formatMoney(amount, { cents: true })}
        <Footnote index={citationIndex} citation={citation} />
      </div>
      <div className="ml-auto h-1.5 w-full rounded-sm bg-page">
        <div
          className="h-1.5 rounded-sm bg-accent"
          style={{ width: `${width}%` }}
        />
      </div>
    </div>
  );
}

function IndividualDonorGuard({ donor }: { donor: DonorSummary }) {
  return (
    <main className="mx-auto flex w-full max-w-[820px] flex-col gap-6 px-6 py-12">
      <header className="space-y-2">
        <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-accent">
          Limited view
        </p>
        <h1 className="font-serif text-[32px] leading-tight text-ink">
          {donor.displayName}
        </h1>
        <p className="font-mono text-[11px] uppercase tracking-wider text-muted">
          {[donor.primaryCity, donor.primaryZip].filter(Boolean).join(" · ")}
        </p>
      </header>
      <p className="font-serif text-[17px] leading-relaxed text-ink">
        This project does not render private-individual donor reports. The
        donor table can show aggregate rankings from public filings; detail
        pages are limited to organizations.
      </p>
      <Link
        href={"/donors" as Route}
        className="self-start font-mono text-[11px] uppercase tracking-wider text-accent hover:text-ink"
      >
        Back to donors
      </Link>
    </main>
  );
}

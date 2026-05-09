import { Avatar } from "./Avatar";
import { Footnote } from "./Footnote";
import { OfficialDonorLinks } from "./OfficialDonorLinks";
import { PartyBadge } from "./PartyBadge";
import { formatMoney } from "@/lib/formatMoney";
import type { OfficialDetail } from "@/lib/profiles/types";

type Props = {
  official: OfficialDetail;
};

const JURISDICTION_LABEL: Record<string, string> = {
  austin: "City of Austin",
  tx_state: "Texas state",
  tx_federal: "Federal",
};

export function OfficialProfile({ official }: Props) {
  return (
    <main className="mx-auto flex w-full max-w-[1120px] flex-col gap-8 px-6 py-8">
      <header className="flex flex-col gap-4 border-b border-rule pb-6 md:flex-row md:items-start md:justify-between">
        <div className="flex items-start gap-4">
          <Avatar name={official.name} kind="official" size={72} slug={official.slug} />
          <div className="space-y-1">
            <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted">
              Public official / candidate · {JURISDICTION_LABEL[official.jurisdiction]}
            </p>
            <h1 className="font-serif text-[36px] leading-tight text-ink">
              {official.name}
            </h1>
            <p className="text-[15px] text-muted">{official.role}</p>
            {official.partyAffiliation ? (
              <div className="flex items-center gap-1.5">
                <PartyBadge party={official.partyAffiliation} />
                <Footnote index={5} citation={official.partyAffiliation.source} />
              </div>
            ) : null}
          </div>
        </div>
      </header>

      <section
        aria-label="Official statistics"
        className="grid grid-cols-2 gap-3 md:grid-cols-4"
      >
        <StatCard
          label="Total raised"
          value={formatMoney(official.totalRaised, { cents: true })}
          citationIndex={1}
          official={official}
        />
        <StatCard
          label="Contributions"
          value={official.donationCount.toLocaleString()}
          citationIndex={2}
          official={official}
        />
        <StatCard
          label="Average"
          value={formatMoney(official.avgDonation, { cents: true })}
          citationIndex={3}
          official={official}
        />
        <StatCard
          label="Years active"
          value={String(official.yearsActive)}
          citationIndex={4}
          official={official}
        />
      </section>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
        <OfficialDonorLinks donors={official.topOrganizationDonors} />
        {official.aliases.length > 0 ? (
          <section aria-labelledby="official-aliases-heading">
            <h2
              id="official-aliases-heading"
              className="mb-2 font-mono text-[11px] uppercase tracking-[0.2em] text-muted"
            >
              Filing aliases
            </h2>
            <details open className="rounded-md border border-rule bg-white p-4">
              <summary className="cursor-pointer font-mono text-[12px] uppercase tracking-wider text-ink">
                Raw recipient names
              </summary>
              <ul className="mt-3 space-y-1 text-[12px] text-ink">
                {official.aliases.map((alias) => (
                  <li key={alias} className="font-mono">
                    {alias}
                  </li>
                ))}
              </ul>
            </details>
          </section>
        ) : null}
      </div>
    </main>
  );
}

function StatCard({
  label,
  value,
  citationIndex,
  official,
}: {
  label: string;
  value: string;
  citationIndex: number;
  official: OfficialDetail;
}) {
  return (
    <div className="rounded-md border border-rule bg-white p-4">
      <div className="font-mono text-[10px] uppercase tracking-wider text-muted">
        {label}
      </div>
      <div className="mt-1 font-serif text-[22px] leading-tight text-ink tnum">
        {value}
        <Footnote index={citationIndex} citation={official.source} />
      </div>
    </div>
  );
}

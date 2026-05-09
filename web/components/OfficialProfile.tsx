import { Avatar } from "./Avatar";
import { EvidenceGraph } from "./EvidenceGraph";
import { Footnote } from "./Footnote";
import { OfficialDonorLinks } from "./OfficialDonorLinks";
import { PartyBadge } from "./PartyBadge";
import { formatMoney } from "@/lib/formatMoney";
import { officialDonorGraph } from "@/lib/profiles/evidenceGraph";
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
  const graph = officialDonorGraph(official);
  const profileText = official.bio?.text ?? fallbackProfileText(official);
  const profileSources = official.bio?.sources ?? [];

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
          label="Reported contributions"
          value={formatMoney(official.totalRaised, { cents: true })}
          citationIndex={1}
          official={official}
        />
        <StatCard
          label="Itemized rows"
          value={official.donationCount.toLocaleString()}
          citationIndex={2}
          official={official}
        />
        <StatCard
          label="Itemized avg"
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

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(260px,0.72fr)_minmax(0,1.28fr)]">
        <div className="space-y-6">
          <section aria-labelledby="official-profile-heading">
            <h2
              id="official-profile-heading"
              className="mb-2 font-mono text-[11px] uppercase tracking-[0.2em] text-muted"
            >
              Profile
            </h2>
            <p className="max-w-[54ch] text-[15px] leading-7 text-ink">
              {profileText}
              {official.bio ? null : (
                <Footnote index={6} citation={official.source} />
              )}
            </p>
            {profileSources.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {profileSources.slice(0, 3).map((source) => (
                  <a
                    key={source.url}
                    href={source.url}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-sm border border-rule bg-white px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-evidence hover:border-ink hover:text-ink"
                  >
                    {sourceLabel(source.url)}
                  </a>
                ))}
              </div>
            ) : null}
          </section>

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

        <div className="min-w-0">
          <OfficialDonorLinks donors={official.topOrganizationDonors} />
        </div>
      </div>

      {graph.nodes.length > 0 ? (
        <section aria-label="Evidence graph">
          <EvidenceGraph nodes={graph.nodes} edges={graph.edges} />
        </section>
      ) : null}
    </main>
  );
}

function fallbackProfileText(official: OfficialDetail): string {
  return `${official.name} is listed in the profile data as ${official.role} for ${JURISDICTION_LABEL[official.jurisdiction]}. Filing aliases and donor rollups are drawn from the source rows attached to this profile.`;
}

function sourceLabel(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "Source";
  }
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

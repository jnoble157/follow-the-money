import Link from "next/link";
import type { Route } from "next";
import { Avatar } from "./Avatar";
import { DonorTable } from "./DonorTable";
import { EntityChip } from "./EntityChip";
import { EvidenceGraph } from "./EvidenceGraph";
import { Footnote, FootnoteGroup } from "./Footnote";
import { OfficialDonorLinks } from "./OfficialDonorLinks";
import { formatMoney } from "@/lib/formatMoney";
import { formatDate } from "@/lib/formatDate";
import type { OfficialDetail, Profile as ProfileType } from "@/lib/profiles/types";

type Props = {
  profile: ProfileType;
  officialDetail?: OfficialDetail | null;
};

const KIND_LABEL: Record<string, string> = {
  official: "Public official",
  candidate: "Candidate",
  lobbyist: "Lobbyist",
  firm: "Firm · employer",
  pac: "PAC · committee",
};

export function Profile({ profile, officialDetail }: Props) {
  if (profile.noDataReason) {
    return <NoDataProfile profile={profile} />;
  }

  // Slug map drives the EvidenceGraph's click-through: nodes whose id
  // appears here become linkable, and double-click (or the action card's
  // "Open profile" button) routes to /profile/<slug>.
  const slugMap = Object.fromEntries(
    profile.network.nodes
      .filter((n) => n.profileSlug)
      .map((n) => [n.id, n.profileSlug as string]),
  );

  return (
    <main className="mx-auto flex w-full max-w-[1280px] flex-col gap-8 px-6 py-8">
      <ProfileHeader profile={profile} />

      {profile.stats.length > 0 ? <StatsRow profile={profile} /> : null}

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="space-y-8">
          <BioBlock profile={profile} />
          {profile.sections.map((section, i) => (
            <SectionRenderer key={i} section={section} />
          ))}
          {officialDetail ? (
            <OfficialDonorLinks donors={officialDetail.topOrganizationDonors} />
          ) : null}
        </div>
        <div className="space-y-6">
          {profile.network.nodes.length > 0 ? (
            <div className="rounded-md border border-rule bg-white p-4">
              <EvidenceGraph
                nodes={profile.network.nodes}
                edges={profile.network.edges}
                nodeIdToProfileSlug={slugMap}
              />
            </div>
          ) : null}
          {profile.related.length > 0 ? (
            <RelatedStrip profile={profile} />
          ) : null}
        </div>
      </div>
    </main>
  );
}

function ProfileHeader({ profile }: { profile: ProfileType }) {
  return (
    <header className="flex flex-col gap-4 border-b border-rule pb-6 md:flex-row md:items-start md:justify-between">
      <div className="flex items-start gap-4">
        <Avatar name={profile.name} kind={profile.kind} size={72} />
        <div className="space-y-1">
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted">
            {KIND_LABEL[profile.kind] ?? profile.kind}
            {profile.jurisdiction === "austin"
              ? " · City of Austin"
              : profile.jurisdiction === "tx_state"
                ? " · Texas State"
                : ""}
          </p>
          <h1 className="font-serif text-[36px] leading-tight text-ink">
            {profile.name}
          </h1>
          {profile.role ? (
            <p className="text-[15px] text-muted">{profile.role}</p>
          ) : null}
        </div>
      </div>
      {profile.defaultQuestion ? (
        <Link
          href={
            `/investigate?q=${encodeURIComponent(profile.defaultQuestion)}` as Route
          }
          className="self-start rounded-sm bg-ink px-4 py-2 text-[12px] font-mono uppercase tracking-wider text-white hover:bg-accent transition-colors"
        >
          Investigate this →
        </Link>
      ) : null}
    </header>
  );
}

function StatsRow({ profile }: { profile: ProfileType }) {
  return (
    <section
      aria-label="Headline statistics"
      className="grid grid-cols-2 gap-3 sm:grid-cols-4"
    >
      {profile.stats.map((s, i) => (
        <div
          key={s.label + i}
          className="rounded-md border border-rule bg-white p-4"
        >
          <div className="font-mono text-[10px] uppercase tracking-wider text-muted">
            {s.label}
          </div>
          <div className="mt-1 font-serif text-[22px] leading-tight text-ink tnum">
            {s.value}
            <Footnote index={i + 1} citation={s.citation} />
          </div>
        </div>
      ))}
    </section>
  );
}

function BioBlock({ profile }: { profile: ProfileType }) {
  return (
    <section aria-labelledby="bio-heading">
      <h2
        id="bio-heading"
        className="mb-2 font-mono text-[11px] uppercase tracking-[0.2em] text-muted"
      >
        Background
      </h2>
      <div className="font-serif text-[17px] leading-relaxed text-ink">
        {profile.bio.text}
        {profile.bio.citations.length > 0 ? (
          <FootnoteGroup
            startIndex={profile.stats.length + 1}
            citations={profile.bio.citations}
          />
        ) : null}
      </div>
    </section>
  );
}

function SectionRenderer({
  section,
}: {
  section: ProfileType["sections"][number];
}) {
  switch (section.kind) {
    case "top_donors":
      return (
        <section>
          <h2 className="mb-2 font-mono text-[11px] uppercase tracking-[0.2em] text-muted">
            {section.title}
          </h2>
          <DonorTable donors={section.rows} />
        </section>
      );
    case "top_expenditures":
      return (
        <section>
          <h2 className="mb-2 font-mono text-[11px] uppercase tracking-[0.2em] text-muted">
            {section.title}
          </h2>
          <div className="overflow-hidden rounded-md border border-rule bg-white">
            <table className="w-full text-[13px]">
              <thead className="border-b border-rule text-[11px] font-mono uppercase tracking-wider text-muted">
                <tr>
                  <th className="px-3 py-2 text-left font-normal w-6">#</th>
                  <th className="px-3 py-2 text-left font-normal">Payee</th>
                  <th className="px-3 py-2 text-left font-normal">
                    Description
                  </th>
                  <th className="px-3 py-2 text-left font-normal">Date</th>
                  <th className="px-3 py-2 text-right font-normal">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-rule">
                {section.rows.map((r) => (
                  <tr key={r.rank}>
                    <td className="px-3 py-2 font-mono text-muted">
                      {r.rank}
                    </td>
                    <td className="px-3 py-2 text-ink">
                      {r.payee}
                      <Footnote index={r.rank} citation={r.citation} />
                    </td>
                    <td className="px-3 py-2 text-ink">{r.description}</td>
                    <td className="px-3 py-2 font-mono text-muted">
                      {r.date ? formatDate(r.date) : "—"}
                    </td>
                    <td className="px-3 py-2 text-right font-mono tnum text-ink">
                      {formatMoney(r.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      );
    case "lobby_ties":
      return (
        <section>
          <h2 className="mb-2 font-mono text-[11px] uppercase tracking-[0.2em] text-muted">
            {section.title}
          </h2>
          <ul className="space-y-2 rounded-md border border-rule bg-white p-3">
            {section.rows.map((r, i) => (
              <li
                key={r.counterpartyName + i}
                className="flex items-baseline justify-between gap-3 text-[13px]"
              >
                <div>
                  <span className="text-ink">{r.counterpartyName}</span>
                  <span className="ml-2 font-mono text-[10px] uppercase tracking-wider text-muted">
                    {r.role}
                  </span>
                  {r.subject ? (
                    <span className="ml-2 text-[12px] text-muted">
                      {r.subject}
                    </span>
                  ) : null}
                  <Footnote index={i + 1} citation={r.citation} />
                </div>
              </li>
            ))}
          </ul>
        </section>
      );
    case "narrative":
      return (
        <section>
          <h2 className="mb-2 font-mono text-[11px] uppercase tracking-[0.2em] text-muted">
            {section.title}
          </h2>
          <div className="space-y-4">
            {section.chunks.map((chunk, i) => (
              <div
                key={chunk.id}
                className="font-serif text-[16px] leading-relaxed text-ink"
              >
                {chunk.text}
                {chunk.citations.length > 0 ? (
                  <FootnoteGroup
                    startIndex={1 + i * 2}
                    citations={chunk.citations}
                  />
                ) : null}
              </div>
            ))}
          </div>
        </section>
      );
  }
}

function RelatedStrip({ profile }: { profile: ProfileType }) {
  return (
    <section aria-labelledby="related-heading">
      <h2
        id="related-heading"
        className="mb-2 font-mono text-[11px] uppercase tracking-[0.2em] text-muted"
      >
        Related
      </h2>
      <div className="flex flex-wrap gap-2">
        {profile.related.map((r) => (
          <EntityChip key={r.slug} slug={r.slug} name={r.name} role={r.role} />
        ))}
      </div>
    </section>
  );
}

function NoDataProfile({ profile }: { profile: ProfileType }) {
  return (
    <main className="mx-auto flex w-full max-w-[820px] flex-col gap-6 px-6 py-12">
      <header className="space-y-1">
        <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-accent">
          No data
        </p>
        <h1 className="font-serif text-[32px] leading-tight text-ink">
          {profile.name}
        </h1>
      </header>
      <p className="font-serif text-[17px] leading-relaxed text-ink">
        {profile.noDataReason}
      </p>
      <div className="rounded-md border border-dashed border-rule bg-white/60 p-4 text-[13px] text-muted">
        Why this matters: AGENTS.md §1 forbids fabricating data. We list
        recognizable federal names so you know we considered them; the data
        simply isn't here.
      </div>
      <Link
        href={"/" as Route}
        className="self-start font-mono text-[11px] uppercase tracking-wider text-accent hover:text-ink"
      >
        ← Back to home
      </Link>
    </main>
  );
}

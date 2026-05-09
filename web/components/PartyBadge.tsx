import type { PartyAffiliation } from "@/lib/profiles/types";

type Props = {
  party: PartyAffiliation;
  compact?: boolean;
};

type PartyTone = "republican" | "democratic" | "nonpartisan" | "neutral";

const PARTY_TONES: Record<PartyTone, { badge: string; mark: string }> = {
  republican: {
    badge: "border-[#B42318] bg-[#FFF4F2] text-[#8F160F] shadow-[inset_0_0_0_1px_rgba(180,35,24,0.18)]",
    mark: "text-[#75110C]",
  },
  democratic: {
    badge: "border-[#1D4ED8] bg-[#EFF6FF] text-[#1E3A8A] shadow-[inset_0_0_0_1px_rgba(29,78,216,0.16)]",
    mark: "text-[#172554]",
  },
  nonpartisan: {
    badge: "border-[#9CA3AF] bg-[#F9FAFB] text-[#4B5563] shadow-[inset_0_0_0_1px_rgba(156,163,175,0.18)]",
    mark: "text-[#374151]",
  },
  neutral: {
    badge: "border-rule bg-white text-muted",
    mark: "text-ink",
  },
};

function partyTone(party: PartyAffiliation): PartyTone {
  const label = party.label.toLowerCase();
  if (label.includes("republican")) return "republican";
  if (label.includes("democratic")) return "democratic";
  if (label.includes("nonpartisan") || label.includes("non-party")) return "nonpartisan";
  return "neutral";
}

export function PartyBadge({ party, compact = false }: Props) {
  const tone = PARTY_TONES[partyTone(party)];

  return (
    <span
      className={
        compact
          ? `inline-flex h-4 shrink-0 items-center justify-center rounded-[2px] border px-1 font-mono text-[9px] uppercase leading-none ${tone.badge}`
          : `inline-flex max-w-full items-center gap-1 rounded-sm border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider ${tone.badge}`
      }
      title={party.source.rowSummary}
      aria-label={`Party affiliation: ${party.label}`}
    >
      <span className={tone.mark}>{party.shortLabel}</span>
      {compact ? null : <span className="truncate">{party.label}</span>}
    </span>
  );
}

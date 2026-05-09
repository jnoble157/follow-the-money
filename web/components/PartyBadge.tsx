import type { PartyAffiliation } from "@/lib/profiles/types";

type Props = {
  party: PartyAffiliation;
  compact?: boolean;
};

export function PartyBadge({ party, compact = false }: Props) {
  return (
    <span
      className={
        compact
          ? "inline-flex h-4 shrink-0 items-center justify-center rounded-[2px] border border-rule bg-white px-1 font-mono text-[9px] uppercase leading-none text-muted"
          : "inline-flex max-w-full items-center gap-1 rounded-sm border border-rule bg-white px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-muted"
      }
      title={party.source.rowSummary}
      aria-label={`Party affiliation: ${party.label}`}
    >
      <span className={compact ? "text-muted" : "text-ink"}>{party.shortLabel}</span>
      {compact ? null : <span className="truncate">{party.label}</span>}
    </span>
  );
}

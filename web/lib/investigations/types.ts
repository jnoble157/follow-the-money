// Re-exports of the canonical wire-format types from @txmoney/mcp/events.
// One source of truth keeps the agent (producer) and the web app (consumer)
// from drifting. AGENTS.md §1: every numeric claim ties to a source row,
// which is the contract these types enforce.

export type {
  Citation,
  DonorRow,
  EmployerVariant,
  GraphNodeKind,
  InvestigationEvent,
  InvestigationEventType,
  NarrativeRole,
  RecipientRow,
} from "@txmoney/mcp/events";

import type { InvestigationEvent } from "@txmoney/mcp/events";

// A scripted hero investigation is a sequence of (event, delay-after-ms) pairs
// with an optional pause point (the disambiguation moment) where the script
// blocks until a user decision arrives. The stub engine consumes this shape
// directly; in live mode the agent loop produces the same event stream.
export type ScriptStep =
  | { kind: "emit"; event: InvestigationEvent; delayAfterMs: number }
  | {
      kind: "await_disambiguation";
      id: string;
      ifMerged: ScriptStep[];
      ifKept: ScriptStep[];
    };

export type HeroInvestigation = {
  id: string;
  question: string;
  pillLabel: string;
  // Topic tags drive the RelatedRail's investigation-card pick. Tags are
  // hand-curated for the hand-scripted heroes; recorded fixtures inherit them
  // from a header row in the JSONL file.
  tags: string[];
  steps: ScriptStep[];
};

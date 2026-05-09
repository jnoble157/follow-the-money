// The seam between stub mode and the (later) real agent loop.
// Every event that produces a number carries source rows; the UI renders no
// dollar amount, no count, no name without a Citation behind it. AGENTS.md §1.

export type GraphNodeKind =
  | "filer"
  | "donor"
  | "employer"
  | "lobbyist"
  | "client"
  | "pac";

export type Citation = {
  // For TEC rows this is the report row identifier; for Austin Socrata rows
  // we use the dataset id + row id as a synthetic identifier.
  reportInfoIdent: string;
  url: string;
  rowSummary: string;
};

export type EmployerVariant = {
  variant: string;
  contributions: number;
  total: number;
  sampleContributors: string[];
  sampleCitation: Citation;
};

export type DonorRow = {
  rank: number;
  donor: string;
  rolledEmployer: string | null;
  contributions: number;
  total: number;
  variants?: string[];
  citation: Citation;
};

// Sections of the report a narrative chunk lives in. The Report component
// switches on this to apply the right typography and ordering. Default is
// "body" so old scripts without the field render unchanged.
export type NarrativeRole =
  | "lede"          // single answer paragraph at the top
  | "body"          // standard reporting paragraphs
  | "methods"       // boxed callout: how the agent earned its keep
  | "reading_note"  // the "we don't infer intent" disclaimer
  | "missing";      // "what's not in this view" (e.g. federal data seam)

export type InvestigationEvent =
  | { type: "plan_started"; question: string }
  // Wall-clock timestamp the run began at, server-side. Used to compute the
  // status-strip elapsed counter without needing a per-event timestamp on
  // every other event.
  | { type: "investigation_started"; startedAt: number }
  | { type: "plan_step"; id: string; description: string }
  | {
      type: "tool_call";
      stepId: string;
      tool: string;
      args: Record<string, unknown>;
    }
  | {
      type: "tool_result";
      stepId: string;
      rowCount: number;
      sample: Array<Record<string, unknown>>;
      sourceRows: string[];
      // When a fuzzy-match tool returned a confidence score, the agent surfaces
      // it here; the methods callout uses this to know when the agent did
      // entity-resolution work as opposed to a straight lookup.
      confidence?: number;
    }
  | {
      type: "disambiguation_required";
      id: string;
      stepId: string;
      title: string;
      explanation: string;
      variants: EmployerVariant[];
    }
  | { type: "disambiguation_resolved"; id: string; merged: boolean }
  | {
      type: "narrative_chunk";
      text: string;
      citations: Citation[];
      role?: NarrativeRole;
    }
  | {
      type: "graph_node";
      id: string;
      label: string;
      kind: GraphNodeKind;
      sublabel?: string;
      // Optional slug into web/lib/profiles. When present, the EvidenceGraph
      // makes the node clickable and routes to /profile/<slug>. This is the
      // "follow the money" affordance.
      profileSlug?: string;
    }
  | {
      type: "graph_edge";
      from: string;
      to: string;
      label?: string;
      weight?: number;
    }
  | { type: "investigation_complete"; topDonors?: DonorRow[] }
  | { type: "investigation_failed"; reason: string };

export type InvestigationEventType = InvestigationEvent["type"];

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

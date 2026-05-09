// Wire format for the investigation event stream.
//
// One canonical definition shared by the agent (which produces these events
// against the OpenAI Responses API) and the web app (which consumes them
// over SSE and reduces them into UI state). Lives in @txmoney/mcp because
// both other workspaces already depend on it; that keeps the type a
// dependency-free leaf and avoids agent <-> web coupling.

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

export type DonorRow = {
  rank: number;
  donor: string;
  rolledEmployer: string | null;
  contributions: number;
  total: number;
  variants?: string[];
  citation: Citation;
};

// Outflow counterpart to DonorRow. Populated by the agent's
// complete_investigation when the question is "what is X funding," "where
// does X give," "who does X support" — the right rail then renders top
// recipients instead of top donors. Same idea, opposite direction.
export type RecipientRow = {
  rank: number;
  recipient: string;
  contributions: number;
  total: number;
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
  | {
      type: "investigation_complete";
      topDonors?: DonorRow[];
      topRecipients?: RecipientRow[];
    }
  // Post-run "follow the money one hop further" suggestion. The agent
  // generates this in a single dedicated OpenAI call after
  // complete_investigation; the reducer hands it to RelatedRail in
  // preference to the static tag-overlap pick. Optional — older recorded
  // fixtures and the stub engine omit it.
  | {
      type: "read_next";
      question: string;
      kicker: string;
      rationale: string;
    }
  | { type: "investigation_failed"; reason: string };

export type InvestigationEventType = InvestigationEvent["type"];

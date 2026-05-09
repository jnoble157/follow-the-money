import type {
  Citation,
  DonorRow,
  EmployerVariant,
  GraphNodeKind,
  InvestigationEvent,
  NarrativeRole,
} from "./types";

// State the UI renders. The reducer is pure; effects (SSE, fetch) live in the
// hook. Keeping these separate makes the disambiguation flow testable without
// a browser.

export type PlanStepView = {
  id: string;
  description: string;
  status: "running" | "done" | "blocked";
  toolCall?: { tool: string; args: Record<string, unknown> };
  toolResult?: {
    rowCount: number;
    sample: Array<Record<string, unknown>>;
    sourceRows: string[];
  };
  blockedOn?: string;
};

export type NarrativeChunk = {
  id: number;
  text: string;
  citations: Citation[];
  // Defaults to "body" when the producer didn't tag the chunk. Optional
  // because profile pages construct chunks as plain value objects without
  // running them through the reducer.
  role?: NarrativeRole;
};

export type GraphNodeView = {
  id: string;
  label: string;
  kind: GraphNodeKind;
  sublabel?: string;
  profileSlug?: string;
};

export type GraphEdgeView = {
  from: string;
  to: string;
  label?: string;
  weight?: number;
};

export type DisambiguationView = {
  id: string;
  stepId: string;
  title: string;
  explanation: string;
  variants: EmployerVariant[];
};

export type InvestigationStatus =
  | "idle"
  | "running"
  | "blocked"
  | "complete"
  | "failed";

export type InvestigationState = {
  question: string | null;
  status: InvestigationStatus;
  failureReason?: string;
  planSteps: PlanStepView[];
  narrative: NarrativeChunk[];
  graphNodes: GraphNodeView[];
  graphEdges: GraphEdgeView[];
  topDonors: DonorRow[];
  pendingDisambiguation: DisambiguationView | null;
  resolvedDisambiguations: Record<string, boolean>;
  // Receipts for the status strip. startedAt comes from the server's
  // investigation_started event so cached replays show their original elapsed
  // budget rather than the replay's wall time.
  startedAt?: number;
  finishedAt?: number;
  // Distinct reportInfoIdent values seen across all tool_result.sourceRows
  // and narrative_chunk.citations. The set is collapsed to a count for
  // rendering; the underlying ids live in citedSourceRows so the status strip
  // can grow into a "show me all 7 cited rows" affordance later.
  citedSourceRows: string[];
  // Number of times the user confirmed a merge in a disambiguation modal.
  // The count is what the strip shows; the boolean values live in
  // resolvedDisambiguations for the script branches.
  variantsMergedCount: number;
};

export const initialState: InvestigationState = {
  question: null,
  status: "idle",
  planSteps: [],
  narrative: [],
  graphNodes: [],
  graphEdges: [],
  topDonors: [],
  pendingDisambiguation: null,
  resolvedDisambiguations: {},
  citedSourceRows: [],
  variantsMergedCount: 0,
};

let chunkCounter = 0;
function nextChunkId(): number {
  chunkCounter += 1;
  return chunkCounter;
}

export function reduce(
  state: InvestigationState,
  ev: InvestigationEvent,
): InvestigationState {
  switch (ev.type) {
    case "plan_started":
      return {
        ...initialState,
        question: ev.question,
        status: "running",
      };
    case "investigation_started":
      return { ...state, startedAt: ev.startedAt };
    case "plan_step":
      return {
        ...state,
        planSteps: [
          ...markPrevDone(state.planSteps),
          {
            id: ev.id,
            description: ev.description,
            status: "running",
          },
        ],
      };
    case "tool_call":
      return {
        ...state,
        planSteps: state.planSteps.map((s) =>
          s.id === ev.stepId
            ? { ...s, toolCall: { tool: ev.tool, args: ev.args } }
            : s,
        ),
      };
    case "tool_result":
      return {
        ...state,
        planSteps: state.planSteps.map((s) =>
          s.id === ev.stepId
            ? {
                ...s,
                toolResult: {
                  rowCount: ev.rowCount,
                  sample: ev.sample,
                  sourceRows: ev.sourceRows,
                },
              }
            : s,
        ),
        citedSourceRows: mergeIdents(state.citedSourceRows, ev.sourceRows),
      };
    case "disambiguation_required":
      return {
        ...state,
        status: "blocked",
        planSteps: state.planSteps.map((s) =>
          s.id === ev.stepId
            ? { ...s, status: "blocked", blockedOn: ev.id }
            : s,
        ),
        pendingDisambiguation: {
          id: ev.id,
          stepId: ev.stepId,
          title: ev.title,
          explanation: ev.explanation,
          variants: ev.variants,
        },
      };
    case "disambiguation_resolved":
      return {
        ...state,
        status: "running",
        pendingDisambiguation: null,
        resolvedDisambiguations: {
          ...state.resolvedDisambiguations,
          [ev.id]: ev.merged,
        },
        variantsMergedCount: ev.merged
          ? state.variantsMergedCount + 1
          : state.variantsMergedCount,
        planSteps: state.planSteps.map((s) =>
          s.blockedOn === ev.id
            ? { ...s, status: "done", blockedOn: undefined }
            : s,
        ),
      };
    case "narrative_chunk":
      return {
        ...state,
        narrative: [
          ...state.narrative,
          {
            id: nextChunkId(),
            text: ev.text,
            citations: ev.citations,
            role: ev.role ?? "body",
          },
        ],
        citedSourceRows: mergeIdents(
          state.citedSourceRows,
          ev.citations.map((c) => c.reportInfoIdent),
        ),
      };
    case "graph_node":
      if (state.graphNodes.some((n) => n.id === ev.id)) return state;
      return {
        ...state,
        graphNodes: [
          ...state.graphNodes,
          {
            id: ev.id,
            label: ev.label,
            kind: ev.kind,
            sublabel: ev.sublabel,
            profileSlug: ev.profileSlug,
          },
        ],
      };
    case "graph_edge":
      return {
        ...state,
        graphEdges: [
          ...state.graphEdges,
          {
            from: ev.from,
            to: ev.to,
            label: ev.label,
            weight: ev.weight,
          },
        ],
      };
    case "investigation_complete":
      return {
        ...state,
        status: "complete",
        finishedAt: Date.now(),
        planSteps: markPrevDone(state.planSteps),
        topDonors: ev.topDonors ?? state.topDonors,
      };
    case "investigation_failed":
      return {
        ...state,
        status: "failed",
        failureReason: ev.reason,
      };
  }
}

function markPrevDone(steps: PlanStepView[]): PlanStepView[] {
  return steps.map((s, i, arr) =>
    i === arr.length - 1 && s.status === "running"
      ? { ...s, status: "done" }
      : s,
  );
}

// Append-only set of source-row identifiers. Order is preserved (first-seen),
// duplicates are dropped. Cheap because the lists are short — a typical
// investigation cites under twenty rows.
function mergeIdents(prev: string[], next: string[]): string[] {
  if (next.length === 0) return prev;
  const seen = new Set(prev);
  const out = prev.slice();
  for (const id of next) {
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

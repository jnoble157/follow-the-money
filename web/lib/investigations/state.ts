import type {
  Citation,
  DonorRow,
  EmployerVariant,
  GraphNodeKind,
  InvestigationEvent,
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
          { id: nextChunkId(), text: ev.text, citations: ev.citations },
        ],
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

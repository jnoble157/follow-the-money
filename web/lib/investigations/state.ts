import type {
  Citation,
  DonorRow,
  GraphNodeKind,
  InvestigationEvent,
  NarrativeRole,
  RecipientRow,
} from "./types";

// State the UI renders. The reducer is pure; effects (SSE, fetch) live in the
// hook. Keeping these separate makes the event stream testable without a
// browser.

export type PlanStepView = {
  id: string;
  description: string;
  status: "running" | "done";
  toolCall?: { tool: string; args: Record<string, unknown> };
  toolResult?: {
    rowCount: number;
    // Distinct reportInfoIdent values the tool result carried — what the
    // step "scanned." Differs from the count of citations the agent
    // chose to cite from those rows; the plan trace shows both.
    sample: Array<Record<string, unknown>>;
    sourceRows: string[];
    // Number of those source rows the agent cited in narrative chunks
    // attached to this step. Updated as narrative_chunk events arrive
    // after the result. Lets the plan trace show "answered with 5 cited
    // donors out of 30 scanned" instead of just "30 rows."
    citedRowCount: number;
    // Lowest fuzzy-match confidence in the result, when applicable. The
    // PlanTrace renders this as a pill so the reader can see when entity
    // resolution was thin.
    confidence?: number;
  };
  // Wall-clock timestamps for the step's life on the client. startedAt
  // is set when the plan_step event lands; endedAt is set when the *next*
  // plan_step lands or when the investigation completes / blocks. These
  // are display-only — they don't gate any logic.
  startedAt?: number;
  endedAt?: number;
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

export type InvestigationStatus =
  | "idle"
  | "running"
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
  topRecipients: RecipientRow[];
  // Receipts for the status strip. startedAt comes from the server's
  // investigation_started event so cached replays show their original elapsed
  // budget rather than the replay's wall time.
  startedAt?: number;
  finishedAt?: number;
  // Distinct reportInfoIdent values surfaced by tool_result events.
  // "Scanned" because the agent saw them; not all of them get cited.
  scannedSourceRows: string[];
  // Subset the agent actually cited in a narrative_chunk. Status strip
  // shows both as separate pills so the labels stop lying — old code
  // conflated them under "rows cited."
  citedSourceRows: string[];
  // Post-run "follow the money" suggestion. Populated by a read_next event
  // when the live runner generated one; otherwise null and RelatedRail
  // falls back to its static tag-overlap pick.
  readNext?: { question: string; kicker: string; rationale: string };
};

export const initialState: InvestigationState = {
  question: null,
  status: "idle",
  planSteps: [],
  narrative: [],
  graphNodes: [],
  graphEdges: [],
  topDonors: [],
  topRecipients: [],
  scannedSourceRows: [],
  citedSourceRows: [],
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
    case "plan_step": {
      const now = Date.now();
      return {
        ...state,
        planSteps: [
          ...markPrevDone(state.planSteps, now),
          {
            id: ev.id,
            description: ev.description,
            status: "running",
            startedAt: now,
          },
        ],
      };
    }
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
                  citedRowCount: 0,
                  confidence: ev.confidence,
                },
              }
            : s,
        ),
        scannedSourceRows: mergeIdents(state.scannedSourceRows, ev.sourceRows),
      };
    case "narrative_chunk": {
      const newCitations = ev.citations.map((c) => c.reportInfoIdent);
      // Walk back through plan steps newest-first; the first step whose
      // toolResult.sourceRows contains any of these citations gets credit
      // for the cite. This is the right attribution because the agent's
      // pattern is "tool call -> immediately narrate from it" — a citation
      // hops back at most one or two plan steps.
      const planSteps = state.planSteps.map((s) => s);
      let attributed = false;
      for (let i = planSteps.length - 1; i >= 0 && !attributed; i--) {
        const tr = planSteps[i].toolResult;
        if (!tr) continue;
        const overlap = newCitations.filter((id) => tr.sourceRows.includes(id));
        if (overlap.length > 0) {
          planSteps[i] = {
            ...planSteps[i],
            toolResult: {
              ...tr,
              citedRowCount: tr.citedRowCount + overlap.length,
            },
          };
          attributed = true;
        }
      }
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
        planSteps,
        citedSourceRows: mergeIdents(state.citedSourceRows, newCitations),
      };
    }
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
    case "investigation_complete": {
      const finishedAt = Date.now();
      return {
        ...state,
        status: "complete",
        finishedAt,
        planSteps: markPrevDone(state.planSteps, finishedAt),
        topDonors: ev.topDonors ?? state.topDonors,
        topRecipients: ev.topRecipients ?? state.topRecipients,
      };
    }
    case "read_next":
      return {
        ...state,
        readNext: {
          question: ev.question,
          kicker: ev.kicker,
          rationale: ev.rationale,
        },
      };
    case "investigation_failed":
      return {
        ...state,
        status: "failed",
        failureReason: ev.reason,
      };
  }
}

function markPrevDone(steps: PlanStepView[], at: number): PlanStepView[] {
  return steps.map((s, i, arr) =>
    i === arr.length - 1 && s.status === "running"
      ? { ...s, status: "done", endedAt: s.endedAt ?? at }
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

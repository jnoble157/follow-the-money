import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";
import { zodToJsonSchema } from "zod-to-json-schema";
import { TOOLS as MCP_TOOLS, getTool } from "@txmoney/mcp/tools";
import {
  WRITER_TOOL_SCHEMAS,
  writerToolsForAnthropic,
  type WriterToolName,
} from "./writer_tools.ts";
import {
  createSession,
  destroySession,
  setPending,
  clearPending,
} from "./sessions.ts";

// Wire-format event the front end consumes. Defined here as a plain
// inlined union; the canonical type lives in web/lib/investigations/types.ts.
// Any change here must also land there.
export type InvestigationEvent =
  | { type: "plan_started"; question: string }
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
      confidence?: number;
    }
  | {
      type: "narrative_chunk";
      text: string;
      citations: Array<{
        reportInfoIdent: string;
        url: string;
        rowSummary: string;
      }>;
      role?: "lede" | "body" | "methods" | "reading_note" | "missing";
    }
  | {
      type: "graph_node";
      id: string;
      label: string;
      kind: "filer" | "donor" | "employer" | "lobbyist" | "client" | "pac";
      sublabel?: string;
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
      type: "disambiguation_required";
      id: string;
      stepId: string;
      title: string;
      explanation: string;
      variants: Array<{
        variant: string;
        contributions: number;
        total: number;
        sampleContributors: string[];
        sampleCitation: {
          reportInfoIdent: string;
          url: string;
          rowSummary: string;
        };
      }>;
    }
  | { type: "disambiguation_resolved"; id: string; merged: boolean }
  | {
      type: "investigation_complete";
      topDonors?: Array<{
        rank: number;
        donor: string;
        rolledEmployer: string | null;
        contributions: number;
        total: number;
        variants?: string[];
        citation: {
          reportInfoIdent: string;
          url: string;
          rowSummary: string;
        };
      }>;
    }
  | { type: "investigation_failed"; reason: string };

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SYSTEM_PROMPT = fs.readFileSync(
  path.join(HERE, "prompts", "system.md"),
  "utf8",
);

const MODEL = process.env.TXMONEY_MODEL ?? "claude-sonnet-4-5";
const MAX_AGENT_TURNS = 24;

// Build the Anthropic tool registry once. MCP data tools come from the
// shared @txmoney/mcp package; writer tools are local to the agent.
function buildAnthropicTools(): Anthropic.Tool[] {
  const data = MCP_TOOLS.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: zodToJsonSchema(t.argsSchema, {
      $refStrategy: "none",
    }) as Anthropic.Tool.InputSchema,
  }));
  const writer = writerToolsForAnthropic().map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.input_schema as Anthropic.Tool.InputSchema,
  }));
  return [...data, ...writer];
}

export type RunOptions = {
  apiKey?: string;
  model?: string;
};

export async function* runInvestigation(
  question: string,
  sessionId: string,
  options: RunOptions = {},
): AsyncGenerator<InvestigationEvent> {
  const apiKey = options.apiKey ?? process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    yield {
      type: "investigation_failed",
      reason: "ANTHROPIC_API_KEY is not set; the live agent can't run without it.",
    };
    return;
  }
  const client = new Anthropic({ apiKey });
  const tools = buildAnthropicTools();
  createSession(sessionId);

  yield { type: "plan_started", question };
  yield { type: "investigation_started", startedAt: Date.now() };

  // Conversation log we send to the model on each turn. We append assistant
  // turns as-is, then append tool_result blocks once the round is done.
  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: question },
  ];

  // Per-call state: the most recent plan_step id, used to attach
  // tool_call/tool_result events to a step in the plan trace.
  let currentStepId = "p0";
  let completed = false;
  // Citation registry, built from every data-tool result we see during the
  // run. The model only has to emit reportInfoIdent in writer-tool citations
  // — the runner looks the row up here to fill in url and rowSummary before
  // the event reaches the UI. Saves ~270 chars per citation of model output,
  // which is the difference between a 38s and a 25s run on citation-heavy
  // questions.
  const citationRegistry = new Map<
    string,
    { url: string; rowSummary: string }
  >();

  // Mutable carrier the streaming-turn generator fills in as it runs. We use
  // an outer object so the turn can yield events through the AsyncGenerator
  // protocol while still surfacing the assistant message + tool results +
  // disambiguation parking to the next iteration.
  type AssistantBlock = Anthropic.TextBlockParam | Anthropic.ToolUseBlockParam;
  type TurnOutcome = {
    assistantBlocks: AssistantBlock[];
    toolResults: Anthropic.ToolResultBlockParam[];
    completed: boolean;
    pendingDisambiguation?: { id: string; blockId: string };
  };

  try {
    for (let turn = 0; turn < MAX_AGENT_TURNS && !completed; turn++) {
      const outcome: TurnOutcome = {
        assistantBlocks: [],
        toolResults: [],
        completed: false,
      };

      // Stream the turn. Writer-tool events are yielded as their tool_use
      // blocks finalize (content_block_stop), so the report panel paints
      // the lede while the model is still generating body chunks.
      for await (const ev of streamTurn({
        client,
        model: options.model ?? MODEL,
        tools,
        messages,
        sessionId,
        citationRegistry,
        getStepId: () => currentStepId,
        setStepId: (id) => {
          currentStepId = id;
        },
        outcome,
      })) {
        yield ev;
      }

      messages.push({
        role: "assistant",
        content: outcome.assistantBlocks,
      });

      if (outcome.completed) {
        completed = true;
        break;
      }

      // Disambiguation pauses the run between turns. The writer-tool
      // dispatcher already emitted disambiguation_required mid-turn; park
      // here until the user answers, then feed { merged } back as the
      // tool_result for the next turn.
      if (outcome.pendingDisambiguation) {
        const { id, blockId } = outcome.pendingDisambiguation;
        const merged = await new Promise<boolean>((resolve) => {
          setPending(sessionId, { id, resolve });
        });
        clearPending(sessionId);
        yield { type: "disambiguation_resolved", id, merged };
        outcome.toolResults.push({
          type: "tool_result",
          tool_use_id: blockId,
          content: JSON.stringify({ merged }),
        });
      }

      if (outcome.toolResults.length === 0) {
        // Model ended the turn without calling any tool. Close gracefully.
        yield { type: "investigation_complete" };
        completed = true;
        break;
      }

      messages.push({ role: "user", content: outcome.toolResults });
    }
    if (!completed) {
      yield {
        type: "investigation_failed",
        reason: `Agent did not complete within ${MAX_AGENT_TURNS} turns.`,
      };
    }
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    yield { type: "investigation_failed", reason };
  } finally {
    destroySession(sessionId);
  }
}

// One assistant turn streamed as it generates. As each tool_use block ends
// (content_block_stop), we parse its accumulated input, dispatch the writer
// event (or run the data tool and dispatch tool_call/tool_result), and yield
// the InvestigationEvents in arrival order. Outer callers iterate this and
// re-yield up to the SSE consumer — that's what makes the user see the lede
// the moment Sonnet finishes typing it, instead of waiting for the whole
// turn to land.
type CitationRegistry = Map<string, { url: string; rowSummary: string }>;

async function* streamTurn(opts: {
  client: Anthropic;
  model: string;
  tools: Anthropic.Tool[];
  messages: Anthropic.MessageParam[];
  sessionId: string;
  citationRegistry: CitationRegistry;
  getStepId: () => string;
  setStepId: (id: string) => void;
  outcome: {
    assistantBlocks: Array<
      Anthropic.TextBlockParam | Anthropic.ToolUseBlockParam
    >;
    toolResults: Anthropic.ToolResultBlockParam[];
    completed: boolean;
    pendingDisambiguation?: { id: string; blockId: string };
  };
}): AsyncGenerator<InvestigationEvent> {
  // Per-content-block accumulator. tool_use input arrives as a sequence of
  // input_json_delta strings that need concatenation then JSON.parse on
  // content_block_stop. text blocks accumulate text_delta strings; we
  // preserve them only for the assistant-message history.
  type BlockState =
    | { kind: "tool_use"; id: string; name: string; jsonBuf: string }
    | { kind: "text"; text: string };
  const blocks = new Map<number, BlockState>();

  // 2048 is enough headroom for one full writer-tool turn under the prompt's
  // output budget (lede + optional body + a handful of graph calls + complete).
  // Lowering this from 4096 directly tightens the wall-clock; Sonnet 4.5
  // outputs at ~70 tok/s and we can't afford the extra 30s ceiling.
  const stream = opts.client.messages.stream({
    model: opts.model,
    max_tokens: 2048,
    system: SYSTEM_PROMPT,
    tools: opts.tools,
    messages: opts.messages,
  });

  for await (const ev of stream) {
    if (ev.type === "content_block_start") {
      const cb = ev.content_block;
      if (cb.type === "tool_use") {
        blocks.set(ev.index, {
          kind: "tool_use",
          id: cb.id,
          name: cb.name,
          jsonBuf: "",
        });
      } else if (cb.type === "text") {
        blocks.set(ev.index, { kind: "text", text: "" });
      }
      continue;
    }

    if (ev.type === "content_block_delta") {
      const state = blocks.get(ev.index);
      if (!state) continue;
      if (
        ev.delta.type === "input_json_delta" &&
        state.kind === "tool_use"
      ) {
        state.jsonBuf += ev.delta.partial_json;
      } else if (
        ev.delta.type === "text_delta" &&
        state.kind === "text"
      ) {
        state.text += ev.delta.text;
      }
      continue;
    }

    if (ev.type !== "content_block_stop") continue;

    const state = blocks.get(ev.index);
    if (!state) continue;
    blocks.delete(ev.index);

    if (state.kind === "text") {
      if (state.text.length > 0) {
        opts.outcome.assistantBlocks.push({ type: "text", text: state.text });
      }
      continue;
    }

    const input = parseJson(state.jsonBuf);
    opts.outcome.assistantBlocks.push({
      type: "tool_use",
      id: state.id,
      name: state.name,
      input: input as Record<string, unknown>,
    });

    const block = {
      id: state.id,
      name: state.name,
      input,
    } as Anthropic.ToolUseBlock;

    if (state.name === "request_disambiguation") {
      const handled = handleDisambigRequest(
        block,
        opts.getStepId(),
        opts.citationRegistry,
      );
      for (const e of handled.events) yield e;
      if (handled.toolResultError) {
        opts.outcome.toolResults.push(handled.toolResultError);
      } else if (handled.disambiguationId) {
        opts.outcome.pendingDisambiguation = {
          id: handled.disambiguationId,
          blockId: state.id,
        };
      }
      continue;
    }

    const handled = await handleToolUse({
      block,
      currentStepId: opts.getStepId(),
      sessionId: opts.sessionId,
      citationRegistry: opts.citationRegistry,
    });
    for (const e of handled.events) yield e;
    if (handled.newStepId) opts.setStepId(handled.newStepId);
    opts.outcome.toolResults.push(handled.toolResult);
    if (handled.complete) {
      opts.outcome.completed = true;
      // The model usually emits complete_investigation last. If the stream
      // has further blocks we still record them in the assistant history,
      // but the run is over so we don't dispatch their UI events.
    }
  }

  // Drain so the SDK surfaces any error encountered mid-stream.
  await stream.finalMessage();
}

function parseJson(buf: string): unknown {
  if (buf.trim().length === 0) return {};
  try {
    return JSON.parse(buf);
  } catch {
    return {};
  }
}

// Trim what we hand back to the model on the next turn. The MCP tools were
// designed for human consumption: get_contributions can return 200 rows with
// type strings the agent never quotes. Feeding all of that back as input
// tokens lengthens the next-turn TTFT and tempts the model to produce a
// longer (slower) narrative. We cap to MODEL_ROW_CAP rows under any of the
// known array keys and drop null/empty fields per row. The UI's sample comes
// from the *full* result via summarizeMcpResult — only the model-facing copy
// gets compacted.
const MODEL_ROW_CAP = 60;
const MODEL_ARRAY_KEYS = [
  "donors",
  "recipients",
  "matches",
  "clusters",
  "rows",
] as const;
function compactForModel(result: unknown): unknown {
  if (!result || typeof result !== "object") return result;
  const r = result as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(r)) {
    if (v === null || v === undefined) continue;
    if (
      Array.isArray(v) &&
      (MODEL_ARRAY_KEYS as readonly string[]).includes(k)
    ) {
      out[k] = v.slice(0, MODEL_ROW_CAP).map((row) =>
        typeof row === "object" && row !== null ? compactRow(row as Record<string, unknown>) : row,
      );
      if (v.length > MODEL_ROW_CAP) {
        out[`${k}Truncated`] = true;
        out[`${k}TotalCount`] = v.length;
      }
      continue;
    }
    out[k] = v;
  }
  return out;
}

function compactRow(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (v === null || v === undefined) continue;
    if (typeof v === "string" && v.length === 0) continue;
    out[k] = v;
  }
  return out;
}

type Handled = {
  events: InvestigationEvent[];
  toolResult: Anthropic.ToolResultBlockParam;
  complete: boolean;
  newStepId?: string;
};

async function handleToolUse(args: {
  block: Anthropic.ToolUseBlock;
  currentStepId: string;
  sessionId: string;
  citationRegistry: CitationRegistry;
}): Promise<Handled> {
  const { block, currentStepId, sessionId, citationRegistry } = args;
  const events: InvestigationEvent[] = [];

  // Writer tools first — they don't hit the data layer.
  if (isWriterTool(block.name)) {
    return handleWriterTool(block, currentStepId, sessionId, citationRegistry);
  }

  // MCP data tool: run it, mirror the call + result to the UI, return the
  // serialized result back to the agent.
  const tool = getTool(block.name);
  if (!tool) {
    return {
      events,
      toolResult: {
        type: "tool_result",
        tool_use_id: block.id,
        is_error: true,
        content: `unknown tool: ${block.name}`,
      },
      complete: false,
    };
  }

  events.push({
    type: "tool_call",
    stepId: currentStepId,
    tool: block.name,
    args: (block.input as Record<string, unknown>) ?? {},
  });

  let resultJson: string;
  let result: unknown;
  try {
    result = await tool.run((block.input ?? {}) as never);
    // Harvest every {reportInfoIdent, url, rowSummary} triple from the result
    // into the run-level registry. The model will reference these by ident in
    // later writer tools and we'll fill in the rest at dispatch time.
    indexCitations(result, citationRegistry);
    resultJson = JSON.stringify(compactForModel(result));
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    events.push({
      type: "tool_result",
      stepId: currentStepId,
      rowCount: 0,
      sample: [],
      sourceRows: [],
    });
    return {
      events,
      toolResult: {
        type: "tool_result",
        tool_use_id: block.id,
        is_error: true,
        content: `tool ${block.name} failed: ${reason}`,
      },
      complete: false,
    };
  }

  const summary = summarizeMcpResult(result);
  events.push({
    type: "tool_result",
    stepId: currentStepId,
    rowCount: summary.rowCount,
    sample: summary.sample,
    sourceRows: summary.sourceRows,
    confidence: summary.confidence,
  });

  return {
    events,
    toolResult: {
      type: "tool_result",
      tool_use_id: block.id,
      content: resultJson,
    },
    complete: false,
  };
}

function isWriterTool(name: string): name is WriterToolName {
  return Object.prototype.hasOwnProperty.call(WRITER_TOOL_SCHEMAS, name);
}

async function handleWriterTool(
  block: Anthropic.ToolUseBlock,
  currentStepId: string,
  sessionId: string,
  citationRegistry: CitationRegistry,
): Promise<Handled> {
  const events: InvestigationEvent[] = [];
  const name = block.name as WriterToolName;
  const schema = WRITER_TOOL_SCHEMAS[name];

  let parsed: unknown;
  try {
    parsed = schema.parse(block.input ?? {});
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return {
      events,
      toolResult: {
        type: "tool_result",
        tool_use_id: block.id,
        is_error: true,
        content: `invalid ${name} args: ${reason}`,
      },
      complete: false,
    };
  }

  switch (name) {
    case "plan_step": {
      const a = parsed as { id: string; description: string };
      events.push({ type: "plan_step", id: a.id, description: a.description });
      return {
        events,
        toolResult: ack(block.id),
        complete: false,
        newStepId: a.id,
      };
    }
    case "emit_narrative": {
      const a = parsed as {
        role: "lede" | "body" | "methods" | "reading_note" | "missing";
        text: string;
        citations: Array<{
          reportInfoIdent: string;
          url?: string;
          rowSummary?: string;
        }>;
      };
      events.push({
        type: "narrative_chunk",
        text: a.text,
        citations: a.citations.map((c) => enrichCitation(c, citationRegistry)),
        role: a.role,
      });
      return { events, toolResult: ack(block.id), complete: false };
    }
    case "emit_graph_node": {
      const a = parsed as {
        id: string;
        label: string;
        kind: "filer" | "donor" | "employer" | "lobbyist" | "client" | "pac";
        sublabel?: string;
        profileSlug?: string;
      };
      events.push({
        type: "graph_node",
        id: a.id,
        label: a.label,
        kind: a.kind,
        sublabel: a.sublabel,
        profileSlug: a.profileSlug,
      });
      return { events, toolResult: ack(block.id), complete: false };
    }
    case "emit_graph_edge": {
      const a = parsed as {
        from: string;
        to: string;
        label?: string;
        weight?: number;
      };
      events.push({
        type: "graph_edge",
        from: a.from,
        to: a.to,
        label: a.label,
        weight: a.weight,
      });
      return { events, toolResult: ack(block.id), complete: false };
    }
    case "request_disambiguation": {
      // Handled in the runner main loop so the event yields before parking.
      // This case is unreachable; keep it for exhaustiveness.
      return { events, toolResult: ack(block.id), complete: false };
    }
    case "complete_investigation": {
      const a = parsed as {
        topDonors?: Array<{
          rank: number;
          donor: string;
          rolledEmployer?: string | null;
          contributions: number;
          total: number;
          variants?: string[];
          citation: {
            reportInfoIdent: string;
            url?: string;
            rowSummary?: string;
          };
        }>;
      };
      const donors = a.topDonors?.map((d) => ({
        rank: d.rank,
        donor: d.donor,
        rolledEmployer: d.rolledEmployer ?? null,
        contributions: d.contributions,
        total: d.total,
        variants: d.variants,
        citation: enrichCitation(d.citation, citationRegistry),
      }));
      events.push({ type: "investigation_complete", topDonors: donors });
      return { events, toolResult: ack(block.id), complete: true };
    }
  }
  return { events, toolResult: ack(block.id), complete: false };
}

function ack(toolUseId: string): Anthropic.ToolResultBlockParam {
  return {
    type: "tool_result",
    tool_use_id: toolUseId,
    content: "ok",
  };
}

// Validates request_disambiguation args and produces the immediate
// disambiguation_required event. The runner yields the event, then awaits
// the user's reply on its own. We don't await inside this function — that
// would deadlock the consumer.
function handleDisambigRequest(
  block: Anthropic.ToolUseBlock,
  currentStepId: string,
  citationRegistry: CitationRegistry,
): {
  events: InvestigationEvent[];
  disambiguationId?: string;
  toolResultError?: Anthropic.ToolResultBlockParam;
} {
  const schema = WRITER_TOOL_SCHEMAS["request_disambiguation"];
  let parsed: {
    id: string;
    title: string;
    explanation: string;
    variants: Array<{
      variant: string;
      contributions: number;
      total: number;
      sampleContributors: string[];
      sampleCitation: {
        reportInfoIdent: string;
        url?: string;
        rowSummary?: string;
      };
    }>;
  };
  try {
    parsed = schema.parse(block.input ?? {}) as typeof parsed;
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return {
      events: [],
      toolResultError: {
        type: "tool_result",
        tool_use_id: block.id,
        is_error: true,
        content: `invalid request_disambiguation args: ${reason}`,
      },
    };
  }
  return {
    events: [
      {
        type: "disambiguation_required",
        id: parsed.id,
        stepId: currentStepId,
        title: parsed.title,
        explanation: parsed.explanation,
        variants: parsed.variants.map((v) => ({
          ...v,
          sampleCitation: enrichCitation(v.sampleCitation, citationRegistry),
        })),
      },
    ],
    disambiguationId: parsed.id,
  };
}

// Walks any tool result and stuffs every {reportInfoIdent, url, rowSummary}
// triple it sees into the registry. We're permissive about field nesting
// because tools shape their results differently — sometimes it's `source`,
// sometimes `citation`, sometimes inside a per-variant object.
function indexCitations(value: unknown, registry: CitationRegistry): void {
  if (!value) return;
  if (Array.isArray(value)) {
    for (const v of value) indexCitations(v, registry);
    return;
  }
  if (typeof value !== "object") return;
  const obj = value as Record<string, unknown>;
  const ident = obj.reportInfoIdent;
  const url = obj.url;
  const summary = obj.rowSummary;
  if (
    typeof ident === "string" &&
    typeof url === "string" &&
    typeof summary === "string"
  ) {
    if (!registry.has(ident)) {
      registry.set(ident, { url, rowSummary: summary });
    }
  }
  for (const v of Object.values(obj)) indexCitations(v, registry);
}

// Fills in any url/rowSummary fields the model omitted. The model gets a
// real wire-format Citation no matter how lazy it was about repeating
// already-known fields.
function enrichCitation(
  c: { reportInfoIdent: string; url?: string; rowSummary?: string },
  registry: CitationRegistry,
): { reportInfoIdent: string; url: string; rowSummary: string } {
  const known = registry.get(c.reportInfoIdent);
  return {
    reportInfoIdent: c.reportInfoIdent,
    url: c.url ?? known?.url ?? "",
    rowSummary: c.rowSummary ?? known?.rowSummary ?? "",
  };
}

// Pull a row count, three sample rows, and the source-row idents out of an
// MCP tool result without knowing the exact shape. Tools share a small
// vocabulary: the result contains one of `donors`, `recipients`, `matches`,
// `clusters`, or `rows`. We walk those.
function summarizeMcpResult(result: unknown): {
  rowCount: number;
  sample: Array<Record<string, unknown>>;
  sourceRows: string[];
  confidence?: number;
} {
  if (!result || typeof result !== "object") {
    return { rowCount: 0, sample: [], sourceRows: [] };
  }
  const r = result as Record<string, unknown>;
  const arrayKey =
    (Array.isArray(r.donors) && "donors") ||
    (Array.isArray(r.recipients) && "recipients") ||
    (Array.isArray(r.matches) && "matches") ||
    (Array.isArray(r.clusters) && "clusters") ||
    (Array.isArray(r.rows) && "rows");
  if (!arrayKey) {
    return { rowCount: 0, sample: [], sourceRows: [] };
  }
  const arr = r[arrayKey] as Array<Record<string, unknown>>;
  const rowCount = arr.length;
  const sample = arr.slice(0, 3);
  const sourceRows: string[] = [];
  let confidence: number | undefined = undefined;

  for (const row of arr) {
    const sources = collectSources(row);
    for (const id of sources) sourceRows.push(id);
    if (typeof row.confidence === "number") {
      // Lowest confidence wins so the UI shows the riskiest bound.
      if (confidence === undefined || row.confidence < confidence) {
        confidence = row.confidence;
      }
    }
  }

  return {
    rowCount,
    sample,
    sourceRows: Array.from(new Set(sourceRows)),
    confidence,
  };
}

function collectSources(row: Record<string, unknown>): string[] {
  const out: string[] = [];
  const single = row.source as { reportInfoIdent?: string } | undefined;
  if (single?.reportInfoIdent) out.push(single.reportInfoIdent);
  const a = row.austinSource as { reportInfoIdent?: string } | undefined;
  if (a?.reportInfoIdent) out.push(a.reportInfoIdent);
  const s = row.stateSource as { reportInfoIdent?: string } | undefined;
  if (s?.reportInfoIdent) out.push(s.reportInfoIdent);
  // cluster.variants[].source
  const variants = row.variants as
    | Array<{ source?: { reportInfoIdent?: string } }>
    | undefined;
  if (Array.isArray(variants)) {
    for (const v of variants) {
      if (v.source?.reportInfoIdent) out.push(v.source.reportInfoIdent);
    }
  }
  return out;
}

export { resolveDisambiguation } from "./sessions.ts";

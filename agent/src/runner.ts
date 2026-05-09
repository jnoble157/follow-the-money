import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import OpenAI from "openai";
import type { ResponseInputItem, Tool } from "openai/resources/responses/responses";
import { zodToJsonSchema } from "zod-to-json-schema";
import { TOOLS as MCP_TOOLS, getTool } from "@txmoney/mcp/tools";
import {
  WRITER_TOOL_SCHEMAS,
  writerToolsForOpenAI,
  type WriterToolName,
} from "./writer_tools.ts";
import {
  createSession,
  destroySession,
  setPending,
  clearPending,
} from "./sessions.ts";
import { generateReadNext } from "./read_next.ts";
import type { InvestigationEvent } from "@txmoney/mcp/events";

export type { InvestigationEvent } from "@txmoney/mcp/events";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SYSTEM_PROMPT = fs.readFileSync(
  path.join(HERE, "prompts", "system.md"),
  "utf8",
);

// Default model. gpt-5.1 is the strongest narrative + tool-calling SKU on
// the OpenAI Responses API at the time of writing; the read-next call uses
// gpt-5-mini because it's a single short turn where latency matters more
// than the marginal quality. Override either with the env vars below if
// your API key has access to a different SKU.
const MODEL = process.env.TXMONEY_MODEL ?? "gpt-5.1";
const READ_NEXT_MODEL = process.env.TXMONEY_READ_NEXT_MODEL ?? "gpt-5-mini";
const MAX_AGENT_TURNS = 24;

// Build the OpenAI tool registry once per process. MCP data tools come from
// the shared @txmoney/mcp package; writer tools are local to the agent.
function buildOpenAITools(): Tool[] {
  const data: Tool[] = MCP_TOOLS.map((t) => ({
    type: "function",
    name: t.name,
    description: t.description,
    parameters: zodToJsonSchema(t.argsSchema, { $refStrategy: "none" }) as Record<
      string,
      unknown
    >,
    strict: false,
  }));
  const writer = writerToolsForOpenAI() as Tool[];
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
  const apiKey = options.apiKey ?? process.env.OPENAI_API_KEY;
  if (!apiKey) {
    yield {
      type: "investigation_failed",
      reason: "OPENAI_API_KEY is not set; the live agent can't run without it.",
    };
    return;
  }
  const client = new OpenAI({ apiKey });
  const tools = buildOpenAITools();
  const model = options.model ?? MODEL;
  createSession(sessionId);

  yield { type: "plan_started", question };
  yield { type: "investigation_started", startedAt: Date.now() };

  // Conversation log we send to the model on each turn. We append assistant
  // function_call items as they arrive, then append function_call_output
  // items once the round is done.
  const messages: ResponseInputItem[] = [
    { role: "user", content: question },
  ];

  // Per-call state: the most recent plan_step id, used to attach
  // tool_call/tool_result events to a step in the plan trace.
  let currentStepId = "p0";
  let completed = false;
  // Citation registry, built from every data-tool result we see during the
  // run. The model only has to emit reportInfoIdent in writer-tool citations
  // — the runner looks the row up here to fill in url and rowSummary before
  // the event reaches the UI.
  const citationRegistry = new Map<
    string,
    { url: string; rowSummary: string }
  >();

  // Narrative buffer for the post-run read-next call. Capturing here keeps
  // the read-next prompt short — we feed it the lede + body chunks plus a
  // short list of graph nodes, not the whole event log.
  const narrativeForReadNext: Array<{ role: string; text: string }> = [];
  const graphNodesForReadNext: Array<{ kind: string; label: string }> = [];

  try {
    for (let turn = 0; turn < MAX_AGENT_TURNS && !completed; turn++) {
      const outcome: TurnOutcome = {
        assistantItems: [],
        toolOutputs: [],
        completed: false,
      };

      for await (const ev of streamTurn({
        client,
        model,
        tools,
        messages,
        sessionId,
        citationRegistry,
        getStepId: () => currentStepId,
        setStepId: (id) => {
          currentStepId = id;
        },
        narrativeForReadNext,
        graphNodesForReadNext,
        outcome,
      })) {
        yield ev;
      }

      // Splice the assistant items into the conversation in arrival order
      // so call_id references resolve correctly on the next request.
      for (const item of outcome.assistantItems) {
        messages.push(item);
      }

      if (outcome.completed) {
        completed = true;
        break;
      }

      if (outcome.pendingDisambiguation) {
        const { id, callId } = outcome.pendingDisambiguation;
        const merged = await new Promise<boolean>((resolve) => {
          setPending(sessionId, { id, resolve });
        });
        clearPending(sessionId);
        yield { type: "disambiguation_resolved", id, merged };
        outcome.toolOutputs.push({
          type: "function_call_output",
          call_id: callId,
          output: JSON.stringify({ merged }),
        });
      }

      if (outcome.toolOutputs.length === 0) {
        // Model ended the turn without calling any tool. Close gracefully.
        yield { type: "investigation_complete" };
        completed = true;
        break;
      }

      for (const item of outcome.toolOutputs) {
        messages.push(item);
      }
    }
    if (!completed) {
      yield {
        type: "investigation_failed",
        reason: `Agent did not complete within ${MAX_AGENT_TURNS} turns.`,
      };
    } else {
      // Post-run read-next. Don't fail the whole investigation if this
      // call errors — the user already has the report.
      try {
        const rn = await generateReadNext(client, READ_NEXT_MODEL, {
          question,
          narrative: narrativeForReadNext,
          graphNodes: graphNodesForReadNext,
        });
        if (rn) yield rn;
      } catch (err) {
        // Swallow; the report is still valid without the read-next pill.
        console.error("read_next generation failed:", err);
      }
    }
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    yield { type: "investigation_failed", reason };
  } finally {
    destroySession(sessionId);
  }
}

type TurnOutcome = {
  // Items the model emitted this turn (function_call items, plus optional
  // assistant message items). They get appended to the conversation in the
  // outer loop after the turn completes.
  assistantItems: ResponseInputItem[];
  toolOutputs: ResponseInputItem[];
  completed: boolean;
  pendingDisambiguation?: { id: string; callId: string };
};

type CitationRegistry = Map<string, { url: string; rowSummary: string }>;

// One assistant turn streamed against the OpenAI Responses API. Yields
// InvestigationEvents to the outer generator as tool calls finalize, so the
// UI paints the lede the moment the model finishes typing it instead of
// waiting for the whole turn to land.
async function* streamTurn(opts: {
  client: OpenAI;
  model: string;
  tools: Tool[];
  messages: ResponseInputItem[];
  sessionId: string;
  citationRegistry: CitationRegistry;
  getStepId: () => string;
  setStepId: (id: string) => void;
  narrativeForReadNext: Array<{ role: string; text: string }>;
  graphNodesForReadNext: Array<{ kind: string; label: string }>;
  outcome: TurnOutcome;
}): AsyncGenerator<InvestigationEvent> {
  const stream = await opts.client.responses.create({
    model: opts.model,
    instructions: SYSTEM_PROMPT,
    input: opts.messages,
    tools: opts.tools,
    parallel_tool_calls: true,
    // Don't persist on OpenAI side; we manage history ourselves so the run
    // is reproducible and recordable to JSONL.
    store: false,
    stream: true,
    max_output_tokens: 2048,
  });

  for await (const ev of stream) {
    if (ev.type !== "response.output_item.done") continue;
    const item = ev.item;
    if (item.type !== "function_call") {
      // Plain assistant messages without tool calls aren't part of our
      // workflow — the agent is expected to communicate via writer tools.
      // Keep them in the assistant log so the next turn can see them.
      opts.outcome.assistantItems.push(item as ResponseInputItem);
      continue;
    }

    const callId = item.call_id;
    const name = item.name;
    const argsJson = item.arguments;

    // Persist the function_call item so the next turn's input includes it
    // before the matching function_call_output.
    opts.outcome.assistantItems.push({
      type: "function_call",
      call_id: callId,
      name,
      arguments: argsJson,
    });

    const args = parseJson(argsJson);

    if (name === "request_disambiguation") {
      const handled = handleDisambigRequest(
        { callId, name, args },
        opts.getStepId(),
        opts.citationRegistry,
      );
      for (const e of handled.events) yield e;
      if (handled.toolOutputError) {
        opts.outcome.toolOutputs.push(handled.toolOutputError);
      } else if (handled.disambiguationId) {
        opts.outcome.pendingDisambiguation = {
          id: handled.disambiguationId,
          callId,
        };
      }
      continue;
    }

    const handled = await handleToolUse({
      block: { callId, name, args },
      currentStepId: opts.getStepId(),
      sessionId: opts.sessionId,
      citationRegistry: opts.citationRegistry,
    });
    for (const e of handled.events) {
      // Mirror narrative + graph_node into the read-next buffers as we go.
      if (e.type === "narrative_chunk") {
        opts.narrativeForReadNext.push({
          role: e.role ?? "body",
          text: e.text,
        });
      } else if (e.type === "graph_node") {
        opts.graphNodesForReadNext.push({ kind: e.kind, label: e.label });
      }
      yield e;
    }
    if (handled.newStepId) opts.setStepId(handled.newStepId);
    opts.outcome.toolOutputs.push(handled.toolOutput);
    if (handled.complete) {
      opts.outcome.completed = true;
    }
  }
}

function parseJson(buf: string): unknown {
  if (!buf || buf.trim().length === 0) return {};
  try {
    return JSON.parse(buf);
  } catch {
    return {};
  }
}

// Trim what we hand back to the model on the next turn. The MCP tools were
// designed for human consumption: top_state_donors can return 50 donors
// with employer + occupation + full citation each, and feeding all of that
// back as input tokens lengthens the next-turn TTFT for no narrative
// benefit. Keep only the columns the model uses to write the lede; the full
// row stays in the citation registry on the runner side so footnotes still
// resolve.
const MODEL_ROW_CAP = 30;
const KEEP_ROW_FIELDS = new Set([
  "rank",
  "donor",
  "donorEmployer",
  "rolledEmployer",
  "totalAmount",
  "contributionsCount",
  "filerName",
  "filerIdent",
  "filerTypeCd",
  "totalRaised",
  "confidence",
  "amount",
  "date",
  "recipient",
  "payee",
  "description",
  "canonical",
  "mergedTotal",
  "mergedCount",
  "variant",
  "variants",
  "name",
  "austinEmployer",
  "stateEmployer",
  // Source row identifiers — the model needs these to cite. We include the
  // top-level reportInfoIdent (when the row has a flat one) plus the
  // nested source object's reportInfoIdent.
  "reportInfoIdent",
]);
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
        typeof row === "object" && row !== null
          ? compactRow(row as Record<string, unknown>)
          : row,
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
    if (k === "source" && typeof v === "object" && v !== null) {
      const src = v as Record<string, unknown>;
      // Keep only the ident — the runner already has url + summary in the
      // citation registry. This is the single biggest token saving.
      if (typeof src.reportInfoIdent === "string") {
        out.reportInfoIdent = src.reportInfoIdent;
      }
      continue;
    }
    if (
      Array.isArray(v) &&
      v.length > 0 &&
      typeof v[0] === "object"
    ) {
      out[k] = v.slice(0, 5).map((nested) =>
        typeof nested === "object" && nested !== null
          ? compactRow(nested as Record<string, unknown>)
          : nested,
      );
      continue;
    }
    if (KEEP_ROW_FIELDS.has(k)) out[k] = v;
  }
  return out;
}

type Handled = {
  events: InvestigationEvent[];
  toolOutput: ResponseInputItem;
  complete: boolean;
  newStepId?: string;
};

type Block = { callId: string; name: string; args: unknown };

async function handleToolUse(args: {
  block: Block;
  currentStepId: string;
  sessionId: string;
  citationRegistry: CitationRegistry;
}): Promise<Handled> {
  const { block, currentStepId, citationRegistry } = args;
  const events: InvestigationEvent[] = [];

  if (isWriterTool(block.name)) {
    return handleWriterTool(block, currentStepId, citationRegistry);
  }

  const tool = getTool(block.name);
  if (!tool) {
    return {
      events,
      toolOutput: {
        type: "function_call_output",
        call_id: block.callId,
        output: `unknown tool: ${block.name}`,
      },
      complete: false,
    };
  }

  events.push({
    type: "tool_call",
    stepId: currentStepId,
    tool: block.name,
    args: (block.args as Record<string, unknown>) ?? {},
  });

  let resultJson: string;
  let result: unknown;
  try {
    result = await tool.run((block.args ?? {}) as never);
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
      toolOutput: {
        type: "function_call_output",
        call_id: block.callId,
        output: `tool ${block.name} failed: ${reason}`,
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
    toolOutput: {
      type: "function_call_output",
      call_id: block.callId,
      output: resultJson,
    },
    complete: false,
  };
}

function isWriterTool(name: string): name is WriterToolName {
  return Object.prototype.hasOwnProperty.call(WRITER_TOOL_SCHEMAS, name);
}

function handleWriterTool(
  block: Block,
  currentStepId: string,
  citationRegistry: CitationRegistry,
): Handled {
  const events: InvestigationEvent[] = [];
  const name = block.name as WriterToolName;
  const schema = WRITER_TOOL_SCHEMAS[name];

  let parsed: unknown;
  try {
    parsed = schema.parse(block.args ?? {});
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return {
      events,
      toolOutput: {
        type: "function_call_output",
        call_id: block.callId,
        output: `invalid ${name} args: ${reason}`,
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
        toolOutput: ack(block.callId),
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
      return { events, toolOutput: ack(block.callId), complete: false };
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
      return { events, toolOutput: ack(block.callId), complete: false };
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
      return { events, toolOutput: ack(block.callId), complete: false };
    }
    case "request_disambiguation": {
      // Handled in streamTurn so the event yields before the runner parks
      // the loop. This case is unreachable; keep it for exhaustiveness.
      return { events, toolOutput: ack(block.callId), complete: false };
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
      return { events, toolOutput: ack(block.callId), complete: true };
    }
  }
  return { events, toolOutput: ack(block.callId), complete: false };
}

function ack(callId: string): ResponseInputItem {
  return {
    type: "function_call_output",
    call_id: callId,
    output: "ok",
  };
}

function handleDisambigRequest(
  block: Block,
  currentStepId: string,
  citationRegistry: CitationRegistry,
): {
  events: InvestigationEvent[];
  disambiguationId?: string;
  toolOutputError?: ResponseInputItem;
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
    parsed = schema.parse(block.args ?? {}) as typeof parsed;
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return {
      events: [],
      toolOutputError: {
        type: "function_call_output",
        call_id: block.callId,
        output: `invalid request_disambiguation args: ${reason}`,
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

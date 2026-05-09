import type OpenAI from "openai";
import type { InvestigationEvent } from "@txmoney/mcp/events";

// Single source of truth for the read-next OpenAI call. Used both at the
// end of a live run (in runner.ts) and by the one-shot backfill that adds
// read_next events to existing recorded JSONL fixtures
// (backfill_read_next.ts). Keeping them aligned matters: backfilled
// fixtures should match what a fresh live run would produce, otherwise the
// related-rail experience drifts between fixtures and live answers.

// gpt-5-* are reasoning models. With default effort the call burns the
// entire output budget on hidden reasoning and returns output_text: "".
// Minimal effort + headroom keeps the call deterministic at ~75 output
// tokens, ~2.5s end-to-end.
const MODEL_DEFAULTS = {
  max_output_tokens: 800,
  reasoning: { effort: "minimal" as const },
  store: false as const,
};

const INSTRUCTIONS =
  `You suggest the single most engaging follow-up investigation for a user who just read this Texas Money Investigator report. The follow-up should "follow the money one hop further" — a different filer, a connected donor, an adjacent ballot cycle, or a related employer cluster — and use the same Texas Ethics Commission and City of Austin data the agent already has. Do not invent entities; re-use names that appear in the report or its evidence graph.\n\n` +
  `Return ONLY a JSON object with these three string fields:\n` +
  `  "question": a natural follow-up question, 8-15 words, the user would actually want to ask after reading the report.\n` +
  `  "kicker": 4-7 words, ALL CAPS, that would headline the follow-up. Punchy, not generic.\n` +
  `  "rationale": one sentence, 12-25 words, that explains why this is the natural next thread.\n\n` +
  `No prose outside the JSON. No markdown fences.`;

export type ReadNextContext = {
  question: string;
  narrative: Array<{ role: string; text: string }>;
  graphNodes: Array<{ kind: string; label: string }>;
};

export type ReadNextEvent = Extract<InvestigationEvent, { type: "read_next" }>;

export async function generateReadNext(
  client: OpenAI,
  model: string,
  ctx: ReadNextContext,
): Promise<ReadNextEvent | null> {
  if (ctx.narrative.length === 0) return null;
  const lede = ctx.narrative.find((n) => n.role === "lede")?.text ?? "";
  const body = ctx.narrative
    .filter((n) => n.role === "body")
    .map((n) => n.text)
    .join("\n\n");
  const entities = ctx.graphNodes
    .map((n) => `${n.kind}:${n.label}`)
    .slice(0, 12)
    .join(", ");

  const input = `Original question: ${ctx.question}\n\nLede: ${lede}\n\nBody: ${body}\n\nEntities surfaced: ${entities}`;

  const r = await client.responses.create({
    model,
    instructions: INSTRUCTIONS,
    input,
    ...MODEL_DEFAULTS,
  });

  const parsed = tryParseJson((r.output_text ?? "").trim());
  if (!parsed || typeof parsed !== "object") return null;
  const obj = parsed as Record<string, unknown>;
  if (
    typeof obj.question !== "string" ||
    typeof obj.kicker !== "string" ||
    typeof obj.rationale !== "string"
  ) {
    return null;
  }
  return {
    type: "read_next",
    question: obj.question.trim(),
    kicker: obj.kicker.trim(),
    rationale: obj.rationale.trim(),
  };
}

// Lenient JSON parse — the model occasionally wraps the body in
// ```json ... ``` despite the instructions telling it not to.
function tryParseJson(text: string): unknown {
  const stripped = text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/, "")
    .trim();
  try {
    return JSON.parse(stripped);
  } catch {
    return null;
  }
}

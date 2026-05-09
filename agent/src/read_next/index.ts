import type OpenAI from "openai";
import type { InvestigationEvent } from "@txmoney/mcp/events";
import {
  buildCandidates,
  type ReadNextCandidate,
  type ReadNextContext,
  type ReadNextEntity,
} from "./templates.ts";

// The read-next generator. Two stages:
//
// 1. buildCandidates() expands the report's graph nodes against the
//    template registry. Each candidate is a (template, entity) pair whose
//    question shape is guaranteed to be answerable, because the entity
//    already came back from a real tool result in the just-completed
//    investigation. The pre-LLM filter drops federal entities, private
//    individuals, and same-question loops automatically — they never
//    appear in the candidate list.
//
// 2. The LLM picks the single most engaging candidate and writes the
//    kicker + rationale. The LLM never authors the question text — we
//    slot-fill it from the chosen template — so a model hallucination
//    cannot produce a dead-end question.
//
// If the LLM call errors, returns malformed JSON, or picks an out-of-list
// index, we fall back to the first candidate (graph-order = central
// entity first) with a generic kicker. That keeps the rabbit hole always
// alive without compromising click quality on the happy path.

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
  `You are picking the next investigation a casual reader of a Texas Money Investigator report would actually click on. They want a rabbit hole — a surprise, a contradiction, a pattern they didn't see coming. They do not want a restatement of the report they just read.\n\n` +
  `You will receive a numbered list of candidate follow-ups. Each candidate is a real, answerable question against the same Texas Ethics Commission and City of Austin data the agent already used; pick the one whose pull is strongest given the entity it targets and the story the report just told.\n\n` +
  `Return ONLY a JSON object with these fields:\n` +
  `  "index": the integer index of the candidate you picked (0-based; must match one of the candidates).\n` +
  `  "kicker": 4-7 words, ALL CAPS, that tease the *reveal* of the next investigation, not the topic. Bad: "DONOR ACTIVITY ELSEWHERE". Good: "FOLLOW THE EMPLOYER VARIANT" / "TWO PACS, ONE WALLET" / "BOTH SIDES OF THE BALLOT".\n` +
  `  "rationale": one sentence, 12-25 words, that explains why this is the natural next thread for a casual reader. Concrete, specific, no marketing register.\n\n` +
  `No prose outside the JSON. No markdown fences.`;

export type ReadNextEvent = Extract<InvestigationEvent, { type: "read_next" }>;

// Re-exported so callers (runner.ts, backfill_read_next.ts) only depend on
// this entry point and not on ./templates directly.
export type { ReadNextContext, ReadNextEntity } from "./templates.ts";

export async function generateReadNext(
  client: OpenAI,
  model: string,
  ctx: ReadNextContext,
): Promise<ReadNextEvent | null> {
  if (ctx.narrative.length === 0) return null;
  const candidates = buildCandidates(ctx);
  if (candidates.length === 0) return null;

  const lede = ctx.narrative.find((n) => n.role === "lede")?.text ?? "";
  const headline =
    ctx.narrative.find((n) => n.role === "headline")?.text ?? "";
  const body = ctx.narrative
    .filter((n) => n.role === "body")
    .map((n) => n.text)
    .join("\n\n");

  const candidatesBlock = candidates
    .map((c, i) => {
      const entity = ctx.entities[c.entityIndex];
      return `${i}. [${entity.kind}: ${entity.label}] ${c.question}  (kicker hint: ${c.kickerHint})`;
    })
    .join("\n");

  const input =
    `Original question: ${ctx.question}\n\n` +
    (headline ? `Headline: ${headline}\n\n` : "") +
    `Lede: ${lede}\n\n` +
    (body ? `Body: ${body}\n\n` : "") +
    `Candidates:\n${candidatesBlock}`;

  let pick: { index: number; kicker: string; rationale: string } | null = null;
  try {
    const r = await client.responses.create({
      model,
      instructions: INSTRUCTIONS,
      input,
      ...MODEL_DEFAULTS,
    });
    pick = parsePick(r.output_text ?? "", candidates.length);
  } catch (err) {
    // Model call failed entirely — fall through to the deterministic
    // fallback below rather than dropping the rail. The user already has
    // the report; a generic-kicker rabbit hole is better than no rabbit
    // hole at all.
    console.error("read_next LLM call failed:", err);
  }

  const chosen = pick ? candidates[pick.index] : candidates[0];
  return {
    type: "read_next",
    question: chosen.question,
    kicker: pick?.kicker ?? deriveKicker(chosen.kickerHint),
    rationale:
      pick?.rationale ??
      `Same data, one hop further — ${chosen.kickerHint}.`,
  };
}

// Parse the model's JSON pick. Returns null on any malformed shape so the
// caller falls back to the deterministic top-of-list candidate. Tolerates
// the occasional ```json ...``` fence.
function parsePick(
  text: string,
  candidateCount: number,
): { index: number; kicker: string; rationale: string } | null {
  const stripped = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/, "")
    .trim();
  let raw: unknown;
  try {
    raw = JSON.parse(stripped);
  } catch {
    return null;
  }
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const index =
    typeof obj.index === "number" ? obj.index : Number(obj.index ?? NaN);
  if (!Number.isInteger(index) || index < 0 || index >= candidateCount) {
    return null;
  }
  if (
    typeof obj.kicker !== "string" ||
    typeof obj.rationale !== "string" ||
    !obj.kicker.trim() ||
    !obj.rationale.trim()
  ) {
    return null;
  }
  return {
    index,
    kicker: obj.kicker.trim(),
    rationale: obj.rationale.trim(),
  };
}

// Last-resort kicker when the model didn't supply one. Take the kickerHint
// (sentence-case editorial framing) and uppercase it; not as punchy as a
// model-written kicker but still on-shape.
function deriveKicker(hint: string): string {
  return hint.split(/\s+/).slice(0, 6).join(" ").toUpperCase();
}

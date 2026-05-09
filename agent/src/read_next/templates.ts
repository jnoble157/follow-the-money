import type { GraphNodeKind } from "@txmoney/mcp/events";

// Read-next templates. Each template is a question shape we can guarantee
// the agent's tool surface can answer, slot-filled with an entity that
// already came back from a real tool result in the just-completed
// investigation. The pipeline in ./index.ts builds a candidate list from
// these templates plus the report's graph, then asks the LLM to pick the
// most engaging (template, entity) pair and write the kicker + rationale.
//
// Why this matters: the previous read-next prompted the LLM to invent a
// follow-up question from scratch. The model would happily suggest federal
// officeholders, school-board races, out-of-window years, or private
// individuals — and the receiving agent would correctly bail with a
// "missing data" chunk, killing the rabbit-hole click. By picking from a
// fixed grammar against entities we already retrieved, the rabbit hole
// can't dead-end.
//
// Templates are *question shapes*, not finished questions. The shape
// expresses an emotional framing ("Where does X's money really go?",
// "Who actually funded Y?") that maps to a concrete tool sequence the
// agent already knows. The LLM picks among these shapes; it doesn't
// invent new ones.
//
// HARD RULE: every template shape must be SELF-CONTAINED. The next agent
// run has no memory of the prior report — no "these lobbyists," no
// "the same donor," no "other X-linked PACs." The only reference is
// {entity}, which gets slot-filled with a concrete named entity from
// the just-finished report's graph. If a question shape needs to refer
// to "the biggest donor" or "this cycle," it can't be a template; the
// next agent has nothing to anchor the reference to.

export type ReadNextEntity = {
  kind: GraphNodeKind;
  label: string;
  sublabel?: string;
};

export type ReadNextContext = {
  question: string;
  narrative: Array<{ role: string; text: string }>;
  entities: ReadNextEntity[];
};

export type ReadNextTemplate = {
  id: string;
  // Slot-string with `{entity}`. Filled with `entity.label` at compose time.
  shape: string;
  // Editorial framing the LLM expands into the final ALL-CAPS kicker. Hint
  // captures the rabbit-hole *trick* of this template — "follow the
  // employer," "follow the principals," "follow the tier" — not the topic.
  kickerHint: string;
  appliesTo: GraphNodeKind[];
  // Cheap predicate over entity + investigation. Drops candidates the
  // template doesn't actually fit. Runs against already-known data, never
  // against the SQL layer.
  precondition?: (ctx: ReadNextContext, entity: ReadNextEntity) => boolean;
};

export type ReadNextCandidate = {
  templateId: string;
  // Index into ctx.entities. The LLM picks one of these to answer with;
  // we slot-fill from the matching entity rather than trusting the LLM's
  // free-form question text.
  entityIndex: number;
  question: string;
  kickerHint: string;
};

// Heuristic: is this label most likely a private individual rather than
// a public-statute-acceptable entity (PAC, LLC, candidate, registered
// lobbyist)? AGENTS.md hard rule 4 says we don't single out private
// individuals as the subject of an investigation. The donor table inside
// a report is fine (aggregated context); the read-next *subject* is not.
//
// TEC convention: private donors are usually formatted "Lastname, Firstname";
// firm donors are "Acme Inc" or "Texans for Lawsuit Reform PAC" — no
// leading-comma pattern, or contain a corporate-form suffix. This isn't
// perfect (registered candidates also use "Lastname, Firstname"), so we
// treat candidate labels as personal-name-shaped *unless* the parent
// graph node kind tells us otherwise (a `filer` is a registered filer, not
// a private donor).
const CORPORATE_TOKENS =
  /\b(PAC|LLC|LP|Inc|Corp|Co|Ltd|Group|Capital|Partners|Holdings|Ventures|Associates|Industries|Foundation|Committee|Fund|Action)\b/i;

export function looksLikePersonalName(label: string): boolean {
  if (CORPORATE_TOKENS.test(label)) return false;
  // "Lastname, Firstname" (TEC) or "Firstname Lastname".
  if (/^[A-Z][a-zA-Z'’-]+,\s+[A-Z]/.test(label)) return true;
  if (/^[A-Z][a-zA-Z'’-]+\s+[A-Z][a-zA-Z'’-]+$/.test(label)) return true;
  return false;
}

// The current investigation's question. Used by templates to skip
// candidates whose follow-up would be a near-restatement of the original.
function questionMentions(ctx: ReadNextContext, term: string): boolean {
  return ctx.question.toLowerCase().includes(term.toLowerCase());
}

// TEC filer records store names as "Lastname, Firstname M." — fine for
// the graph node where formality matches the source data, awkward in
// casual-reader read-next copy ("Where does Watson, Kirk P.'s money
// really go?"). Flip to "Firstname Lastname" for display, dropping any
// trailing initial. Non-matching strings (PACs, firms, "Watson Mayoral")
// pass through unchanged.
export function humanizeEntityLabel(label: string): string {
  const m = label.match(
    /^([A-Z][a-zA-Z'’-]+(?:\s+[IVX]+)?),\s+([A-Z][a-zA-Z'’-]+)(?:\s+[A-Z]\.?)?(?:\s+\([^)]+\))?$/,
  );
  if (!m) return label;
  const last = m[1];
  const first = m[2];
  return `${first} ${last}`;
}

export const TEMPLATES: ReadNextTemplate[] = [
  {
    id: "where_else_donor",
    // No "this cycle" — fresh agent has no shared cycle context. The
    // entity name carries the rest.
    shape: "Where else does {entity} send political money in Texas?",
    kickerHint: "follow the wallet to its other recipients",
    appliesTo: ["donor"],
    precondition: (_ctx, e) => !looksLikePersonalName(e.label),
  },
  {
    id: "who_funded_pac",
    shape: "Who actually funded {entity}?",
    kickerHint: "open the funder list of a PAC the report only mentioned",
    appliesTo: ["pac"],
    // Skip if the original report was already a "who funded X?" investigation
    // about this PAC — we'd be asking the same question we just answered.
    precondition: (ctx, e) =>
      !(questionMentions(ctx, "funded") && questionMentions(ctx, e.label)),
  },
  {
    id: "what_did_filer_fund",
    shape: "Where does {entity}'s money really go?",
    kickerHint: "trace outflows from a filer the report introduced",
    appliesTo: ["filer"],
    precondition: (ctx, e) =>
      !questionMentions(ctx, "where did") || !questionMentions(ctx, e.label),
  },
  {
    id: "lobby_overlap",
    shape:
      "Which other clients does {entity}'s lobby team work for?",
    kickerHint: "open the client list behind a firm",
    appliesTo: ["employer", "client"],
  },
  {
    id: "cross_tier_check",
    shape: "Does {entity} also work the Texas Capitol?",
    kickerHint: "check whether a city lobbyist plays both tiers",
    appliesTo: ["lobbyist"],
    // Skip if the original investigation was already the cross-tier join.
    precondition: (ctx) => !questionMentions(ctx, "capitol"),
  },
  {
    id: "donor_to_lobby_clients",
    // {entity} is itself the lobbyist node, so the possessive form "X's
    // lobbyist" reads broken ("Austin city lobbyists's lobbyist"). Frame
    // the lobbyist as the subject directly.
    shape: "Does {entity} also donate to the officials they lobby?",
    kickerHint: "fold the lobbyist's giving back into the report",
    appliesTo: ["lobbyist"],
  },
  // Removed: a "biggest donor of X" template can only resolve via the
  // prior report, not via a fresh agent run that has no memory of who
  // the biggest donor was. Keep templates entity-anchored.
];

// Build the candidate list. Each entity gets one row per template that
// applies to its kind and whose precondition passes. Candidates are
// returned in graph order — the first entity surfaced by the agent is
// usually the most central, and rendering ordering matters because the
// LLM defaults to picking near the top of a list when it's indifferent.
export function buildCandidates(
  ctx: ReadNextContext,
): ReadNextCandidate[] {
  const out: ReadNextCandidate[] = [];
  for (let idx = 0; idx < ctx.entities.length; idx++) {
    const entity = ctx.entities[idx];
    for (const tpl of TEMPLATES) {
      if (!tpl.appliesTo.includes(entity.kind)) continue;
      if (tpl.precondition && !tpl.precondition(ctx, entity)) continue;
      out.push({
        templateId: tpl.id,
        entityIndex: idx,
        question: tpl.shape.replace("{entity}", humanizeEntityLabel(entity.label)),
        kickerHint: tpl.kickerHint,
      });
    }
  }
  return out;
}

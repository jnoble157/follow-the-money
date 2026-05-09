// Filer-name matching for the MCP tools. TEC and Austin both store
// person filers as "LAST, FIRST [TITLE]" inside a single concatenated
// column (filerName, Recipient, Donor, Paid_By, Payee, ...), and both
// receive free-text input from the agent that is just as often natural
// order ("Kirk Watson") as last-first ("Watson, Kirk"). A naive
// `column ILIKE '%input%'` whiffs whenever the input order doesn't match
// the stored order; the agent then honors hard rule 3 ("if a tool returns
// nothing, say not-in-this-view") and the run dies on a question whose
// answer is in fact in the data. That's how a state-side question about
// Kirk Watson — 13,208 contributions on filerIdent 00023391 — produced
// "not in this view." See docs/tec-schema/CFS-ReadMe.txt §FilerData for
// the canonical name layout.
//
// This module fixes that at the data layer so the agent never has to know
// about the storage convention. Three exports:
//
//   tokens(name)              normalized tokens (drops titles + parens)
//   nameWhere(cols, input)    token-AND ILIKE clause for one or many cols
//   confidence(input, cand)   token-set Jaccard, calibrated for the gate
//
// Notes on choices:
//
// * Token-AND substring on a single column is one ILIKE per token. DuckDB
//   pushes that down into a single columnar scan; the cost difference vs.
//   one ILIKE call is rounding error.
//
// * False-positive substring matches (e.g. "kirk" matching "kirkland")
//   pass the SQL filter, but `confidence` returns Jaccard < 1 against
//   them and the existing ORDER BY contribution_count downranks the
//   noise. We intentionally do not gate the match on token-true equality
//   in SQL — single ILIKE per token is cheaper and the post-filter ranks
//   correctly.
//
// * Single-token input ("Watson") against multi-token candidate
//   ("Watson, Kirk P.") yields confidence 0.5, well below the system
//   prompt's 0.85 silent-merge threshold, which is the right behavior:
//   ambiguous lookups should ask the user.

const TITLES = new Set([
  "mr",
  "mrs",
  "ms",
  "miss",
  "dr",
  "hon",
  "honorable",
  "sen",
  "rep",
  "judge",
  "justice",
  "chief",
  "the",
]);

// Generational and ordinal suffixes that show up in TEC filer names. Roman
// numerals stop at V because the data hasn't gone past Henry VIII jokes.
const SUFFIXES = new Set(["jr", "sr", "ii", "iii", "iv", "v"]);

// Stop-words that are noise in PAC and committee names. "Texans for Greg
// Abbott" should tokenize to {texans, greg, abbott}; "Friends of Kirk
// Watson" to {friends, kirk, watson}. Keep this list tight — anything
// here is something we promise will never matter for matching.
const STOP = new Set(["of", "for", "and", "an", "a", "to", "in", "on"]);

export function tokens(name: string): string[] {
  if (!name) return [];
  // Parenthetical clauses are how TEC tags titles ("(The Honorable)",
  // "(Mr.)", "(Ms.)"). Drop the whole paren group up front rather than
  // relying on the title list to catch every variant inside.
  const stripped = name.replace(/\([^)]*\)/g, " ");
  const out: string[] = [];
  for (const t of stripped.toLowerCase().split(/[^a-z0-9]+/)) {
    if (t.length < 2) continue;
    if (TITLES.has(t) || SUFFIXES.has(t) || STOP.has(t)) continue;
    out.push(t);
  }
  return out;
}

export function nameWhere(
  columns: readonly string[],
  input: string,
): { sql: string; params: string[] } | null {
  const toks = tokens(input);
  if (toks.length === 0 || columns.length === 0) return null;
  const params: string[] = [];
  const perToken = toks.map((t) => {
    const pat = `%${t.replace(/[%_]/g, "")}%`;
    if (columns.length === 1) {
      params.push(pat);
      return `${columns[0]} ILIKE ?`;
    }
    const ors = columns.map((c) => {
      params.push(pat);
      return `${c} ILIKE ?`;
    });
    return `(${ors.join(" OR ")})`;
  });
  return { sql: perToken.join(" AND "), params };
}

export function confidence(input: string, candidate: string): number {
  const a = new Set(tokens(input));
  const b = new Set(tokens(candidate));
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  if (inter === 0) return 0;
  return inter / (a.size + b.size - inter);
}

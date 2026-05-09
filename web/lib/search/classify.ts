import { HERO_INVESTIGATIONS } from "@/lib/investigations/registry";
import { listProfileSearchKeys } from "@/lib/profiles/registry";

// One classifier, four shapes. Pure: no LLM, no fetch. The same function
// powers the type-ahead dropdown and the form submit handler — what the user
// sees in the dropdown is exactly what they get when they press Enter.

export type Suggestion =
  | { kind: "profile"; slug: string; name: string; role?: string; matchedTerm: string }
  | { kind: "investigation"; id: string; question: string; pillLabel: string; matchedTerm: string }
  | { kind: "no_data"; reason: string; name: string }
  | { kind: "freeform"; question: string };

// Federal officials and federal-only candidates. We don't have FEC data
// staged; the honest move is to refuse and explain, not to fabricate a
// state-level profile for them. Lowercased for match.
const FEDERAL_ONLY_NAMES = [
  "ted cruz",
  "rafael edward cruz",
  "john cornyn",
  "beto o'rourke",
  "beto orourke",
  "colin allred",
  "joaquin castro",
  "henry cuellar",
  "ronny jackson",
  "wesley hunt",
  "donald trump",
  "kamala harris",
  "joe biden",
];

const FEDERAL_REASON =
  "Federal officials aren't in this dataset. The Texas Money Investigator covers TEC state filings and City of Austin filings only — federal contributions and FEC-side data live with the Federal Election Commission, which we haven't ingested.";

function normalize(s: string): string {
  return s.trim().toLowerCase().replace(/[^a-z0-9'\s]/g, " ").replace(/\s+/g, " ");
}

export function classify(query: string): Suggestion[] {
  const q = normalize(query);
  if (!q) return [];

  const out: Suggestion[] = [];

  // 1. Profiles — substring match on name + aliases.
  for (const key of listProfileSearchKeys()) {
    const hit = key.terms.find((t) => normalize(t).includes(q) || q.includes(normalize(t)));
    if (hit) {
      out.push({
        kind: "profile",
        slug: key.slug,
        name: key.name,
        role: key.role,
        matchedTerm: hit,
      });
    }
  }

  // 2. Hero investigations — substring match on question + pill label.
  for (const inv of HERO_INVESTIGATIONS) {
    const haystack = normalize(`${inv.question} ${inv.pillLabel}`);
    if (haystack.includes(q)) {
      out.push({
        kind: "investigation",
        id: inv.id,
        question: inv.question,
        pillLabel: inv.pillLabel,
        matchedTerm: inv.question,
      });
    }
  }

  // 3. Federal-only refusal — only fires when no profile already matched.
  if (out.every((s) => s.kind !== "profile")) {
    for (const fed of FEDERAL_ONLY_NAMES) {
      if (fed.includes(q) || q.includes(fed)) {
        out.push({
          kind: "no_data",
          reason: FEDERAL_REASON,
          name: titleCase(fed),
        });
        break;
      }
    }
  }

  // 4. Freeform fallback — always offered last as a "ask anyway" path. The
  // stub engine's friendly failure handles this honestly when the question
  // isn't a hero.
  out.push({ kind: "freeform", question: query.trim() });

  return out;
}

function titleCase(s: string): string {
  return s
    .split(" ")
    .map((p) => (p ? p[0].toUpperCase() + p.slice(1) : p))
    .join(" ");
}

// The route a suggestion resolves to. Used by both SearchBar (on enter /
// click) and the home page Trending cards (which also produce Suggestions).
export function suggestionHref(s: Suggestion): string {
  switch (s.kind) {
    case "profile":
      return `/profile/${s.slug}`;
    case "investigation":
      return `/investigate?q=${encodeURIComponent(s.question)}`;
    case "no_data":
      return `/profile/no-federal-data`;
    case "freeform":
      return `/investigate?q=${encodeURIComponent(s.question)}`;
  }
}

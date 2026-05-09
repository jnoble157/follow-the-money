import type { HeroInvestigation } from "./types";
import { s1Epstein } from "./hero/s1-epstein";
import { a1Watson } from "./hero/a1-watson";
import { a3CrossTier } from "./hero/a3-cross-tier";
import { b1SaveAustin } from "./hero/b1-save-austin";

// The hero registry has two layers.
//
// HAND_SCRIPTED is what the stub engine drives directly — each entry carries
// the full step-by-step script. S1 is the headline (the most visible plan
// trace, with a live employer-cluster auto-merge); the other three are
// scripted because they're tightly choreographed off the
// docs/investigations.md walkthroughs and the live agent's natural pacing
// on those questions stretches a 30-second story into 5 minutes of
// per-event API round-trips.
//
// RECORDED_FIXTURES are heroes the live agent ran end-to-end against the
// real parquet data; the full event stream lives as a committed JSONL file
// under web/lib/investigations/recorded/. The metadata below is what the
// home-page Trending strip, the search classifier, and the related-rail
// need to know about each one. The `steps: []` is intentional — those
// heroes don't run through the stub engine, they run through replayJsonl
// in the API route.
//
// New recordings: drop the JSONL file under recorded/ AND add a metadata
// row here. The JSONL header must agree with this row.

export const HAND_SCRIPTED: HeroInvestigation[] = [
  s1Epstein,
  a1Watson,
  a3CrossTier,
  b1SaveAustin,
];

export const RECORDED_FIXTURES: HeroInvestigation[] = [
  {
    id: "a2-endeavor",
    question:
      "What's the relationship between Endeavor Real Estate Group and Mayor Watson?",
    pillLabel: "Endeavor Real Estate \u2194 Watson",
    tags: [
      "austin",
      "watson",
      "mayor",
      "lobby",
      "real-estate",
      "entity-resolution",
      "employer-rollup",
    ],
    steps: [],
  },
  {
    id: "b3-uber",
    question: "Who funded Ridesharing Works for Austin in 2016?",
    pillLabel: "Uber's 2016 Austin spend",
    tags: ["austin", "ballot", "2016", "pac", "corporate-money"],
    steps: [],
  },
];

// Order matches the trending strip and ambient mode rotation: hand-scripted
// (with S1 as the headline) first, then recorded.
export const HERO_INVESTIGATIONS: HeroInvestigation[] = [
  ...HAND_SCRIPTED,
  ...RECORDED_FIXTURES,
];

// Used by the API route to decide whether to drive the stub engine or fall
// through to the recorded-JSONL replay path. Only hand-scripted heroes are
// returned — recorded heroes get their stream from replayJsonl, not the stub.
export function findHeroByQuestion(question: string): HeroInvestigation | null {
  const norm = normalize(question);
  for (const inv of HAND_SCRIPTED) {
    if (normalize(inv.question) === norm) return inv;
  }
  return null;
}

export function findHeroById(id: string): HeroInvestigation | null {
  return HERO_INVESTIGATIONS.find((inv) => inv.id === id) ?? null;
}

function normalize(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

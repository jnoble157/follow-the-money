import type { HeroInvestigation } from "./types";
import { s1Epstein } from "./hero/s1-epstein";
import { a1Watson } from "./hero/a1-watson";
import { a2Endeavor } from "./hero/a2-endeavor";
import { a3CrossTier } from "./hero/a3-cross-tier";
import { b1SaveAustin } from "./hero/b1-save-austin";
import { b3Uber } from "./hero/b3-uber";

// Hero investigations the stub engine can replay. Order is the order they
// appear in the question-input pill row and the order ambient mode cycles
// through. S1 is the headline (with the disambiguation moment); the rest
// vary in length and shape so the demo doesn't feel like one template.
export const HERO_INVESTIGATIONS: HeroInvestigation[] = [
  s1Epstein,
  a1Watson,
  a2Endeavor,
  a3CrossTier,
  b1SaveAustin,
  b3Uber,
];

export function findHeroByQuestion(question: string): HeroInvestigation | null {
  const norm = normalize(question);
  for (const inv of HERO_INVESTIGATIONS) {
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

import type { Profile, ProfileKind } from "./types";
import { kirkWatson } from "./people/kirk-watson";
import { gregAbbott } from "./people/greg-abbott";
import { demetriusMcDaniel } from "./people/demetrius-mcdaniel";
import { endeavorRealEstate } from "./people/endeavor-real-estate";
import { saveAustinNow } from "./people/save-austin-now";
import { ridesharingWorks } from "./people/ridesharing-works";

// Source of truth for everything profile-shaped. Order matters: it determines
// the order of the home-page Officials list and the related-profile fallback.
export const PROFILES: Profile[] = [
  kirkWatson,
  gregAbbott,
  demetriusMcDaniel,
  endeavorRealEstate,
  saveAustinNow,
  ridesharingWorks,
];

const BY_SLUG = new Map(PROFILES.map((p) => [p.slug, p]));

export function getProfileBySlug(slug: string): Profile | null {
  return BY_SLUG.get(slug) ?? null;
}

export function listAllProfiles(): Profile[] {
  return PROFILES;
}

export function listProfilesByKind(kind: ProfileKind): Profile[] {
  return PROFILES.filter((p) => p.kind === kind);
}

// The home Officials list shows public officials and then named candidates
// from the 2024 Austin mayoral race that don't have full profiles yet, so the
// roster reads like a roster rather than a stub.
export type OfficialEntry = {
  name: string;
  role: string;
  jurisdiction: "austin" | "tx_state" | "tx_federal";
  // When set, the entry links to that profile. When absent the entry is a
  // listed-but-not-yet-profiled candidate.
  slug?: string;
  // For federal officials we explicitly carry no data; the list still surfaces
  // them but the click leads to the no-data refusal.
  noData?: boolean;
};

export function listOfficialsForHome(): OfficialEntry[] {
  return [
    { name: "Kirk Watson", role: "Mayor of Austin", jurisdiction: "austin", slug: "kirk-watson" },
    { name: "Greg Abbott", role: "Governor of Texas", jurisdiction: "tx_state", slug: "greg-abbott" },
    { name: "Carmen Llanes-Pulido", role: "2024 Austin mayoral candidate", jurisdiction: "austin" },
    { name: "Kathie Tovo", role: "Former council, 2024 mayoral candidate", jurisdiction: "austin" },
    { name: "Jeffrey Greco", role: "2024 Austin mayoral candidate", jurisdiction: "austin" },
  ];
}

// Aliases used by the search classifier. Built once from the profile registry
// rather than re-declared, so adding an alias to a profile is enough.
export type ProfileSearchKey = {
  slug: string;
  name: string;
  role?: string;
  // Lowercased terms (name + aliases) for match.
  terms: string[];
};

const SEARCH_KEYS: ProfileSearchKey[] = PROFILES.map((p) => ({
  slug: p.slug,
  name: p.name,
  role: p.role,
  terms: [p.name, ...(p.aliases ?? [])].map((t) => t.toLowerCase()),
}));

export function listProfileSearchKeys(): ProfileSearchKey[] {
  return SEARCH_KEYS;
}

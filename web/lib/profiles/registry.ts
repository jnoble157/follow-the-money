import type {
  DonorSummary,
  OfficialWithStats,
  Profile,
  ProfileKind,
} from "./types";
import { kirkWatson } from "./people/kirk-watson";
import { gregAbbott } from "./people/greg-abbott";
import { demetriusMcDaniel } from "./people/demetrius-mcdaniel";
import { endeavorRealEstate } from "./people/endeavor-real-estate";
import { saveAustinNow } from "./people/save-austin-now";
import { ridesharingWorks } from "./people/ridesharing-works";
import manifest from "./officials_manifest.json";
import donorManifest from "./donors_manifest.json";

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
const OFFICIALS = manifest as OfficialWithStats[];
const OFFICIALS_BY_SLUG = new Map(OFFICIALS.map((o) => [o.slug, o]));
const DONORS = donorManifest as DonorSummary[];
const DONORS_BY_SLUG = new Map(DONORS.map((d) => [d.slug, d]));

export function getProfileBySlug(slug: string): Profile | null {
  return BY_SLUG.get(slug) ?? null;
}

export function listAllProfiles(): Profile[] {
  return PROFILES;
}

export function listAllProfileSlugs(): string[] {
  const slugs = new Set(PROFILES.map((p) => p.slug));
  for (const row of OFFICIALS) slugs.add(row.slug);
  return [...slugs];
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
  // Hardcoded recipient/filer names used by the manifest builder to aggregate
  // donations. Only present for profiled officials with data.
  austinRecipients?: string[];
  tecFilerNames?: string[];
};

export function listOfficialsForHome(): OfficialEntry[] {
  return [
    {
      name: "Kirk Watson",
      role: "Mayor of Austin",
      jurisdiction: "austin",
      slug: "kirk-watson",
      austinRecipients: ["Watson, Kirk P."],
      tecFilerNames: ["Watson, Kirk P.", "Watson, Kirk", "Watson, Kirk P. (The Honorable)"],
    },
    {
      name: "Greg Abbott",
      role: "Governor of Texas",
      jurisdiction: "tx_state",
      slug: "greg-abbott",
      austinRecipients: ["Greg Abbott Campaign"],
      tecFilerNames: ["Texans for Greg Abbott", "Abbott, Greg (The Honorable)", "Greg Abbott Campaign"],
    },
    { name: "Carmen Llanes-Pulido", role: "2024 Austin mayoral candidate", jurisdiction: "austin", slug: "carmen-llanes-pulido", austinRecipients: ["Llanes-Pulido, Carmen D."] },
    { name: "Kathie Tovo", role: "Former council, 2024 mayoral candidate", jurisdiction: "austin", slug: "kathie-tovo", austinRecipients: ["Tovo, Kathryne Beth"] },
    { name: "Jeffrey Greco", role: "2024 Austin mayoral candidate", jurisdiction: "austin", slug: "jeffrey-greco", austinRecipients: ["Greco, Douglas"] },
    { name: "Celia Israel", role: "Former Austin council member", jurisdiction: "austin", slug: "celia-israel", austinRecipients: ["Israel, Celia M."], tecFilerNames: ["Israel, Celia M. (The Honorable)", "Israel, Celia M. (Ms.)", "Israel, Celia"] },
    { name: "Steve Adler", role: "Former Mayor of Austin", jurisdiction: "austin", slug: "steve-adler", austinRecipients: ["Adler, Stephen"] },
    { name: "Jennifer Virden", role: "Austin council member", jurisdiction: "austin", slug: "jennifer-virden", austinRecipients: ["Virden, Jennifer M"] },
    { name: "Mike Siegel", role: "Austin council member", jurisdiction: "austin", slug: "mike-siegel", austinRecipients: ["Siegel, Mike"] },
    { name: "Jimmy Flannigan", role: "Former Austin council member", jurisdiction: "austin", slug: "jimmy-flannigan", austinRecipients: ["Flannigan, James T. \"Jimmy\""] },
    { name: "Zohaib Qadri", role: "Austin council member", jurisdiction: "austin", slug: "zohaib-qadri", austinRecipients: ["Qadri, Zohaib"] },
    { name: "Alison Alter", role: "Former Austin council member", jurisdiction: "austin", slug: "alison-alter", austinRecipients: ["Alter, Alison B."] },
    { name: "Mackenzie Kelly", role: "Austin council member", jurisdiction: "austin", slug: "mackenzie-kelly", austinRecipients: ["Kelly, Mackenzie"] },
    { name: "Greg Casar", role: "U.S. Representative, former Austin council", jurisdiction: "tx_federal", slug: "greg-casar", austinRecipients: ["Casar, Gregorio E. \"Greg\""], tecFilerNames: ["Casar, Greg"] },
    { name: "Paige Ellis", role: "Austin council member", jurisdiction: "austin", slug: "paige-ellis", austinRecipients: ["Ellis, Paige"] },
    { name: "Vanessa Fuentes", role: "Austin council member", jurisdiction: "austin", slug: "vanessa-fuentes", austinRecipients: ["Fuentes, Vanessa"] },
    { name: "Natasha Harper-Madison", role: "Austin council member", jurisdiction: "austin", slug: "natasha-harper-madison", austinRecipients: ["Harper-Madison, Natasha N."] },
    { name: "Beto O'Rourke", role: "Former U.S. Representative, 2022 gubernatorial candidate", jurisdiction: "tx_state", slug: "beto-orourke", tecFilerNames: ["Beto for Texas", "Texans for Beto"] },
    { name: "Linda Guerrero", role: "Austin council candidate", jurisdiction: "austin", slug: "linda-guerrero", austinRecipients: ["Guerrero, Linda H."] },
    { name: "Sheri Gallo", role: "Former Austin council member", jurisdiction: "austin", slug: "sheri-gallo", austinRecipients: ["Gallo, Sheri P."] },
    { name: "Laura Morrison", role: "Former Austin council member, mayoral candidate", jurisdiction: "austin", slug: "laura-morrison", austinRecipients: ["Morrison, Laura"] },
    { name: "Leslie Pool", role: "Former Austin council member", jurisdiction: "austin", slug: "leslie-pool", austinRecipients: ["Pool, Leslie"] },
    { name: "Jose Velasquez", role: "Austin council candidate", jurisdiction: "austin", slug: "jose-velasquez", austinRecipients: ["Velasquez, Jose"] },
    { name: "Ken Paxton", role: "Texas Attorney General", jurisdiction: "tx_state", slug: "ken-paxton", tecFilerNames: ["Paxton Jr., W. Kenneth (The Honorable)", "Paxton, W. Kenneth (Mr.)", "Paxton Jr., W. Kenneth (Mr.)"] },
    { name: "Wendy Davis", role: "Former State Senator, gubernatorial candidate", jurisdiction: "tx_state", slug: "wendy-davis", tecFilerNames: ["Davis, Wendy R.", "Wendy R Davis for Governor Inc", "Wendy R. Davis for Governor Inc.", "Wendy R. Davis for Governor, Inc."] },
    { name: "Dan Patrick", role: "Lieutenant Governor of Texas", jurisdiction: "tx_state", slug: "dan-patrick", tecFilerNames: ["Texans for Dan Patrick"] },
    { name: "James Talarico", role: "Texas State Representative", jurisdiction: "tx_state", slug: "james-talarico", tecFilerNames: ["Talarico, James (The Honorable)", "Talarico, James (Mr.)"] },
  ];
}

const OFFICIAL_OVERRIDES = new Map(
  listOfficialsForHome()
    .filter((o): o is OfficialEntry & { slug: string } => !!o.slug)
    .map((o) => [o.slug, o]),
);

export function listOfficialsWithStats(): OfficialWithStats[] {
  return OFFICIALS.map(applyOfficialOverride);
}

export function hasProfilePage(slug: string): boolean {
  return BY_SLUG.has(slug) || OFFICIALS_BY_SLUG.has(slug);
}

export function applyOfficialOverride<T extends OfficialWithStats>(row: T): T {
  const entry = OFFICIAL_OVERRIDES.get(row.slug);
  if (!entry) return row;
  return {
    ...row,
    name: entry.name,
    role: entry.role,
    jurisdiction: entry.jurisdiction,
  };
}

export function listDonorsWithStats(): DonorSummary[] {
  return DONORS;
}

export function getDonorBySlug(slug: string): DonorSummary | null {
  return DONORS_BY_SLUG.get(slug) ?? null;
}

export function donorSlug(name: string, zipCode: string | null | undefined) {
  const stem = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const zip = (zipCode ?? "unknown")
    .toLowerCase()
    .replace(/[^0-9a-z]+/g, "");
  return `${stem || "donor"}-${zip || "unknown"}`;
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

import type {
  DonorSummary,
  OfficialWithStats,
} from "./types";
import manifest from "./officials_manifest.json";
import donorManifest from "./donors_manifest.json";

const OFFICIALS = manifest as OfficialWithStats[];
const OFFICIALS_BY_SLUG = new Map(OFFICIALS.map((o) => [o.slug, o]));
const DONORS = donorManifest as DonorSummary[];
const DONORS_BY_SLUG = new Map(DONORS.map((d) => [d.slug, d]));

export function listAllProfileSlugs(): string[] {
  return OFFICIALS.map((o) => o.slug);
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

type ProfileOverride = Pick<OfficialEntry, "name" | "role" | "jurisdiction">;

const PROFILE_OVERRIDES = new Map<string, ProfileOverride>([
  [
    "christi-l-craddick-30098",
    { name: "Christi Craddick", role: "Railroad Commissioner", jurisdiction: "tx_state" },
  ],
  [
    "matthew-m-phelan-62288",
    { name: "Dade Phelan", role: "Texas State Representative", jurisdiction: "tx_state" },
  ],
  [
    "donald-b-huffines-69651",
    { name: "Don Huffines", role: "Former Texas State Senator", jurisdiction: "tx_state" },
  ],
  [
    "william-h-white-18964",
    {
      name: "Bill White",
      role: "Former Houston mayor, gubernatorial candidate",
      jurisdiction: "tx_state",
    },
  ],
  [
    "david-m-middleton-ii-81727",
    { name: "Mayes Middleton", role: "Texas State Senator", jurisdiction: "tx_state" },
  ],
  [
    "george-p-bush-68738",
    { name: "George P. Bush", role: "Former Texas Land Commissioner", jurisdiction: "tx_state" },
  ],
  [
    "glenn-hegar-jr-51286",
    { name: "Glenn Hegar", role: "Former Texas Comptroller", jurisdiction: "tx_state" },
  ],
  [
    "john-whitmire-19581",
    { name: "John Whitmire", role: "Houston mayor, former state senator", jurisdiction: "tx_state" },
  ],
  [
    "tec-00019628-19628",
    { name: "Bob Bullock", role: "Former Lieutenant Governor of Texas", jurisdiction: "tx_state" },
  ],
  [
    "r-christopher-bell-56697",
    { name: "Chris Bell", role: "Former US representative, gubernatorial candidate", jurisdiction: "tx_state" },
  ],
  [
    "michael-e-collier-69397",
    { name: "Mike Collier", role: "Lieutenant governor candidate", jurisdiction: "tx_state" },
  ],
  [
    "phillip-s-phil-king-36483",
    { name: "Phil King", role: "Texas State Senator", jurisdiction: "tx_state" },
  ],
  [
    "tec-00025028-25028",
    { name: "George W. Bush", role: "Former Texas Governor, US President", jurisdiction: "tx_state" },
  ],
  [
    "phillip-wayne-huffines-81004",
    { name: "Phillip Huffines", role: "Dallas Republican Party figure", jurisdiction: "tx_state" },
  ],
  [
    "richard-friedman-56764",
    { name: "Kinky Friedman", role: "Agriculture commissioner candidate", jurisdiction: "tx_state" },
  ],
  [
    "peter-p-flores-80439",
    { name: "Pete Flores", role: "Texas State Senator", jurisdiction: "tx_state" },
  ],
  [
    "john-lujan-iii-58435",
    { name: "John Lujan", role: "Texas State Representative", jurisdiction: "tx_state" },
  ],
  [
    "walter-t-price-iv-66243",
    { name: "Four Price", role: "Former Texas State Representative", jurisdiction: "tx_state" },
  ],
  [
    "adan-hinojosa-86098",
    { name: "Adam Hinojosa", role: "Texas State Senator", jurisdiction: "tx_state" },
  ],
  [
    "dawn-c-buckingham-m-d-69001",
    { name: "Dawn Buckingham", role: "Texas Land Commissioner", jurisdiction: "tx_state" },
  ],
  [
    "juan-hinojosa-13805",
    { name: "Juan Hinojosa", role: "Texas State Senator", jurisdiction: "tx_state" },
  ],
  [
    "morgan-d-meyer-69344",
    { name: "Morgan Meyer", role: "Texas State Representative", jurisdiction: "tx_state" },
  ],
  [
    "tom-craddick-20051",
    { name: "Tom Craddick", role: "Texas State Representative", jurisdiction: "tx_state" },
  ],
]);

const OFFICIAL_OVERRIDES = new Map(
  [
    ...PROFILE_OVERRIDES,
    ...listOfficialsForHome()
      .filter((o): o is OfficialEntry & { slug: string } => !!o.slug)
      .map((o) => [o.slug, o] as const),
  ],
);

export function listOfficialsWithStats(): OfficialWithStats[] {
  return OFFICIALS.map(applyOfficialOverride);
}

export function hasProfilePage(slug: string): boolean {
  return OFFICIALS_BY_SLUG.has(slug);
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

// Profile search is generated from the official manifest. Curated aliases can
// exist in officials_map.json for aggregation, but profile pages do not carry
// handwritten evidence.
export type ProfileSearchKey = {
  slug: string;
  name: string;
  role?: string;
  terms: string[];
};

const SEARCH_KEYS: ProfileSearchKey[] = OFFICIALS.map(applyOfficialOverride).map(
  (o) => ({
    slug: o.slug,
    name: o.name,
    role: o.role,
    terms: [o.name, o.slug.replace(/-/g, " ")].map((t) => t.toLowerCase()),
  }),
);

export function listAllProfiles(): ProfileSearchKey[] {
  return SEARCH_KEYS;
}

export function listProfileSearchKeys(): ProfileSearchKey[] {
  return SEARCH_KEYS;
}

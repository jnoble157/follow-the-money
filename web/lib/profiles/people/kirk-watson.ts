import type { Profile } from "../types";

const ATX_CONTRIBS = "https://data.austintexas.gov/d/3kfv-biw6";
const ATX_EXPS = "https://data.austintexas.gov/d/gd3e-xut2";

function row(token: string, summary: string) {
  return {
    reportInfoIdent: token,
    url: `${ATX_CONTRIBS}?row=${encodeURIComponent(token)}`,
    rowSummary: summary,
  };
}

const transferCitation = {
  reportInfoIdent: "ATX-CF-2022-WATSON-TRANSFER-1186764",
  url: `${ATX_EXPS}?row=ATX-CF-2022-WATSON-TRANSFER-1186764`,
  rowSummary:
    "Watson, Kirk P., 2022 expenditure to KPW PAC, $1,186,764 — described 'Contribution (from prior Senate C/OH funds)'.",
};

const watson2024 = row(
  "ATX-CF-2024-WATSON-TOTALS",
  "Watson, Kirk P., 2024 mayoral contributions: 2,896 unique donors, $1,986,830 raised.",
);

const fieldCite = row(
  "ATX-CF-2024-MAYOR-FIELD",
  "2024 Austin mayor's race fundraising by candidate (cover sheets aggregated).",
);

const zip78703 = row(
  "ATX-CF-WATSON-78703",
  "Watson, Kirk P., contributions by donor ZIP 2022–2026: 78703 (Tarrytown / Old West Austin), $1,160,757.",
);

const zip78746 = row(
  "ATX-CF-WATSON-78746",
  "Watson, Kirk P., contributions by donor ZIP 2022–2026: 78746 (Westlake), $684,386.",
);

const zip78731 = row(
  "ATX-CF-WATSON-78731",
  "Watson, Kirk P., contributions by donor ZIP 2022–2026: 78731 (Northwest Hills), $662,182.",
);

const endeavorCanonical = row(
  "ATX-CF-WATSON-ERG-CANONICAL",
  "Watson, Kirk P. recipient; donor employer 'Endeavor Real Estate Group' across 60 individual contributions, 2022–present, totaling $24,975.",
);

export const kirkWatson: Profile = {
  slug: "kirk-watson",
  name: "Kirk Watson",
  kind: "official",
  role: "Mayor of Austin",
  jurisdiction: "austin",
  aliases: ["Mayor Watson", "Watson", "Kirk P. Watson", "Watson, Kirk P."],
  bio: {
    text: "Kirk P. Watson is the mayor of Austin (sworn in January 2023) and previously served in the Texas State Senate from 2007 through 2020 representing District 14. His political-finance footprint spans both jurisdictions: a long state-level fundraising history followed by an Austin mayoral campaign that out-raised the rest of the 2024 field roughly 17 to 1, anchored by a $1.18M transfer from his old Senate campaign account into a new Austin committee.",
    citations: [transferCitation, watson2024, fieldCite],
  },
  stats: [
    {
      label: "Raised, 2024 mayoral",
      value: "$1,986,830",
      citation: watson2024,
    },
    {
      label: "Unique donors, 2024",
      value: "2,896",
      citation: watson2024,
    },
    {
      label: "Senate → KPW PAC transfer (2022)",
      value: "$1,186,764",
      citation: transferCitation,
    },
    {
      label: "Top donor ZIP, 2022–2026",
      value: "78703 · $1,160,757",
      citation: zip78703,
    },
  ],
  sections: [
    {
      kind: "narrative",
      title: "What's in the filings",
      chunks: [
        {
          id: 1,
          text: "Watson's single largest 2022 political expenditure was a $1,186,764 transfer from his Texas State Senate campaign account into a newly registered committee, KPW PAC. The Austin filing describes the line item as 'Contribution (from prior Senate C/OH funds)' — a clean recycling of state-level fundraising into a city committee.",
          citations: [transferCitation],
        },
        {
          id: 2,
          text: "By the 2024 mayoral cycle, Watson had raised $1,986,830 across 2,896 unique donors. The combined total for the four other candidates on the ballot (Llanes-Pulido, Tovo, Greco, Bowen) was roughly $429,398.",
          citations: [watson2024, fieldCite],
        },
        {
          id: 3,
          text: "Geographically, the money is concentrated. ZIP 78703 (Tarrytown / Old West Austin) alone produced $1,160,757 — more than every 2024 mayoral challenger combined. The next-largest contributing ZIPs are 78746 (Westlake, $684,386) and 78731 (Northwest Hills, $662,182).",
          citations: [zip78703, zip78746, zip78731],
        },
        {
          id: 4,
          text: "On the employer side, Endeavor Real Estate Group is the densest cluster: 60 contributions reported under the canonical employer name and another 34 under shorter variants ('Endeavor Real Estate', 'Endeavor'), 33 distinct employees in total. Per AGENTS.md §5 the breakdown is shown as a rollup; the underlying variants are visible in the Endeavor profile.",
          citations: [endeavorCanonical],
        },
      ],
    },
    {
      kind: "top_expenditures",
      title: "Largest 2022 expenditures",
      rows: [
        {
          rank: 1,
          payee: "KPW PAC",
          description: "Contribution (from prior Senate C/OH funds)",
          amount: 1_186_764,
          date: "2022-11-15",
          citation: transferCitation,
        },
      ],
    },
  ],
  network: {
    nodes: [
      { id: "watson-mayor", label: "Kirk Watson", kind: "filer", sublabel: "Mayor of Austin", profileSlug: "kirk-watson" },
      { id: "watson-senate", label: "Watson Senate", kind: "filer", sublabel: "TX Senate, 2007–2020", profileSlug: "kirk-watson" },
      { id: "kpw-pac", label: "KPW PAC", kind: "pac", sublabel: "registered 2022" },
      { id: "endeavor-firm", label: "Endeavor Real Estate Group", kind: "employer", profileSlug: "endeavor-real-estate" },
    ],
    edges: [
      { from: "watson-senate", to: "kpw-pac", label: "$1,186,764", weight: 1_186_764 },
      { from: "kpw-pac", to: "watson-mayor", label: "supports", weight: 1 },
      { from: "endeavor-firm", to: "watson-mayor", label: "33 employees, $39,439", weight: 39_439 },
    ],
  },
  related: [
    { slug: "endeavor-real-estate", name: "Endeavor Real Estate Group", role: "Donor cluster · firm" },
    { slug: "save-austin-now", name: "Save Austin Now PAC", role: "2021 Prop B committee" },
    { slug: "demetrius-mcdaniel", name: "Demetrius McDaniel", role: "Cross-tier lobbyist" },
  ],
  defaultQuestion: "Where did Kirk Watson's biggest political spending in 2022 actually go?",
};

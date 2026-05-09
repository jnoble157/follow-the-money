import type { Profile } from "../types";

const ATX_EXPS = "https://data.austintexas.gov/d/gd3e-xut2";
const TEC_CF = "https://www.ethics.state.tx.us/search/cf/";

const intraPacCitation = {
  reportInfoIdent: "ATX-CF-2020-TFA-GAC-7750000",
  url: `${ATX_EXPS}?donor=Texans+for+Greg+Abbott&recipient=Greg+Abbott+Campaign`,
  rowSummary:
    "Six 2020 transfers from Texans for Greg Abbott to Greg Abbott Campaign totaling $7,750,000 (six expenditure rows).",
};

const tecCitation = {
  reportInfoIdent: "TEC-CF-ABBOTT-FILER",
  url: TEC_CF,
  rowSummary:
    "Texas Ethics Commission state campaign-finance database; 'Texans for Greg Abbott' is the principal state filer with continuous activity since 2014.",
};

export const gregAbbott: Profile = {
  slug: "greg-abbott",
  name: "Greg Abbott",
  kind: "official",
  role: "Governor of Texas",
  jurisdiction: "tx_state",
  aliases: ["Governor Abbott", "Abbott", "Greg W. Abbott"],
  bio: {
    text: "Greg Abbott has served as Governor of Texas since January 2015. The principal state filer that supports him is Texans for Greg Abbott, the largest single state-level fundraising committee in Texas. The investigation surface for this profile is currently shallow because the TEC bulk campaign-finance index is still being staged for query; what we describe here is what the existing tool calls have already returned.",
    citations: [tecCitation, intraPacCitation],
  },
  stats: [
    {
      label: "2020 intra-PAC transfers (6 lines)",
      value: "$7,750,000",
      citation: intraPacCitation,
    },
    {
      label: "Principal state filer",
      value: "Texans for Greg Abbott",
      citation: tecCitation,
    },
  ],
  sections: [
    {
      kind: "narrative",
      title: "What's in the filings (so far)",
      chunks: [
        {
          id: 1,
          text: "In fall 2020 a series of six expenditures totaling $7,750,000 transferred from 'Texans for Greg Abbott' to 'Greg Abbott Campaign'. They appear in the Austin city campaign-finance dataset, likely because of how the receiving committee was registered with the City Clerk at that time. The pattern is real and documented; the underlying explanation is a research thread, not a finding.",
          citations: [intraPacCitation],
        },
        {
          id: 2,
          text: "Once the TEC state campaign-finance bulk is fully indexed, this profile expands to cover top donors, employer rollups, and contributors crossing state and city jurisdictions. Until then we only describe what the current tools surface, per AGENTS.md §1.",
          citations: [tecCitation],
        },
      ],
    },
  ],
  network: {
    nodes: [
      { id: "abbott", label: "Greg Abbott", kind: "filer", sublabel: "Governor of Texas", profileSlug: "greg-abbott" },
      { id: "tfga", label: "Texans for Greg Abbott", kind: "pac" },
      { id: "gac", label: "Greg Abbott Campaign", kind: "pac" },
    ],
    edges: [
      { from: "tfga", to: "gac", label: "6× = $7,750,000", weight: 7_750_000, citation: intraPacCitation },
      { from: "gac", to: "abbott", label: "supports", weight: 1, citation: intraPacCitation },
    ],
  },
  related: [],
  defaultQuestion: "What were the 2020 transfers between Texans for Greg Abbott and Greg Abbott Campaign?",
};

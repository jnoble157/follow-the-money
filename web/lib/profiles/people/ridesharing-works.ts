import type { Profile } from "../types";

const ATX_CONTRIBS = "https://data.austintexas.gov/d/3kfv-biw6";

const totalsCite = {
  reportInfoIdent: "ATX-CF-RWA-TOTALS-2016",
  url: `${ATX_CONTRIBS}?recipient=Ridesharing+Works+for+Austin`,
  rowSummary:
    "Ridesharing Works for Austin, 2016 Proposition 1 cycle, $3,216,000 total raised across 2 contributors.",
};

const uberCite = {
  reportInfoIdent: "ATX-CF-2016-RWA-UBER-2990000",
  url: `${ATX_CONTRIBS}?donor=Uber+Tech&recipient=Ridesharing+Works+for+Austin`,
  rowSummary:
    "Ridesharing Works for Austin, donor Uber Technologies Inc, $2,990,000, 2016.",
};

const lyftCite = {
  reportInfoIdent: "ATX-CF-2016-RWA-LYFT-226000",
  url: `${ATX_CONTRIBS}?donor=Lyft+Inc&recipient=Ridesharing+Works+for+Austin`,
  rowSummary:
    "Ridesharing Works for Austin, donor Lyft Inc, $226,000, 2016.",
};

const propCite = {
  reportInfoIdent: "ATX-PROP-1-2016",
  url: "https://www.austintexas.gov/department/city-clerk/elections",
  rowSummary:
    "Austin May 2016 special election, Proposition 1 (rideshare fingerprinting). Voters approved fingerprinting; Uber and Lyft suspended Austin operations the next day.",
};

export const ridesharingWorks: Profile = {
  slug: "ridesharing-works",
  name: "Ridesharing Works for Austin",
  kind: "pac",
  role: "2016 Proposition 1 committee",
  jurisdiction: "austin",
  aliases: ["RWA", "Ridesharing Works"],
  bio: {
    text: "Ridesharing Works for Austin raised $3,216,000 for the 2016 Proposition 1 campaign — the ballot question on whether ridesharing drivers would be fingerprinted. Two donors account for essentially the entire war chest: Uber Technologies Inc gave $2,990,000 and Lyft Inc gave $226,000. There is no long tail. Voters approved fingerprinting; Uber and Lyft suspended Austin operations the day after the election and stayed gone for roughly a year.",
    citations: [totalsCite, uberCite, lyftCite, propCite],
  },
  stats: [
    { label: "Total raised, 2016 cycle", value: "$3,216,000", citation: totalsCite },
    { label: "Uber Technologies Inc", value: "$2,990,000", citation: uberCite },
    { label: "Lyft Inc", value: "$226,000", citation: lyftCite },
    { label: "Donors", value: "2", citation: totalsCite },
  ],
  sections: [
    {
      kind: "top_donors",
      title: "Contributors",
      rows: [
        { rank: 1, donor: "Uber Technologies Inc", rolledEmployer: null, contributions: 1, total: 2_990_000, citation: uberCite },
        { rank: 2, donor: "Lyft Inc", rolledEmployer: null, contributions: 1, total: 226_000, citation: lyftCite },
      ],
    },
    {
      kind: "narrative",
      title: "Outcome",
      chunks: [
        {
          id: 1,
          text: "The expenditure is the cleanest example in any Texas dataset of corporate money attempting to override a local-government ballot decision. The ballot won; the companies left.",
          citations: [propCite],
        },
      ],
    },
  ],
  network: {
    nodes: [
      { id: "rwa", label: "Ridesharing Works for Austin", kind: "pac", sublabel: "$3.21M, 2016 Prop 1", profileSlug: "ridesharing-works" },
      { id: "uber", label: "Uber Technologies", kind: "donor" },
      { id: "lyft", label: "Lyft", kind: "donor" },
    ],
    edges: [
      { from: "uber", to: "rwa", label: "$2,990,000", weight: 2_990_000, citation: uberCite },
      { from: "lyft", to: "rwa", label: "$226,000", weight: 226_000, citation: lyftCite },
    ],
  },
  related: [],
  defaultQuestion: "Who funded Ridesharing Works for Austin in 2016?",
};

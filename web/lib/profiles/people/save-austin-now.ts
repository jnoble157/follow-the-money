import type { Profile } from "../types";

const ATX_CONTRIBS = "https://data.austintexas.gov/d/3kfv-biw6";

function row(token: string, summary: string) {
  return {
    reportInfoIdent: token,
    url: `${ATX_CONTRIBS}?row=${encodeURIComponent(token)}`,
    rowSummary: summary,
  };
}

const totalsCite = row(
  "ATX-CF-SAN-TOTALS",
  "Save Austin Now PAC, Prop B 2021 cycle, $4,950,000 total raised across 2,400+ contributions.",
);

const donors = [
  { rank: 1, name: "Canfield, Philip B.", emp: "Ariet Capital LLC", amt: 450_000, tok: "ATX-CF-SAN-CANFIELD-450000" },
  { rank: 2, name: "Royston, Danielle", emp: "TelcoDR", amt: 148_000, tok: "ATX-CF-SAN-ROYSTON-148000" },
  { rank: 3, name: "Charles Maund Toyota", emp: "Charles Maund Toyota", amt: 100_000, tok: "ATX-CF-SAN-MAUND-100000" },
  { rank: 4, name: "Liemandt, Joe", emp: "ESW Capital", amt: 100_000, tok: "ATX-CF-SAN-LIEMANDT-100000" },
  { rank: 5, name: "Oskoui, Stephen", emp: "Gigafund", amt: 100_000, tok: "ATX-CF-SAN-OSKOUI-100000" },
  { rank: 6, name: "Nosek, Luke", emp: "Founders Fund", amt: 100_000, tok: "ATX-CF-SAN-NOSEK-100000" },
  { rank: 7, name: "Lonsdale, Joe", emp: "8VC / Lonsdale Enterprises", amt: 75_000, tok: "ATX-CF-SAN-LONSDALE-75000" },
];

const donorRows = donors.map((d) => ({
  rank: d.rank,
  donor: d.name,
  rolledEmployer: d.emp,
  contributions: 1,
  total: d.amt,
  citation: row(d.tok, `Save Austin Now PAC, donor ${d.name}, employer ${d.emp}, $${d.amt.toLocaleString("en-US")}, 2021.`),
}));

export const saveAustinNow: Profile = {
  slug: "save-austin-now",
  name: "Save Austin Now PAC",
  kind: "pac",
  role: "2021 Prop B (public-camping ban) committee",
  jurisdiction: "austin",
  aliases: ["Save Austin Now", "SAN PAC"],
  bio: {
    text: "Save Austin Now PAC raised $4,950,000 for the 2021 Proposition B campaign — the ballot question to reinstate Austin's public-camping ban. Its biggest gifts came from Texas tech founders and venture investors; the long tail includes hundreds of small-dollar contributions reported with employer 'Best Efforts', a regulatory placeholder used when the campaign couldn't determine the donor's employer.",
    citations: [totalsCite],
  },
  stats: [
    { label: "Total raised, 2021 cycle", value: "$4,950,000", citation: totalsCite },
    { label: "Top individual gift", value: "$450,000 · Philip Canfield", citation: donorRows[0].citation },
    { label: "Donors at $100,000+", value: "5", citation: totalsCite },
  ],
  sections: [
    {
      kind: "top_donors",
      title: "Top contributors",
      rows: donorRows,
    },
    {
      kind: "narrative",
      title: "Reading note",
      chunks: [
        {
          id: 1,
          text: "Hundreds of contributions to Save Austin Now during the campaign were reported with the employer field as literal 'Best Efforts'. We describe that pattern but do not characterize the donors behind it; the City Clerk does not require campaigns to make a second attempt once 'Best Efforts' is recorded.",
          citations: [totalsCite],
        },
      ],
    },
  ],
  network: {
    nodes: [
      { id: "san", label: "Save Austin Now PAC", kind: "pac", sublabel: "$4.95M, 2021 Prop B", profileSlug: "save-austin-now" },
      ...donors.slice(0, 5).map((d) => ({
        id: `san-${d.rank}`,
        label: d.name.replace(/,.*/, ""),
        kind: "donor" as const,
        sublabel: d.emp,
      })),
    ],
    edges: donors.slice(0, 5).map((d) => ({
      from: `san-${d.rank}`,
      to: "san",
      label: `$${d.amt.toLocaleString("en-US")}`,
      weight: d.amt,
      citation: donorRows[d.rank - 1].citation,
    })),
  },
  related: [],
  defaultQuestion: "Who funded Save Austin Now PAC for the 2021 Prop B campaign?",
};

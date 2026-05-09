import type { HeroInvestigation } from "../types";

// Source rows: data.austintexas.gov dataset 3kfv-biw6 (Austin contributions),
// the Robert Epstein subset matching the table in docs/investigations.md §S1.
// reportInfoIdent values are synthetic stable tokens; the citation popover
// shows the row summary and the URL deep-links to the underlying dataset
// where a reader can verify the row by donor name + date + amount.

const AUSTIN_CONTRIBUTIONS = "https://data.austintexas.gov/d/3kfv-biw6";

function rowUrl(rowToken: string): string {
  return `${AUSTIN_CONTRIBUTIONS}?row=${encodeURIComponent(rowToken)}`;
}

// Three variants present in the actual transaction table; the firm's full
// LP name (Prophet Capital Asset Management LP) is mentioned in narrative
// but does not appear as a separate employer variant in the data.
const variants = [
  {
    variant: "Prophet Capital",
    contributions: 4,
    total: 215_000,
    sampleCitation: {
      reportInfoIdent: "ATX-CF-2019-FPA-175000",
      url: rowUrl("ATX-CF-2019-FPA-175000"),
      rowSummary:
        "Fair Play Austin PAC, donor Epstein Robert, employer Prophet Capital, monetary $175,000, 2019.",
    },
  },
  {
    variant: "Prophet Capital Management",
    contributions: 3,
    total: 79_987,
    sampleCitation: {
      reportInfoIdent: "ATX-CF-2018-FPA-INKIND-50000",
      url: rowUrl("ATX-CF-2018-FPA-INKIND-50000"),
      rowSummary:
        "Fair Play Austin PAC, donor Epstein Robert, employer Prophet Capital Management, in-kind $50,000 (signature gathering), 2018.",
    },
  },
  {
    variant: "PCM LLC",
    contributions: 2,
    total: 44_000,
    sampleCitation: {
      reportInfoIdent: "ATX-CF-2018-INDY-24000",
      url: rowUrl("ATX-CF-2018-INDY-24000"),
      rowSummary:
        "Indy Austin, donor Epstein Robert, employer PCM LLC, monetary $24,000, 2018.",
    },
  },
];

const rolledTotal = variants.reduce((s, v) => s + v.total, 0); // $338,987
const rolledCount = variants.reduce((s, v) => s + v.contributions, 0); // 9
const fairPlayTotal = 279_987; // the $50k + $17,831 + $12,156 + $175k + $25k slice
const mergeConfidence = 0.92;

const fairPlay175kCitation = variants[0].sampleCitation;
const fairPlay50kCitation = variants[1].sampleCitation;
const indyAustinCitation = variants[2].sampleCitation;

const stadiumCitation = {
  reportInfoIdent: "AUSTIN-PROP-K-2018",
  url: "https://www.austintexas.gov/department/city-clerk/elections",
  rowSummary:
    "City of Austin, Nov 2018 ballot, Proposition K (McKalla Place / soccer stadium ballot question).",
};

function formatAmount(n: number): string {
  return `$${n.toLocaleString("en-US")}`;
}

function formatCount(n: number): string {
  return n.toLocaleString("en-US");
}

export const s1Epstein: HeroInvestigation = {
  id: "s1-epstein",
  question:
    "Who was the biggest individual political spender in Austin's 2018 ballot cycle?",
  pillLabel: "Biggest 2018 Austin ballot spender",
  tags: [
    "austin",
    "ballot",
    "2018",
    "individual-donor",
    "real-estate",
    "entity-resolution",
  ],
  steps: [
    {
      kind: "emit",
      event: {
        type: "plan_started",
        question:
          "Who was the biggest individual political spender in Austin's 2018 ballot cycle?",
      },
      delayAfterMs: 350,
    },
    {
      kind: "emit",
      event: {
        type: "plan_step",
        id: "p1",
        description:
          "Find PACs active in Austin's 2018 ballot cycle and rank them by raised total.",
      },
      delayAfterMs: 200,
    },
    {
      kind: "emit",
      event: {
        type: "tool_call",
        stepId: "p1",
        tool: "top_pacs",
        args: { jurisdiction: "austin", year: 2018, limit: 10 },
      },
      delayAfterMs: 600,
    },
    {
      kind: "emit",
      event: {
        type: "tool_result",
        stepId: "p1",
        rowCount: 10,
        sample: [
          { pac: "Fair Play Austin PAC", raised: 540_239 },
          { pac: "Austin Forward", raised: 420_812 },
          { pac: "Indy Austin", raised: 224_500 },
          { pac: "Megaphone", raised: 188_400 },
        ],
        sourceRows: [
          "ATX-CF-2018-FPA-CS",
          "ATX-CF-2018-AFW-CS",
          "ATX-CF-2018-INDY-CS",
          "ATX-CF-2018-MGP-CS",
        ],
      },
      delayAfterMs: 350,
    },
    {
      kind: "emit",
      event: {
        type: "plan_step",
        id: "p2",
        description:
          "Pull individual contributions to those PACs across 2018–2019 (the cycle includes the Apr 2019 special).",
      },
      delayAfterMs: 200,
    },
    {
      kind: "emit",
      event: {
        type: "tool_call",
        stepId: "p2",
        tool: "get_contributions",
        args: {
          recipients: [
            "Fair Play Austin PAC",
            "Austin Forward",
            "Indy Austin",
            "Megaphone",
          ],
          dateRange: ["2018-01-01", "2019-12-31"],
          donorScope: "individual",
        },
      },
      delayAfterMs: 700,
    },
    {
      kind: "emit",
      event: {
        type: "tool_result",
        stepId: "p2",
        rowCount: 1_842,
        sample: [
          { donor: "Epstein, Robert", employer: "Prophet Capital", amount: 175_000 },
          { donor: "Epstein, Robert", employer: "Prophet Capital Management", amount: 50_000 },
          { donor: "Epstein, Robert", employer: "PCM LLC", amount: 24_000 },
          { donor: "Epstein, Robert", employer: "Prophet Capital", amount: 25_000 },
        ],
        sourceRows: variants.map((v) => v.sampleCitation.reportInfoIdent),
      },
      delayAfterMs: 400,
    },
    {
      kind: "emit",
      event: {
        type: "plan_step",
        id: "p3",
        description:
          "Roll up the donor side by employer. The same donor reports under three employer spellings — clustering them as one firm.",
      },
      delayAfterMs: 250,
    },
    {
      kind: "emit",
      event: {
        type: "tool_call",
        stepId: "p3",
        tool: "cluster_employer_variants",
        args: { donorName: "Epstein, Robert", threshold: 0.78 },
      },
      delayAfterMs: 800,
    },
    {
      kind: "emit",
      event: {
        type: "tool_result",
        stepId: "p3",
        rowCount: 1,
        sample: [
          {
            canonical: "Prophet Capital",
            mergedTotal: rolledTotal,
            mergedCount: rolledCount,
            confidence: mergeConfidence,
            variants: variants.map((v) => v.variant),
          },
        ],
        sourceRows: variants.map((v) => v.sampleCitation.reportInfoIdent),
        confidence: mergeConfidence,
      },
      delayAfterMs: 350,
    },
    {
      kind: "emit",
      event: {
        type: "narrative_chunk",
        role: "lede",
        text: `One donor anchors Austin's 2018 ballot cycle. Robert Epstein, founder of Prophet Capital Asset Management LP, wrote ${formatCount(rolledCount)} contributions totaling ${formatAmount(rolledTotal)} across four PACs — including ${formatAmount(fairPlayTotal)} into Fair Play Austin PAC, the committee that opposed the McKalla Place soccer-stadium deal on the November ballot.`,
        citations: [fairPlay175kCitation, indyAustinCitation],
      },
      delayAfterMs: 900,
    },
    {
      kind: "emit",
      event: {
        type: "narrative_chunk",
        role: "methods",
        text: `Three reported employer variants — Prophet Capital, Prophet Capital Management, PCM LLC — were auto-merged at ${Math.round(mergeConfidence * 100)}% match confidence on shared donor name (Epstein, Robert) and Austin ZIP. Without that rollup, no individual entry crosses the cycle's top-contributors threshold.`,
        citations: [fairPlay50kCitation, indyAustinCitation],
      },
      delayAfterMs: 700,
    },
    {
      kind: "emit",
      event: {
        type: "graph_node",
        id: "epstein",
        label: "Robert Epstein",
        kind: "donor",
        sublabel: "Prophet Capital",
      },
      delayAfterMs: 200,
    },
    {
      kind: "emit",
      event: {
        type: "graph_node",
        id: "fair-play-austin",
        label: "Fair Play Austin PAC",
        kind: "pac",
        sublabel: "opposed Prop K (2018)",
      },
      delayAfterMs: 200,
    },
    {
      kind: "emit",
      event: {
        type: "graph_node",
        id: "indy-austin",
        label: "Indy Austin",
        kind: "pac",
      },
      delayAfterMs: 200,
    },
    {
      kind: "emit",
      event: {
        type: "graph_edge",
        from: "epstein",
        to: "fair-play-austin",
        label: formatAmount(fairPlayTotal),
        weight: fairPlayTotal,
      },
      delayAfterMs: 150,
    },
    {
      kind: "emit",
      event: {
        type: "graph_edge",
        from: "epstein",
        to: "indy-austin",
        label: formatAmount(24_000),
        weight: 24_000,
      },
      delayAfterMs: 400,
    },
    {
      kind: "emit",
      event: {
        type: "narrative_chunk",
        role: "body",
        text: `The single largest line item is the ${formatAmount(175_000)} monetary contribution on Apr 4, 2019; the rest is split across $50,000 of in-kind signature-gathering and four smaller monetary and in-kind gifts in 2018. The pro-stadium side won Prop K and the McKalla Place site became Q2 Stadium, now home to Austin FC — but the file is the largest individual outlay in the dataset for that cycle.`,
        citations: [fairPlay175kCitation, stadiumCitation],
      },
      delayAfterMs: 800,
    },
    {
      kind: "emit",
      event: {
        type: "investigation_complete",
        topDonors: [
          {
            rank: 1,
            donor: "Epstein, Robert",
            rolledEmployer: "Prophet Capital Asset Management LP",
            contributions: rolledCount,
            total: rolledTotal,
            variants: variants.map((v) => v.variant),
            citation: fairPlay175kCitation,
          },
        ],
      },
      delayAfterMs: 0,
    },
  ],
};

import type { EmployerVariant, HeroInvestigation, ScriptStep } from "../types";

// Source: data.austintexas.gov contributions (3kfv-biw6) and lobby clients
// (7ena-g23u). Numbers per docs/investigations.md §A2.

const AUSTIN_CONTRIBS = "https://data.austintexas.gov/d/3kfv-biw6";
const AUSTIN_LOBBY_CLIENTS = "https://data.austintexas.gov/d/7ena-g23u";

const variants: EmployerVariant[] = [
  {
    variant: "Endeavor Real Estate Group",
    contributions: 60,
    total: 24_975,
    sampleContributors: ["Manley, James", "Wells, Cushman"],
    sampleCitation: {
      reportInfoIdent: "ATX-CF-WATSON-ERG-CANONICAL",
      url: `${AUSTIN_CONTRIBS}?donor=Endeavor+Real+Estate+Group`,
      rowSummary:
        "Watson, Kirk P. recipient; donor employer 'Endeavor Real Estate Group' across 60 individual contributions, 2022–present.",
    },
  },
  {
    variant: "Endeavor Real Estate",
    contributions: 24,
    total: 10_350,
    sampleContributors: ["Bray, Jay"],
    sampleCitation: {
      reportInfoIdent: "ATX-CF-WATSON-ERG-SHORT",
      url: `${AUSTIN_CONTRIBS}?donor=Endeavor+Real+Estate`,
      rowSummary:
        "Watson, Kirk P. recipient; donor employer 'Endeavor Real Estate', 24 contributions.",
    },
  },
  {
    variant: "Endeavor",
    contributions: 10,
    total: 4_114,
    sampleContributors: ["Linseisen, Andrew"],
    sampleCitation: {
      reportInfoIdent: "ATX-CF-WATSON-ERG-BARE",
      url: `${AUSTIN_CONTRIBS}?donor=Endeavor`,
      rowSummary:
        "Watson, Kirk P. recipient; donor employer 'Endeavor', 10 contributions.",
    },
  },
];

const lobbyCitation = {
  reportInfoIdent: "ATX-LOBBY-ENDEAVOR-CLIENT",
  url: `${AUSTIN_LOBBY_CLIENTS}?client=Endeavor`,
  rowSummary:
    "Endeavor Real Estate Group, registered Austin city lobby client; 4 registrants under subject 'REAL ESTATE INVESTMENT/DEVELOPMENT'.",
};

const mfaCitation = {
  reportInfoIdent: "ATX-CF-MFA-ENDEAVOR",
  url: `${AUSTIN_CONTRIBS}?recipient=Mobility+for+All&donor=Endeavor`,
  rowSummary:
    "Mobility for All PAC, contributions from Endeavor leadership totaling $200,000 across 2 contributions.",
};

const rolledTotal = variants.reduce((s, v) => s + v.total, 0);
const rolledCount = variants.reduce((s, v) => s + v.contributions, 0);

const ifMerged: ScriptStep[] = [
  {
    kind: "emit",
    event: { type: "disambiguation_resolved", id: "endeavor-merge", merged: true },
    delayAfterMs: 200,
  },
  {
    kind: "emit",
    event: {
      type: "narrative_chunk",
      text: `Merged, Endeavor Real Estate Group employees account for ${rolledCount} contributions to Mayor Kirk Watson totaling $${rolledTotal.toLocaleString("en-US")} since 2022 — 33 distinct individuals, most giving at the per-cycle maximum across multiple election cycles. No single Endeavor name is large enough to surface in a top-donors view; the rollup is what makes the pattern visible.`,
      citations: [variants[0].sampleCitation],
    },
    delayAfterMs: 800,
  },
  {
    kind: "emit",
    event: { type: "graph_node", id: "endeavor-employees", label: "33 Endeavor employees", kind: "donor", sublabel: "individual donors" },
    delayAfterMs: 200,
  },
  {
    kind: "emit",
    event: { type: "graph_node", id: "endeavor-firm", label: "Endeavor Real Estate Group", kind: "employer", profileSlug: "endeavor-real-estate" },
    delayAfterMs: 200,
  },
  {
    kind: "emit",
    event: { type: "graph_node", id: "watson-mayor", label: "Mayor Kirk Watson", kind: "filer", profileSlug: "kirk-watson" },
    delayAfterMs: 200,
  },
  {
    kind: "emit",
    event: { type: "graph_node", id: "lobbyists", label: "4 city lobbyists", kind: "lobbyist", sublabel: "Morrow · Linseisen · Wright · Cain" },
    delayAfterMs: 200,
  },
  {
    kind: "emit",
    event: { type: "graph_node", id: "mfa", label: "Mobility for All PAC", kind: "pac" },
    delayAfterMs: 200,
  },
  {
    kind: "emit",
    event: { type: "graph_edge", from: "endeavor-employees", to: "watson-mayor", label: `$${rolledTotal.toLocaleString("en-US")}`, weight: rolledTotal },
    delayAfterMs: 200,
  },
  {
    kind: "emit",
    event: { type: "graph_edge", from: "endeavor-firm", to: "endeavor-employees", label: "employs", weight: 1 },
    delayAfterMs: 200,
  },
  {
    kind: "emit",
    event: { type: "graph_edge", from: "endeavor-firm", to: "lobbyists", label: "retains", weight: 1 },
    delayAfterMs: 200,
  },
  {
    kind: "emit",
    event: { type: "graph_edge", from: "endeavor-firm", to: "mfa", label: "$200,000", weight: 200_000 },
    delayAfterMs: 400,
  },
  {
    kind: "emit",
    event: {
      type: "narrative_chunk",
      text: `On the lobby side, the same firm appears as a registered city lobby client with four registrants — Amanda Morrow, Andrew Linseisen, Kelly Wright, and Julienne Cain — all filing under 'REAL ESTATE INVESTMENT/DEVELOPMENT'. Endeavor leadership also gave $200,000 across two contributions to Mobility for All PAC, the pro-Project-Connect committee whose policy positions favor transit-adjacent development.`,
      citations: [lobbyCitation, mfaCitation],
    },
    delayAfterMs: 800,
  },
  {
    kind: "emit",
    event: {
      type: "narrative_chunk",
      text: `Reading note: nothing in this pattern violates Austin's campaign-finance rules. Per-individual contributions stay under the per-cycle cap; lobby registration is public; PAC contributions are disclosed. The pattern is what's interesting — the same firm appears across three distinct slices of the public record, in a way no single query would surface.`,
      citations: [variants[0].sampleCitation],
    },
    delayAfterMs: 600,
  },
  {
    kind: "emit",
    event: {
      type: "investigation_complete",
      topDonors: [
        {
          rank: 1,
          donor: "Endeavor Real Estate Group employees (33)",
          rolledEmployer: "Endeavor Real Estate Group",
          contributions: rolledCount,
          total: rolledTotal,
          variants: variants.map((v) => v.variant),
          citation: variants[0].sampleCitation,
        },
      ],
    },
    delayAfterMs: 0,
  },
];

const ifKept: ScriptStep[] = [
  {
    kind: "emit",
    event: { type: "disambiguation_resolved", id: "endeavor-merge", merged: false },
    delayAfterMs: 200,
  },
  {
    kind: "emit",
    event: {
      type: "narrative_chunk",
      text: `Without rolling up the variants, no Endeavor entry crosses the threshold for a top-donor view: ${variants.map((v) => `${v.variant} ($${v.total.toLocaleString("en-US")})`).join(", ")}. Combined they total $${rolledTotal.toLocaleString("en-US")} across ${rolledCount} contributions, but read separately the pattern is invisible in the data — which is the case the rollup is meant to address.`,
      citations: variants.map((v) => v.sampleCitation),
    },
    delayAfterMs: 800,
  },
  {
    kind: "emit",
    event: {
      type: "investigation_complete",
      topDonors: variants.map((v, i) => ({
        rank: i + 1,
        donor: `Endeavor employees (under '${v.variant}')`,
        rolledEmployer: v.variant,
        contributions: v.contributions,
        total: v.total,
        citation: v.sampleCitation,
      })),
    },
    delayAfterMs: 0,
  },
];

export const a2Endeavor: HeroInvestigation = {
  id: "a2-endeavor",
  question:
    "What's the relationship between Endeavor Real Estate Group and Mayor Watson?",
  pillLabel: "Endeavor Real Estate ↔ Watson",
  steps: [
    {
      kind: "emit",
      event: {
        type: "plan_started",
        question:
          "What's the relationship between Endeavor Real Estate Group and Mayor Watson?",
      },
      delayAfterMs: 350,
    },
    {
      kind: "emit",
      event: {
        type: "plan_step",
        id: "p1",
        description:
          "Pull Mayor Watson's contributions since 2022 and group by donor employer.",
      },
      delayAfterMs: 200,
    },
    {
      kind: "emit",
      event: {
        type: "tool_call",
        stepId: "p1",
        tool: "get_contributions",
        args: { recipient: "Watson, Kirk P.", since: "2022-01-01", groupBy: "employer" },
      },
      delayAfterMs: 700,
    },
    {
      kind: "emit",
      event: {
        type: "tool_result",
        stepId: "p1",
        rowCount: 4_211,
        sample: [
          { employer: "Endeavor Real Estate Group", count: 60, total: 24_975 },
          { employer: "Endeavor Real Estate", count: 24, total: 10_350 },
          { employer: "Endeavor", count: 10, total: 4_114 },
          { employer: "self-employed", count: 312, total: 142_001 },
        ],
        sourceRows: variants.map((v) => v.sampleCitation.reportInfoIdent),
      },
      delayAfterMs: 350,
    },
    {
      kind: "emit",
      event: {
        type: "plan_step",
        id: "p2",
        description:
          "Three Endeavor variants look like the same firm. Asking before reporting a merged total.",
      },
      delayAfterMs: 200,
    },
    {
      kind: "emit",
      event: {
        type: "tool_call",
        stepId: "p2",
        tool: "cluster_employer_variants",
        args: { stem: "Endeavor", threshold: 0.78 },
      },
      delayAfterMs: 700,
    },
    {
      kind: "emit",
      event: {
        type: "disambiguation_required",
        id: "endeavor-merge",
        stepId: "p2",
        title: "Merge these Endeavor employer variants?",
        explanation: `Three variants share the 'Endeavor Real Estate Group' stem, no overlapping ZIPs that conflict, and the firm's HR roster (LinkedIn cross-check) confirms 33 distinct employees. Merging surfaces a $${rolledTotal.toLocaleString("en-US")} pattern across ${rolledCount} contributions that no individual entry shows.`,
        variants,
      },
      delayAfterMs: 0,
    },
    {
      kind: "await_disambiguation",
      id: "endeavor-merge",
      ifMerged,
      ifKept,
    },
  ],
};

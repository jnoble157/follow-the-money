import type { HeroInvestigation } from "../types";

// Source: data.austintexas.gov contributions (3kfv-biw6), recipient
// "Ridesharing Works for Austin" 2016. Per docs/investigations.md §B3.

const AUSTIN_CONTRIBS = "https://data.austintexas.gov/d/3kfv-biw6";

const uberCitation = {
  reportInfoIdent: "ATX-CF-2016-RWA-UBER-2990000",
  url: `${AUSTIN_CONTRIBS}?donor=Uber+Tech&recipient=Ridesharing+Works+for+Austin`,
  rowSummary:
    "Ridesharing Works for Austin, donor Uber Technologies Inc, $2,990,000, 2016.",
};

const lyftCitation = {
  reportInfoIdent: "ATX-CF-2016-RWA-LYFT-226000",
  url: `${AUSTIN_CONTRIBS}?donor=Lyft+Inc&recipient=Ridesharing+Works+for+Austin`,
  rowSummary:
    "Ridesharing Works for Austin, donor Lyft Inc, $226,000, 2016.",
};

const propCitation = {
  reportInfoIdent: "ATX-PROP-1-2016",
  url: "https://www.austintexas.gov/department/city-clerk/elections",
  rowSummary:
    "Austin May 2016 special election, Proposition 1 (rideshare fingerprinting). Voters approved fingerprinting; Uber and Lyft suspended Austin operations the next day.",
};

export const b3Uber: HeroInvestigation = {
  id: "b3-uber",
  question: "Who funded Ridesharing Works for Austin in 2016?",
  pillLabel: "Uber's 2016 Austin spend",
  steps: [
    {
      kind: "emit",
      event: { type: "plan_started", question: "Who funded Ridesharing Works for Austin in 2016?" },
      delayAfterMs: 300,
    },
    {
      kind: "emit",
      event: { type: "plan_step", id: "p1", description: "Find the filer and pull all 2016 contributions to it." },
      delayAfterMs: 200,
    },
    {
      kind: "emit",
      event: { type: "tool_call", stepId: "p1", tool: "find_filer", args: { name: "Ridesharing Works for Austin" } },
      delayAfterMs: 500,
    },
    {
      kind: "emit",
      event: {
        type: "tool_result",
        stepId: "p1",
        rowCount: 1,
        sample: [{ filerIdent: "ATX-RWA-PAC", raised: 3_216_000, cycle: "2016 Prop 1" }],
        sourceRows: ["ATX-FILER-RWA"],
      },
      delayAfterMs: 300,
    },
    {
      kind: "emit",
      event: { type: "plan_step", id: "p2", description: "Pull the donor list — expecting a long tail; ranking by amount." },
      delayAfterMs: 200,
    },
    {
      kind: "emit",
      event: { type: "tool_call", stepId: "p2", tool: "top_donors", args: { filerIdent: "ATX-RWA-PAC", cycle: "2016" } },
      delayAfterMs: 700,
    },
    {
      kind: "emit",
      event: {
        type: "tool_result",
        stepId: "p2",
        rowCount: 2,
        sample: [
          { donor: "Uber Technologies Inc", amount: 2_990_000 },
          { donor: "Lyft Inc", amount: 226_000 },
        ],
        sourceRows: [uberCitation.reportInfoIdent, lyftCitation.reportInfoIdent],
      },
      delayAfterMs: 350,
    },
    {
      kind: "emit",
      event: {
        type: "narrative_chunk",
        text: "Ridesharing Works for Austin raised $3,216,000 for the 2016 Proposition 1 campaign — the ballot question on whether ridesharing drivers would be fingerprinted. Two donors account for essentially the entire war chest: Uber Technologies Inc gave $2,990,000 and Lyft Inc gave $226,000. There is no long tail; this is a 2-donor PAC.",
        citations: [uberCitation, lyftCitation],
      },
      delayAfterMs: 800,
    },
    { kind: "emit", event: { type: "graph_node", id: "rwa", label: "Ridesharing Works for Austin", kind: "pac", sublabel: "$3.21M, 2016 Prop 1", profileSlug: "ridesharing-works" }, delayAfterMs: 200 },
    { kind: "emit", event: { type: "graph_node", id: "uber", label: "Uber Technologies", kind: "donor" }, delayAfterMs: 150 },
    { kind: "emit", event: { type: "graph_node", id: "lyft", label: "Lyft", kind: "donor" }, delayAfterMs: 150 },
    { kind: "emit", event: { type: "graph_edge", from: "uber", to: "rwa", label: "$2,990,000", weight: 2_990_000 }, delayAfterMs: 200 },
    { kind: "emit", event: { type: "graph_edge", from: "lyft", to: "rwa", label: "$226,000", weight: 226_000 }, delayAfterMs: 400 },
    {
      kind: "emit",
      event: {
        type: "narrative_chunk",
        text: "Voters approved fingerprinting. Uber and Lyft suspended Austin operations the day after the election and stayed gone for roughly a year. The expenditure is the single cleanest example in any Texas dataset of corporate money attempting to override a local-government ballot decision.",
        citations: [propCitation],
      },
      delayAfterMs: 700,
    },
    {
      kind: "emit",
      event: {
        type: "investigation_complete",
        topDonors: [
          { rank: 1, donor: "Uber Technologies Inc", rolledEmployer: null, contributions: 1, total: 2_990_000, citation: uberCitation },
          { rank: 2, donor: "Lyft Inc", rolledEmployer: null, contributions: 1, total: 226_000, citation: lyftCitation },
        ],
      },
      delayAfterMs: 0,
    },
  ],
};

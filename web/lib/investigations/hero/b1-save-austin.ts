import type { HeroInvestigation } from "../types";

// Source: data.austintexas.gov contributions (3kfv-biw6) filtered to recipient
// "Save Austin Now PAC". Per docs/investigations.md §B1.

const AUSTIN_CONTRIBS = "https://data.austintexas.gov/d/3kfv-biw6";

function row(token: string, summary: string) {
  return {
    reportInfoIdent: token,
    url: `${AUSTIN_CONTRIBS}?row=${encodeURIComponent(token)}`,
    rowSummary: summary,
  };
}

const totalCitation = row(
  "ATX-CF-SAN-TOTALS",
  "Save Austin Now PAC, Prop B 2021 cycle, $4,950,000 total raised across 2,400+ contributions.",
);

const donors = [
  { name: "Canfield, Philip B.", employer: "Ariet Capital LLC", amount: 450_000, token: "ATX-CF-SAN-CANFIELD-450000" },
  { name: "Royston, Danielle", employer: "TelcoDR", amount: 148_000, token: "ATX-CF-SAN-ROYSTON-148000" },
  { name: "Charles Maund Toyota", employer: "Charles Maund Toyota", amount: 100_000, token: "ATX-CF-SAN-MAUND-100000" },
  { name: "Liemandt, Joe", employer: "ESW Capital", amount: 100_000, token: "ATX-CF-SAN-LIEMANDT-100000" },
  { name: "Oskoui, Stephen", employer: "Gigafund", amount: 100_000, token: "ATX-CF-SAN-OSKOUI-100000" },
  { name: "Nosek, Luke", employer: "Founders Fund", amount: 100_000, token: "ATX-CF-SAN-NOSEK-100000" },
  { name: "Lonsdale, Joe", employer: "8VC / Lonsdale Enterprises", amount: 75_000, token: "ATX-CF-SAN-LONSDALE-75000" },
];

const samples = donors.map((d) =>
  row(d.token, `Save Austin Now PAC, donor ${d.name}, employer ${d.employer}, $${d.amount.toLocaleString("en-US")}, 2021.`),
);

export const b1SaveAustin: HeroInvestigation = {
  id: "b1-save-austin",
  question: "Who funded Save Austin Now PAC for the 2021 Prop B campaign?",
  pillLabel: "Save Austin Now (Prop B)",
  steps: [
    {
      kind: "emit",
      event: {
        type: "plan_started",
        question: "Who funded Save Austin Now PAC for the 2021 Prop B campaign?",
      },
      delayAfterMs: 300,
    },
    {
      kind: "emit",
      event: { type: "plan_step", id: "p1", description: "Resolve filer 'Save Austin Now PAC' and pull the cycle totals." },
      delayAfterMs: 200,
    },
    {
      kind: "emit",
      event: { type: "tool_call", stepId: "p1", tool: "find_filer", args: { name: "Save Austin Now PAC" } },
      delayAfterMs: 500,
    },
    {
      kind: "emit",
      event: {
        type: "tool_result",
        stepId: "p1",
        rowCount: 1,
        sample: [{ filerIdent: "ATX-SAN-PAC", raised: 4_950_000, cycle: "2021 Prop B" }],
        sourceRows: [totalCitation.reportInfoIdent],
      },
      delayAfterMs: 300,
    },
    {
      kind: "emit",
      event: { type: "plan_step", id: "p2", description: "Pull the top individual contributors and their employers." },
      delayAfterMs: 200,
    },
    {
      kind: "emit",
      event: { type: "tool_call", stepId: "p2", tool: "top_donors", args: { filerIdent: "ATX-SAN-PAC", cycle: "2021", limit: 10 } },
      delayAfterMs: 700,
    },
    {
      kind: "emit",
      event: {
        type: "tool_result",
        stepId: "p2",
        rowCount: 10,
        sample: donors.map((d) => ({ donor: d.name, employer: d.employer, amount: d.amount })),
        sourceRows: samples.map((s) => s.reportInfoIdent),
      },
      delayAfterMs: 350,
    },
    {
      kind: "emit",
      event: {
        type: "narrative_chunk",
        text: "Save Austin Now PAC raised $4,950,000 for the 2021 Prop B campaign — the ballot question to reinstate Austin's public-camping ban. The committee's biggest individual gifts came from Texas tech founders and venture investors: Philip Canfield (Ariet Capital, $450,000), Joe Liemandt (ESW Capital / Trilogy, $100,000), Stephen Oskoui and Luke Nosek (Gigafund / Founders Fund, $100,000 each), and Joe Lonsdale (8VC, $75,000). Royston Danielle of TelcoDR contributed $148,000; the only corporate gift in this slice is $100,000 from Charles Maund Toyota.",
        citations: [totalCitation, samples[0], samples[1]],
      },
      delayAfterMs: 800,
    },
    { kind: "emit", event: { type: "graph_node", id: "san", label: "Save Austin Now PAC", kind: "pac", sublabel: "$4.95M, 2021 Prop B", profileSlug: "save-austin-now" }, delayAfterMs: 150 },
    ...donors.slice(0, 6).flatMap((d, i) => [
      {
        kind: "emit" as const,
        event: { type: "graph_node" as const, id: `san-d${i}`, label: d.name.replace(/,.*/, ""), kind: "donor" as const, sublabel: d.employer },
        delayAfterMs: 120,
      },
      {
        kind: "emit" as const,
        event: { type: "graph_edge" as const, from: `san-d${i}`, to: "san", label: `$${d.amount.toLocaleString("en-US")}`, weight: d.amount },
        delayAfterMs: 80,
      },
    ]),
    {
      kind: "emit",
      event: {
        type: "narrative_chunk",
        text: "Reading note: this is the top of the contributor list, not the long tail. Save Austin Now also reported hundreds of small-dollar contributions during the campaign with employer field listed as 'Best Efforts' (a regulatory placeholder used when a campaign couldn't determine the donor's employer); we describe that pattern but do not characterize the donors behind it.",
        citations: [totalCitation],
      },
      delayAfterMs: 600,
    },
    {
      kind: "emit",
      event: {
        type: "investigation_complete",
        topDonors: donors.map((d, i) => ({
          rank: i + 1,
          donor: d.name,
          rolledEmployer: d.employer,
          contributions: 1,
          total: d.amount,
          citation: samples[i],
        })),
      },
      delayAfterMs: 0,
    },
  ],
};

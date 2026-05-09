import type { HeroInvestigation } from "../types";

// Source: data.austintexas.gov dataset gd3e-xut2 (Austin expenditures), filer
// Watson, Kirk P. — the $1,186,764 line item is the largest single expenditure
// in the entire Austin dataset and the headline of docs/investigations.md §A1.

const AUSTIN_EXPENDITURES = "https://data.austintexas.gov/d/gd3e-xut2";
const AUSTIN_CONTRIBS = "https://data.austintexas.gov/d/3kfv-biw6";

const transferCitation = {
  reportInfoIdent: "ATX-CF-2022-WATSON-TRANSFER-1186764",
  url: `${AUSTIN_EXPENDITURES}?row=ATX-CF-2022-WATSON-TRANSFER-1186764`,
  rowSummary:
    "Watson, Kirk P., 2022 expenditure to KPW PAC, $1,186,764 — described 'Contribution (from prior Senate C/OH funds)'.",
};

const watson2024Citation = {
  reportInfoIdent: "ATX-CF-2024-WATSON-RAISED",
  url: `${AUSTIN_CONTRIBS}?filer=Watson%2C+Kirk+P.&year=2024`,
  rowSummary:
    "Watson, Kirk P., 2024 mayoral campaign contributions: 2,896 unique donors, $1,986,830 raised.",
};

const fieldCitation = {
  reportInfoIdent: "ATX-CF-2024-MAYOR-FIELD",
  url: `${AUSTIN_CONTRIBS}?office=Mayor&year=2024`,
  rowSummary:
    "2024 Austin mayor's race fundraising by candidate (cover sheets aggregated).",
};

// Question reframed for the common-man home tile: a basic-curiosity
// "what happens to..." question. The underlying scripted answer (Watson
// transferred $1.18M of state-Senate funds into KPW PAC for his mayoral
// race) is the canonical example of the answer; the lede names the
// mechanism + legal context.
export const a1Watson: HeroInvestigation = {
  id: "a1-watson",
  question: "What happens to politicians' leftover campaign money?",
  pillLabel: "$1.18M Senate-to-mayor pivot",
  tags: ["austin", "watson", "mayor", "expenditure", "tec-state", "transfer"],
  searchAliases: [
    "Kirk Watson",
    "Watson 2022",
    "KPW PAC",
    "Watson mayoral",
    "Senate transfer",
    "campaign account transfer",
  ],
  steps: [
    {
      kind: "emit",
      event: {
        type: "plan_started",
        question: "What happens to politicians' leftover campaign money?",
      },
      delayAfterMs: 350,
    },
    {
      kind: "emit",
      event: {
        type: "plan_step",
        id: "p1",
        description:
          "Resolve the filer 'Kirk Watson' across personal and committee filings.",
      },
      delayAfterMs: 200,
    },
    {
      kind: "emit",
      event: {
        type: "tool_call",
        stepId: "p1",
        tool: "find_filer",
        args: { name: "Kirk Watson", jurisdiction: "austin" },
      },
      delayAfterMs: 500,
    },
    {
      kind: "emit",
      event: {
        type: "tool_result",
        stepId: "p1",
        rowCount: 2,
        sample: [
          { filerIdent: "ATX-WATSON-KIRK", name: "Watson, Kirk P." },
          { filerIdent: "ATX-KPW-PAC", name: "KPW PAC" },
        ],
        sourceRows: ["ATX-FILER-WATSON-KIRK", "ATX-FILER-KPW-PAC"],
      },
      delayAfterMs: 300,
    },
    {
      kind: "emit",
      event: {
        type: "plan_step",
        id: "p2",
        description:
          "Pull Watson's largest 2022 expenditures and inspect the line item.",
      },
      delayAfterMs: 200,
    },
    {
      kind: "emit",
      event: {
        type: "tool_call",
        stepId: "p2",
        tool: "top_expenditures",
        args: { filerIdent: "ATX-WATSON-KIRK", year: 2022, limit: 5 },
      },
      delayAfterMs: 700,
    },
    {
      kind: "emit",
      event: {
        type: "tool_result",
        stepId: "p2",
        rowCount: 5,
        sample: [
          {
            payee: "KPW PAC",
            description: "Contribution (from prior Senate C/OH funds)",
            amount: 1_186_764,
          },
          { payee: "Block By Block", description: "Phone bank", amount: 12_500 },
          { payee: "Vendor Y", description: "Direct mail", amount: 8_750 },
        ],
        sourceRows: [transferCitation.reportInfoIdent],
      },
      delayAfterMs: 350,
    },
    {
      kind: "emit",
      event: {
        type: "plan_step",
        id: "p3",
        description:
          "Cross-reference the destination committee against the 2024 Austin mayor's race fundraising field.",
      },
      delayAfterMs: 200,
    },
    {
      kind: "emit",
      event: {
        type: "tool_call",
        stepId: "p3",
        tool: "top_pacs",
        args: { jurisdiction: "austin", office: "Mayor", year: 2024 },
      },
      delayAfterMs: 600,
    },
    {
      kind: "emit",
      event: {
        type: "tool_result",
        stepId: "p3",
        rowCount: 5,
        sample: [
          { candidate: "Watson, Kirk P.", raised: 1_986_830, donors: 2_896 },
          { candidate: "Llanes-Pulido, Carmen", raised: 193_254 },
          { candidate: "Tovo, Kathie", raised: 118_774 },
          { candidate: "Greco, Jeffrey", raised: 101_345 },
          { candidate: "Bowen, Doug", raised: 16_025 },
        ],
        sourceRows: [fieldCitation.reportInfoIdent],
      },
      delayAfterMs: 400,
    },
    {
      kind: "emit",
      event: {
        type: "narrative_chunk",
        role: "headline",
        text:
          "$1,186,764 of old state Senate money, rolled into a new Austin mayoral war chest.",
        citations: [transferCitation],
      },
      delayAfterMs: 600,
    },
    {
      kind: "emit",
      event: {
        type: "narrative_chunk",
        role: "lede",
        text:
          "Watson's single largest 2022 political expenditure was a $1,186,764 transfer from his Texas State Senate campaign account into a new committee, KPW PAC. The expenditure description on the filing reads 'Contribution (from prior Senate C/OH funds)' — a clean recycling of state-level fundraising into a city committee.",
        citations: [transferCitation],
      },
      delayAfterMs: 800,
    },
    {
      kind: "emit",
      event: { type: "graph_node", id: "watson-senate", label: "Watson Senate", kind: "filer", sublabel: "TX State Senate, prior to 2022", profileSlug: "kirk-watson" },
      delayAfterMs: 200,
    },
    {
      kind: "emit",
      event: { type: "graph_node", id: "kpw-pac", label: "KPW PAC", kind: "pac", sublabel: "registered 2022" },
      delayAfterMs: 200,
    },
    {
      kind: "emit",
      event: { type: "graph_node", id: "watson-mayor", label: "Watson Mayoral", kind: "filer", sublabel: "Austin mayor 2024", profileSlug: "kirk-watson" },
      delayAfterMs: 200,
    },
    {
      kind: "emit",
      event: { type: "graph_edge", from: "watson-senate", to: "kpw-pac", label: "$1,186,764", weight: 1_186_764 },
      delayAfterMs: 200,
    },
    {
      kind: "emit",
      event: { type: "graph_edge", from: "kpw-pac", to: "watson-mayor", label: "supports", weight: 1 },
      delayAfterMs: 400,
    },
    {
      kind: "emit",
      event: {
        type: "narrative_chunk",
        role: "body",
        text:
          "By the 2024 mayoral cycle, Watson outraised his entire opposing field roughly 17 to 1: $1,986,830 across 2,896 unique donors, against the four challengers' combined $429,398. The Senate-to-PAC transfer is the legal backbone of that head start.",
        citations: [watson2024Citation, fieldCitation],
      },
      delayAfterMs: 800,
    },
    {
      kind: "emit",
      event: {
        type: "narrative_chunk",
        role: "reading_note",
        text:
          "Texas Election Code permits transfers between committees of the same officeholder, and the City Clerk accepted the filing — this is the legal mechanism, not a workaround. What's interesting is the scale: $1.18M is more than every challenger's total fundraising combined.",
        citations: [transferCitation],
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
            donor: "Watson, Kirk P. (mayoral, 2024)",
            rolledEmployer: null,
            contributions: 2_896,
            total: 1_986_830,
            citation: watson2024Citation,
          },
          {
            rank: 2,
            donor: "Llanes-Pulido, Carmen",
            rolledEmployer: null,
            contributions: 0,
            total: 193_254,
            citation: fieldCitation,
          },
          {
            rank: 3,
            donor: "Tovo, Kathie",
            rolledEmployer: null,
            contributions: 0,
            total: 118_774,
            citation: fieldCitation,
          },
          {
            rank: 4,
            donor: "Greco, Jeffrey",
            rolledEmployer: null,
            contributions: 0,
            total: 101_345,
            citation: fieldCitation,
          },
          {
            rank: 5,
            donor: "Bowen, Doug",
            rolledEmployer: null,
            contributions: 0,
            total: 16_025,
            citation: fieldCitation,
          },
        ],
      },
      delayAfterMs: 600,
    },
    // Read-next pick: KPW PAC's other side of the ledger. The headline
    // traces money INTO the new committee; the natural follow-up is what
    // it spent the money on. Maps to the `what_did_filer_fund` template
    // shape against the kpw-pac graph node.
    {
      kind: "emit",
      event: {
        type: "read_next",
        question: "Where did KPW PAC's money actually go?",
        kicker: "FOLLOW THE SPEND",
        rationale:
          "$1.18M moved into the committee. The next step is the expenditure ledger: vendors, ad buys, transfers — the actual shape of an Austin mayoral campaign budget.",
      },
      delayAfterMs: 0,
    },
  ],
};

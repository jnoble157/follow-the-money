import type { Profile } from "../types";

const ATX_CONTRIBS = "https://data.austintexas.gov/d/3kfv-biw6";
const ATX_LOBBY_CLIENTS = "https://data.austintexas.gov/d/7ena-g23u";

const canonicalCite = {
  reportInfoIdent: "ATX-CF-WATSON-ERG-CANONICAL",
  url: `${ATX_CONTRIBS}?donor=Endeavor+Real+Estate+Group`,
  rowSummary:
    "Watson, Kirk P. recipient; donor employer 'Endeavor Real Estate Group' across 60 individual contributions totaling $24,975, 2022–present.",
};

const shortCite = {
  reportInfoIdent: "ATX-CF-WATSON-ERG-SHORT",
  url: `${ATX_CONTRIBS}?donor=Endeavor+Real+Estate`,
  rowSummary:
    "Watson, Kirk P. recipient; donor employer 'Endeavor Real Estate', 24 contributions totaling $10,350.",
};

const bareCite = {
  reportInfoIdent: "ATX-CF-WATSON-ERG-BARE",
  url: `${ATX_CONTRIBS}?donor=Endeavor`,
  rowSummary:
    "Watson, Kirk P. recipient; donor employer 'Endeavor', 10 contributions totaling $4,114.",
};

const lobbyCite = {
  reportInfoIdent: "ATX-LOBBY-ENDEAVOR-CLIENT",
  url: `${ATX_LOBBY_CLIENTS}?client=Endeavor`,
  rowSummary:
    "Endeavor Real Estate Group, registered Austin city lobby client; 4 registrants under subject 'REAL ESTATE INVESTMENT/DEVELOPMENT'.",
};

const mfaCite = {
  reportInfoIdent: "ATX-CF-MFA-ENDEAVOR",
  url: `${ATX_CONTRIBS}?recipient=Mobility+for+All&donor=Endeavor`,
  rowSummary:
    "Mobility for All PAC, contributions from Endeavor leadership totaling $200,000 across 2 contributions.",
};

const ROLLED_TOTAL = 24_975 + 10_350 + 4_114; // $39,439
const ROLLED_COUNT = 60 + 24 + 10;            // 94

export const endeavorRealEstate: Profile = {
  slug: "endeavor-real-estate",
  name: "Endeavor Real Estate Group",
  kind: "firm",
  role: "Real estate investment / development",
  jurisdiction: "austin",
  aliases: ["Endeavor", "Endeavor Real Estate"],
  bio: {
    text: "Endeavor Real Estate Group is an Austin-based development firm. In Austin's campaign-finance dataset its presence is unusually broad: 33 distinct employees give to Mayor Kirk Watson, four of its registered Austin city lobbyists file under 'REAL ESTATE INVESTMENT/DEVELOPMENT', and the firm's leadership funds the pro-mobility / pro-Project-Connect committee Mobility for All. Reading the three slices together is the whole point of the rollup; reading any one of them in isolation hides the pattern.",
    citations: [canonicalCite, lobbyCite, mfaCite],
  },
  stats: [
    {
      label: "Employee gifts to Watson",
      value: `$${ROLLED_TOTAL.toLocaleString("en-US")}`,
      citation: canonicalCite,
    },
    {
      label: "Distinct contributing employees",
      value: "33",
      citation: canonicalCite,
    },
    {
      label: "Registered city lobbyists",
      value: "4 · subject REAL ESTATE INVESTMENT/DEVELOPMENT",
      citation: lobbyCite,
    },
    {
      label: "Mobility for All PAC giving",
      value: "$200,000 · 2 contributions",
      citation: mfaCite,
    },
  ],
  sections: [
    {
      kind: "narrative",
      title: "Three slices of the same firm",
      chunks: [
        {
          id: 1,
          text: `On the donor side, ${ROLLED_COUNT} contributions to Mayor Kirk Watson are reported under three Endeavor employer variants — Endeavor Real Estate Group ($24,975), Endeavor Real Estate ($10,350), and Endeavor ($4,114) — totaling $${ROLLED_TOTAL.toLocaleString("en-US")} since 2022, across 33 distinct employees, most giving at the per-cycle maximum.`,
          citations: [canonicalCite, shortCite, bareCite],
        },
        {
          id: 2,
          text: "On the lobby side, the firm appears as a registered Austin city lobby client with four registrants — Amanda Morrow, Andrew Linseisen, Kelly Wright, and Julienne Cain — all filing under 'REAL ESTATE INVESTMENT/DEVELOPMENT'.",
          citations: [lobbyCite],
        },
        {
          id: 3,
          text: "On the PAC side, Endeavor leadership gave $200,000 across two contributions to Mobility for All PAC, the pro-Project-Connect committee whose policy positions favor transit-adjacent development.",
          citations: [mfaCite],
        },
      ],
    },
    {
      kind: "lobby_ties",
      title: "Registered city lobbyists",
      rows: [
        { counterpartyName: "Amanda Morrow", role: "lobbyist for Endeavor", subject: "REAL ESTATE INVESTMENT/DEVELOPMENT", citation: lobbyCite },
        { counterpartyName: "Andrew Linseisen", role: "lobbyist for Endeavor", subject: "REAL ESTATE INVESTMENT/DEVELOPMENT", citation: lobbyCite },
        { counterpartyName: "Kelly Wright", role: "lobbyist for Endeavor", subject: "REAL ESTATE INVESTMENT/DEVELOPMENT", citation: lobbyCite },
        { counterpartyName: "Julienne Cain", role: "lobbyist for Endeavor", subject: "REAL ESTATE INVESTMENT/DEVELOPMENT", citation: lobbyCite },
      ],
    },
  ],
  network: {
    nodes: [
      { id: "endeavor-firm", label: "Endeavor Real Estate Group", kind: "employer", profileSlug: "endeavor-real-estate" },
      { id: "endeavor-employees", label: "33 Endeavor employees", kind: "donor", sublabel: "individual donors" },
      { id: "watson-mayor", label: "Mayor Kirk Watson", kind: "filer", profileSlug: "kirk-watson" },
      { id: "lobbyists", label: "4 city lobbyists", kind: "lobbyist", sublabel: "REAL ESTATE INVESTMENT/DEVELOPMENT" },
      { id: "mfa", label: "Mobility for All PAC", kind: "pac" },
    ],
    edges: [
      { from: "endeavor-firm", to: "endeavor-employees", label: "employs", weight: 1 },
      { from: "endeavor-employees", to: "watson-mayor", label: `$${ROLLED_TOTAL.toLocaleString("en-US")}`, weight: ROLLED_TOTAL },
      { from: "endeavor-firm", to: "lobbyists", label: "retains", weight: 1 },
      { from: "endeavor-firm", to: "mfa", label: "$200,000", weight: 200_000 },
    ],
  },
  related: [
    { slug: "kirk-watson", name: "Kirk Watson", role: "Mayor of Austin" },
  ],
  defaultQuestion: "What's the relationship between Endeavor Real Estate Group and Mayor Watson?",
};

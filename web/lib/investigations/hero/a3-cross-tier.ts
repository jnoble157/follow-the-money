import type { HeroInvestigation } from "../types";

// Source: data.austintexas.gov registrants (58ix-34ma) joined to TEC state
// lobbyist registrations 2025. Per docs/investigations.md §A3.

const AUSTIN_REGISTRANTS = "https://data.austintexas.gov/d/58ix-34ma";
const TEC_LOBBY = "https://www.ethics.state.tx.us/data/search/lobby/2025/2025RegisteredLobbyists.xlsx";

const matches = [
  { name: "Demetrius McDaniel", austinEmployer: "Greenberg Traurig LLP", stateEmployer: "Greenberg Traurig LLP" },
  { name: "Kathleen Mitchell", austinEmployer: "Mitchell Williams Selig Gates Woodyard", stateEmployer: "Mitchell Williams Selig Gates Woodyard" },
  { name: "Ana Husted", austinEmployer: "Husted Strategies", stateEmployer: "Husted Strategies" },
  { name: "Ryan Hanretty", austinEmployer: "Hanretty Group", stateEmployer: "Hanretty Group" },
  { name: "Madison Gessner", austinEmployer: "Capitol Hill Consulting Group", stateEmployer: "Capitol Hill Consulting Group" },
  { name: "Stefanie Sass", austinEmployer: "Sass + Co", stateEmployer: "Sass + Co" },
  { name: "Jerry Philips", austinEmployer: "Philips & Reiter PLLC", stateEmployer: "Philips & Reiter PLLC" },
  { name: "Elizabeth Hadley", austinEmployer: "Hadley Strategies", stateEmployer: "Hadley Strategies" },
  { name: "Steve Drenner", austinEmployer: "Drenner Group", stateEmployer: "Drenner Group PC" },
  { name: "Amanda Morrow", austinEmployer: "Drenner Group", stateEmployer: "Drenner Group PC" },
  { name: "Kelly Wright", austinEmployer: "Drenner Group", stateEmployer: "Drenner Group PC" },
  { name: "Andrew Linseisen", austinEmployer: "Drenner Group", stateEmployer: "Drenner Group PC" },
];

const austinCitation = {
  reportInfoIdent: "ATX-LOBBY-REGISTRANTS-2025",
  url: AUSTIN_REGISTRANTS,
  rowSummary:
    "City of Austin Registered Lobbyists, dataset 58ix-34ma; 320 currently registered city lobbyists.",
};

const tecCitation = {
  reportInfoIdent: "TEC-LOBBY-REG-2025",
  url: TEC_LOBBY,
  rowSummary:
    "Texas Ethics Commission, 2025 Registered Lobbyists (Excel); the state lobby register, ~1,800 active registrations.",
};

// Question reframed for the home page: "who quietly works both sides" is
// the rabbit-hole frame; "Austin city lobbyists also lobby the state
// legislature" was the technocratic frame. The cross-tier reveal lands the
// same way in the lede.
export const a3CrossTier: HeroInvestigation = {
  id: "a3-cross-tier",
  question: "Who quietly works both Austin City Hall and the Texas Capitol?",
  pillLabel: "Twelve cross-tier lobbyists",
  tags: ["lobby", "austin", "tec-state", "cross-tier", "fuzzy-join"],
  searchAliases: [
    "Austin city lobbyists",
    "Texas state lobbyists",
    "cross-tier lobby",
    "Demetrius McDaniel",
    "Drenner Group",
  ],
  steps: [
    {
      kind: "emit",
      event: {
        type: "plan_started",
        question: "Who quietly works both Austin City Hall and the Texas Capitol?",
      },
      delayAfterMs: 350,
    },
    {
      kind: "emit",
      event: {
        type: "plan_step",
        id: "p1",
        description: "Pull the Austin city lobbyist registry and the TEC state lobby registry for 2025.",
      },
      delayAfterMs: 200,
    },
    {
      kind: "emit",
      event: {
        type: "tool_call",
        stepId: "p1",
        tool: "get_lobby_registry",
        args: { jurisdictions: ["austin", "tec_state"], year: 2025 },
      },
      delayAfterMs: 700,
    },
    {
      kind: "emit",
      event: {
        type: "tool_result",
        stepId: "p1",
        rowCount: 320 + 1_800,
        sample: [
          { jurisdiction: "austin", count: 320 },
          { jurisdiction: "tec_state", count: 1_800 },
        ],
        sourceRows: [austinCitation.reportInfoIdent, tecCitation.reportInfoIdent],
      },
      delayAfterMs: 300,
    },
    {
      kind: "emit",
      event: {
        type: "plan_step",
        id: "p2",
        description:
          "City and state IDs are in different namespaces — fuzzy-match on names and confirm overlapping employers.",
      },
      delayAfterMs: 200,
    },
    {
      kind: "emit",
      event: {
        type: "tool_call",
        stepId: "p2",
        tool: "cross_reference_lobby",
        args: { left: "austin", right: "tec_state", year: 2025, threshold: 0.85 },
      },
      delayAfterMs: 800,
    },
    {
      kind: "emit",
      event: {
        type: "tool_result",
        stepId: "p2",
        rowCount: matches.length,
        sample: matches.slice(0, 6),
        sourceRows: [austinCitation.reportInfoIdent, tecCitation.reportInfoIdent],
      },
      delayAfterMs: 350,
    },
    {
      kind: "emit",
      event: {
        type: "narrative_chunk",
        role: "headline",
        text: "Twelve lobbyists work both sides: the city register and the Capitol register, in 2025.",
        citations: [austinCitation],
      },
      delayAfterMs: 600,
    },
    {
      kind: "emit",
      event: {
        type: "narrative_chunk",
        role: "lede",
        text: `Twelve people are confirmed lobbying both the City of Austin and the Texas state legislature in 2025: Demetrius McDaniel (Greenberg Traurig), Kathleen Mitchell, Ana Husted, Ryan Hanretty, Madison Gessner, Stefanie Sass, Jerry Philips, Elizabeth Hadley, and four registrants from the Drenner Group — Steve Drenner, Amanda Morrow, Kelly Wright, and Andrew Linseisen. The cross-jurisdiction view is what makes them visible as a single set; neither registry on its own does.`,
        citations: [austinCitation, tecCitation],
      },
      delayAfterMs: 800,
    },
    {
      kind: "emit",
      event: {
        type: "narrative_chunk",
        role: "methods",
        text: `Austin's REGISTRANT_ID and the TEC FilerID are different number spaces; the join is a fuzzy name match plus employer agreement at a 0.85 confidence floor. Twelve names cleared the bar without ambiguity in 2025; lower-confidence matches are deliberately excluded from this view.`,
        citations: [austinCitation, tecCitation],
      },
      delayAfterMs: 700,
    },
    {
      kind: "emit",
      event: { type: "graph_node", id: "city", label: "Austin City Hall", kind: "client", sublabel: "city lobby register" },
      delayAfterMs: 150,
    },
    {
      kind: "emit",
      event: { type: "graph_node", id: "state", label: "Texas Capitol", kind: "client", sublabel: "TEC state lobby register" },
      delayAfterMs: 150,
    },
    ...matches.slice(0, 6).flatMap((m, i) => [
      {
        kind: "emit" as const,
        event: {
          type: "graph_node" as const,
          id: `m-${i}`,
          label: m.name,
          kind: "lobbyist" as const,
          sublabel: m.austinEmployer,
          // Only McDaniel has a baked profile right now; the rest stay
          // unlinked rather than route to a 404.
          profileSlug: m.name === "Demetrius McDaniel" ? "demetrius-mcdaniel" : undefined,
        },
        delayAfterMs: 100,
      },
      {
        kind: "emit" as const,
        event: { type: "graph_edge" as const, from: `m-${i}`, to: "city", label: "registers", weight: 1 },
        delayAfterMs: 50,
      },
      {
        kind: "emit" as const,
        event: { type: "graph_edge" as const, from: `m-${i}`, to: "state", label: "registers", weight: 1 },
        delayAfterMs: 50,
      },
    ]),
    {
      kind: "emit",
      event: {
        type: "narrative_chunk",
        role: "body",
        text: `The Drenner Group cluster is the densest single firm in the join: four registrants in 2025 with parallel municipal-question filings on real-estate development and parallel state-level subject-matter filings.`,
        citations: [austinCitation, tecCitation],
      },
      delayAfterMs: 700,
    },
    {
      kind: "emit",
      event: {
        type: "narrative_chunk",
        role: "reading_note",
        text: `Registration alone is not a description of activity. Each of these registrants files quarterly reports describing what they lobbied on; the cross-jurisdiction view is the entry point, not the conclusion. The full subject-matter rollup per registrant is one tool call away.`,
        citations: [tecCitation],
      },
      delayAfterMs: 500,
    },
    {
      kind: "emit",
      event: {
        type: "investigation_complete",
        topDonors: matches.map((m, i) => ({
          rank: i + 1,
          donor: m.name,
          rolledEmployer: m.austinEmployer === m.stateEmployer ? m.austinEmployer : `${m.austinEmployer} / ${m.stateEmployer}`,
          contributions: 0,
          total: 0,
          citation: i % 2 === 0 ? austinCitation : tecCitation,
        })),
      },
      delayAfterMs: 600,
    },
    // Read-next pick: the natural follow-up to a register-overlap is the
    // donor side of the same names. Do any of these dual-tier lobbyists
    // also write checks to the officials they're paid to influence?
    {
      kind: "emit",
      event: {
        type: "read_next",
        question: "Do any of these lobbyists also donate to the officials they lobby?",
        kicker: "FROM REGISTER TO DONOR",
        rationale:
          "Twelve names appear on both city and state lobby registers. The next step joins the donor file: a registrant who also gives to the people they're paid to influence is a different story from one who doesn't.",
      },
      delayAfterMs: 0,
    },
  ],
};

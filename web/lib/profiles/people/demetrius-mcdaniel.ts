import type { Profile } from "../types";

const AUSTIN_REG = "https://data.austintexas.gov/d/58ix-34ma";
const TEC_LOBBY = "https://www.ethics.state.tx.us/data/search/lobby/2025/2025RegisteredLobbyists.xlsx";

const austinCitation = {
  reportInfoIdent: "ATX-LOBBY-MCDANIEL-2025",
  url: AUSTIN_REG,
  rowSummary:
    "City of Austin Registered Lobbyists 2025; Demetrius McDaniel, employer Greenberg Traurig LLP.",
};

const tecCitation = {
  reportInfoIdent: "TEC-LOBBY-MCDANIEL-2025",
  url: TEC_LOBBY,
  rowSummary:
    "Texas Ethics Commission 2025 Registered Lobbyists; Demetrius McDaniel, employer Greenberg Traurig LLP.",
};

export const demetriusMcDaniel: Profile = {
  slug: "demetrius-mcdaniel",
  name: "Demetrius McDaniel",
  kind: "lobbyist",
  role: "Cross-tier lobbyist · Greenberg Traurig LLP",
  jurisdiction: "austin",
  aliases: ["McDaniel", "Demetrius D. McDaniel"],
  bio: {
    text: "Demetrius McDaniel is one of the small, named set of lobbyists registered in 2025 to lobby both the City of Austin and the Texas State Legislature. He files under Greenberg Traurig LLP in both registries; the city REGISTRANT_ID and the TEC FilerID are different numbers in different namespaces, joined here through fuzzy name match plus matching employer.",
    citations: [austinCitation, tecCitation],
  },
  stats: [
    {
      label: "City lobby register",
      value: "Austin · Greenberg Traurig",
      citation: austinCitation,
    },
    {
      label: "State lobby register",
      value: "Texas · Greenberg Traurig",
      citation: tecCitation,
    },
  ],
  sections: [
    {
      kind: "lobby_ties",
      title: "2025 registrations",
      rows: [
        {
          counterpartyName: "City of Austin",
          role: "registered city lobbyist",
          subject: "various municipal questions; see quarterly reports",
          citation: austinCitation,
        },
        {
          counterpartyName: "Texas Legislature",
          role: "registered state lobbyist",
          subject: "various state subject matters; see TEC subject matter file",
          citation: tecCitation,
        },
      ],
    },
    {
      kind: "narrative",
      title: "What this lookup actually tells you",
      chunks: [
        {
          id: 1,
          text: "Cross-tier registration on its own is not a description of activity. Each registrant files quarterly reports describing what they actually lobbied on; the cross-jurisdiction join is the entry point, not the conclusion.",
          citations: [austinCitation, tecCitation],
        },
      ],
    },
  ],
  network: {
    nodes: [
      { id: "mcdaniel", label: "Demetrius McDaniel", kind: "lobbyist", sublabel: "Greenberg Traurig", profileSlug: "demetrius-mcdaniel" },
      { id: "greenberg", label: "Greenberg Traurig LLP", kind: "employer" },
      { id: "city", label: "Austin City Hall", kind: "client", sublabel: "city lobby register" },
      { id: "state", label: "Texas Capitol", kind: "client", sublabel: "TEC state lobby register" },
    ],
    edges: [
      { from: "mcdaniel", to: "greenberg", label: "employed by", weight: 1, citation: austinCitation },
      { from: "mcdaniel", to: "city", label: "registers", weight: 1, citation: austinCitation },
      { from: "mcdaniel", to: "state", label: "registers", weight: 1, citation: tecCitation },
    ],
  },
  related: [
    { slug: "endeavor-real-estate", name: "Endeavor Real Estate Group", role: "Lobby client cluster" },
  ],
  defaultQuestion:
    "Do Austin's lobbyists also work the state capitol?",
};

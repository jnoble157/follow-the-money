// Profile pages are aggregations over the same source rows that drive
// investigations. Every claim carries a Citation, AGENTS.md §1.

import type {
  Citation,
  DonorRow,
  GraphNodeKind,
} from "@/lib/investigations/types";
import type {
  GraphEdgeView,
  GraphNodeView,
  NarrativeChunk,
} from "@/lib/investigations/state";

export type ProfileKind =
  | "official"   // sitting public official
  | "candidate"  // ran or is running for office
  | "lobbyist"   // registered lobbyist
  | "firm"       // employer / lobby client
  | "pac";       // committee

export type Jurisdiction = "austin" | "tx_state" | "tx_federal";

// Stats surfaced on the home-page officials table. Built by
// scripts/ingest/build_manifests.py from Parquet and merged with the
// registry entry.
export type OfficialWithStats = {
  slug: string;
  name: string;
  role: string;
  jurisdiction: Jurisdiction;
  donationCount: number;
  totalRaised: number;
  avgDonation: number;
  yearsActive: number;
  source: Citation;
  topOrganizationDonors: OfficialDonorLink[];
};

export type OfficialDonorLink = {
  displayName: string;
  donorSlug?: string;
  total: number;
  contributionCount: number;
  source: Citation;
};

export type OfficialDetail = OfficialWithStats & {
  aliases: string[];
};

export type DonorRecipient = {
  recipient: string;
  total: number;
  contributionCount: number;
  source: Citation;
  recipientSlug?: string;
  recipientRole?: string;
  recipientJurisdiction?: Jurisdiction;
};

export type DonorYearlyTotal = {
  year: number;
  total: number;
  contributionCount: number;
  source: Citation;
};

export type DonorSummary = {
  slug: string;
  displayName: string;
  donorType: "individual" | "organization";
  totalGiven: number;
  contributionCount: number;
  avgContribution: number;
  primaryEmployer: string | null;
  primaryCity: string | null;
  primaryZip: string;
  yearsActive: number;
  source: Citation;
};

export type DonorWithStats = DonorSummary & {
  topRecipients: DonorRecipient[];
  yearlyTotals: DonorYearlyTotal[];
  employerVariants: string[];
};

export type ProfileStat = {
  label: string;
  value: string;
  citation: Citation;
};

export type ExpenditureRow = {
  rank: number;
  payee: string;
  description: string;
  amount: number;
  date?: string; // ISO yyyy-mm-dd; presentation layer formats
  citation: Citation;
};

export type LobbyTieRow = {
  // Either the lobbyist or the client side, depending on which profile owns
  // the section. The renderer is agnostic.
  counterpartyName: string;
  // For a firm/PAC profile: the registrant's name. For a lobbyist profile:
  // the client's name. Always required so the table reads either way.
  role: string; // "lobbyist for", "registered subject", "employer of record"
  subject?: string;
  citation: Citation;
};

export type ProfileSection =
  | { kind: "top_donors"; title: string; rows: DonorRow[] }
  | { kind: "top_expenditures"; title: string; rows: ExpenditureRow[] }
  | { kind: "lobby_ties"; title: string; rows: LobbyTieRow[] }
  | { kind: "narrative"; title: string; chunks: NarrativeChunk[] };

export type ProfileNetwork = {
  // Same shape as the investigation graph so we can reuse the renderer.
  // Nodes whose `profileSlug` is set become click-throughs to other profiles.
  nodes: GraphNodeView[];
  edges: GraphEdgeView[];
};

export type RelatedProfileRef = {
  slug: string;
  // Cached display values so the chip can render without resolving the
  // related profile. Both populate at registry-build time.
  name: string;
  role?: string;
};

export type Profile = {
  slug: string;
  name: string;
  kind: ProfileKind;
  role?: string;
  jurisdiction?: Jurisdiction;
  // Aliases the search classifier matches against in addition to the name.
  // Useful for "Mayor Watson" → "Kirk Watson", "Endeavor" → "Endeavor Real Estate Group".
  aliases?: string[];
  bio: { text: string; citations: Citation[] };
  stats: ProfileStat[];
  sections: ProfileSection[];
  network: ProfileNetwork;
  related: RelatedProfileRef[];
  defaultQuestion?: string;
  // For honest "no data" placeholder profiles (federal officials, etc.). When
  // set, the renderer collapses to a refusal block instead of the full page.
  noDataReason?: string;
};

// Re-export so callers don't import from two places when constructing profiles.
export type { GraphNodeKind };

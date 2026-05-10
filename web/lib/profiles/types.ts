// Profile pages are aggregations over the same source rows that drive
// investigations. Every claim carries a Citation, AGENTS.md §1.

import type {
  Citation,
  GraphNodeKind,
} from "@/lib/investigations/types";
import type {
  GraphEdgeView,
  GraphNodeView,
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
  partyAffiliation?: PartyAffiliation;
  donationCount: number;
  totalRaised: number;
  avgDonation: number;
  yearsActive: number;
  source: Citation;
  topOrganizationDonors: OfficialDonorLink[];
};

export type PartyAffiliation = {
  label: string;
  shortLabel: string;
  source: Citation;
};

export type OfficialDonorLink = {
  displayName: string;
  donorSlug?: string;
  total: number;
  contributionCount: number;
  source: Citation;
};

export type OfficialBio = {
  slug: string;
  text: string;
  model: string;
  grounding: "manual" | "model_knowledge" | "web_search";
  sources: {
    title: string;
    url: string;
  }[];
  generatedAt: string;
};

export type OfficialDetail = OfficialWithStats & {
  aliases: string[];
  bio?: OfficialBio;
};

export type DonorRecipient = {
  recipient: string;
  total: number;
  contributionCount: number;
  source: Citation;
  recipientSlug?: string;
  recipientRole?: string;
  recipientJurisdiction?: Jurisdiction;
  recipientFilerType?: string;
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

export type ProfileNetwork = {
  // Same shape as the investigation graph so we can reuse the renderer.
  // `profileSlug` targets profile pages; `href` is for donor pages and other
  // non-profile routes the static graph knows exactly.
  nodes: GraphNodeView[];
  edges: GraphEdgeView[];
};

// Re-export so callers don't import from two places when constructing profiles.
export type { GraphNodeKind };

import type { Citation } from "./schemas/index.ts";

// Source-row identifiers and their resolution to public-records URLs. We
// don't store full URLs in the Parquet files — the citation helper builds
// them from the row's TRANSACTION_ID (Austin) or FilerID (TEC) so the rule
// "every numeric claim is one click from the original filing" stays cheap.

const AUSTIN_CONTRIBS_DATASET = "https://data.austintexas.gov/d/3kfv-biw6";
const AUSTIN_EXPEND_DATASET = "https://data.austintexas.gov/d/gd3e-xut2";
const AUSTIN_LOBBY_REGISTRANTS = "https://data.austintexas.gov/d/58ix-34ma";
const AUSTIN_LOBBY_CLIENTS = "https://data.austintexas.gov/d/7ena-g23u";
const TEC_LOBBY_LANDING = "https://www.ethics.state.tx.us/search/lobby/";

export function austinContributionCitation(args: {
  transactionId: string;
  donor: string;
  recipient: string;
  amount: number;
  date?: string;
}): Citation {
  return {
    reportInfoIdent: args.transactionId,
    url: `${AUSTIN_CONTRIBS_DATASET}?row=${encodeURIComponent(args.transactionId)}`,
    rowSummary:
      `Austin City Clerk campaign finance, contribution: ${args.donor} -> ${args.recipient}, ` +
      `$${args.amount.toLocaleString("en-US")}` +
      (args.date ? `, ${args.date}` : "") +
      ".",
  };
}

export function austinExpenditureCitation(args: {
  transactionId: string;
  paidBy: string;
  payee: string;
  amount: number;
  date?: string;
  description?: string;
}): Citation {
  const desc = args.description ? ` (${args.description})` : "";
  return {
    reportInfoIdent: args.transactionId,
    url: `${AUSTIN_EXPEND_DATASET}?row=${encodeURIComponent(args.transactionId)}`,
    rowSummary:
      `Austin City Clerk campaign finance, expenditure: ${args.paidBy} -> ${args.payee}, ` +
      `$${args.amount.toLocaleString("en-US")}` +
      (args.date ? `, ${args.date}` : "") +
      desc +
      ".",
  };
}

export function austinLobbyRegistrantCitation(args: {
  registrantId: string;
  fullName: string;
  employer: string;
}): Citation {
  return {
    reportInfoIdent: `ATX-LOBBY-REG-${args.registrantId}`,
    url: AUSTIN_LOBBY_REGISTRANTS,
    rowSummary:
      `Austin city lobbyist registry, REGISTRANT_ID ${args.registrantId}: ${args.fullName} (${args.employer}).`,
  };
}

export function austinLobbyClientCitation(args: {
  clientId: string;
  clientName: string;
  business: string;
}): Citation {
  return {
    reportInfoIdent: `ATX-LOBBY-CLIENT-${args.clientId}`,
    url: AUSTIN_LOBBY_CLIENTS,
    rowSummary:
      `Austin city lobby client ${args.clientId}: ${args.clientName} — ${args.business}.`,
  };
}

export function tecLobbyRegistrationCitation(args: {
  filerId: string;
  filerName: string;
  business: string;
  year: string;
}): Citation {
  return {
    reportInfoIdent: `TEC-LOBBY-${args.year}-${args.filerId}`,
    url: TEC_LOBBY_LANDING,
    rowSummary:
      `TEC ${args.year} lobby registration, FilerID ${args.filerId}: ${args.filerName} (${args.business}).`,
  };
}

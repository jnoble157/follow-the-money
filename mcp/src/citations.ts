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
// TEC's per-report PDF deep link. reportInfoIdent is the documentID in their
// CFIS system. The page renders the original report PDF; our citation hands
// the user straight to the source filing.
const TEC_REPORT_DOC = "https://www.ethics.state.tx.us/dfs/loadDoc.cfm";
const TEC_CF_SEARCH = "https://www.ethics.state.tx.us/search/cf/";

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

export function tecContributionCitation(args: {
  reportInfoIdent: string;
  filerName: string;
  contributor: string;
  amount: number;
  date?: string | null;
}): Citation {
  // reportInfoIdent left-pads to 11 digits per the TEC schema. We strip
  // padding before the URL because the dfs/loadDoc.cfm endpoint accepts the
  // unpadded numeric form, but we keep the padded value on
  // reportInfoIdent so it round-trips to the citation registry verbatim.
  const docId = String(args.reportInfoIdent).replace(/^0+/, "") || "0";
  return {
    reportInfoIdent: String(args.reportInfoIdent),
    url: `${TEC_REPORT_DOC}?documentID=${encodeURIComponent(docId)}`,
    rowSummary:
      `TEC campaign-finance report ${args.reportInfoIdent}, contribution to ${args.filerName} from ${args.contributor}: ` +
      `$${args.amount.toLocaleString("en-US")}` +
      (args.date ? `, ${args.date}` : "") +
      ".",
  };
}

export function tecExpenditureCitation(args: {
  reportInfoIdent: string;
  filerName: string;
  payee: string;
  amount: number;
  date?: string | null;
  description?: string | null;
}): Citation {
  const docId = String(args.reportInfoIdent).replace(/^0+/, "") || "0";
  const desc = args.description ? ` (${args.description})` : "";
  return {
    reportInfoIdent: String(args.reportInfoIdent),
    url: `${TEC_REPORT_DOC}?documentID=${encodeURIComponent(docId)}`,
    rowSummary:
      `TEC campaign-finance report ${args.reportInfoIdent}, expenditure by ${args.filerName} to ${args.payee}: ` +
      `$${args.amount.toLocaleString("en-US")}` +
      (args.date ? `, ${args.date}` : "") +
      desc +
      ".",
  };
}

export function tecFilerCitation(args: {
  filerIdent: string;
  filerName: string;
  filerTypeCd?: string | null;
}): Citation {
  const t = args.filerTypeCd ? ` (${args.filerTypeCd})` : "";
  return {
    reportInfoIdent: `TEC-FILER-${args.filerIdent}`,
    url: `${TEC_CF_SEARCH}?Filer_ID=${encodeURIComponent(args.filerIdent)}`,
    rowSummary:
      `Texas Ethics Commission filer index, filerIdent ${args.filerIdent}: ${args.filerName}${t}.`,
  };
}

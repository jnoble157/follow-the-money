import type { Citation } from "./schemas/index.ts";

// Source-row identifiers and their resolution to public-records URLs. We
// don't store full URLs in the Parquet files; the citation helper builds
// them from the row's TRANSACTION_ID (Austin) or reportInfoIdent (TEC).

const AUSTIN_CONTRIBS_DATASET = "https://data.austintexas.gov/d/3kfv-biw6";
const AUSTIN_EXPEND_DATASET = "https://data.austintexas.gov/d/gd3e-xut2";
const AUSTIN_LOBBY_REGISTRANTS = "https://data.austintexas.gov/d/58ix-34ma";
const AUSTIN_LOBBY_CLIENTS = "https://data.austintexas.gov/d/7ena-g23u";
const TEC_LOBBY_LANDING = "https://www.ethics.state.tx.us/search/lobby/";
const TEC_REPORT_VIEWER =
  "https://jasper.ethics.state.tx.us/jasperserver-pro/flow.html";
const TEC_REPORT_UNIT = "/public/publicData/datasource/CFS/By_Report_Number";
// TEC's public search page generates this same pre-auth shape in
// SimpleVisual.js. It carries only the PUBLIC2 viewer account; without it,
// direct report-number links land on Jasper's login page.
const TEC_PUBLIC_TOKEN =
  "u=PUBLIC2|expireTime=Thu Jan 01 2099 00:00:00 GMT-0600 (Central Standard Time)";
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
  const docId = String(args.reportInfoIdent).replace(/^0+/, "") || "0";
  return {
    reportInfoIdent: String(args.reportInfoIdent),
    url: tecReportUrl(docId),
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
    url: tecReportUrl(docId),
    rowSummary:
      `TEC campaign-finance report ${args.reportInfoIdent}, expenditure by ${args.filerName} to ${args.payee}: ` +
      `$${args.amount.toLocaleString("en-US")}` +
      (args.date ? `, ${args.date}` : "") +
      desc +
      ".",
  };
}

function tecReportUrl(reportInfoIdent: string): string {
  const params = new URLSearchParams({
    "tec-pp": TEC_PUBLIC_TOKEN,
    _flowId: "viewReportFlow",
    reportUnit: TEC_REPORT_UNIT,
    Report_ident: reportInfoIdent,
  });
  return `${TEC_REPORT_VIEWER}?${params.toString()}`;
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

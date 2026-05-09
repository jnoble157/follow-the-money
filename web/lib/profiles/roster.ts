import type { DonorSummary, Jurisdiction, OfficialWithStats } from "./types";

export type SortKey = "name" | "count" | "total" | "avg" | "yearsActive";
export type SortDir = "desc" | "asc";
export type EntityTab = "officials" | "donors";
export type JurisdictionFilter = "all" | Jurisdiction;
export type DonorTypeFilter = "organization" | "individual" | "all";

export type RosterPage<T> = {
  page: number;
  perPage: number;
  rowCount: number;
  totalPages: number;
  start: number;
  rows: T[];
};

export type ProfileRosterResult =
  | ({ kind: "officials" } & RosterPage<OfficialWithStats>)
  | ({ kind: "donors" } & RosterPage<DonorSummary>);

export function filterOfficials(
  rows: OfficialWithStats[],
  jurisdiction: JurisdictionFilter,
  query: string,
): OfficialWithStats[] {
  const q = query.trim().toLowerCase();
  return rows.filter((o) => {
    if (jurisdiction !== "all" && o.jurisdiction !== jurisdiction) return false;
    if (!q) return true;
    return o.name.toLowerCase().includes(q);
  });
}

export function filterDonors(
  rows: DonorSummary[],
  donorType: DonorTypeFilter,
  query: string,
): DonorSummary[] {
  const q = query.trim().toLowerCase();
  return rows.filter((d) => {
    if (donorType !== "all" && d.donorType !== donorType) return false;
    if (!q) return true;
    return (
      d.displayName.toLowerCase().includes(q) ||
      (d.primaryEmployer?.toLowerCase().includes(q) ?? false)
    );
  });
}

export function sortOfficials(
  rows: OfficialWithStats[],
  key: SortKey | null,
  dir: SortDir,
): OfficialWithStats[] {
  const sorted = [...rows];
  if (!key) {
    sorted.sort((a, b) =>
      b.totalRaised !== a.totalRaised
        ? b.totalRaised - a.totalRaised
        : a.name.localeCompare(b.name),
    );
    return sorted;
  }
  sorted.sort((a, b) => {
    if (key === "name") return compareText(a.name, b.name, dir);
    const diff = officialNumber(a, key) - officialNumber(b, key);
    if (diff !== 0) return dir === "asc" ? diff : -diff;
    if (b.totalRaised !== a.totalRaised) return b.totalRaised - a.totalRaised;
    return a.name.localeCompare(b.name);
  });
  return sorted;
}

export function sortDonors(
  rows: DonorSummary[],
  key: SortKey | null,
  dir: SortDir,
): DonorSummary[] {
  const sorted = [...rows];
  if (!key) {
    sorted.sort((a, b) =>
      b.totalGiven !== a.totalGiven
        ? b.totalGiven - a.totalGiven
        : a.displayName.localeCompare(b.displayName),
    );
    return sorted;
  }
  sorted.sort((a, b) => {
    if (key === "name") return compareText(a.displayName, b.displayName, dir);
    const diff = donorNumber(a, key) - donorNumber(b, key);
    if (diff !== 0) return dir === "asc" ? diff : -diff;
    if (b.totalGiven !== a.totalGiven) return b.totalGiven - a.totalGiven;
    return a.displayName.localeCompare(b.displayName);
  });
  return sorted;
}

export function pageRows<T>(
  rows: T[],
  requestedPage: number,
  perPage: number,
): RosterPage<T> {
  const rowCount = rows.length;
  const totalPages = Math.max(1, Math.ceil(rowCount / perPage));
  const page = Math.min(Math.max(1, requestedPage), totalPages);
  const start = (page - 1) * perPage;
  return {
    page,
    perPage,
    rowCount,
    totalPages,
    start,
    rows: rows.slice(start, start + perPage),
  };
}

function officialNumber(row: OfficialWithStats, key: SortKey): number {
  switch (key) {
    case "count":
      return row.donationCount;
    case "total":
      return row.totalRaised;
    case "avg":
      return row.avgDonation;
    case "yearsActive":
      return row.yearsActive;
    case "name":
      return 0;
  }
}

function donorNumber(row: DonorSummary, key: SortKey): number {
  switch (key) {
    case "count":
      return row.contributionCount;
    case "total":
      return row.totalGiven;
    case "avg":
      return row.avgContribution;
    case "yearsActive":
      return row.yearsActive;
    case "name":
      return 0;
  }
}

function compareText(a: string, b: string, dir: SortDir): number {
  const cmp = a.localeCompare(b);
  return dir === "asc" ? cmp : -cmp;
}

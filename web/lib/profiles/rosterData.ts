import {
  listDonorsWithStats,
  listOfficialsWithStats,
} from "./registry";
import {
  filterDonors,
  filterOfficials,
  pageRows,
  sortDonors,
  sortOfficials,
  type DonorTypeFilter,
  type EntityTab,
  type JurisdictionFilter,
  type ProfileRosterResult,
  type SortDir,
  type SortKey,
} from "./roster";

export type RosterRead = {
  kind: EntityTab;
  page: number;
  perPage: number;
  sortKey: SortKey | null;
  sortDir: SortDir;
  query: string;
  jurisdiction: JurisdictionFilter;
  donorType: DonorTypeFilter;
};

export function readProfileRoster(args: RosterRead): ProfileRosterResult {
  if (args.kind === "officials") {
    const rows = sortOfficials(
      filterOfficials(listOfficialsWithStats(), args.jurisdiction, args.query),
      args.sortKey,
      args.sortDir,
    );
    return { kind: "officials", ...pageRows(rows, args.page, args.perPage) };
  }

  const rows = sortDonors(
    filterDonors(listDonorsWithStats(), args.donorType, args.query),
    args.sortKey,
    args.sortDir,
  );
  return { kind: "donors", ...pageRows(rows, args.page, args.perPage) };
}

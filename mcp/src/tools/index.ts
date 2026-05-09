import { findFiler } from "./find_filer.ts";
import { topDonors } from "./top_donors.ts";
import { topPacs } from "./top_pacs.ts";
import { getContributions } from "./get_contributions.ts";
import { getExpenditures } from "./get_expenditures.ts";
import { clusterEmployerVariants } from "./cluster_employer_variants.ts";
import { crossReferenceLobby } from "./cross_reference_lobby.ts";

export const TOOLS = [
  findFiler,
  topDonors,
  topPacs,
  getContributions,
  getExpenditures,
  clusterEmployerVariants,
  crossReferenceLobby,
] as const;

export type ToolName = (typeof TOOLS)[number]["name"];

export function getTool(name: string) {
  return TOOLS.find((t) => t.name === name);
}

export {
  findFiler,
  topDonors,
  topPacs,
  getContributions,
  getExpenditures,
  clusterEmployerVariants,
  crossReferenceLobby,
};

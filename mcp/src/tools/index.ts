import { findFiler } from "./find_filer.ts";
import { topDonors } from "./top_donors.ts";
import { topPacs } from "./top_pacs.ts";
import { getContributions } from "./get_contributions.ts";
import { getExpenditures } from "./get_expenditures.ts";
import { clusterEmployerVariants } from "./cluster_employer_variants.ts";
import { crossReferenceLobby } from "./cross_reference_lobby.ts";
import { findStateFiler } from "./find_state_filer.ts";
import { topStateDonors } from "./top_state_donors.ts";
import { getStateContributions } from "./get_state_contributions.ts";
import { getStateExpenditures } from "./get_state_expenditures.ts";

export const TOOLS = [
  findFiler,
  topDonors,
  topPacs,
  getContributions,
  getExpenditures,
  clusterEmployerVariants,
  crossReferenceLobby,
  findStateFiler,
  topStateDonors,
  getStateContributions,
  getStateExpenditures,
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
  findStateFiler,
  topStateDonors,
  getStateContributions,
  getStateExpenditures,
};

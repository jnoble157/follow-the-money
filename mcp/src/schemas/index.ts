import { z } from "zod";

// Shared shapes used by every tool's result. Hard rule from AGENTS.md §1:
// every result row carries a Citation pointing at the underlying TEC or
// City of Austin filing. The agent's narrative cites these reportInfoIdent
// values; the front end renders the URL behind a popover.

export const Citation = z.object({
  reportInfoIdent: z.string().min(1),
  url: z.string().url(),
  rowSummary: z.string().min(1),
});
export type Citation = z.infer<typeof Citation>;

// Confidence is on [0, 1]. Tools that perform fuzzy work (filer match,
// employer cluster, cross-jurisdiction join) return this so the agent can
// decide whether to ask the user before proceeding (system prompt rule).
export const Confidence = z.number().min(0).max(1);

export const Jurisdiction = z.enum(["austin", "tec_state"]);
export type Jurisdiction = z.infer<typeof Jurisdiction>;

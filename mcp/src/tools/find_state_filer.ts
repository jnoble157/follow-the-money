import { z } from "zod";
import { query } from "../db/connect.ts";
import { confidence, nameWhere } from "../db/names.ts";
import { Citation, Confidence } from "../schemas/index.ts";
import { tecFilerCitation } from "../citations.ts";
import type { Tool } from "./types.ts";

// TEC counterpart to find_filer. Resolves a free-text name to one or more
// state-level filers — candidates, officeholders, PACs, SPACs — by joining
// the filer index with contribution counts. The agent picks this when the
// question names a Texas state official (Governor, Lt. Gov, AG, Comptroller,
// state legislators) or a state PAC.
//
// Match is order-agnostic: "Kirk Watson" and "Watson, Kirk" both find
// filerIdent 00023391. TEC stores filerName as "LAST, FIRST [TITLE]"
// inside a single column, so a substring match against natural-order
// input would otherwise miss every officeholder. See db/names.ts.

const Args = z.object({
  name: z.string().min(2).max(120),
  // tec uses two-letter codes for filer types (JCOH, CCC, MPAC, GPAC, SPAC,
  // COH, CAND). Optional filter; default is no restriction.
  filerTypeCd: z.string().min(2).max(10).optional(),
  limit: z.number().int().positive().max(20).default(10),
});

const Match = z.object({
  filerIdent: z.string(),
  filerName: z.string(),
  filerTypeCd: z.string().nullable(),
  contributionsCount: z.number().int().nonnegative(),
  totalRaised: z.number().nonnegative(),
  firstSeen: z.string().nullable(),
  lastSeen: z.string().nullable(),
  confidence: Confidence,
  source: Citation,
});
const Result = z.object({
  matches: z.array(Match),
});

type Row = {
  filerIdent: string;
  filerName: string;
  filerTypeCd: string | null;
  n: number;
  total: number | null;
  firstSeen: string | null;
  lastSeen: string | null;
};

async function run(rawArgs: z.input<typeof Args>): Promise<z.infer<typeof Result>> {
  const args = Args.parse(rawArgs);
  const match = nameWhere(["filerName"], args.name);
  if (!match) return { matches: [] };

  // Single grouped query against tec_contributions: joining to tec_filers
  // would just add the same filerName/filerTypeCd we already have on the
  // contribution row. Empirically the contribution table is the source of
  // truth for which filers are actually active.
  const where: string[] = [match.sql];
  const params: Array<string | number> = [...match.params];
  if (args.filerTypeCd) {
    where.push("filerTypeCd = ?");
    params.push(args.filerTypeCd);
  }

  const rows = await query<Row>(
    `
    SELECT
      filerIdent                                 AS filerIdent,
      ANY_VALUE(filerName)                       AS filerName,
      ANY_VALUE(filerTypeCd)                     AS filerTypeCd,
      COUNT(*)::INTEGER                          AS n,
      SUM(TRY_CAST(contributionAmount AS DOUBLE)) AS total,
      MIN(SUBSTR(receivedDt, 1, 4))              AS firstSeen,
      MAX(SUBSTR(receivedDt, 1, 4))              AS lastSeen
    FROM tec_contributions
    WHERE ${where.join(" AND ")}
    GROUP BY filerIdent
    ORDER BY n DESC
    LIMIT ?
    `,
    [...params, args.limit],
  );

  const matches = rows.map((r) =>
    Match.parse({
      filerIdent: r.filerIdent,
      filerName: r.filerName,
      filerTypeCd: r.filerTypeCd,
      contributionsCount: r.n,
      totalRaised: Number(r.total ?? 0),
      firstSeen: r.firstSeen,
      lastSeen: r.lastSeen,
      confidence: confidence(args.name, r.filerName),
      source: tecFilerCitation({
        filerIdent: r.filerIdent,
        filerName: r.filerName,
        filerTypeCd: r.filerTypeCd,
      }),
    }),
  );

  return { matches };
}

export const findStateFiler: Tool<typeof Args, typeof Result> = {
  name: "find_state_filer",
  description:
    "Resolve a free-text name to Texas Ethics Commission state-level filers (candidates, officeholders, PACs, SPACs). Match is order-agnostic: pass natural order ('Kirk Watson') or last-first ('Watson, Kirk') — both resolve to the same filerIdent. Returns ranked candidates with filerIdent, filer-type code, lifetime contribution counts, and confidence. Use this for state-level officials (Governor, AG, state legislators) and state PACs.",
  argsSchema: Args,
  resultSchema: Result,
  run,
};

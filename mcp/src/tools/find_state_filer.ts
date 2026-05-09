import { z } from "zod";
import { distance } from "fastest-levenshtein";
import { query } from "../db/connect.ts";
import { Citation, Confidence } from "../schemas/index.ts";
import { tecFilerCitation } from "../citations.ts";
import type { Tool } from "./types.ts";

// TEC counterpart to find_filer. Resolves a free-text name to one or more
// state-level filers — candidates, officeholders, PACs, SPACs — by joining
// the filer index with contribution counts. The agent picks this when the
// question names a Texas state official (Governor, Lt. Gov, AG, Comptroller,
// state legislators) or a state PAC.

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
  const wildcard = `%${args.name.replace(/[%_]/g, "")}%`;

  // Single grouped query against tec_contributions: joining to tec_filers
  // would just add the same filerName/filerTypeCd we already have on the
  // contribution row. Empirically the contribution table is the source of
  // truth for which filers are actually active.
  const where: string[] = ["filerName ILIKE ?"];
  const params: Array<string | number> = [wildcard];
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

  const target = args.name.toLowerCase();
  const matches = rows.map((r) =>
    Match.parse({
      filerIdent: r.filerIdent,
      filerName: r.filerName,
      filerTypeCd: r.filerTypeCd,
      contributionsCount: r.n,
      totalRaised: Number(r.total ?? 0),
      firstSeen: r.firstSeen,
      lastSeen: r.lastSeen,
      confidence: nameConfidence(target, r.filerName.toLowerCase()),
      source: tecFilerCitation({
        filerIdent: r.filerIdent,
        filerName: r.filerName,
        filerTypeCd: r.filerTypeCd,
      }),
    }),
  );

  return { matches };
}

function nameConfidence(target: string, candidate: string): number {
  if (!target || !candidate) return 0;
  const d = distance(target, candidate);
  const max = Math.max(target.length, candidate.length);
  return Math.max(0, 1 - d / max);
}

export const findStateFiler: Tool<typeof Args, typeof Result> = {
  name: "find_state_filer",
  description:
    "Resolve a free-text name to Texas Ethics Commission state-level filers (candidates, officeholders, PACs, SPACs). Returns ranked candidates with filerIdent, filer-type code, lifetime contribution counts, and confidence. Use this for state-level officials (Governor, AG, state legislators) and state PACs.",
  argsSchema: Args,
  resultSchema: Result,
  run,
};

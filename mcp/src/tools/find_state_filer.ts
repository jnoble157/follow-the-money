import { z } from "zod";
import { query } from "../db/connect.ts";
import { confidence, nameWhere } from "../db/names.ts";
import { Citation, Confidence } from "../schemas/index.ts";
import { tecFilerTotalCitation } from "../citations.ts";
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
  sourceKind: "cover" | "itemized";
  sourceCount: number;
  sourceReportInfoIdent: string;
  sourceAmount: number;
  sourceDate: string | null;
};

async function run(rawArgs: z.input<typeof Args>): Promise<z.infer<typeof Result>> {
  const args = Args.parse(rawArgs);
  const match = nameWhere(["filerName"], args.name);
  if (!match) return { matches: [] };

  // Single grouped query against tec_contributions: joining to tec_filers
  // would just add the same filerName/filerTypeCd we already have on the
  // contribution row. Empirically the contribution table is the source of
  // truth for which filers are actually active.
  const where: string[] = [match.sql, "COALESCE(infoOnlyFlag, '') <> 'Y'"];
  const params: Array<string | number> = [...match.params];
  if (args.filerTypeCd) {
    where.push("filerTypeCd = ?");
    params.push(args.filerTypeCd);
  }

  const rows = await query<Row>(
    `
    WITH itemized_rows AS (
      SELECT
        filerIdent                                  AS filerIdent,
        filerName                                   AS filerName,
        filerTypeCd                                 AS filerTypeCd,
        TRY_CAST(contributionAmount AS DOUBLE)      AS amount,
        NULLIF(TRIM(reportInfoIdent), '')           AS rid,
        contributionDt                              AS dt
      FROM tec_contributions
      WHERE ${where.join(" AND ")}
        AND TRY_CAST(contributionAmount AS DOUBLE) IS NOT NULL
        AND NULLIF(TRIM(reportInfoIdent), '') IS NOT NULL
        AND NOT (
          UPPER(COALESCE(formTypeCd, '')) LIKE '%DAILY%'
          OR UPPER(COALESCE(formTypeCd, '')) LIKE '%SS'
          OR UPPER(COALESCE(schedFormTypeCd, '')) LIKE '%SS'
          OR UPPER(COALESCE(schedFormTypeCd, '')) = 'T-CTR'
        )
        AND UPPER(COALESCE(schedFormTypeCd, '')) IN ('A', 'A1', 'A2', 'AJ1', 'AL', 'AS1', 'AS2', 'C1', 'C2', 'C3', 'C4')
    ),
    itemized AS (
      SELECT
        filerIdent,
        ANY_VALUE(filerName)       AS filerName,
        ANY_VALUE(filerTypeCd)     AS filerTypeCd,
        COUNT(*)::INTEGER          AS n,
        SUM(amount)                AS itemizedTotal,
        MIN(SUBSTR(dt, 1, 4))      AS firstSeen,
        MAX(SUBSTR(dt, 1, 4))      AS lastSeen
      FROM itemized_rows
      GROUP BY filerIdent
    ),
    itemized_largest AS (
      SELECT filerIdent, rid, amount, dt
      FROM (
        SELECT
          filerIdent,
          rid,
          amount,
          dt,
          ROW_NUMBER() OVER (
            PARTITION BY filerIdent
            ORDER BY amount DESC NULLS LAST, rid
          ) AS rn
        FROM itemized_rows
      )
      WHERE rn = 1
    ),
    cover_rows AS (
      SELECT
        filerIdent,
        NULLIF(TRIM(reportInfoIdent), '')           AS rid,
        TRY_CAST(totalContribAmount AS DOUBLE)      AS amount,
        periodEndDt                                 AS dt
      FROM tec_cover_sheet1
      WHERE COALESCE(infoOnlyFlag, '') <> 'Y'
        AND TRY_CAST(totalContribAmount AS DOUBLE) IS NOT NULL
        AND NULLIF(TRIM(reportInfoIdent), '') IS NOT NULL
        AND NOT (
          UPPER(COALESCE(formTypeCd, '')) LIKE '%DAILY%'
          OR UPPER(COALESCE(formTypeCd, '')) LIKE '%SS'
        )
    ),
    cover AS (
      SELECT
        filerIdent,
        COUNT(*)::INTEGER      AS sourceCount,
        SUM(amount)            AS coverTotal,
        MIN(SUBSTR(dt, 1, 4))  AS firstSeen,
        MAX(SUBSTR(dt, 1, 4))  AS lastSeen
      FROM cover_rows
      GROUP BY filerIdent
    ),
    cover_largest AS (
      SELECT filerIdent, rid, amount, dt
      FROM (
        SELECT
          filerIdent,
          rid,
          amount,
          dt,
          ROW_NUMBER() OVER (
            PARTITION BY filerIdent
            ORDER BY amount DESC NULLS LAST, rid
          ) AS rn
        FROM cover_rows
      )
      WHERE rn = 1
    )
    SELECT
      i.filerIdent,
      i.filerName,
      i.filerTypeCd,
      i.n,
      COALESCE(c.coverTotal, i.itemizedTotal) AS total,
      COALESCE(c.firstSeen, i.firstSeen) AS firstSeen,
      COALESCE(c.lastSeen, i.lastSeen) AS lastSeen,
      CASE WHEN c.coverTotal IS NOT NULL THEN 'cover' ELSE 'itemized' END AS sourceKind,
      COALESCE(c.sourceCount, i.n)::INTEGER AS sourceCount,
      COALESCE(cl.rid, il.rid) AS sourceReportInfoIdent,
      COALESCE(cl.amount, il.amount) AS sourceAmount,
      COALESCE(cl.dt, il.dt) AS sourceDate
    FROM itemized i
    LEFT JOIN cover c ON c.filerIdent = i.filerIdent
    LEFT JOIN cover_largest cl ON cl.filerIdent = i.filerIdent
    LEFT JOIN itemized_largest il ON il.filerIdent = i.filerIdent
    ORDER BY i.n DESC
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
      source: tecFilerTotalCitation({
        reportInfoIdent: r.sourceReportInfoIdent,
        filerIdent: r.filerIdent,
        filerName: r.filerName,
        total: Number(r.total ?? 0),
        sourceCount: r.sourceCount,
        sourceKind: r.sourceKind,
        amount: Number(r.sourceAmount ?? 0),
        date: r.sourceDate,
      }),
    }),
  );

  return { matches };
}

export const findStateFiler: Tool<typeof Args, typeof Result> = {
  name: "find_state_filer",
  description:
    "Resolve a free-text name to Texas Ethics Commission state-level filers (candidates, officeholders, PACs, SPACs). Match is order-agnostic: pass natural order ('Kirk Watson') or last-first ('Watson, Kirk') — both resolve to the same filerIdent. Returns ranked candidates with filerIdent, filer-type code, lifetime itemized contribution counts, reported contribution totals from non-superseded cover sheets when available, and confidence. Use this for state-level officials (Governor, AG, state legislators) and state PACs.",
  argsSchema: Args,
  resultSchema: Result,
  run,
};

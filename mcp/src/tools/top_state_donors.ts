import { z } from "zod";
import { query } from "../db/connect.ts";
import { nameWhere } from "../db/names.ts";
import { Citation } from "../schemas/index.ts";
import { tecContributionCitation } from "../citations.ts";
import type { Tool } from "./types.ts";

// TEC counterpart to top_donors. Ranks the largest contributors to a given
// state-level filer over a year window. Donor names come from
// contributorNameOrganization (entities) or last/first (individuals); we
// surface a single normalized donor string per row.
//
// Either filerIdent (preferred — comes from find_state_filer) or filerName
// can be passed. filerIdent is unambiguous; filerName is ILIKE matched.

const Args = z
  .object({
    filerIdent: z.string().min(1).max(120).optional(),
    filerName: z.string().min(2).max(200).optional(),
    cycle: z
      .string()
      .regex(/^\d{4}(-\d{4})?$/)
      .optional(),
    donorScope: z.enum(["individual", "organization", "any"]).default("any"),
    // System prompt caps the rendered table at 5; default to that. The
    // citation registry on the runner side is the long-form view.
    limit: z.number().int().positive().max(50).default(5),
  })
  .refine((v) => v.filerIdent || v.filerName, "filerIdent or filerName required");

const Donor = z.object({
  rank: z.number().int().positive(),
  donor: z.string(),
  donorEmployer: z.string().nullable(),
  donorOccupation: z.string().nullable(),
  contributionsCount: z.number().int().positive(),
  totalAmount: z.number().nonnegative(),
  source: Citation,
});

// When donors comes back empty but the filer is real, this tells the
// agent why: the filer is alive in the data, just outside the cycle the
// agent asked for. Lets the agent decide whether to widen the window or
// narrate the gap honestly instead of bailing with "not in this view."
const FilerActivity = z.object({
  firstYear: z.string().nullable(),
  lastYear: z.string().nullable(),
  totalContributions: z.number().int().nonnegative(),
});

const Result = z.object({
  filer: z.string(),
  cycle: z.string(),
  donors: z.array(Donor),
  // Only populated when donors is empty AND a filer was specified. Null
  // means the filer truly has no contributions in the data; non-null with
  // a year span means the cycle filter eliminated rows that exist
  // elsewhere.
  filerActivity: FilerActivity.nullable().optional(),
});

type Row = {
  donor: string;
  employer: string | null;
  occupation: string | null;
  n: number;
  total: number;
  largestAmount: number;
  largestReportInfoIdent: string;
  largestDate: string | null;
  filerNameAny: string;
};

async function run(rawArgs: z.input<typeof Args>): Promise<z.infer<typeof Result>> {
  const args = Args.parse(rawArgs);
  const [from, to] = parseCycle(args.cycle);
  const where: string[] = [];
  const params: Array<string | number> = [];
  if (args.filerIdent) {
    where.push("filerIdent = ?");
    params.push(args.filerIdent);
  } else if (args.filerName) {
    const m = nameWhere(["filerName"], args.filerName);
    if (!m) {
      return Result.parse({
        filer: args.filerName,
        cycle: args.cycle ?? "",
        donors: [],
      });
    }
    where.push(m.sql);
    params.push(...m.params);
  }
  if (args.donorScope === "individual") {
    where.push("contributorPersentTypeCd = 'INDIVIDUAL'");
  } else if (args.donorScope === "organization") {
    where.push("contributorPersentTypeCd = 'ENTITY'");
  }

  // Two-pass shape mirrors top_donors: rank donors by sum, then attach the
  // largest single contribution as the citation row. The donor key folds
  // ENTITY (org name) vs INDIVIDUAL (last, first) into a single string so
  // grouping is one column.
  const rows = await query<Row>(
    `
    WITH cycle_rows AS (
      SELECT
        CASE
          WHEN contributorPersentTypeCd = 'ENTITY'
            THEN COALESCE(NULLIF(TRIM(contributorNameOrganization), ''), 'Unnamed entity')
          ELSE TRIM(
            COALESCE(contributorNameLast, '') ||
            CASE WHEN contributorNameFirst IS NOT NULL AND TRIM(contributorNameFirst) <> ''
                 THEN ', ' || TRIM(contributorNameFirst) ELSE '' END
          )
        END                                           AS donor,
        NULLIF(TRIM(contributorEmployer), '')         AS employer,
        NULLIF(TRIM(contributorOccupation), '')       AS occupation,
        TRY_CAST(contributionAmount AS DOUBLE)        AS amount,
        reportInfoIdent                               AS rid,
        contributionDt                                AS dt,
        filerName                                     AS filerName
      FROM tec_contributions
      WHERE ${where.join(" AND ")}
        AND TRY_CAST(SUBSTR(contributionDt, 1, 4) AS INTEGER) BETWEEN ? AND ?
        AND TRY_CAST(contributionAmount AS DOUBLE) IS NOT NULL
        AND COALESCE(infoOnlyFlag, '') <> 'Y'
        AND NOT (
          UPPER(COALESCE(formTypeCd, '')) LIKE '%DAILY%'
          OR UPPER(COALESCE(formTypeCd, '')) LIKE '%SS'
          OR UPPER(COALESCE(schedFormTypeCd, '')) LIKE '%SS'
          OR UPPER(COALESCE(schedFormTypeCd, '')) = 'T-CTR'
        )
        AND UPPER(COALESCE(schedFormTypeCd, '')) IN ('A', 'A1', 'A2', 'AJ1', 'AL', 'AS1', 'AS2', 'C1', 'C2', 'C3', 'C4')
    ),
    ranked AS (
      SELECT
        donor,
        ANY_VALUE(employer)   AS employer,
        ANY_VALUE(occupation) AS occupation,
        COUNT(*)::INTEGER     AS n,
        SUM(amount)           AS total,
        MAX(amount)           AS largestAmount,
        ANY_VALUE(filerName)  AS filerNameAny
      FROM cycle_rows
      GROUP BY donor
      HAVING SUM(amount) > 0
    )
    SELECT
      r.donor,
      r.employer,
      r.occupation,
      r.n,
      r.total,
      r.largestAmount,
      r.filerNameAny,
      ANY_VALUE(c.rid) AS largestReportInfoIdent,
      ANY_VALUE(c.dt)  AS largestDate
    FROM ranked r
    JOIN cycle_rows c ON c.donor = r.donor AND c.amount = r.largestAmount
    GROUP BY r.donor, r.employer, r.occupation, r.n, r.total, r.largestAmount, r.filerNameAny
    ORDER BY r.total DESC
    LIMIT ?
    `,
    [...params, from, to, args.limit],
  );

  const donors = rows.map((r, i) =>
    Donor.parse({
      rank: i + 1,
      donor: r.donor,
      donorEmployer: r.employer,
      donorOccupation: r.occupation,
      contributionsCount: r.n,
      totalAmount: Number(r.total),
      source: tecContributionCitation({
        reportInfoIdent: r.largestReportInfoIdent,
        filerName: r.filerNameAny,
        contributor: r.donor,
        amount: Number(r.largestAmount),
        date: r.largestDate,
      }),
    }),
  );

  let filerActivity: z.infer<typeof FilerActivity> | null = null;
  if (donors.length === 0 && (args.filerIdent || args.filerName)) {
    filerActivity = await probeFilerActivity(args);
  }

  return Result.parse({
    filer: args.filerIdent ?? args.filerName ?? "",
    cycle: args.cycle ?? `${from}-${to}`,
    donors,
    filerActivity,
  });
}

async function probeFilerActivity(args: {
  filerIdent?: string;
  filerName?: string;
}): Promise<z.infer<typeof FilerActivity> | null> {
  const where: string[] = [];
  const params: Array<string | number> = [];
  if (args.filerIdent) {
    where.push("filerIdent = ?");
    params.push(args.filerIdent);
  } else if (args.filerName) {
    const m = nameWhere(["filerName"], args.filerName);
    if (!m) return null;
    where.push(m.sql);
    params.push(...m.params);
  } else {
    return null;
  }
  const probe = await query<{
    firstYear: string | null;
    lastYear: string | null;
    totalContributions: number;
  }>(
    `
    SELECT
      MIN(SUBSTR(contributionDt, 1, 4)) AS firstYear,
      MAX(SUBSTR(contributionDt, 1, 4)) AS lastYear,
      COUNT(*)::INTEGER             AS totalContributions
    FROM tec_contributions
    WHERE ${where.join(" AND ")}
      AND COALESCE(infoOnlyFlag, '') <> 'Y'
      AND TRY_CAST(contributionAmount AS DOUBLE) IS NOT NULL
      AND NOT (
        UPPER(COALESCE(formTypeCd, '')) LIKE '%DAILY%'
        OR UPPER(COALESCE(formTypeCd, '')) LIKE '%SS'
        OR UPPER(COALESCE(schedFormTypeCd, '')) LIKE '%SS'
        OR UPPER(COALESCE(schedFormTypeCd, '')) = 'T-CTR'
      )
      AND UPPER(COALESCE(schedFormTypeCd, '')) IN ('A', 'A1', 'A2', 'AJ1', 'AL', 'AS1', 'AS2', 'C1', 'C2', 'C3', 'C4')
    `,
    params,
  );
  const row = probe[0];
  if (!row || row.totalContributions === 0) return null;
  return {
    firstYear: row.firstYear,
    lastYear: row.lastYear,
    totalContributions: row.totalContributions,
  };
}

function parseCycle(cycle: string | undefined): [number, number] {
  if (!cycle) return [1900, 2999];
  const m = cycle.match(/^(\d{4})(?:-(\d{4}))?$/);
  if (!m) return [1900, 2999];
  const lo = Number(m[1]);
  const hi = m[2] ? Number(m[2]) : lo;
  return [lo, hi];
}

export const topStateDonors: Tool<typeof Args, typeof Result> = {
  name: "top_state_donors",
  description:
    "Rank the largest contributors to a TEC state-level filer over a year or cycle. Pass filerIdent (preferred, from find_state_filer) or filerName. Donors fold ENTITY/INDIVIDUAL into a single normalized string. Citations point at the per-report PDF on ethics.state.tx.us.",
  argsSchema: Args,
  resultSchema: Result,
  run,
};

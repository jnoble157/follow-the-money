import { z } from "zod";
import { query } from "../db/connect.ts";
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

const Result = z.object({
  filer: z.string(),
  cycle: z.string(),
  donors: z.array(Donor),
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
    where.push("filerName ILIKE ?");
    params.push(`%${args.filerName.replace(/[%_]/g, "")}%`);
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
        receivedDt                                    AS dt,
        filerName                                     AS filerName
      FROM tec_contributions
      WHERE ${where.join(" AND ")}
        AND TRY_CAST(SUBSTR(receivedDt, 1, 4) AS INTEGER) BETWEEN ? AND ?
        AND TRY_CAST(contributionAmount AS DOUBLE) IS NOT NULL
        AND COALESCE(infoOnlyFlag, '') <> 'Y'
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

  return Result.parse({
    filer: args.filerIdent ?? args.filerName ?? "",
    cycle: args.cycle ?? `${from}-${to}`,
    donors,
  });
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

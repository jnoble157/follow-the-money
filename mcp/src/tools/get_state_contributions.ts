import { z } from "zod";
import { query } from "../db/connect.ts";
import { nameWhere } from "../db/names.ts";
import { Citation } from "../schemas/index.ts";
import { tecContributionCitation } from "../citations.ts";
import type { Tool } from "./types.ts";

// TEC counterpart to get_contributions. Bounded query for the raw rows
// behind a top_state_donors roll-up. At least one of contributor / filer /
// dateRange must be set so we never scan the entire 25-year contribution
// table.

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const Args = z
  .object({
    contributor: z.string().min(2).max(160).optional(),
    filerIdent: z.string().min(1).max(120).optional(),
    filerName: z.string().min(2).max(200).optional(),
    employerLike: z.string().min(2).max(160).optional(),
    dateFrom: z.string().regex(ISO_DATE).optional(),
    dateTo: z.string().regex(ISO_DATE).optional(),
    minAmount: z.number().nonnegative().optional(),
    donorScope: z.enum(["individual", "organization", "any"]).default("any"),
    limit: z.number().int().positive().max(200).default(50),
  })
  .refine(
    (v) =>
      v.contributor ||
      v.filerIdent ||
      v.filerName ||
      v.employerLike ||
      (v.dateFrom && v.dateTo),
    "at least one of contributor, filerIdent, filerName, employerLike, or both dateFrom + dateTo must be set",
  );

const Row = z.object({
  contributor: z.string(),
  filerName: z.string(),
  filerIdent: z.string(),
  employer: z.string().nullable(),
  occupation: z.string().nullable(),
  amount: z.number(),
  date: z.string().nullable(),
  source: Citation,
});

const Result = z.object({
  rows: z.array(Row),
  truncated: z.boolean(),
});

type Raw = {
  contributor: string;
  filerName: string;
  filerIdent: string;
  employer: string | null;
  occupation: string | null;
  amount: number | null;
  dt: string | null;
  rid: string;
};

async function run(rawArgs: z.input<typeof Args>): Promise<z.infer<typeof Result>> {
  const args = Args.parse(rawArgs);
  const where: string[] = ["COALESCE(infoOnlyFlag, '') <> 'Y'"];
  const params: Array<string | number> = [];
  if (args.contributor) {
    const m = nameWhere(
      ["contributorNameOrganization", "contributorNameLast", "contributorNameFirst"],
      args.contributor,
    );
    if (m) { where.push(`(${m.sql})`); params.push(...m.params); }
    else { where.push("1 = 0"); }
  }
  if (args.filerIdent) {
    where.push("filerIdent = ?");
    params.push(args.filerIdent);
  }
  if (args.filerName) {
    const m = nameWhere(["filerName"], args.filerName);
    if (m) { where.push(m.sql); params.push(...m.params); }
    else { where.push("1 = 0"); }
  }
  if (args.employerLike) {
    where.push("contributorEmployer ILIKE ?");
    params.push(`%${args.employerLike.replace(/[%_]/g, "")}%`);
  }
  // receivedDt is yyyyMMdd, no separators. Compare as string.
  if (args.dateFrom) {
    where.push("receivedDt >= ?");
    params.push(args.dateFrom.replace(/-/g, ""));
  }
  if (args.dateTo) {
    where.push("receivedDt <= ?");
    params.push(args.dateTo.replace(/-/g, ""));
  }
  if (args.minAmount !== undefined) {
    where.push("TRY_CAST(contributionAmount AS DOUBLE) >= ?");
    params.push(args.minAmount);
  }
  if (args.donorScope === "individual") {
    where.push("contributorPersentTypeCd = 'INDIVIDUAL'");
  } else if (args.donorScope === "organization") {
    where.push("contributorPersentTypeCd = 'ENTITY'");
  }

  const cap = args.limit + 1;
  const rows = await query<Raw>(
    `
    SELECT
      CASE
        WHEN contributorPersentTypeCd = 'ENTITY'
          THEN COALESCE(NULLIF(TRIM(contributorNameOrganization), ''), 'Unnamed entity')
        ELSE TRIM(
          COALESCE(contributorNameLast, '') ||
          CASE WHEN contributorNameFirst IS NOT NULL AND TRIM(contributorNameFirst) <> ''
               THEN ', ' || TRIM(contributorNameFirst) ELSE '' END
        )
      END                                       AS contributor,
      filerName                                 AS filerName,
      filerIdent                                AS filerIdent,
      NULLIF(TRIM(contributorEmployer), '')     AS employer,
      NULLIF(TRIM(contributorOccupation), '')   AS occupation,
      TRY_CAST(contributionAmount AS DOUBLE)    AS amount,
      receivedDt                                AS dt,
      reportInfoIdent                           AS rid
    FROM tec_contributions
    WHERE ${where.join(" AND ")}
    ORDER BY TRY_CAST(contributionAmount AS DOUBLE) DESC NULLS LAST
    LIMIT ?
    `,
    [...params, cap],
  );

  const truncated = rows.length > args.limit;
  const out = rows.slice(0, args.limit).map((r) =>
    Row.parse({
      contributor: r.contributor,
      filerName: r.filerName,
      filerIdent: r.filerIdent,
      employer: r.employer,
      occupation: r.occupation,
      amount: Number(r.amount ?? 0),
      date: r.dt,
      source: tecContributionCitation({
        reportInfoIdent: r.rid,
        filerName: r.filerName,
        contributor: r.contributor,
        amount: Number(r.amount ?? 0),
        date: r.dt,
      }),
    }),
  );

  return { rows: out, truncated };
}

export const getStateContributions: Tool<typeof Args, typeof Result> = {
  name: "get_state_contributions",
  description:
    "Bounded query over TEC state-level campaign-finance contributions. Requires at least one of contributor, filerIdent, filerName, employerLike, or a (dateFrom, dateTo) pair. Rows are sorted by amount descending and capped at `limit`; `truncated` flags overflow.",
  argsSchema: Args,
  resultSchema: Result,
  run,
};

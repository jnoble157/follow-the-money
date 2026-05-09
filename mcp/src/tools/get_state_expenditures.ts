import { z } from "zod";
import { query } from "../db/connect.ts";
import { nameWhere } from "../db/names.ts";
import { Citation } from "../schemas/index.ts";
import { tecExpenditureCitation } from "../citations.ts";
import type { Tool } from "./types.ts";

// TEC counterpart to get_expenditures. One state filer paying a payee.

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const Args = z
  .object({
    filerIdent: z.string().min(1).max(120).optional(),
    filerName: z.string().min(2).max(200).optional(),
    payee: z.string().min(2).max(160).optional(),
    descriptionLike: z.string().min(2).max(160).optional(),
    dateFrom: z.string().regex(ISO_DATE).optional(),
    dateTo: z.string().regex(ISO_DATE).optional(),
    minAmount: z.number().nonnegative().optional(),
    limit: z.number().int().positive().max(200).default(50),
  })
  .refine(
    (v) =>
      v.filerIdent ||
      v.filerName ||
      v.payee ||
      v.descriptionLike ||
      (v.dateFrom && v.dateTo),
    "at least one of filerIdent, filerName, payee, descriptionLike, or both dateFrom + dateTo must be set",
  );

const Row = z.object({
  filerName: z.string(),
  filerIdent: z.string(),
  payee: z.string(),
  description: z.string().nullable(),
  category: z.string().nullable(),
  amount: z.number(),
  date: z.string().nullable(),
  source: Citation,
});

const Result = z.object({
  rows: z.array(Row),
  truncated: z.boolean(),
});

type Raw = {
  filerName: string;
  filerIdent: string;
  payee: string;
  description: string | null;
  category: string | null;
  amount: number | null;
  dt: string | null;
  rid: string;
};

async function run(rawArgs: z.input<typeof Args>): Promise<z.infer<typeof Result>> {
  const args = Args.parse(rawArgs);
  const where: string[] = ["COALESCE(infoOnlyFlag, '') <> 'Y'"];
  const params: Array<string | number> = [];
  if (args.filerIdent) {
    where.push("filerIdent = ?");
    params.push(args.filerIdent);
  }
  if (args.filerName) {
    const m = nameWhere(["filerName"], args.filerName);
    if (m) { where.push(m.sql); params.push(...m.params); }
    else { where.push("1 = 0"); }
  }
  if (args.payee) {
    const m = nameWhere(
      ["payeeNameOrganization", "payeeNameLast", "payeeNameFirst"],
      args.payee,
    );
    if (m) { where.push(`(${m.sql})`); params.push(...m.params); }
    else { where.push("1 = 0"); }
  }
  if (args.descriptionLike) {
    where.push("expendDescr ILIKE ?");
    params.push(`%${args.descriptionLike.replace(/[%_]/g, "")}%`);
  }
  if (args.dateFrom) {
    where.push("receivedDt >= ?");
    params.push(args.dateFrom.replace(/-/g, ""));
  }
  if (args.dateTo) {
    where.push("receivedDt <= ?");
    params.push(args.dateTo.replace(/-/g, ""));
  }
  if (args.minAmount !== undefined) {
    where.push("TRY_CAST(expendAmount AS DOUBLE) >= ?");
    params.push(args.minAmount);
  }

  const cap = args.limit + 1;
  const rows = await query<Raw>(
    `
    SELECT
      filerName                                 AS filerName,
      filerIdent                                AS filerIdent,
      CASE
        WHEN payeePersentTypeCd = 'ENTITY'
          THEN COALESCE(NULLIF(TRIM(payeeNameOrganization), ''), 'Unnamed payee')
        ELSE TRIM(
          COALESCE(payeeNameLast, '') ||
          CASE WHEN payeeNameFirst IS NOT NULL AND TRIM(payeeNameFirst) <> ''
               THEN ', ' || TRIM(payeeNameFirst) ELSE '' END
        )
      END                                       AS payee,
      NULLIF(TRIM(expendDescr), '')             AS description,
      NULLIF(TRIM(expendCatDescr), '')          AS category,
      TRY_CAST(expendAmount AS DOUBLE)          AS amount,
      receivedDt                                AS dt,
      reportInfoIdent                           AS rid
    FROM tec_expenditures
    WHERE ${where.join(" AND ")}
    ORDER BY TRY_CAST(expendAmount AS DOUBLE) DESC NULLS LAST
    LIMIT ?
    `,
    [...params, cap],
  );

  const truncated = rows.length > args.limit;
  const out = rows.slice(0, args.limit).map((r) =>
    Row.parse({
      filerName: r.filerName,
      filerIdent: r.filerIdent,
      payee: r.payee,
      description: r.description,
      category: r.category,
      amount: Number(r.amount ?? 0),
      date: r.dt,
      source: tecExpenditureCitation({
        reportInfoIdent: r.rid,
        filerName: r.filerName,
        payee: r.payee,
        amount: Number(r.amount ?? 0),
        date: r.dt,
        description: r.description,
      }),
    }),
  );

  return { rows: out, truncated };
}

export const getStateExpenditures: Tool<typeof Args, typeof Result> = {
  name: "get_state_expenditures",
  description:
    "Bounded query over TEC state-level campaign-finance expenditures (one state filer paying a payee). Requires at least one of filerIdent, filerName, payee, descriptionLike, or a (dateFrom, dateTo) pair. Sorted by amount descending; `truncated` flags overflow.",
  argsSchema: Args,
  resultSchema: Result,
  run,
};

import { z } from "zod";
import { query } from "../db/connect.ts";
import { nameWhere } from "../db/names.ts";
import { Citation } from "../schemas/index.ts";
import { austinExpenditureCitation } from "../citations.ts";
import type { Tool } from "./types.ts";

// Same shape as get_contributions, against the expenditures parquet.

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const Args = z
  .object({
    paidBy: z.string().min(2).max(160).optional(),
    payee: z.string().min(2).max(160).optional(),
    descriptionLike: z.string().min(2).max(160).optional(),
    dateFrom: z.string().regex(ISO_DATE).optional(),
    dateTo: z.string().regex(ISO_DATE).optional(),
    minAmount: z.number().nonnegative().optional(),
    limit: z.number().int().positive().max(200).default(50),
  })
  .refine(
    (v) => v.paidBy || v.payee || v.descriptionLike || (v.dateFrom && v.dateTo),
    "at least one of paidBy, payee, descriptionLike, or both dateFrom + dateTo must be set",
  );

const Row = z.object({
  paidBy: z.string(),
  payee: z.string(),
  description: z.string().nullable(),
  type: z.string().nullable(),
  amount: z.number(),
  date: z.string().nullable(),
  source: Citation,
});

const Result = z.object({
  rows: z.array(Row),
  truncated: z.boolean(),
});

type Raw = {
  paidBy: string;
  payee: string;
  description: string | null;
  type: string | null;
  amount: number | null;
  dt: string | null;
  tid: string;
};

async function run(rawArgs: z.input<typeof Args>): Promise<z.infer<typeof Result>> {
  const args = Args.parse(rawArgs);
  const where: string[] = [];
  const params: Array<string | number> = [];
  if (args.paidBy) {
    const m = nameWhere(["Paid_By"], args.paidBy);
    if (m) { where.push(m.sql); params.push(...m.params); }
    else { where.push("1 = 0"); }
  }
  if (args.payee) {
    const m = nameWhere(["Payee"], args.payee);
    if (m) { where.push(m.sql); params.push(...m.params); }
    else { where.push("1 = 0"); }
  }
  if (args.descriptionLike) {
    where.push("Expense_Description ILIKE ?");
    params.push(`%${args.descriptionLike.replace(/[%_]/g, "")}%`);
  }
  if (args.dateFrom) {
    where.push(`STRPTIME(Payment_Date, '%m/%d/%Y') >= STRPTIME(?, '%Y-%m-%d')`);
    params.push(args.dateFrom);
  }
  if (args.dateTo) {
    where.push(`STRPTIME(Payment_Date, '%m/%d/%Y') <= STRPTIME(?, '%Y-%m-%d')`);
    params.push(args.dateTo);
  }
  if (args.minAmount !== undefined) {
    where.push("TRY_CAST(Payment_Amount AS DOUBLE) >= ?");
    params.push(args.minAmount);
  }

  const cap = args.limit + 1;
  const rows = await query<Raw>(
    `
    SELECT
      Paid_By                       AS paidBy,
      Payee                         AS payee,
      Expense_Description           AS description,
      Expenditure_Type              AS type,
      TRY_CAST(Payment_Amount AS DOUBLE) AS amount,
      Payment_Date                  AS dt,
      TRANSACTION_ID                AS tid
    FROM austin_expenditures
    ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
    ORDER BY TRY_CAST(Payment_Amount AS DOUBLE) DESC NULLS LAST
    LIMIT ?
    `,
    [...params, cap],
  );

  const truncated = rows.length > args.limit;
  const out = rows.slice(0, args.limit).map((r) =>
    Row.parse({
      paidBy: r.paidBy,
      payee: r.payee,
      description: r.description,
      type: r.type,
      amount: Number(r.amount ?? 0),
      date: r.dt,
      source: austinExpenditureCitation({
        transactionId: r.tid,
        paidBy: r.paidBy,
        payee: r.payee,
        amount: Number(r.amount ?? 0),
        date: r.dt ?? undefined,
        description: r.description ?? undefined,
      }),
    }),
  );

  return { rows: out, truncated };
}

export const getExpenditures: Tool<typeof Args, typeof Result> = {
  name: "get_expenditures",
  description:
    "Bounded query over Austin campaign-finance expenditures (one filer paying a payee). At least one filter must be set. Rows are sorted by amount descending; `truncated` flags overflow beyond the cap.",
  argsSchema: Args,
  resultSchema: Result,
  run,
};

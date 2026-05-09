import { z } from "zod";
import { query } from "../db/connect.ts";
import { Citation } from "../schemas/index.ts";
import { austinContributionCitation } from "../citations.ts";
import type { Tool } from "./types.ts";

// Bounded contribution lookup. At least one of donor / recipient / dateRange
// must be set so we never return the entire 238k-row table by accident. The
// agent uses this when it needs the raw rows behind a top_donors / top_pacs
// roll-up — for example to print individual line items in the narrative.

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const Args = z
  .object({
    donor: z.string().min(2).max(160).optional(),
    recipient: z.string().min(2).max(160).optional(),
    employerLike: z.string().min(2).max(160).optional(),
    dateFrom: z.string().regex(ISO_DATE).optional(),
    dateTo: z.string().regex(ISO_DATE).optional(),
    minAmount: z.number().nonnegative().optional(),
    donorScope: z.enum(["individual", "organization", "any"]).default("any"),
    limit: z.number().int().positive().max(200).default(50),
  })
  .refine(
    (v) => v.donor || v.recipient || v.employerLike || (v.dateFrom && v.dateTo),
    "at least one of donor, recipient, employerLike, or both dateFrom + dateTo must be set",
  );

const Row = z.object({
  donor: z.string(),
  recipient: z.string(),
  employer: z.string().nullable(),
  occupation: z.string().nullable(),
  amount: z.number(),
  type: z.string().nullable(),
  date: z.string().nullable(),
  source: Citation,
});

const Result = z.object({
  rows: z.array(Row),
  truncated: z.boolean(),
});

type Raw = {
  donor: string;
  recipient: string;
  employer: string | null;
  occupation: string | null;
  amount: number | null;
  type: string | null;
  dt: string | null;
  tid: string;
};

async function run(rawArgs: z.input<typeof Args>): Promise<z.infer<typeof Result>> {
  const args = Args.parse(rawArgs);
  const where: string[] = [];
  const params: Array<string | number> = [];
  if (args.donor) {
    where.push("Donor ILIKE ?");
    params.push(`%${args.donor.replace(/[%_]/g, "")}%`);
  }
  if (args.recipient) {
    where.push("Recipient ILIKE ?");
    params.push(`%${args.recipient.replace(/[%_]/g, "")}%`);
  }
  if (args.employerLike) {
    where.push("Donor_Reported_Employer ILIKE ?");
    params.push(`%${args.employerLike.replace(/[%_]/g, "")}%`);
  }
  // Contribution_Date is MM/DD/YYYY in Austin — convert at the boundary.
  if (args.dateFrom) {
    where.push(`STRPTIME(Contribution_Date, '%m/%d/%Y') >= STRPTIME(?, '%Y-%m-%d')`);
    params.push(args.dateFrom);
  }
  if (args.dateTo) {
    where.push(`STRPTIME(Contribution_Date, '%m/%d/%Y') <= STRPTIME(?, '%Y-%m-%d')`);
    params.push(args.dateTo);
  }
  if (args.minAmount !== undefined) {
    where.push("TRY_CAST(Contribution_Amount AS DOUBLE) >= ?");
    params.push(args.minAmount);
  }
  if (args.donorScope === "individual") where.push("Donor_Type ILIKE 'INDIVIDUAL'");
  if (args.donorScope === "organization") where.push("Donor_Type NOT ILIKE 'INDIVIDUAL'");

  // Always cap with limit + 1 so we know whether there's more.
  const cap = args.limit + 1;
  const rows = await query<Raw>(
    `
    SELECT
      Donor                          AS donor,
      Recipient                      AS recipient,
      Donor_Reported_Employer        AS employer,
      Donor_Reported_Occupation      AS occupation,
      TRY_CAST(Contribution_Amount AS DOUBLE) AS amount,
      Contribution_Type              AS type,
      Contribution_Date              AS dt,
      TRANSACTION_ID                 AS tid
    FROM austin_contributions
    ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
    ORDER BY TRY_CAST(Contribution_Amount AS DOUBLE) DESC NULLS LAST
    LIMIT ?
    `,
    [...params, cap],
  );

  const truncated = rows.length > args.limit;
  const out = rows.slice(0, args.limit).map((r) =>
    Row.parse({
      donor: r.donor,
      recipient: r.recipient,
      employer: r.employer,
      occupation: r.occupation,
      amount: Number(r.amount ?? 0),
      type: r.type,
      date: r.dt,
      source: austinContributionCitation({
        transactionId: r.tid,
        donor: r.donor,
        recipient: r.recipient,
        amount: Number(r.amount ?? 0),
        date: r.dt ?? undefined,
      }),
    }),
  );

  return { rows: out, truncated };
}

export const getContributions: Tool<typeof Args, typeof Result> = {
  name: "get_contributions",
  description:
    "Bounded query over Austin campaign-finance contributions. At least one of donor, recipient, employerLike, or a (dateFrom, dateTo) pair must be set. Rows are sorted by amount descending and capped at `limit`; `truncated` flags an overflow.",
  argsSchema: Args,
  resultSchema: Result,
  run,
};

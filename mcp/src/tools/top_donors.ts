import { z } from "zod";
import { query } from "../db/connect.ts";
import { nameWhere } from "../db/names.ts";
import { Citation } from "../schemas/index.ts";
import { austinContributionCitation } from "../citations.ts";
import type { Tool } from "./types.ts";

// Top contributors to a given Austin filer (recipient), summed across the
// chosen cycle. The donor side carries an optional rolledEmployer field for
// the case where the agent has already merged variants — for the unmerged
// raw view callers pass `rollupEmployer: false`.

const Args = z.object({
  recipient: z.string().min(2).max(120),
  // Match Austin's Contribution_Year field, which is a string. The agent
  // can pass "2024" or "2024-2024" for a single year, or "2022-2024" for
  // multiple.
  cycle: z
    .string()
    .regex(/^\d{4}(-\d{4})?$/)
    .optional(),
  donorScope: z.enum(["individual", "organization", "any"]).default("any"),
  // System prompt caps the rendered table at 5; default to that so the
  // tool returns exactly what the model needs. The agent can pass a
  // larger limit when explicitly asked for a longer roll.
  limit: z.number().int().positive().max(50).default(5),
});

const Donor = z.object({
  rank: z.number().int().positive(),
  donor: z.string(),
  rolledEmployer: z.string().nullable(),
  contributionsCount: z.number().int().positive(),
  totalAmount: z.number().nonnegative(),
  // Citation of the largest single contribution in the donor's cluster.
  // Cheap to verify by hand; bigger numbers are more recognizable.
  source: Citation,
});

// When donors comes back empty but the recipient is real, this tells the
// agent why: the filer has activity in the data, just not in the cycle
// the agent asked for. Same shape and field name as top_state_donors so
// the system prompt can describe one rule for both jurisdictions.
const FilerActivity = z.object({
  firstYear: z.string().nullable(),
  lastYear: z.string().nullable(),
  totalContributions: z.number().int().nonnegative(),
});

const Result = z.object({
  recipient: z.string(),
  cycle: z.string(),
  donors: z.array(Donor),
  filerActivity: FilerActivity.nullable().optional(),
});

type Row = {
  donor: string;
  employer: string | null;
  n: number;
  total: number;
  largestTid: string;
  largestAmount: number;
  largestDate: string;
};

async function run(rawArgs: z.input<typeof Args>): Promise<z.infer<typeof Result>> {
  const args = Args.parse(rawArgs);
  const [from, to] = parseCycle(args.cycle);
  const recipientMatch = nameWhere(["Recipient"], args.recipient);
  if (!recipientMatch) {
    return Result.parse({
      recipient: args.recipient,
      cycle: args.cycle ?? `${from}-${to}`,
      donors: [],
    });
  }
  const donorScopeFilter =
    args.donorScope === "individual"
      ? "AND Donor_Type ILIKE 'INDIVIDUAL'"
      : args.donorScope === "organization"
      ? "AND Donor_Type NOT ILIKE 'INDIVIDUAL'"
      : "";

  // Two-pass query: rank donors by total in window 1, then pull the
  // largest contribution in each donor cluster for the citation.
  const rows = await query<Row>(
    `
    WITH cycle_rows AS (
      SELECT
        Donor,
        Donor_Reported_Employer AS employer,
        TRY_CAST(Contribution_Amount AS DOUBLE) AS amount,
        TRANSACTION_ID AS tid,
        Contribution_Date AS dt
      FROM austin_contributions
      WHERE ${recipientMatch.sql}
        AND TRY_CAST(Contribution_Year AS INTEGER) BETWEEN ? AND ?
        ${donorScopeFilter}
    ),
    ranked AS (
      SELECT
        Donor,
        employer,
        COUNT(*)::INTEGER AS n,
        SUM(amount) AS total,
        MAX(amount) AS largestAmount
      FROM cycle_rows
      GROUP BY Donor, employer
      HAVING SUM(amount) > 0
    )
    SELECT
      r.Donor AS donor,
      r.employer AS employer,
      r.n,
      r.total,
      r.largestAmount,
      ANY_VALUE(w.tid) AS largestTid,
      ANY_VALUE(w.dt) AS largestDate
    FROM ranked r
    JOIN cycle_rows w ON w.Donor = r.Donor
                  AND COALESCE(w.employer,'') = COALESCE(r.employer,'')
                  AND w.amount = r.largestAmount
    GROUP BY r.Donor, r.employer, r.n, r.total, r.largestAmount
    ORDER BY r.total DESC
    LIMIT ?
    `,
    [...recipientMatch.params, from, to, args.limit],
  );

  const donors = rows.map((r, i) =>
    Donor.parse({
      rank: i + 1,
      donor: r.donor,
      rolledEmployer: r.employer,
      contributionsCount: r.n,
      totalAmount: Number(r.total),
      source: austinContributionCitation({
        transactionId: r.largestTid,
        donor: r.donor,
        recipient: args.recipient,
        amount: Number(r.largestAmount),
        date: r.largestDate,
      }),
    }),
  );

  let filerActivity: z.infer<typeof FilerActivity> | null = null;
  if (donors.length === 0) {
    filerActivity = await probeFilerActivity(recipientMatch);
  }

  return Result.parse({
    recipient: args.recipient,
    cycle: args.cycle ?? `${from}-${to}`,
    donors,
    filerActivity,
  });
}

async function probeFilerActivity(
  recipientMatch: { sql: string; params: string[] },
): Promise<z.infer<typeof FilerActivity> | null> {
  const probe = await query<{
    firstYear: string | null;
    lastYear: string | null;
    totalContributions: number;
  }>(
    `
    SELECT
      MIN(Contribution_Year)        AS firstYear,
      MAX(Contribution_Year)        AS lastYear,
      COUNT(*)::INTEGER             AS totalContributions
    FROM austin_contributions
    WHERE ${recipientMatch.sql}
    `,
    recipientMatch.params,
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

export const topDonors: Tool<typeof Args, typeof Result> = {
  name: "top_donors",
  description:
    "Rank the largest contributors to an Austin filer over a year or cycle. Donor and employer come straight from the filing — variants are NOT pre-rolled. Use cluster_employer_variants if the result shows multiple variants of the same firm and the question asks for a rolled total.",
  argsSchema: Args,
  resultSchema: Result,
  run,
};

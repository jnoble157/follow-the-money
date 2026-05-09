import { z } from "zod";
import { query } from "../db/connect.ts";
import { Citation } from "../schemas/index.ts";
import type { Tool } from "./types.ts";

// Rank Austin recipients (PACs, candidates, committees) by total raised in
// a given year. Useful as the entry point for ballot-cycle questions where
// the user names a year but no specific filer.

const Args = z.object({
  year: z
    .number()
    .int()
    .min(2000)
    .max(2100),
  limit: z.number().int().positive().max(50).default(10),
});

const Recipient = z.object({
  rank: z.number().int().positive(),
  recipient: z.string(),
  contributionsCount: z.number().int().positive(),
  uniqueDonors: z.number().int().nonnegative(),
  totalRaised: z.number().nonnegative(),
  source: Citation,
});

const Result = z.object({
  year: z.number(),
  recipients: z.array(Recipient),
});

type Row = {
  recipient: string;
  n: number;
  uniqueDonors: number;
  total: number;
};

async function run(rawArgs: z.input<typeof Args>): Promise<z.infer<typeof Result>> {
  const args = Args.parse(rawArgs);
  const rows = await query<Row>(
    `
    SELECT
      Recipient AS recipient,
      COUNT(*)::INTEGER AS n,
      COUNT(DISTINCT Donor)::INTEGER AS uniqueDonors,
      SUM(TRY_CAST(Contribution_Amount AS DOUBLE)) AS total
    FROM austin_contributions
    WHERE TRY_CAST(Contribution_Year AS INTEGER) = ?
    GROUP BY Recipient
    HAVING SUM(TRY_CAST(Contribution_Amount AS DOUBLE)) > 0
    ORDER BY total DESC
    LIMIT ?
    `,
    [args.year, args.limit],
  );

  const recipients = rows.map((r, i) =>
    Recipient.parse({
      rank: i + 1,
      recipient: r.recipient,
      contributionsCount: r.n,
      uniqueDonors: r.uniqueDonors,
      totalRaised: Number(r.total),
      source: {
        reportInfoIdent: `ATX-CYCLE-${args.year}-${slug(r.recipient)}`,
        url: `https://data.austintexas.gov/d/3kfv-biw6?recipient=${encodeURIComponent(r.recipient)}&year=${args.year}`,
        rowSummary:
          `${r.recipient} raised $${Number(r.total).toLocaleString("en-US")} from ${r.uniqueDonors} unique donors across ${r.n} reported contributions in ${args.year}.`,
      },
    }),
  );

  return { year: args.year, recipients };
}

function slug(s: string): string {
  return s.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "").toUpperCase();
}

export const topPacs: Tool<typeof Args, typeof Result> = {
  name: "top_pacs",
  description:
    "Rank Austin recipients (PACs, candidates, committees) by total raised in a given year. Use this as the entry point for ballot-cycle questions where the user has named a year but not a specific filer.",
  argsSchema: Args,
  resultSchema: Result,
  run,
};

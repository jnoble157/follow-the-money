import { z } from "zod";
import { distance } from "fastest-levenshtein";
import { query } from "../db/connect.ts";
import { Citation, Confidence } from "../schemas/index.ts";
import type { Tool } from "./types.ts";

// Resolve a free-text name to one or more filers. "Filer" is the Austin
// City Clerk's term for any party that submits a campaign-finance report
// — candidates, officeholders, PACs, and committees. We search across
// recipients of contributions (the closest the Austin schema gets to a
// canonical filer table) and aggregate.

const Args = z.object({
  name: z.string().min(2).max(120),
  // Defaults to austin because that's the dataset the agent uses for most
  // questions. The TEC surface is reachable via cross_reference_lobby; we
  // don't expose state-CF filer search until the bulk parquet ingests.
  jurisdiction: z.literal("austin").default("austin"),
  limit: z.number().int().positive().max(20).default(10),
});

const Match = z.object({
  filerName: z.string(),
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
  filerName: string;
  n: number;
  total: number | null;
  firstSeen: string | null;
  lastSeen: string | null;
  sampleTid: string | null;
};

async function run(rawArgs: z.input<typeof Args>): Promise<z.infer<typeof Result>> {
  const args = Args.parse(rawArgs);
  const wildcard = `%${args.name.replace(/[%_]/g, "")}%`;
  const rows = await query<Row>(
    `
    SELECT
      Recipient                                   AS filerName,
      COUNT(*)::INTEGER                           AS n,
      SUM(TRY_CAST(Contribution_Amount AS DOUBLE)) AS total,
      MIN(Contribution_Year)                      AS firstSeen,
      MAX(Contribution_Year)                      AS lastSeen,
      ANY_VALUE(TRANSACTION_ID)                   AS sampleTid
    FROM austin_contributions
    WHERE Recipient ILIKE ?
    GROUP BY Recipient
    ORDER BY n DESC
    LIMIT ?
    `,
    [wildcard, args.limit],
  );

  const target = args.name.toLowerCase();
  const matches = rows.map((r) => {
    const conf = nameConfidence(target, r.filerName.toLowerCase());
    return Match.parse({
      filerName: r.filerName,
      contributionsCount: r.n,
      totalRaised: Number(r.total ?? 0),
      firstSeen: r.firstSeen,
      lastSeen: r.lastSeen,
      confidence: conf,
      source: {
        reportInfoIdent: `ATX-FILER-${slug(r.filerName)}`,
        url: "https://data.austintexas.gov/d/3kfv-biw6",
        rowSummary:
          `Austin City Clerk campaign finance, recipient ${r.filerName}: ` +
          `${r.n} reported contributions${
            r.total ? `, $${Number(r.total).toLocaleString("en-US")}` : ""
          }${r.firstSeen ? ` (${r.firstSeen}-${r.lastSeen ?? r.firstSeen})` : ""}.`,
      },
    });
  });

  return { matches };
}

function nameConfidence(target: string, candidate: string): number {
  if (!target || !candidate) return 0;
  const d = distance(target, candidate);
  const max = Math.max(target.length, candidate.length);
  // Levenshtein gives an absolute distance. Normalize to [0, 1] with a
  // gentle floor so partial matches aren't reported as zero confidence.
  return Math.max(0, 1 - d / max);
}

function slug(s: string): string {
  return s.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "").toUpperCase();
}

export const findFiler: Tool<typeof Args, typeof Result> = {
  name: "find_filer",
  description:
    "Resolve a free-text name to Austin campaign-finance filers (candidates, officeholders, PACs, committees). Returns ranked candidates with confidence; the agent should ask the user before reporting a number against a low-confidence match.",
  argsSchema: Args,
  resultSchema: Result,
  run,
};

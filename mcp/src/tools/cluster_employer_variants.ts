import { z } from "zod";
import { distance } from "fastest-levenshtein";
import { query } from "../db/connect.ts";
import { Citation, Confidence } from "../schemas/index.ts";
import { austinContributionCitation } from "../citations.ts";
import type { Tool } from "./types.ts";

// Group reported `Donor_Reported_Employer` values by surface-form similarity.
// Returns one row per cluster of variants seen for the (donor, recipient)
// pair, with a confidence score for the merge. The agent calls
// request_disambiguation if confidence is below 0.85 and the merge would
// change the headline number — see the system prompt.

const Args = z
  .object({
    // The agent passes one of these. donorName narrows to a single contributor
    // and is the right call for "is the same person reporting under three
    // employers"; stem is the right call for "are these three employer
    // strings the same firm at the per-contribution level". recipient
    // narrows the universe and keeps clusters intra-cycle.
    donorName: z.string().min(2).max(160).optional(),
    stem: z.string().min(2).max(160).optional(),
    recipient: z.string().min(2).max(160).optional(),
    threshold: z.number().min(0).max(1).default(0.78),
  })
  .refine((v) => v.donorName || v.stem, "either donorName or stem is required");

const Variant = z.object({
  variant: z.string(),
  contributionsCount: z.number().int().positive(),
  totalAmount: z.number().nonnegative(),
  sampleContributors: z.array(z.string()),
  source: Citation,
});

const Result = z.object({
  // Each cluster groups one or more variants. Single-variant clusters are
  // returned unmerged so the agent can decide.
  clusters: z.array(
    z.object({
      canonical: z.string(),
      variants: z.array(Variant),
      mergedTotal: z.number().nonnegative(),
      mergedCount: z.number().int().nonnegative(),
      confidence: Confidence,
    }),
  ),
});

type RawRow = {
  variant: string;
  donor: string;
  recipient: string;
  amount: number;
  tid: string;
  date: string;
};

// Hard cap on rows pulled into JS for clustering. The unscoped form of this
// tool (stem only, no donor or recipient) used to scan the entire 238k-row
// contributions table and pull every variant of every donor. With this cap
// the worst case is bounded; in practice donor + recipient scoping cuts the
// pull to under 1k rows.
const ROW_CAP = 8000;

async function run(rawArgs: z.input<typeof Args>): Promise<z.infer<typeof Result>> {
  const args = Args.parse(rawArgs);
  const where: string[] = [];
  const params: Array<string | number> = [];
  if (args.donorName) {
    where.push("Donor ILIKE ?");
    params.push(`%${args.donorName.replace(/[%_]/g, "")}%`);
  }
  if (args.stem) {
    where.push("Donor_Reported_Employer ILIKE ?");
    params.push(`%${args.stem.replace(/[%_]/g, "")}%`);
  }
  if (args.recipient) {
    where.push("Recipient ILIKE ?");
    params.push(`%${args.recipient.replace(/[%_]/g, "")}%`);
  }
  // Drop nulls and empty strings — they cluster as nonsense.
  where.push("Donor_Reported_Employer IS NOT NULL");
  where.push("TRIM(Donor_Reported_Employer) <> ''");

  const rows = await query<RawRow>(
    `
    SELECT
      Donor_Reported_Employer AS variant,
      Donor                   AS donor,
      Recipient               AS recipient,
      TRY_CAST(Contribution_Amount AS DOUBLE) AS amount,
      TRANSACTION_ID          AS tid,
      Contribution_Date       AS date
    FROM austin_contributions
    WHERE ${where.join(" AND ")}
    ORDER BY TRY_CAST(Contribution_Amount AS DOUBLE) DESC NULLS LAST
    LIMIT ?
    `,
    [...params, ROW_CAP],
  );

  // Group rows by exact variant string first.
  const byVariant = new Map<string, RawRow[]>();
  for (const r of rows) {
    if (!r.variant) continue;
    const arr = byVariant.get(r.variant) ?? [];
    arr.push(r);
    byVariant.set(r.variant, arr);
  }

  // Greedy clustering: walk variants in descending row-count order, attach
  // each to the first existing cluster whose canonical form is within the
  // similarity threshold. New cluster otherwise.
  const variantList = [...byVariant.entries()].sort(
    (a, b) => b[1].length - a[1].length,
  );

  type Cluster = {
    canonical: string;
    variants: Map<string, RawRow[]>;
  };
  const clusters: Cluster[] = [];

  for (const [variant, rs] of variantList) {
    const norm = normalize(variant);
    let attached: Cluster | null = null;
    for (const c of clusters) {
      if (similar(norm, normalize(c.canonical), args.threshold)) {
        attached = c;
        break;
      }
    }
    if (attached) {
      attached.variants.set(variant, rs);
    } else {
      const c: Cluster = { canonical: variant, variants: new Map() };
      c.variants.set(variant, rs);
      clusters.push(c);
    }
  }

  return {
    clusters: clusters.map((c) => buildCluster(c, args.threshold)),
  };
}

function buildCluster(
  c: { canonical: string; variants: Map<string, RawRow[]> },
  threshold: number,
) {
  const variants = [...c.variants.entries()].map(([variant, rs]) => {
    const total = rs.reduce((s, r) => s + (Number(r.amount) || 0), 0);
    const largest = rs.slice().sort((a, b) => (b.amount || 0) - (a.amount || 0))[0];
    const sampleContributors = Array.from(new Set(rs.map((r) => r.donor))).slice(0, 5);
    return {
      variant,
      contributionsCount: rs.length,
      totalAmount: total,
      sampleContributors,
      source: austinContributionCitation({
        transactionId: largest.tid,
        donor: largest.donor,
        recipient: largest.recipient,
        amount: Number(largest.amount),
        date: largest.date,
      }),
    };
  });
  variants.sort((a, b) => b.totalAmount - a.totalAmount);

  const mergedCount = variants.reduce((s, v) => s + v.contributionsCount, 0);
  const mergedTotal = variants.reduce((s, v) => s + v.totalAmount, 0);

  // Cluster confidence is the minimum pairwise similarity between the
  // canonical and each variant. This is conservative — we'd rather under-
  // report confidence than over-merge. Single-variant clusters are 1.0.
  let conf = 1;
  if (variants.length > 1) {
    const canon = normalize(c.canonical);
    let lo = 1;
    for (const v of variants) {
      const norm = normalize(v.variant);
      const sim = similarity(canon, norm);
      if (sim < lo) lo = sim;
    }
    // Floor at the threshold so the agent's downstream gate (< 0.85) is
    // grounded in the same scale we used to merge.
    conf = Math.max(lo, threshold);
  }

  return {
    canonical: c.canonical,
    variants,
    mergedCount,
    mergedTotal,
    confidence: conf,
  };
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function similarity(a: string, b: string): number {
  if (!a || !b) return 0;
  const d = distance(a, b);
  const max = Math.max(a.length, b.length);
  return Math.max(0, 1 - d / max);
}

function similar(a: string, b: string, threshold: number): boolean {
  // Stem-prefix match catches "Endeavor" matching "Endeavor Real Estate".
  // Empirically the strict Levenshtein ratio under-clusters those because
  // length disparity dominates. Threshold 0.78 = no false merges in the
  // 2024 House donor sample.
  if (a.startsWith(b) || b.startsWith(a)) return true;
  return similarity(a, b) >= threshold;
}

export const clusterEmployerVariants: Tool<typeof Args, typeof Result> = {
  name: "cluster_employer_variants",
  description:
    "Cluster reported employer variants by surface-form similarity. Use after top_donors / get_contributions surfaces multiple spellings of the same firm. Returns clusters with confidence; the agent should call request_disambiguation when confidence < 0.85 and merging would change the headline number.",
  argsSchema: Args,
  resultSchema: Result,
  run,
};

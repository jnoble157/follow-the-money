import { z } from "zod";
import { readProfileRoster } from "@/lib/profiles/rosterData";
import type { SortKey } from "@/lib/profiles/roster";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Query = z.object({
  kind: z.enum(["officials", "donors"]),
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(50).default(20),
  sortKey: z
    .enum(["name", "count", "total", "avg", "yearsActive", "none"])
    .default("total"),
  sortDir: z.enum(["desc", "asc"]).default("desc"),
  query: z.string().max(120).default(""),
  jurisdiction: z.enum(["all", "austin", "tx_state", "tx_federal"]).default("all"),
  donorType: z.enum(["all", "individual", "organization"]).default("organization"),
});

export async function GET(req: Request) {
  const url = new URL(req.url);
  const parsed = Query.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) {
    return Response.json(
      { error: "invalid request", detail: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const q = parsed.data;
  const sortKey = q.sortKey === "none" ? null : (q.sortKey as SortKey);
  return Response.json(
    readProfileRoster({
      kind: q.kind,
      page: q.page,
      perPage: q.perPage,
      sortKey,
      sortDir: q.sortDir,
      query: q.query,
      jurisdiction: q.jurisdiction,
      donorType: q.donorType,
    }),
  );
}

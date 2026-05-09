import { getNetwork } from "@/lib/network/build";

export const runtime = "nodejs";
// Dynamic so the response picks up newly-fetched Wikipedia thumbnails as
// the background enrichment fills in. The DuckDB query result itself is
// memoized inside getNetwork; only the image-merge step re-runs.
export const dynamic = "force-dynamic";

export async function GET() {
  const data = await getNetwork();
  return Response.json(data);
}

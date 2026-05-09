import { classify } from "@/lib/search/classify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Read-only debug endpoint that mirrors the search-bar classifier. Useful
// from the smoke tests (Node can't reach the Next path-aliased modules
// directly) and from devtools while iterating on suggestions.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = url.searchParams.get("q") ?? "";
  return Response.json({ query: q, suggestions: classify(q) });
}

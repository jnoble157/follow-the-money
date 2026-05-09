import { z } from "zod";
import { resolveDisambiguation as resolveStub } from "@/lib/investigations/stub";
import { resolveDisambiguation as resolveLive } from "@txmoney/agent";

export const runtime = "nodejs";

const Body = z.object({
  sessionId: z.string().min(1).max(64),
  disambiguationId: z.string().min(1).max(64),
  merged: z.boolean(),
});

export async function POST(req: Request) {
  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await req.json());
  } catch (err) {
    return Response.json(
      { error: "invalid request", detail: String(err) },
      { status: 400 },
    );
  }
  // The session lives in either the stub map or the live-agent map; we
  // don't know which without checking. Try stub first (it's the hand-
  // scripted hero path); fall through to live.
  const ok =
    resolveStub(body.sessionId, body.disambiguationId, body.merged) ||
    resolveLive(body.sessionId, body.disambiguationId, body.merged);
  if (!ok) {
    return Response.json(
      { error: "no pending disambiguation for that session" },
      { status: 404 },
    );
  }
  return Response.json({ ok: true });
}

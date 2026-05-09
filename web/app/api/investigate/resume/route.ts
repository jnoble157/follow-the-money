import { z } from "zod";
import { resolveDisambiguation as resolveStub } from "@/lib/investigations/stub";
import { resolveDisambiguation as resolveLiveLocal } from "@txmoney/agent";
import {
  isAgentServiceConfigured,
  resolveRemote,
} from "@/lib/investigations/agent-client";

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
  // The session might live in three places: the stub (hero path), the
  // remote agent service (Railway), or — for local dev only — the
  // in-process agent. Stub is local, so try it first; then forward to
  // whichever live runner is configured.
  if (resolveStub(body.sessionId, body.disambiguationId, body.merged)) {
    return Response.json({ ok: true });
  }
  let liveOk = false;
  if (isAgentServiceConfigured()) {
    liveOk = await resolveRemote(
      body.sessionId,
      body.disambiguationId,
      body.merged,
    );
  } else {
    liveOk = resolveLiveLocal(
      body.sessionId,
      body.disambiguationId,
      body.merged,
    );
  }
  if (!liveOk) {
    return Response.json(
      { error: "no pending disambiguation for that session" },
      { status: 404 },
    );
  }
  return Response.json({ ok: true });
}

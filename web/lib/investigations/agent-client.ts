// HTTP/SSE client for the remote agent service. Used in production where
// the Vercel function can't query parquet locally — the agent runs on
// Railway and we proxy events back to the browser through the Next.js
// /api/investigate route.
//
// The agent service is configured via `AGENT_SERVICE_URL` (e.g.
// https://agent.fly.dev) and optionally `AGENT_SHARED_SECRET`. When
// AGENT_SERVICE_URL is unset, callers should fall back to the in-process
// runner from `@txmoney/agent`.

import type { InvestigationEvent } from "./types";

export function isAgentServiceConfigured(): boolean {
  return Boolean(process.env.AGENT_SERVICE_URL);
}

export class AgentServiceUnavailableError extends Error {
  constructor() {
    super("AGENT_SERVICE_URL is not set");
    this.name = "AgentServiceUnavailableError";
  }
}

function buildHeaders(): HeadersInit {
  const h: Record<string, string> = { "content-type": "application/json" };
  const secret = process.env.AGENT_SHARED_SECRET;
  if (secret) h["x-agent-token"] = secret;
  return h;
}

export async function* runRemote(
  question: string,
  sessionId: string,
): AsyncGenerator<InvestigationEvent> {
  const base = process.env.AGENT_SERVICE_URL;
  if (!base) throw new AgentServiceUnavailableError();
  const url = `${base.replace(/\/$/, "")}/investigate`;

  const res = await fetch(url, {
    method: "POST",
    headers: buildHeaders(),
    body: JSON.stringify({ question, sessionId }),
  });
  if (!res.ok || !res.body) {
    yield {
      type: "investigation_failed",
      reason: `Agent service returned ${res.status} ${res.statusText}`,
    };
    return;
  }
  yield* parseSse(res.body);
}

export async function resolveRemote(
  sessionId: string,
  disambiguationId: string,
  merged: boolean,
): Promise<boolean> {
  const base = process.env.AGENT_SERVICE_URL;
  if (!base) throw new AgentServiceUnavailableError();
  const url = `${base.replace(/\/$/, "")}/resume`;
  const res = await fetch(url, {
    method: "POST",
    headers: buildHeaders(),
    body: JSON.stringify({ sessionId, disambiguationId, merged }),
  });
  if (res.status === 404) return false;
  return res.ok;
}

// Minimal SSE parser. The agent service writes one event per `data: …\n\n`
// frame; we don't bother with `event:` or `id:` lines.
async function* parseSse(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<InvestigationEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buf.indexOf("\n\n")) !== -1) {
      const frame = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      const dataLines = frame
        .split("\n")
        .filter((l) => l.startsWith("data:"))
        .map((l) => l.slice(5).trimStart());
      if (dataLines.length === 0) continue;
      const payload = dataLines.join("\n");
      try {
        yield JSON.parse(payload) as InvestigationEvent;
      } catch {
        // Drop malformed frames silently; they're almost always heartbeats.
      }
    }
  }
}

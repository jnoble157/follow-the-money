// HTTP server that exposes the live agent over SSE. Used by the Vercel-
// deployed Next.js app, which can't run the agent itself because the
// underlying parquet (~600 MB) doesn't fit on Vercel.
//
// Endpoints:
//   GET  /health                      → 200 OK
//   POST /investigate { question, sessionId }     → SSE of InvestigationEvent
//   POST /resume     { sessionId, choice }        → SSE of InvestigationEvent
//
// Auth: optional shared-secret header `x-agent-token` matched against
// AGENT_SHARED_SECRET. When the env var is absent the endpoint is open.
//
//   $ AGENT_PORT=8080 OPENAI_API_KEY=… npx tsx agent/src/server.ts
import http from "node:http";
import { runInvestigation, resolveDisambiguation } from "./runner.ts";
import type { InvestigationEvent } from "@txmoney/mcp/events";

const PORT = Number(process.env.PORT ?? process.env.AGENT_PORT ?? 8080);
const SECRET = process.env.AGENT_SHARED_SECRET ?? "";

function send(res: http.ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

function authOk(req: http.IncomingMessage): boolean {
  if (!SECRET) return true;
  const got = req.headers["x-agent-token"];
  return got === SECRET;
}

async function readJson<T>(req: http.IncomingMessage): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      try {
        const text = Buffer.concat(chunks).toString("utf-8");
        resolve(text ? JSON.parse(text) : ({} as T));
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

function startSse(res: http.ServerResponse) {
  res.writeHead(200, {
    "content-type": "text/event-stream",
    "cache-control": "no-cache, no-transform",
    connection: "keep-alive",
    "x-accel-buffering": "no",
  });
}

function writeEvent(res: http.ServerResponse, ev: InvestigationEvent) {
  res.write(`data: ${JSON.stringify(ev)}\n\n`);
}

async function streamGenerator(
  res: http.ServerResponse,
  gen: AsyncGenerator<InvestigationEvent>,
): Promise<void> {
  try {
    for await (const ev of gen) {
      // Honor client disconnects to stop spending tokens.
      if (res.destroyed) break;
      writeEvent(res, ev);
    }
  } catch (err) {
    writeEvent(res, {
      type: "investigation_failed",
      reason: `Server error: ${err instanceof Error ? err.message : String(err)}`,
    });
  } finally {
    res.end();
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
  const method = req.method ?? "GET";

  if (method === "GET" && url.pathname === "/health") {
    send(res, 200, { ok: true, ts: Date.now() });
    return;
  }

  if (method === "POST" && url.pathname === "/investigate") {
    if (!authOk(req)) return send(res, 401, { error: "unauthorized" });
    let body: { question?: unknown; sessionId?: unknown };
    try {
      body = await readJson(req);
    } catch (err) {
      return send(res, 400, { error: "invalid json", detail: String(err) });
    }
    const question = typeof body.question === "string" ? body.question : "";
    const sessionId = typeof body.sessionId === "string" ? body.sessionId : "";
    if (question.length < 3 || sessionId.length < 1) {
      return send(res, 400, { error: "missing question or sessionId" });
    }
    startSse(res);
    await streamGenerator(res, runInvestigation(question, sessionId));
    return;
  }

  if (method === "POST" && url.pathname === "/resume") {
    if (!authOk(req)) return send(res, 401, { error: "unauthorized" });
    let body: { sessionId?: unknown; disambiguationId?: unknown; merged?: unknown };
    try {
      body = await readJson(req);
    } catch (err) {
      return send(res, 400, { error: "invalid json", detail: String(err) });
    }
    const sessionId = typeof body.sessionId === "string" ? body.sessionId : "";
    const disambiguationId =
      typeof body.disambiguationId === "string" ? body.disambiguationId : "";
    const merged = typeof body.merged === "boolean" ? body.merged : false;
    if (!sessionId || !disambiguationId) {
      return send(res, 400, { error: "missing sessionId or disambiguationId" });
    }
    const ok = resolveDisambiguation(sessionId, disambiguationId, merged);
    if (!ok) return send(res, 404, { error: "no pending disambiguation" });
    return send(res, 200, { ok: true });
  }

  send(res, 404, { error: "not found" });
});

server.listen(PORT, () => {
  console.log(`agent service listening on :${PORT}`);
  if (!process.env.OPENAI_API_KEY) {
    console.warn("warning: OPENAI_API_KEY is not set");
  }
});

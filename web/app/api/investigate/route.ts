import { z } from "zod";
import {
  runInvestigation as runStub,
  UnknownInvestigationError,
} from "@/lib/investigations/stub";
import {
  isAgentServiceConfigured,
  runRemote,
} from "@/lib/investigations/agent-client";
import {
  loadCached,
  loadRecorded,
  replayJsonl,
  streamAndRecord,
} from "@/lib/investigations/replay";
import { findHeroByQuestion } from "@/lib/investigations/registry";
import type { InvestigationEvent } from "@/lib/investigations/types";

// `@txmoney/agent` pulls in `@duckdb/node-api` (native libduckdb.so) at
// module load. On Vercel, libduckdb isn't on disk, so any static import
// fails the route entirely. Load the local runner lazily — production
// uses the remote service and never executes this branch.
async function loadLocalRunner(): Promise<
  typeof import("@txmoney/agent")["runInvestigation"]
> {
  const mod = await import("@txmoney/agent");
  return mod.runInvestigation;
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  question: z.string().min(3).max(500),
  sessionId: z.string().min(1).max(64),
  // The replay engines respect this; the live agent ignores it.
  speed: z.number().positive().max(10).optional(),
});

// The cascade. Order matters: a question that's both registered AND
// committed-as-fixture should be served from the registry (S1 only after
// Phase 6 deletions). Cached runs are gitignored ad-hoc captures.
async function* selectStream(
  question: string,
  sessionId: string,
  speed: number | undefined,
): AsyncGenerator<InvestigationEvent> {
  // 1. Hand-scripted heroes. After Phase 6 only S1 remains.
  const scripted = findHeroByQuestion(question);
  if (scripted) {
    try {
      for await (const ev of runStub(sessionId, question, { speed })) {
        yield ev;
      }
    } catch (err) {
      yield failure(err);
    }
    return;
  }

  // 2. Recorded fixture (committed JSONL).
  const recorded = await loadRecorded(question);
  if (recorded) {
    for await (const ev of replayJsonl(recorded.filePath, speed)) {
      yield ev;
    }
    return;
  }

  // 3. Ad-hoc cached run.
  const cached = await loadCached(question);
  if (cached) {
    for await (const ev of replayJsonl(cached, speed)) {
      yield ev;
    }
    return;
  }

  // 4. Live agent. Prefer the remote service (Railway) when configured,
  // since Vercel can't run the agent locally — the parquet doesn't fit in
  // the deployment. Fall back to the in-process runner for local dev.
  // Tee to ad-hoc cache so the next time anyone asks the same question,
  // we replay rather than re-spend tokens.
  if (isAgentServiceConfigured()) {
    const live = runRemote(question, sessionId);
    for await (const ev of streamAndRecord(live, question)) {
      yield ev;
    }
    return;
  }
  if (!process.env.OPENAI_API_KEY) {
    yield {
      type: "investigation_failed",
      reason:
        "This is a stub demo. This question isn't in the recorded set, and neither AGENT_SERVICE_URL nor OPENAI_API_KEY is configured. Try one of the trending questions on the home page.",
    };
    return;
  }
  const runLiveLocal = await loadLocalRunner();
  const live = runLiveLocal(question, sessionId);
  for await (const ev of streamAndRecord(live, question)) {
    yield ev;
  }
}

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

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: unknown) => {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(data)}\n\n`),
        );
      };
      try {
        for await (const ev of selectStream(
          body.question,
          body.sessionId,
          body.speed,
        )) {
          send(ev);
        }
      } catch (err) {
        send(failure(err));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
    },
  });
}

function failure(err: unknown): InvestigationEvent {
  if (err instanceof UnknownInvestigationError) {
    return {
      type: "investigation_failed",
      reason:
        "This is a stub demo. Click one of the suggested questions below — those are wired to recorded investigations against real public records.",
    };
  }
  return {
    type: "investigation_failed",
    reason: `Unexpected error: ${err instanceof Error ? err.message : String(err)}`,
  };
}

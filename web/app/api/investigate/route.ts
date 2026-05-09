import { z } from "zod";
import {
  runInvestigation,
  UnknownInvestigationError,
} from "@/lib/investigations/stub";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  question: z.string().min(3).max(500),
  sessionId: z.string().min(1).max(64),
  speed: z.number().positive().max(10).optional(),
});

export async function POST(req: Request) {
  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await req.json());
  } catch (err) {
    return new Response(
      JSON.stringify({ error: "invalid request", detail: String(err) }),
      { status: 400, headers: { "content-type": "application/json" } },
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
        for await (const ev of runInvestigation(
          body.sessionId,
          body.question,
          { speed: body.speed },
        )) {
          send(ev);
        }
      } catch (err) {
        if (err instanceof UnknownInvestigationError) {
          send({
            type: "investigation_failed",
            reason:
              "This is a stub demo. Click one of the suggested questions below — those are wired to recorded investigations against real public records.",
          });
        } else {
          send({
            type: "investigation_failed",
            reason: `Unexpected error: ${String(err)}`,
          });
        }
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

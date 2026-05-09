import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import OpenAI from "openai";
import { loadDotEnv } from "./env.ts";
import { generateReadNext } from "./read_next/index.ts";
import type { InvestigationEvent } from "@txmoney/mcp/events";

// One-shot: walks each recorded JSONL fixture under
// web/lib/investigations/recorded/, runs the read-next generator on the
// captured narrative + graph, and appends a read_next event line at the
// end. Idempotent — skips any file that already contains a read_next.
//
// Usage: `npx tsx agent/src/backfill_read_next.ts [--dry-run]`

const HERE = path.dirname(fileURLToPath(import.meta.url));
const RECORDED_DIR = path.resolve(
  HERE,
  "..",
  "..",
  "web",
  "lib",
  "investigations",
  "recorded",
);

type EventLine = { ts: number; event: InvestigationEvent };
type MetaLine = {
  meta: { id: string; question: string; pillLabel: string; tags: string[] };
};

async function processFile(
  client: OpenAI,
  model: string,
  filePath: string,
  dryRun: boolean,
): Promise<{ skipped: boolean; reason?: string; written?: boolean }> {
  const text = await fs.promises.readFile(filePath, "utf8");
  const lines = text.split("\n").filter((l) => l.trim().length > 0);
  if (lines.length === 0) return { skipped: true, reason: "empty file" };

  const headerObj = JSON.parse(lines[0]) as Partial<MetaLine>;
  if (!headerObj.meta) return { skipped: true, reason: "no meta line" };
  const meta = headerObj.meta;

  const events: InvestigationEvent[] = [];
  for (let i = 1; i < lines.length; i++) {
    const obj = JSON.parse(lines[i]) as Partial<EventLine>;
    if (obj.event) events.push(obj.event);
  }

  if (events.some((e) => e.type === "read_next")) {
    return { skipped: true, reason: "already has read_next" };
  }
  if (!events.some((e) => e.type === "investigation_complete")) {
    return { skipped: true, reason: "did not complete" };
  }

  const narrative = events
    .filter((e): e is Extract<InvestigationEvent, { type: "narrative_chunk" }> => e.type === "narrative_chunk")
    .map((e) => ({ role: e.role ?? "body", text: e.text }));
  const entities = events
    .filter((e): e is Extract<InvestigationEvent, { type: "graph_node" }> => e.type === "graph_node")
    .map((e) => ({ kind: e.kind, label: e.label, sublabel: e.sublabel }));

  const event = await generateReadNext(client, model, {
    question: meta.question,
    narrative,
    entities,
  });
  if (!event) return { skipped: true, reason: "model returned malformed JSON" };

  const newLine = JSON.stringify({ ts: Date.now(), event });
  process.stderr.write(
    `  ${meta.id} -> ${event.kicker} | ${event.question}\n`,
  );
  if (dryRun) return { skipped: false, written: false };

  await fs.promises.writeFile(
    filePath,
    text.endsWith("\n") ? text + newLine + "\n" : text + "\n" + newLine + "\n",
    "utf8",
  );
  return { skipped: false, written: true };
}

async function main(): Promise<void> {
  loadDotEnv();
  if (!process.env.OPENAI_API_KEY) {
    console.error("OPENAI_API_KEY is unset; backfill needs it.");
    process.exit(2);
  }
  const dryRun = process.argv.includes("--dry-run");
  const model = process.env.TXMONEY_READ_NEXT_MODEL ?? "gpt-5-mini";
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const files = (await fs.promises.readdir(RECORDED_DIR))
    .filter((f) => f.endsWith(".jsonl"))
    .map((f) => path.join(RECORDED_DIR, f))
    .sort();

  process.stderr.write(`backfilling ${files.length} fixtures (model=${model}, dry-run=${dryRun})\n`);
  let written = 0;
  let skipped = 0;
  for (const fp of files) {
    try {
      const r = await processFile(client, model, fp, dryRun);
      if (r.skipped) {
        process.stderr.write(`  skip  ${path.basename(fp)}: ${r.reason}\n`);
        skipped++;
      } else if (r.written) {
        written++;
      }
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      process.stderr.write(`  FAIL  ${path.basename(fp)}: ${reason}\n`);
    }
  }
  process.stderr.write(`done: ${written} written, ${skipped} skipped\n`);
}

main();

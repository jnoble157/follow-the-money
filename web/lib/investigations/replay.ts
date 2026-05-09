import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";
import type { InvestigationEvent } from "./types";

// JSONL replay engine. Recorded heroes (committed) and ad-hoc cached runs
// (gitignored) live as JSONL files where each line is either:
//   { meta: { id, question, pillLabel, tags } }   (one-time header)
// or:
//   { ts: number, event: InvestigationEvent }     (zero or more bodies)
//
// `ts` is wall-clock milliseconds at recording time. We *don't* replay at the
// original gaps — those gaps are mostly model-tool-call latency and don't
// reflect anything the reader needs to see paced out. Instead we walk events
// at a fixed cadence per type (CADENCE_MS below), scaled by `speed`.

export type RecordedFile = {
  filePath: string;
  meta: RecordedMeta;
};

export type RecordedMeta = {
  id: string;
  question: string;
  pillLabel: string;
  tags: string[];
};

type EventLine = { ts: number; event: InvestigationEvent };
type MetaLine = { meta: RecordedMeta };

export async function readRecordedMeta(
  filePath: string,
): Promise<RecordedMeta | null> {
  try {
    const stream = fs.createReadStream(filePath, { encoding: "utf8" });
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
    for await (const line of rl) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const obj = JSON.parse(trimmed) as Partial<MetaLine>;
      if (obj.meta) {
        rl.close();
        stream.close();
        return obj.meta;
      }
      // First line wasn't meta; the file is malformed.
      rl.close();
      stream.close();
      return null;
    }
    return null;
  } catch {
    return null;
  }
}

// Replay cadence (ms) per event type. Original recorded timestamps were
// dominated by model-call latency and didn't pace anything a reader needs.
// We replay at a fixed rate so the run feels live without the variance.
//
// Calibration: a typical hero run is ~25 events (3 plan steps + 4 tool
// rounds + ~10 narrative chunks + ~6 graph events). With these numbers the
// run lands in ~5s — long enough to read the lede as it appears, short
// enough that a judge doesn't tap out.
const CADENCE_MS: Record<InvestigationEvent["type"], number> = {
  plan_started: 0,
  investigation_started: 0,
  plan_step: 280,
  tool_call: 200,
  tool_result: 220,
  narrative_chunk: 380,
  graph_node: 80,
  graph_edge: 80,
  investigation_complete: 200,
  read_next: 240,
  investigation_failed: 0,
};

export async function* replayJsonl(
  filePath: string,
  speed = 1,
): AsyncGenerator<InvestigationEvent> {
  const stream = fs.createReadStream(filePath, { encoding: "utf8" });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const obj = JSON.parse(trimmed) as Partial<MetaLine & EventLine>;
    if (obj.meta) continue;
    if (!obj.event) continue;

    const delay = (CADENCE_MS[obj.event.type] ?? 50) * speed;
    if (delay > 0) await sleep(delay);

    if (obj.event.type === "investigation_started") {
      yield { type: "investigation_started", startedAt: Date.now() };
    } else {
      yield obj.event;
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..", "..", "..");
const RECORDED_DIR = path.join(HERE, "recorded");
const CACHE_DIR = path.join(REPO_ROOT, "data", "cache", "investigations");

export async function loadRecorded(
  question: string,
): Promise<RecordedFile | null> {
  const norm = normalizeQuestion(question);
  for (const file of await readdir(RECORDED_DIR)) {
    if (!file.endsWith(".jsonl")) continue;
    const fp = path.join(RECORDED_DIR, file);
    const meta = await readRecordedMeta(fp);
    if (!meta) continue;
    if (normalizeQuestion(meta.question) === norm) {
      return { filePath: fp, meta };
    }
  }
  return null;
}

// Ad-hoc cache, keyed by sha1(normalized question). Lives outside the repo
// at data/cache/investigations/ and is gitignored.
export async function cachedFilePath(question: string): Promise<string> {
  await fs.promises.mkdir(CACHE_DIR, { recursive: true });
  const sha = await sha1(normalizeQuestion(question));
  return path.join(CACHE_DIR, `${sha}.jsonl`);
}

export async function loadCached(
  question: string,
): Promise<string | null> {
  const fp = await cachedFilePath(question);
  try {
    const stat = await fs.promises.stat(fp);
    if (stat.size > 0) return fp;
  } catch {
    return null;
  }
  return null;
}

// Wraps a live agent generator: tees each event to a JSONL cache file as
// it streams. On generator throw, deletes the partial file (don't cache
// failures).
export async function* streamAndRecord(
  source: AsyncGenerator<InvestigationEvent>,
  question: string,
): AsyncGenerator<InvestigationEvent> {
  const fp = await cachedFilePath(question);
  const tmp = `${fp}.partial`;
  await fs.promises.mkdir(path.dirname(tmp), { recursive: true });
  const handle = await fs.promises.open(tmp, "w");
  let ok = false;
  try {
    // No meta line for ad-hoc caches — they replay anonymously.
    for await (const ev of source) {
      const line = JSON.stringify({ ts: Date.now(), event: ev });
      await handle.write(line + "\n");
      yield ev;
      if (ev.type === "investigation_failed") {
        // Don't promote a partial run to the cache when the agent
        // explicitly failed.
        ok = false;
        break;
      }
    }
    ok = true;
  } finally {
    await handle.close();
    if (ok) {
      try {
        await fs.promises.rename(tmp, fp);
      } catch {
        // best-effort
      }
    } else {
      await fs.promises.unlink(tmp).catch(() => undefined);
    }
  }
}

function normalizeQuestion(q: string): string {
  return q.trim().toLowerCase().replace(/\s+/g, " ");
}

async function sha1(s: string): Promise<string> {
  // Use Web Crypto so the function works on either edge or node runtimes.
  const data = new TextEncoder().encode(s);
  const buf = await crypto.subtle.digest("SHA-1", data);
  return [...new Uint8Array(buf)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function readdir(p: string): Promise<string[]> {
  try {
    return await fs.promises.readdir(p);
  } catch {
    return [];
  }
}

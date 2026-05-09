// One-shot: insert a headline narrative_chunk in front of the first existing
// narrative chunk for every ad-hoc cached run under data/cache/investigations/.
//
// The cache is gitignored — these are local replay captures from before the
// "headline is mandatory" rule shipped. Without this, asking the same
// question twice replays the pre-headline events and the report panel
// renders without a headline. Deleting the cache would force re-spending
// tokens and slow the demo path; backfilling lifts the lede's first
// sentence (verbatim, with citations preserved) into a headline role so
// Hard Rule 1 still holds.
//
// Run with: npx tsx scripts/backfill_cached_headlines.ts

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = path.resolve(HERE, "..", "data", "cache", "investigations");

type CachedLine = { ts: number; event: Record<string, unknown> };

function firstSentence(text: string): string {
  const cleaned = text.replace(/\s+/g, " ").trim();
  const m = cleaned.match(/^(.+?[.!?])(\s|$)/);
  const sentence = m ? m[1] : cleaned;
  // Hard rule for headlines: no em dashes; strip if the lede had one.
  return sentence.replace(/\s*[—–]\s*/g, ", ").trim();
}

function backfillFile(fp: string): { changed: boolean; reason: string } {
  const raw = fs.readFileSync(fp, "utf8");
  const lines = raw.split("\n").filter((l) => l.length > 0);
  const parsed: CachedLine[] = lines.map((l) => JSON.parse(l));

  const hasHeadline = parsed.some(
    (p) =>
      p.event.type === "narrative_chunk" &&
      (p.event as { role?: string }).role === "headline",
  );
  if (hasHeadline) return { changed: false, reason: "already has headline" };

  const firstChunkIdx = parsed.findIndex(
    (p) => p.event.type === "narrative_chunk",
  );
  if (firstChunkIdx < 0) return { changed: false, reason: "no narrative chunk" };

  const lede = parsed[firstChunkIdx].event as {
    type: string;
    role?: string;
    text: string;
    citations?: unknown[];
  };
  const headlineText = firstSentence(lede.text);
  if (!headlineText) return { changed: false, reason: "empty lede" };

  const citations = Array.isArray(lede.citations) ? lede.citations.slice(0, 1) : [];

  const headlineLine: CachedLine = {
    ts: parsed[firstChunkIdx].ts,
    event: {
      type: "narrative_chunk",
      role: "headline",
      text: headlineText,
      citations,
    },
  };

  parsed.splice(firstChunkIdx, 0, headlineLine);
  const out = parsed.map((p) => JSON.stringify(p)).join("\n") + "\n";
  fs.writeFileSync(fp, out);
  return { changed: true, reason: `inserted: ${headlineText.slice(0, 80)}` };
}

function main() {
  const files = fs
    .readdirSync(CACHE_DIR)
    .filter((f) => f.endsWith(".jsonl"))
    .map((f) => path.join(CACHE_DIR, f));
  let changed = 0;
  let skipped = 0;
  for (const fp of files) {
    const { changed: ok, reason } = backfillFile(fp);
    const tag = ok ? "[ok ]" : "[skip]";
    console.log(`${tag} ${path.basename(fp)} ${reason}`);
    if (ok) changed++;
    else skipped++;
  }
  console.log(`\n${changed} changed, ${skipped} skipped`);
}

main();

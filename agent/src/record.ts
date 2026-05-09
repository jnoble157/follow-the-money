// Drives the live agent against one of the named heroes and writes the
// result as a JSONL fixture under web/lib/investigations/recorded/. The
// fixture format matches what loadRecorded/replayJsonl expect:
//   line 1: { meta: { id, question, pillLabel, tags } }
//   line 2..N: { ts: number, event: InvestigationEvent }
//
// Usage:
//   npm run record-hero -- a1-watson [--out path]
//
// We hand-inspect each output before committing. The hand-scripted .ts
// versions get deleted in the same commit.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadDotEnv } from "./env.ts";
import { runInvestigation } from "./runner.ts";

type HeroMeta = {
  id: string;
  question: string;
  pillLabel: string;
  tags: string[];
};

// Exact metadata from the existing hand-scripted files. We keep this list
// inline so the recording script doesn't depend on the web/ TS importing.
const HEROES: Record<string, HeroMeta> = {
  "a1-watson": {
    id: "a1-watson",
    question: "What happens to politicians' leftover campaign money?",
    pillLabel: "$1.18M Senate-to-mayor pivot",
    tags: ["austin", "watson", "mayor", "expenditure", "tec-state", "transfer"],
  },
  "a2-endeavor": {
    id: "a2-endeavor",
    question: "Are real-estate developers paying Austin politicians?",
    pillLabel: "One firm, two decades of checks",
    tags: [
      "austin",
      "watson",
      "mayor",
      "lobby",
      "real-estate",
      "entity-resolution",
      "employer-rollup",
    ],
  },
  "a3-cross-tier": {
    id: "a3-cross-tier",
    question: "Do Austin's lobbyists also work the state capitol?",
    pillLabel: "Twelve cross-tier lobbyists",
    tags: ["lobby", "austin", "tec-state", "cross-tier", "fuzzy-join"],
  },
  "b1-save-austin": {
    id: "b1-save-austin",
    question:
      "Which tech-founder money reshaped Austin's homelessness policy in 2021?",
    pillLabel: "$4.95M reshaped Prop B",
    tags: ["austin", "ballot", "2021", "pac", "tech-money"],
  },
  "b3-uber": {
    id: "b3-uber",
    question: "Which Silicon Valley giant tried to buy an Austin election?",
    pillLabel: "$3.21M into one ballot fight",
    tags: ["austin", "ballot", "2016", "pac", "corporate-money"],
  },
};

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..", "..");
const DEFAULT_OUT_DIR = path.join(
  REPO_ROOT,
  "web",
  "lib",
  "investigations",
  "recorded",
);

type CliArgs = {
  ids: string[];
  outDir: string;
};

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    ids: [],
    outDir: DEFAULT_OUT_DIR,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--out") {
      args.outDir = argv[++i] ?? DEFAULT_OUT_DIR;
    } else if (a === "--all") {
      args.ids = Object.keys(HEROES);
    } else if (a.startsWith("--")) {
      throw new Error(`unknown flag: ${a}`);
    } else {
      args.ids.push(a);
    }
  }
  return args;
}

async function recordOne(
  hero: HeroMeta,
  outDir: string,
): Promise<{ outPath: string; eventCount: number; durationMs: number }> {
  await fs.promises.mkdir(outDir, { recursive: true });
  const outPath = path.join(outDir, `${hero.id}.jsonl`);
  const tmpPath = `${outPath}.partial`;
  const handle = await fs.promises.open(tmpPath, "w");

  const meta = JSON.stringify({ meta: hero });
  await handle.write(meta + "\n");

  const sessionId = `record-${hero.id}-${Date.now().toString(36)}`;
  const t0 = Date.now();
  let count = 0;
  let ok = false;

  try {
    for await (const ev of runInvestigation(hero.question, sessionId)) {
      const line = JSON.stringify({ ts: Date.now(), event: ev });
      await handle.write(line + "\n");
      count++;
      if (ev.type === "investigation_failed") {
        throw new Error(`agent failed: ${ev.reason}`);
      }
    }
    ok = true;
  } finally {
    await handle.close();
    if (ok) {
      await fs.promises.rename(tmpPath, outPath);
    } else {
      await fs.promises.unlink(tmpPath).catch(() => undefined);
    }
  }

  return { outPath, eventCount: count, durationMs: Date.now() - t0 };
}

async function main(): Promise<void> {
  loadDotEnv();
  if (!process.env.OPENAI_API_KEY) {
    console.error(
      "OPENAI_API_KEY is unset; record-hero needs it. Set in repo .env.",
    );
    process.exit(2);
  }

  const args = parseArgs(process.argv.slice(2));
  if (args.ids.length === 0) {
    console.error(
      `usage: record-hero <id...> [--out path]\n` +
        `       record-hero --all\n` +
        `known: ${Object.keys(HEROES).join(", ")}`,
    );
    process.exit(2);
  }

  for (const id of args.ids) {
    const hero = HEROES[id];
    if (!hero) {
      console.error(`unknown hero id: ${id}`);
      process.exit(2);
    }
  }

  for (const id of args.ids) {
    const hero = HEROES[id];
    process.stderr.write(`record ${hero.id}: ${hero.question}\n`);
    try {
      const r = await recordOne(hero, args.outDir);
      process.stderr.write(
        `wrote ${r.outPath} (${r.eventCount} events, ${r.durationMs}ms)\n`,
      );
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      process.stderr.write(`FAIL ${hero.id}: ${reason}\n`);
      process.exitCode = 1;
    }
  }
}

main();

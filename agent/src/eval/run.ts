// Eval rig. Two suites share this runner: `questions.yaml` is the strict
// regression suite (CI gate); `exploratory.yaml` is the soak grid (demo
// gate). Both feed the same assertion library and the same JSON report
// shape. See AGENTS.md §8.
//
// Usage:
//   npm run eval                              # regression suite, all entries
//   npm run eval -- --suite exploratory       # soak grid
//   npm run eval -- --suite all               # both, with two separate reports
//   npm run eval -- --suite regression s1-epstein b3-uber   # subset by id
//   npm run eval -- --concurrency 4           # run N entries in parallel
//   npm run eval -- --report path/to/out.json # override report destination
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import { loadDotEnv } from "../env.ts";
import { runInvestigation, type InvestigationEvent } from "../runner.ts";
import { isExemptCitation } from "@txmoney/mcp/citations";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SUITES = {
  regression: path.join(HERE, "questions.yaml"),
  exploratory: path.join(HERE, "exploratory.yaml"),
} as const;
const REPORT_DIR = path.join(HERE, "reports");
const DEFAULT_CONCURRENCY = 4;

type SuiteName = keyof typeof SUITES;

// ---------- assertion schema -----------------------------------------------

type Expect = {
  // Backwards-compatible regression assertions.
  contains_role?: string;
  top_donor_name_includes?: string;
  top_donor_total_min?: number;
  top_donor_total_max?: number;

  // Tool-routing assertions. The runner inspects every `tool_call` event in
  // the stream; "tools" means the tool name (e.g. `top_donors`,
  // `cluster_employer_variants`, `web_search`, plus the writer tool names).
  // expected_tools_contains: every listed tool must have been called at least
  // once. must_not_call_tools: none of the listed tools may have been called.
  // max_calls_per_tool: for each {tool, max} entry, the count of calls to
  // that tool must not exceed `max` — guards against the agent spamming the
  // same query.
  expected_tools_contains?: string[];
  must_not_call_tools?: string[];
  max_calls_per_tool?: Record<string, number>;

  // Narrative assertions. Patterns are JS regex strings, evaluated
  // case-insensitive multiline against the concatenation of all
  // `narrative_chunk.text` chunks. must_match: every pattern in the list
  // must match somewhere. must_not_match: none of the patterns may match.
  must_match?: string[];
  must_not_match?: string[];

  // Citation grounding. When true, every citation in every narrative_chunk
  // must reference a `reportInfoIdent` that appeared in some preceding
  // tool_result.sourceRows for the same run. AGENTS.md §1.
  citation_must_be_grounded?: boolean;

  // Cap on citations per chunk. If a chunk has more than this many
  // citations, fail. Useful as a "no citation-stuffing" guard.
  max_citations_per_chunk?: number;

  // When true, a `narrative_chunk` with role "methods" must appear AFTER any
  // call to `cluster_employer_variants`. The same role can also appear after
  // any other fuzzy-match call; this assertion is the floor, not the
  // ceiling. (Matches the system-prompt §8 contract.)
  requires_methods_after_cluster?: boolean;

  // The agent should never include both topDonors and topRecipients in the
  // same investigation_complete. The shape of the question dictates which
  // direction the right rail renders; both at once is a routing bug.
  forbids_topDonors_and_topRecipients_both?: boolean;

  // Hard caps on the run as a whole.
  max_turns?: number;
  max_runtime_ms?: number;
};

type EvalEntry = {
  id: string;
  question: string;
  // Optional; defaults to the suite name. Used for per-category roll-up in
  // the summary.
  category?: string;
  expect: Expect;
};

type EvalResult = {
  suite: SuiteName;
  id: string;
  category: string;
  question: string;
  passed: boolean;
  failures: string[];
  durationMs: number;
  toolCallCounts: Record<string, number>;
  narrativeRoles: string[];
  // Captured for failed runs so the report itself is enough to triage —
  // no second run needed. Pass runs omit this to keep the report small.
  events?: InvestigationEvent[];
};

// ---------- runner ---------------------------------------------------------

async function runOne(suite: SuiteName, entry: EvalEntry): Promise<EvalResult> {
  const sessionId = `eval-${entry.id}-${Date.now().toString(36)}`;
  const events: InvestigationEvent[] = [];
  const failures: string[] = [];
  const t0 = Date.now();
  const exp = entry.expect;
  const maxRuntime = exp.max_runtime_ms ?? 90_000;

  const runPromise = (async () => {
    for await (const ev of runInvestigation(entry.question, sessionId)) {
      events.push(ev);
      if (Date.now() - t0 > maxRuntime) {
        throw new Error(`runtime ceiling ${maxRuntime}ms exceeded`);
      }
    }
  })();

  try {
    await runPromise;
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    failures.push(`runner: ${reason}`);
  }

  // ---- derived projections of the event stream --------------------------
  const toolCallCounts: Record<string, number> = {};
  const sourceRowsSeen = new Set<string>();
  const narrativeRoles: string[] = [];
  const fullNarrative: string[] = [];
  const citationsPerChunk: number[] = [];
  let lastClusterCallIdx = -1;
  let firstMethodsAfterClusterIdx = -1;
  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    if (e.type === "tool_call") {
      toolCallCounts[e.tool] = (toolCallCounts[e.tool] ?? 0) + 1;
      if (e.tool === "cluster_employer_variants") lastClusterCallIdx = i;
    } else if (e.type === "tool_result") {
      for (const id of e.sourceRows) sourceRowsSeen.add(id);
    } else if (e.type === "narrative_chunk") {
      narrativeRoles.push(e.role ?? "body");
      fullNarrative.push(e.text);
      citationsPerChunk.push(e.citations.length);
      if (
        e.role === "methods" &&
        lastClusterCallIdx >= 0 &&
        firstMethodsAfterClusterIdx === -1
      ) {
        firstMethodsAfterClusterIdx = i;
      }
    }
  }
  const completeEv = events.find(
    (e): e is Extract<InvestigationEvent, { type: "investigation_complete" }> =>
      e.type === "investigation_complete",
  );

  // ---- assertions -------------------------------------------------------
  if (exp.contains_role) {
    if (!narrativeRoles.includes(exp.contains_role)) {
      failures.push(`no narrative chunk with role ${exp.contains_role}`);
    }
  }

  if (exp.expected_tools_contains) {
    for (const t of exp.expected_tools_contains) {
      if (!toolCallCounts[t]) failures.push(`expected tool ${t} not called`);
    }
  }

  if (exp.must_not_call_tools) {
    for (const t of exp.must_not_call_tools) {
      if (toolCallCounts[t]) {
        failures.push(`forbidden tool ${t} called ${toolCallCounts[t]} times`);
      }
    }
  }

  if (exp.max_calls_per_tool) {
    for (const [t, max] of Object.entries(exp.max_calls_per_tool)) {
      const got = toolCallCounts[t] ?? 0;
      if (got > max) failures.push(`tool ${t} called ${got} > ${max}`);
    }
  }

  const narrative = fullNarrative.join("\n");
  for (const pat of exp.must_match ?? []) {
    const rx = compileRegex(pat, failures);
    if (rx && !rx.test(narrative)) {
      failures.push(`must_match /${pat}/im did not match narrative`);
    }
  }
  for (const pat of exp.must_not_match ?? []) {
    const rx = compileRegex(pat, failures);
    if (rx && rx.test(narrative)) {
      failures.push(`must_not_match /${pat}/im hit narrative`);
    }
  }

  if (exp.citation_must_be_grounded) {
    // Walk events in order; for each narrative_chunk, every citation's
    // reportInfoIdent must be in the set of sourceRows seen by some
    // preceding tool_result. Exempts citations that came from web_search
    // (those carry a non-TEC URL prefix) and the synthetic AUSTIN-PROP-K
    // family used by hand-scripted heroes.
    const seenSoFar = new Set<string>();
    for (const e of events) {
      if (e.type === "tool_result") {
        for (const id of e.sourceRows) seenSoFar.add(id);
      } else if (e.type === "narrative_chunk") {
        for (const c of e.citations) {
          if (!c.reportInfoIdent) continue;
          if (seenSoFar.has(c.reportInfoIdent)) continue;
          if (isExemptCitation(c.reportInfoIdent, c.url)) continue;
          failures.push(
            `ungrounded citation ${c.reportInfoIdent} (no preceding tool_result.sourceRows entry)`,
          );
        }
      }
    }
  }

  if (typeof exp.max_citations_per_chunk === "number") {
    for (const n of citationsPerChunk) {
      if (n > exp.max_citations_per_chunk) {
        failures.push(
          `narrative chunk with ${n} citations exceeds max ${exp.max_citations_per_chunk}`,
        );
      }
    }
  }

  if (exp.requires_methods_after_cluster) {
    if (lastClusterCallIdx === -1) {
      failures.push(
        "requires_methods_after_cluster: cluster_employer_variants was never called",
      );
    } else if (firstMethodsAfterClusterIdx === -1) {
      failures.push(
        "requires_methods_after_cluster: no methods narrative_chunk emitted after cluster_employer_variants",
      );
    }
  }

  if (exp.forbids_topDonors_and_topRecipients_both) {
    if (
      completeEv &&
      Array.isArray(completeEv.topDonors) && completeEv.topDonors.length > 0 &&
      Array.isArray(completeEv.topRecipients) && completeEv.topRecipients.length > 0
    ) {
      failures.push("investigation_complete carried both topDonors and topRecipients");
    }
  }

  if (
    exp.top_donor_name_includes ||
    exp.top_donor_total_min ||
    exp.top_donor_total_max
  ) {
    const top = completeEv?.topDonors?.[0];
    if (!top) {
      failures.push("expected top donor in investigation_complete; got none");
    } else {
      if (
        exp.top_donor_name_includes &&
        !top.donor.toLowerCase().includes(exp.top_donor_name_includes.toLowerCase())
      ) {
        failures.push(
          `top donor name ${JSON.stringify(top.donor)} does not include ${JSON.stringify(exp.top_donor_name_includes)}`,
        );
      }
      if (exp.top_donor_total_min && top.total < exp.top_donor_total_min) {
        failures.push(`top donor total ${top.total} < ${exp.top_donor_total_min}`);
      }
      if (exp.top_donor_total_max && top.total > exp.top_donor_total_max) {
        failures.push(`top donor total ${top.total} > ${exp.top_donor_total_max}`);
      }
    }
  }

  const passed = failures.length === 0;
  return {
    suite,
    id: entry.id,
    category: entry.category ?? suite,
    question: entry.question,
    passed,
    failures,
    durationMs: Date.now() - t0,
    toolCallCounts,
    narrativeRoles,
    events: passed ? undefined : events,
  };
}

function compileRegex(pat: string, failures: string[]): RegExp | null {
  try {
    return new RegExp(pat, "im");
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    failures.push(`bad regex /${pat}/im: ${reason}`);
    return null;
  }
}

// ---------- driver --------------------------------------------------------

type CliArgs = {
  suites: SuiteName[];
  ids: string[];
  concurrency: number;
  reportPath?: string;
};

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    suites: ["regression"],
    ids: [],
    concurrency: DEFAULT_CONCURRENCY,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--suite") {
      const v = argv[++i];
      if (v === "regression" || v === "exploratory") {
        args.suites = [v];
      } else if (v === "all") {
        args.suites = ["regression", "exploratory"];
      } else {
        throw new Error(`unknown suite: ${v}`);
      }
    } else if (a === "--concurrency") {
      args.concurrency = Math.max(1, parseInt(argv[++i] ?? "1", 10));
    } else if (a === "--report") {
      args.reportPath = argv[++i];
    } else if (a.startsWith("--")) {
      throw new Error(`unknown flag: ${a}`);
    } else {
      args.ids.push(a);
    }
  }
  return args;
}

function loadEntries(suite: SuiteName, idFilter: string[]): EvalEntry[] {
  const fp = SUITES[suite];
  if (!fs.existsSync(fp)) return [];
  const text = fs.readFileSync(fp, "utf8");
  const all = YAML.parse(text) as EvalEntry[] | null;
  const entries = all ?? [];
  return idFilter.length ? entries.filter((e) => idFilter.includes(e.id)) : entries;
}

async function runConcurrently<T, R>(
  items: T[],
  worker: (item: T) => Promise<R>,
  concurrency: number,
  onResult: (r: R, item: T) => void,
): Promise<R[]> {
  const results: R[] = [];
  let next = 0;
  async function take(): Promise<void> {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      const r = await worker(items[i]);
      results[i] = r;
      onResult(r, items[i]);
    }
  }
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, take);
  await Promise.all(workers);
  return results;
}

function summarize(results: EvalResult[]): {
  total: number;
  passed: number;
  byCategory: Record<string, { total: number; passed: number }>;
} {
  const byCategory: Record<string, { total: number; passed: number }> = {};
  for (const r of results) {
    const cat = r.category;
    byCategory[cat] = byCategory[cat] ?? { total: 0, passed: 0 };
    byCategory[cat].total += 1;
    if (r.passed) byCategory[cat].passed += 1;
  }
  return {
    total: results.length,
    passed: results.filter((r) => r.passed).length,
    byCategory,
  };
}

function writeReport(suite: SuiteName, results: EvalResult[], explicit?: string): string {
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const fp = explicit ?? path.join(REPORT_DIR, `${suite}-${ts}.json`);
  const summary = summarize(results);
  const payload = {
    suite,
    generatedAt: new Date().toISOString(),
    summary,
    results,
  };
  fs.writeFileSync(fp, JSON.stringify(payload, null, 2) + "\n");
  return fp;
}

async function runSuite(
  suite: SuiteName,
  ids: string[],
  concurrency: number,
  reportPath: string | undefined,
): Promise<{ results: EvalResult[]; reportPath: string }> {
  const entries = loadEntries(suite, ids);
  if (entries.length === 0) {
    process.stderr.write(`suite ${suite}: no entries matched\n`);
    return { results: [], reportPath: "" };
  }
  process.stderr.write(
    `suite ${suite}: ${entries.length} entries, concurrency ${concurrency}\n`,
  );
  const results = await runConcurrently<EvalEntry, EvalResult>(
    entries,
    (entry) => runOne(suite, entry),
    concurrency,
    (r) => {
      const flag = r.passed ? "pass" : "FAIL";
      process.stderr.write(`  ${flag} ${r.id}  ${r.durationMs}ms\n`);
      for (const f of r.failures) process.stderr.write(`       ${f}\n`);
    },
  );
  const summary = summarize(results);
  process.stderr.write(
    `\nsuite ${suite}: ${summary.passed}/${summary.total} passed\n`,
  );
  for (const [cat, s] of Object.entries(summary.byCategory)) {
    process.stderr.write(`  ${cat}: ${s.passed}/${s.total}\n`);
  }
  const fp = writeReport(suite, results, reportPath);
  if (fp) process.stderr.write(`report: ${fp}\n`);
  return { results, reportPath: fp };
}

async function main(): Promise<void> {
  loadDotEnv();
  if (!process.env.OPENAI_API_KEY) {
    console.error("OPENAI_API_KEY is unset; the eval rig needs it. Set in repo .env.");
    process.exit(2);
  }

  const args = parseArgs(process.argv.slice(2));
  let exitCode = 0;
  for (const suite of args.suites) {
    // Only honor an explicit --report path when running a single suite;
    // if the user asked for `--suite all`, write per-suite default reports
    // so they don't overwrite each other.
    const reportPath = args.suites.length === 1 ? args.reportPath : undefined;
    const { results } = await runSuite(suite, args.ids, args.concurrency, reportPath);
    if (results.length === 0) {
      exitCode = exitCode || 2;
      continue;
    }
    const summary = summarize(results);
    if (summary.passed !== summary.total) {
      exitCode = exitCode || 1;
    }
  }
  process.exit(exitCode);
}

main();

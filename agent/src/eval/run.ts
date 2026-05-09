// Hand-graded eval rig. Runs each entry in questions.yaml through the live
// agent and asserts a small set of expectations against the streamed event
// log. Two roles:
//   1. Pre-flight before stage. We run this and read the table.
//   2. Regression guard. CI runs it and a single failure fails the build.
//
// The questions live in questions.yaml so we can read and edit them without
// thinking about TypeScript escaping. Reads ANTHROPIC_API_KEY from
// repo-root .env automatically.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import { loadDotEnv } from "../env.ts";
import { runInvestigation, type InvestigationEvent } from "../runner.ts";
import { resolveDisambiguation } from "../sessions.ts";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const QUESTIONS_PATH = path.join(HERE, "questions.yaml");

type Expect = {
  triggers_disambiguation?: boolean;
  disambiguation_id?: string;
  contains_role?: string;
  top_donor_name_includes?: string;
  top_donor_total_min?: number;
  top_donor_total_max?: number;
};

type EvalEntry = {
  id: string;
  question: string;
  expect: Expect;
};

type EvalResult = {
  id: string;
  passed: boolean;
  failures: string[];
  durationMs: number;
};

async function runOne(entry: EvalEntry): Promise<EvalResult> {
  const sessionId = `eval-${entry.id}-${Date.now().toString(36)}`;
  const events: InvestigationEvent[] = [];
  const failures: string[] = [];
  const t0 = Date.now();

  // If the agent asks for disambiguation we always answer "merge" so the
  // run completes. Eval entries can still assert that the prompt happened
  // — the answer itself just isn't part of any expectation.
  for await (const ev of runInvestigation(entry.question, sessionId)) {
    events.push(ev);
    if (ev.type === "disambiguation_required") {
      resolveDisambiguation(sessionId, ev.id, true);
    }
  }

  const exp = entry.expect;
  const triggered = events.some((e) => e.type === "disambiguation_required");
  if (
    typeof exp.triggers_disambiguation === "boolean" &&
    triggered !== exp.triggers_disambiguation
  ) {
    failures.push(
      `triggers_disambiguation expected ${exp.triggers_disambiguation}, got ${triggered}`,
    );
  }
  if (exp.disambiguation_id) {
    const hit = events.find(
      (e) => e.type === "disambiguation_required" && e.id === exp.disambiguation_id,
    );
    if (!hit) {
      failures.push(`disambiguation_id ${exp.disambiguation_id} not seen`);
    }
  }
  if (exp.contains_role) {
    const hit = events.some(
      (e) => e.type === "narrative_chunk" && e.role === exp.contains_role,
    );
    if (!hit) failures.push(`no narrative chunk with role ${exp.contains_role}`);
  }

  const complete = events.find(
    (e): e is Extract<InvestigationEvent, { type: "investigation_complete" }> =>
      e.type === "investigation_complete",
  );
  if (exp.top_donor_name_includes || exp.top_donor_total_min || exp.top_donor_total_max) {
    const top = complete?.topDonors?.[0];
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
        failures.push(
          `top donor total ${top.total} < ${exp.top_donor_total_min}`,
        );
      }
      if (exp.top_donor_total_max && top.total > exp.top_donor_total_max) {
        failures.push(
          `top donor total ${top.total} > ${exp.top_donor_total_max}`,
        );
      }
    }
  }

  return {
    id: entry.id,
    passed: failures.length === 0,
    failures,
    durationMs: Date.now() - t0,
  };
}

async function main(): Promise<void> {
  loadDotEnv();
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error(
      "ANTHROPIC_API_KEY is unset; the eval rig needs it. Set in repo .env.",
    );
    process.exit(2);
  }

  const text = fs.readFileSync(QUESTIONS_PATH, "utf8");
  const all = YAML.parse(text) as EvalEntry[];

  // Allow `tsx run.ts s1-epstein b3-uber` to run a subset.
  const wanted = process.argv.slice(2);
  const entries = wanted.length
    ? all.filter((e) => wanted.includes(e.id))
    : all;

  if (entries.length === 0) {
    console.error("no eval entries matched");
    process.exit(2);
  }

  const results: EvalResult[] = [];
  for (const entry of entries) {
    process.stderr.write(`run  ${entry.id}: ${entry.question}\n`);
    try {
      const r = await runOne(entry);
      results.push(r);
      const flag = r.passed ? "pass" : "FAIL";
      process.stderr.write(`${flag} ${r.id}  ${r.durationMs}ms\n`);
      for (const f of r.failures) process.stderr.write(`     ${f}\n`);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      results.push({
        id: entry.id,
        passed: false,
        failures: [`runner threw: ${reason}`],
        durationMs: 0,
      });
      process.stderr.write(`FAIL ${entry.id}  threw: ${reason}\n`);
    }
  }

  const passed = results.filter((r) => r.passed).length;
  process.stderr.write(`\n${passed}/${results.length} passed\n`);
  process.exit(passed === results.length ? 0 : 1);
}

main();

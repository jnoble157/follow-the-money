"use client";

import { useEffect, useState } from "react";
import type { PlanStepView } from "@/lib/investigations/state";

type Props = {
  steps: PlanStepView[];
  status: "idle" | "running" | "complete" | "failed";
};

export function PlanTrace({ steps, status }: Props) {
  return (
    <div className="space-y-3">
      <Header status={status} />
      {steps.length === 0 ? (
        <p className="text-[13px] text-muted">
          The agent's plan, tool calls, and intermediate results stream here as
          the investigation runs. Click any step to inspect the underlying
          rows.
        </p>
      ) : (
        <ol className="relative space-y-2 border-l border-rule pl-4">
          {steps.map((s) => (
            <Step key={s.id} step={s} />
          ))}
        </ol>
      )}
    </div>
  );
}

function Header({ status }: { status: Props["status"] }) {
  const label =
    status === "running"
      ? "Running"
      : status === "complete"
      ? "Complete"
      : status === "failed"
      ? "Failed"
      : "Idle";
  return (
    <div className="flex items-center justify-between">
      <h2 className="font-mono text-[11px] uppercase tracking-wider text-muted">
        Agent trace
      </h2>
      <span
        className={
          "font-mono text-[11px] uppercase tracking-wider " +
          (status === "failed" ? "text-accent" : "text-muted")
        }
      >
        {label}
      </span>
    </div>
  );
}

function Step({ step }: { step: PlanStepView }) {
  const [open, setOpen] = useState(false);
  // Tick the elapsed counter for the running step so the timer feels live.
  // Once endedAt is set we freeze; for the still-running case we recompute
  // every 250ms.
  const [now, setNow] = useState<number>(() => Date.now());
  useEffect(() => {
    if (step.status !== "running" || step.endedAt) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [step.status, step.endedAt]);

  const elapsedMs = step.startedAt
    ? Math.max(0, (step.endedAt ?? now) - step.startedAt)
    : undefined;

  const tool = step.toolCall?.tool;
  const provenance = tool ? PROVENANCE[tool] : undefined;
  const outcome = stepOutcome(step);

  return (
    <li className="relative -ml-[5px] pl-3">
      <Dot status={step.status} />
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="block w-full text-left"
      >
        <div className="flex flex-wrap items-baseline gap-x-2">
          <p className="text-[13px] leading-snug text-ink">{step.description}</p>
          {elapsedMs !== undefined ? (
            <span className="font-mono tnum text-[10px] uppercase tracking-wider text-muted">
              {formatElapsed(elapsedMs)}
            </span>
          ) : null}
        </div>
        {step.toolCall ? (
          <p className="mt-0.5 flex flex-wrap items-baseline gap-x-2 font-mono text-[11px] text-muted">
            <span className="truncate text-ink">
              {step.toolCall.tool}({summarizeArgs(step.toolCall.args)})
            </span>
            {provenance ? (
              <span className="rounded-sm bg-page px-1.5 py-px text-[10px] uppercase tracking-wider text-evidence">
                {provenance}
              </span>
            ) : null}
          </p>
        ) : null}
        {step.toolResult ? (
          <p className="mt-0.5 flex flex-wrap items-baseline gap-x-2 font-mono text-[10px] uppercase tracking-wider text-muted">
            <Receipt
              label="rows"
              value={step.toolResult.rowCount.toLocaleString()}
            />
            {step.toolResult.citedRowCount > 0 ? (
              <Receipt
                label="cited"
                value={step.toolResult.citedRowCount.toLocaleString()}
              />
            ) : null}
            {typeof step.toolResult.confidence === "number" ? (
              <Receipt
                label="conf"
                value={step.toolResult.confidence.toFixed(2)}
                tone={step.toolResult.confidence >= 0.85 ? "evidence" : "accent"}
              />
            ) : null}
            {outcome ? (
              <span className="rounded-sm border border-rule px-1.5 py-px text-[10px] normal-case tracking-normal text-ink">
                {outcome}
              </span>
            ) : null}
          </p>
        ) : null}
      </button>
      {open && step.toolResult ? (
        <pre className="mt-2 max-h-40 overflow-auto rounded-sm border border-rule bg-white p-2 font-mono text-[11px] leading-snug text-ink">
          {JSON.stringify(step.toolResult.sample, null, 2)}
        </pre>
      ) : null}
    </li>
  );
}

function Receipt({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "evidence" | "accent";
}) {
  const cls =
    tone === "evidence"
      ? "text-evidence"
      : tone === "accent"
      ? "text-accent"
      : "text-ink";
  return (
    <span>
      <span className="text-muted">{label} </span>
      <span className={`tnum ${cls}`}>{value}</span>
    </span>
  );
}

function Dot({ status }: { status: PlanStepView["status"] }) {
  const cls =
    status === "running" ? "bg-accent animate-pulseRing" : "bg-ink";
  return (
    <span
      aria-hidden
      className={`absolute -left-[6px] top-[7px] h-[7px] w-[7px] rounded-full ${cls}`}
    />
  );
}

function summarizeArgs(args: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(args)) {
    if (typeof v === "string") parts.push(`${k}: "${truncate(v)}"`);
    else if (typeof v === "number" || typeof v === "boolean")
      parts.push(`${k}: ${v}`);
    else if (Array.isArray(v))
      parts.push(`${k}: [${v.length}]`);
    else parts.push(`${k}: …`);
  }
  return parts.join(", ");
}

function truncate(s: string, n = 32): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

function formatElapsed(ms: number): string {
  if (ms < 1000) return `${ms} ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(s < 10 ? 1 : 0)}s`;
  const m = Math.floor(s / 60);
  const rs = Math.round(s - m * 60);
  return `${m}m ${rs}s`;
}

// Reader-facing label for each MCP tool. Matches the vocabulary in the
// system prompt's tool routing section so the plan trace and the agent's
// methods callout speak the same names.
const PROVENANCE: Record<string, string> = {
  find_filer: "Austin filers",
  top_donors: "Austin contributions",
  top_pacs: "Austin PAC index",
  get_contributions: "Austin contributions",
  get_expenditures: "Austin expenditures",
  cluster_employer_variants: "Austin employer rollup",
  cross_reference_lobby: "Austin lobby ↔ TEC lobby",
  find_state_filer: "TEC filers",
  top_state_donors: "TEC contributions",
  get_state_contributions: "TEC contributions",
  get_state_expenditures: "TEC expenditures",
};

// Outcome tag derived from result row count + tool name. Short prose the
// reader can scan without reading the tool args; the agent's narrative
// makes the same point in long form.
function stepOutcome(step: PlanStepView): string | undefined {
  const tr = step.toolResult;
  const tool = step.toolCall?.tool;
  if (!tr || !tool) return undefined;
  if (tr.rowCount === 0) return "no rows for that filter";
  if (tool === "top_donors" || tool === "top_state_donors") {
    return `top ${Math.min(tr.rowCount, 5)} donors`;
  }
  if (tool === "find_filer" || tool === "find_state_filer") {
    return tr.rowCount === 1 ? "1 filer matched" : `${tr.rowCount} filer candidates`;
  }
  if (tool === "cluster_employer_variants") {
    return `${tr.rowCount} cluster${tr.rowCount === 1 ? "" : "s"}`;
  }
  if (tool === "cross_reference_lobby") {
    return `${tr.rowCount} cross-tier match${tr.rowCount === 1 ? "" : "es"}`;
  }
  if (tool === "get_contributions" || tool === "get_state_contributions") {
    return `${tr.rowCount} contribution${tr.rowCount === 1 ? "" : "s"}`;
  }
  if (tool === "get_expenditures" || tool === "get_state_expenditures") {
    return `${tr.rowCount} expenditure${tr.rowCount === 1 ? "" : "s"}`;
  }
  if (tool === "top_pacs") {
    return `top ${Math.min(tr.rowCount, 5)} PACs`;
  }
  return `${tr.rowCount} rows`;
}

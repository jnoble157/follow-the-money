"use client";

import { useState } from "react";
import type { PlanStepView } from "@/lib/investigations/state";

type Props = {
  steps: PlanStepView[];
  status: "idle" | "running" | "blocked" | "complete" | "failed";
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
        <ol className="relative space-y-1 border-l border-rule pl-4">
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
      : status === "blocked"
      ? "Waiting for you"
      : status === "complete"
      ? "Complete"
      : status === "failed"
      ? "Failed"
      : "Idle";
  return (
    <div className="flex items-center justify-between">
      <h2 className="font-mono text-[11px] uppercase tracking-wider text-muted">
        Plan trace
      </h2>
      <span
        className={
          "font-mono text-[11px] uppercase tracking-wider " +
          (status === "blocked"
            ? "text-accent"
            : status === "failed"
            ? "text-accent"
            : "text-muted")
        }
      >
        {label}
      </span>
    </div>
  );
}

function Step({ step }: { step: PlanStepView }) {
  const [open, setOpen] = useState(false);
  return (
    <li className="relative -ml-[5px] pl-3">
      <Dot status={step.status} />
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="block w-full text-left"
      >
        <p className="text-[13px] leading-snug text-ink">{step.description}</p>
        {step.toolCall ? (
          <p className="mt-0.5 truncate font-mono text-[11px] text-muted">
            <span className="text-ink">{step.toolCall.tool}</span>(
            {summarizeArgs(step.toolCall.args)})
            {step.toolResult ? (
              <span className="ml-2 text-evidence">
                {step.toolResult.rowCount.toLocaleString()} rows
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

function Dot({ status }: { status: PlanStepView["status"] }) {
  const cls =
    status === "running"
      ? "bg-accent animate-pulseRing"
      : status === "blocked"
      ? "bg-accent"
      : "bg-ink";
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

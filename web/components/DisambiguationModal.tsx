"use client";

import { useEffect, useState } from "react";
import { formatMoney } from "@/lib/formatMoney";
import type { DisambiguationView } from "@/lib/investigations/state";
import type { EmployerVariant } from "@/lib/investigations/types";

type Props = {
  prompt: DisambiguationView | null;
  // Optional auto-confirm for ambient/kiosk mode. When set, the modal counts
  // down and resolves to `merged: autoConfirm.merged` after the delay. The
  // visible caption tells viewers this only happens because no one is driving.
  autoConfirm?: {
    merged: boolean;
    delayMs: number;
    caption: string;
  };
  onResolve: (id: string, merged: boolean) => Promise<void> | void;
};

export function DisambiguationModal({ prompt, autoConfirm, onResolve }: Props) {
  const [submitting, setSubmitting] = useState(false);
  const [remainingMs, setRemainingMs] = useState<number | null>(null);

  // Reset submitting state whenever a new prompt arrives.
  useEffect(() => {
    setSubmitting(false);
    if (autoConfirm && prompt) {
      setRemainingMs(autoConfirm.delayMs);
    } else {
      setRemainingMs(null);
    }
  }, [prompt, autoConfirm]);

  // Auto-confirm tick. The interval drives only the visible countdown; the
  // actual resolve is fired once when the timer reaches zero.
  useEffect(() => {
    if (!prompt || !autoConfirm) return;
    let cancelled = false;
    const start = Date.now();
    const interval = window.setInterval(() => {
      if (cancelled) return;
      const left = Math.max(0, autoConfirm.delayMs - (Date.now() - start));
      setRemainingMs(left);
      if (left === 0) {
        window.clearInterval(interval);
        void resolve(autoConfirm.merged);
      }
    }, 100);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
    // resolve is stable for a given prompt id below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prompt?.id, autoConfirm?.delayMs, autoConfirm?.merged]);

  if (!prompt) return null;

  async function resolve(merged: boolean) {
    if (submitting) return;
    setSubmitting(true);
    try {
      await onResolve(prompt!.id, merged);
    } catch {
      setSubmitting(false);
    }
  }

  const total = prompt.variants.reduce((s, v) => s + v.total, 0);
  const count = prompt.variants.reduce((s, v) => s + v.contributions, 0);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="disambiguation-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 px-4 py-4"
    >
      <div className="flex w-full max-w-3xl max-h-[calc(100vh-2rem)] flex-col overflow-hidden rounded-md border border-rule bg-page shadow-2xl">
        <div className="flex items-center justify-between border-b border-rule bg-white px-5 py-3">
          <span className="font-mono text-[10px] uppercase tracking-wider text-accent">
            Agent paused — entity resolution
          </span>
          <span className="font-mono text-[10px] uppercase tracking-wider text-muted">
            Step {prompt.stepId}
          </span>
        </div>
        <div className="flex-1 overflow-y-auto px-5 pb-4 pt-4 space-y-4">
          <h2
            id="disambiguation-title"
            className="font-serif text-[22px] leading-tight text-ink"
          >
            {prompt.title}
          </h2>
          <p className="text-[14px] leading-relaxed text-ink">
            {prompt.explanation}
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {prompt.variants.map((v) => (
              <VariantCard key={v.variant} variant={v} />
            ))}
          </div>
        </div>
        <div className="border-t border-rule bg-white px-5 py-3 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 text-[12px] text-muted">
            <p>
              <span className="font-mono tnum text-ink">
                {count.toLocaleString()}
              </span>{" "}
              contributions ·{" "}
              <span className="font-mono tnum text-ink">
                {formatMoney(total)}
              </span>{" "}
              if merged
            </p>
            {autoConfirm && remainingMs !== null ? (
              <p className="font-mono text-[11px] text-accent">
                Auto {autoConfirm.merged ? "merging" : "keeping separate"} in{" "}
                {Math.ceil(remainingMs / 1000)}s — {autoConfirm.caption}
              </p>
            ) : null}
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={() => resolve(false)}
              disabled={submitting}
              className="rounded-sm border border-rule bg-white px-4 py-2 text-[13px] text-ink hover:border-ink disabled:opacity-50"
            >
              No, keep separate
            </button>
            <button
              type="button"
              onClick={() => resolve(true)}
              disabled={submitting}
              className="rounded-sm bg-accent px-4 py-2 text-[13px] font-medium text-white hover:bg-accent/90 disabled:opacity-50"
            >
              Yes, merge
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function VariantCard({ variant }: { variant: EmployerVariant }) {
  return (
    <div className="rounded-sm border border-rule bg-white p-3">
      <p className="font-mono text-[13px] text-ink">{variant.variant}</p>
      <p className="mt-0.5 text-[12px] text-muted">
        <span className="font-mono tnum text-ink">
          {variant.contributions}
        </span>{" "}
        contributions ·{" "}
        <span className="font-mono tnum text-ink">
          {formatMoney(variant.total)}
        </span>
      </p>
      <p className="mt-2 text-[11px] text-muted">
        e.g. {variant.sampleContributors.join(", ")}
      </p>
      <p className="mt-1 font-mono text-[10px] text-muted">
        [{variant.sampleCitation.reportInfoIdent}]
      </p>
    </div>
  );
}

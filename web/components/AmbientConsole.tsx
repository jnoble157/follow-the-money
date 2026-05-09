"use client";

import { useEffect, useRef, useState } from "react";
import { useInvestigation } from "@/lib/investigations/useInvestigation";
import { HERO_INVESTIGATIONS } from "@/lib/investigations/registry";
import { PlanTrace } from "./PlanTrace";
import { Report } from "./Report";
import { EvidenceGraph } from "./EvidenceGraph";
import { DonorTable } from "./DonorTable";

const CYCLE_MS = 45_000;
const COOLDOWN_MS = 6_000;

export function AmbientConsole() {
  const { state, ask } = useInvestigation();
  const [index, setIndex] = useState(0);
  const indexRef = useRef(index);
  indexRef.current = index;

  // Kick off the first investigation immediately, then advance on a fixed
  // cadence regardless of completion. If the previous one is still streaming
  // when the next slot lands, ask() cancels the in-flight request before
  // starting the new one — so the booth never has dead air.
  useEffect(() => {
    function start(i: number) {
      const inv = HERO_INVESTIGATIONS[i % HERO_INVESTIGATIONS.length];
      void ask(inv.question, { speed: 0.6 });
    }
    start(0);
    const timer = window.setInterval(() => {
      const next = (indexRef.current + 1) % HERO_INVESTIGATIONS.length;
      setIndex(next);
      start(next);
    }, CYCLE_MS);
    return () => window.clearInterval(timer);
  }, [ask]);

  // After completion, leave the result on screen for the cooldown then start
  // the next investigation early. (Independent of the cycle interval; whichever
  // hits first wins.)
  useEffect(() => {
    if (state.status !== "complete") return;
    const t = window.setTimeout(() => {
      const next = (indexRef.current + 1) % HERO_INVESTIGATIONS.length;
      setIndex(next);
      const inv = HERO_INVESTIGATIONS[next];
      void ask(inv.question, { speed: 0.6 });
    }, COOLDOWN_MS);
    return () => window.clearTimeout(t);
  }, [state.status, ask]);

  const current = HERO_INVESTIGATIONS[index];

  return (
    <main className="mx-auto flex w-full max-w-[1600px] flex-1 flex-col gap-4 px-6 pb-4 pt-3">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-[12px]">
        <span className="font-mono uppercase tracking-[0.2em] text-accent">
          Live · attract mode
        </span>
        <span className="font-mono text-muted">
          {String(index + 1).padStart(2, "0")} / {HERO_INVESTIGATIONS.length}
        </span>
        <span className="font-mono text-muted">{current.id}</span>
        <span className="ml-auto font-mono text-muted">
          Press any key or focus the input on the laptop to drive the agent
          yourself
        </span>
      </div>
      <div className="grid flex-1 grid-cols-1 gap-4 lg:grid-cols-[340px_minmax(0,1fr)_480px]">
        <aside className="overflow-auto rounded-md border border-rule bg-white p-4">
          <PlanTrace steps={state.planSteps} status={state.status} />
        </aside>
        <section className="overflow-auto rounded-md border border-rule bg-white p-6">
          <Report state={state} />
        </section>
        <aside className="space-y-4 overflow-auto">
          <div className="rounded-md border border-rule bg-white p-4">
            <EvidenceGraph
              nodes={state.graphNodes}
              edges={state.graphEdges}
            />
          </div>
          <div className="rounded-md border border-rule bg-white p-4">
            <DonorTable donors={state.topDonors} />
          </div>
        </aside>
      </div>
    </main>
  );
}

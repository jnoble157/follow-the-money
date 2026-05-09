"use client";

import { useEffect, useRef } from "react";
import { useInvestigation } from "@/lib/investigations/useInvestigation";
import { PlanTrace } from "./PlanTrace";
import { Report } from "./Report";
import { EvidenceGraph } from "./EvidenceGraph";
import { DonorTable } from "./DonorTable";
import { DisambiguationModal } from "./DisambiguationModal";
import { RelatedRail } from "./RelatedRail";

type Props = {
  initialQuestion: string;
};

export function InvestigationConsole({ initialQuestion }: Props) {
  const { state, ask, resolveDisambiguation } = useInvestigation();

  // Re-run when the URL's q changes. The ref guards against React strict
  // mode double-invoke firing two streams in dev. The investigate page
  // upstream guarantees initialQuestion is non-empty.
  const lastRunRef = useRef<string | null>(null);
  useEffect(() => {
    const q = initialQuestion.trim();
    if (lastRunRef.current === q) return;
    lastRunRef.current = q;
    ask(q);
  }, [initialQuestion, ask]);

  return (
    <main className="mx-auto flex w-full max-w-[1600px] flex-col gap-6 px-6 py-6">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[340px_minmax(0,1fr)_480px]">
        <aside className="rounded-md border border-rule bg-white p-4">
          <PlanTrace steps={state.planSteps} status={state.status} />
        </aside>
        <section className="rounded-md border border-rule bg-white p-6">
          <Report state={state} fallbackQuestion={initialQuestion} />
        </section>
        <aside className="space-y-6">
          <div className="rounded-md border border-rule bg-white p-4">
            <EvidenceGraph
              nodes={state.graphNodes}
              edges={state.graphEdges}
            />
          </div>
          <div className="rounded-md border border-rule bg-white p-4">
            <DonorTable donors={state.topDonors} />
          </div>
          <RelatedRail
            currentQuestion={state.question}
            graphNodes={state.graphNodes}
          />
        </aside>
      </div>
      <DisambiguationModal
        prompt={state.pendingDisambiguation}
        onResolve={resolveDisambiguation}
      />
    </main>
  );
}

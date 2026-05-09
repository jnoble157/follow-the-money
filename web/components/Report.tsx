"use client";

import { useEffect, useState } from "react";
import type {
  InvestigationState,
  NarrativeChunk,
} from "@/lib/investigations/state";
import type { Citation, NarrativeRole } from "@/lib/investigations/types";
import { FootnoteGroup } from "./Footnote";

type Props = {
  state: InvestigationState;
  // The bound URL question. Rendered as the report header before the live
  // stream's plan_started event arrives so that even server-side HTML
  // contains the question text. Once the stream lands, state.question wins.
  fallbackQuestion?: string;
};

// The report panel. The agent's answer rendered as a structured news
// report rather than a chat transcript: status strip, question, lede,
// methods callout, body, reading note, missing-data note, citations
// footer. Each section appears only when there's content for it.
export function Report({ state, fallbackQuestion }: Props) {
  const { status, narrative, failureReason } = state;
  const question = state.question ?? fallbackQuestion ?? null;
  const grouped = groupByRole(narrative);

  // Footnote indices number the citations in the order they're rendered, so
  // the inline [n] markers and the canonical citations footer line up.
  const indexer = makeFootnoteIndexer();

  return (
    <article className="space-y-6">
      <ReportStatusStrip state={state} />
      {question ? (
        <header className="space-y-1">
          <p className="font-mono text-[11px] uppercase tracking-wider text-muted">
            Investigation
          </p>
          <h1 className="font-serif text-[28px] leading-tight text-ink">
            {question}
          </h1>
        </header>
      ) : null}
      {status === "failed" && failureReason ? (
        <p className="rounded-sm border border-accent/40 bg-accent/5 p-3 text-[14px] text-ink">
          {failureReason}
        </p>
      ) : null}
      {grouped.lede.map((c) => (
        <Lede key={c.id} chunk={c} indexer={indexer} />
      ))}
      {grouped.methods.length > 0 ? (
        <MethodsCallout chunks={grouped.methods} indexer={indexer} />
      ) : null}
      {grouped.body.map((c) => (
        <Paragraph key={c.id} chunk={c} indexer={indexer} />
      ))}
      {grouped.reading_note.map((c) => (
        <ReadingNote key={c.id} chunk={c} indexer={indexer} />
      ))}
      {grouped.missing.map((c) => (
        <MissingDataNote key={c.id} chunk={c} indexer={indexer} />
      ))}
      {status === "running" || status === "blocked" ? (
        <span
          aria-hidden
          className="inline-block h-4 w-1.5 animate-cursorBlink bg-ink"
        />
      ) : null}
      <CitationsFooter narrative={narrative} />
    </article>
  );
}

type Grouped = Record<NarrativeRole, NarrativeChunk[]>;

function groupByRole(chunks: NarrativeChunk[]): Grouped {
  const out: Grouped = {
    lede: [],
    body: [],
    methods: [],
    reading_note: [],
    missing: [],
  };
  for (const c of chunks) out[c.role ?? "body"].push(c);
  return out;
}

// Reuse a single counter across all sections so the footnote indices read
// 1, 2, 3… in the order chunks render rather than restarting per section.
type Indexer = { next: (count: number) => number };

function makeFootnoteIndexer(): Indexer {
  let n = 0;
  return {
    next(count: number) {
      n += 1;
      const start = n;
      n += count - 1;
      return start;
    },
  };
}

function Lede({
  chunk,
  indexer,
}: {
  chunk: NarrativeChunk;
  indexer: Indexer;
}) {
  const start = chunk.citations.length > 0 ? indexer.next(chunk.citations.length) : 0;
  return (
    <p className="font-serif text-[18px] leading-relaxed text-ink">
      {chunk.text}
      {chunk.citations.length > 0 ? (
        <FootnoteGroup startIndex={start} citations={chunk.citations} />
      ) : null}
    </p>
  );
}

function Paragraph({
  chunk,
  indexer,
}: {
  chunk: NarrativeChunk;
  indexer: Indexer;
}) {
  const start = chunk.citations.length > 0 ? indexer.next(chunk.citations.length) : 0;
  return (
    <p className="font-serif text-[16px] leading-relaxed text-ink">
      {chunk.text}
      {chunk.citations.length > 0 ? (
        <FootnoteGroup startIndex={start} citations={chunk.citations} />
      ) : null}
    </p>
  );
}

function MethodsCallout({
  chunks,
  indexer,
}: {
  chunks: NarrativeChunk[];
  indexer: Indexer;
}) {
  return (
    <aside
      aria-label="How the agent answered this"
      className="rounded-md border border-rule bg-page p-4"
    >
      <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.18em] text-evidence">
        How the agent answered this
      </p>
      <div className="space-y-2">
        {chunks.map((c) => {
          const start =
            c.citations.length > 0 ? indexer.next(c.citations.length) : 0;
          return (
            <p key={c.id} className="text-[14px] leading-relaxed text-ink">
              {c.text}
              {c.citations.length > 0 ? (
                <FootnoteGroup startIndex={start} citations={c.citations} />
              ) : null}
            </p>
          );
        })}
      </div>
    </aside>
  );
}

function ReadingNote({
  chunk,
  indexer,
}: {
  chunk: NarrativeChunk;
  indexer: Indexer;
}) {
  const start = chunk.citations.length > 0 ? indexer.next(chunk.citations.length) : 0;
  return (
    <p className="border-l-2 border-rule pl-3 text-[13px] italic leading-relaxed text-muted">
      <span className="font-mono not-italic text-[10px] uppercase tracking-[0.18em] text-muted/80">
        Reading note ·{" "}
      </span>
      {chunk.text}
      {chunk.citations.length > 0 ? (
        <FootnoteGroup startIndex={start} citations={chunk.citations} />
      ) : null}
    </p>
  );
}

function MissingDataNote({
  chunk,
  indexer,
}: {
  chunk: NarrativeChunk;
  indexer: Indexer;
}) {
  const start = chunk.citations.length > 0 ? indexer.next(chunk.citations.length) : 0;
  return (
    <aside
      aria-label="What this view doesn't cover"
      className="rounded-md border border-accent/40 bg-accent/5 p-4"
    >
      <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.18em] text-accent">
        Not in this view
      </p>
      <p className="text-[14px] leading-relaxed text-ink">
        {chunk.text}
        {chunk.citations.length > 0 ? (
          <FootnoteGroup startIndex={start} citations={chunk.citations} />
        ) : null}
      </p>
    </aside>
  );
}

// The receipts strip. Once the run completes the elapsed counter freezes;
// while running it ticks every second so the user can see the run is alive.
function ReportStatusStrip({ state }: { state: InvestigationState }) {
  const { status, startedAt, finishedAt, citedSourceRows, variantsMergedCount } =
    state;
  const [now, setNow] = useState<number>(() => Date.now());
  useEffect(() => {
    if (status !== "running" && status !== "blocked") return;
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [status]);

  const endpoint = finishedAt ?? (status === "running" || status === "blocked" ? now : startedAt);
  const elapsedMs = startedAt && endpoint ? Math.max(0, endpoint - startedAt) : 0;

  const items: string[] = [statusLabel(status)];
  if (startedAt) items.push(formatElapsed(elapsedMs));
  if (citedSourceRows.length > 0) items.push(`${citedSourceRows.length} sources cited`);
  if (variantsMergedCount > 0) {
    items.push(
      `${variantsMergedCount} variant${variantsMergedCount === 1 ? "" : "s"} merged`,
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-rule pb-2 font-mono text-[10px] uppercase tracking-[0.18em] text-muted">
      {items.map((item, i) => (
        <span key={i} className="flex items-center gap-3">
          {i > 0 ? <span className="text-rule">·</span> : null}
          <span className={i === 0 ? statusToneClass(status) : undefined}>
            {item}
          </span>
        </span>
      ))}
    </div>
  );
}

function statusLabel(s: InvestigationState["status"]): string {
  switch (s) {
    case "idle":
      return "Idle";
    case "running":
      return "Running";
    case "blocked":
      return "Waiting on you";
    case "complete":
      return "Complete";
    case "failed":
      return "Failed";
  }
}

function statusToneClass(s: InvestigationState["status"]): string {
  if (s === "running" || s === "blocked") return "text-accent";
  if (s === "failed") return "text-accent";
  if (s === "complete") return "text-evidence";
  return "text-muted";
}

function formatElapsed(ms: number): string {
  if (ms < 1000) return `${ms} ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(s < 10 ? 1 : 0)}s`;
  const m = Math.floor(s / 60);
  const rs = Math.round(s - m * 60);
  return `${m}m ${rs}s`;
}

function CitationsFooter({ narrative }: { narrative: NarrativeChunk[] }) {
  // Numbered, deduped on reportInfoIdent. Collapsed when there are no
  // citations (idle or pre-first-chunk states).
  const ordered: Citation[] = [];
  const seen = new Set<string>();
  for (const c of narrative) {
    for (const cit of c.citations) {
      if (seen.has(cit.reportInfoIdent)) continue;
      seen.add(cit.reportInfoIdent);
      ordered.push(cit);
    }
  }
  if (ordered.length === 0) return null;
  return (
    <section
      aria-label="Citations"
      className="space-y-2 border-t border-rule pt-4"
    >
      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted">
        Citations
      </p>
      <ol className="space-y-1.5 text-[12px] text-ink">
        {ordered.map((c, i) => (
          <li key={c.reportInfoIdent} className="flex gap-3">
            <span className="font-mono tnum text-muted">[{i + 1}]</span>
            <div className="flex-1 space-y-0.5">
              <span className="font-mono text-[11px] text-accent">
                {c.reportInfoIdent}
              </span>
              <p className="leading-snug text-ink">{c.rowSummary}</p>
              <a
                href={c.url}
                target="_blank"
                rel="noreferrer"
                className="font-mono text-[11px] text-evidence underline decoration-dotted hover:text-accent"
              >
                Open source filing →
              </a>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import type { Citation } from "@/lib/investigations/types";

type Props = {
  index: number;
  citation: Citation;
};

// Single-citation footnote chip with a hover/focus popover that shows the
// row identifier, a one-line summary, and a deep link to the source. Use
// FootnoteGroup below to bundle multiple citations under one chip.
export function Footnote({ index, citation }: Props) {
  return (
    <Popover
      label={String(index)}
      content={<CitationCard citation={citation} />}
    />
  );
}

export function FootnoteGroup({
  startIndex,
  citations,
}: {
  startIndex: number;
  citations: Citation[];
}) {
  if (citations.length === 0) return null;
  return (
    <Popover
      label={
        citations.length === 1
          ? String(startIndex)
          : `${startIndex}–${startIndex + citations.length - 1}`
      }
      content={
        // Span-with-block-display, not <div>: footnote chips live inside
        // <p> in the report layout, and a <div> descendant of <p> is the
        // hydration error the dev console warns about. Spans nested in
        // spans are valid HTML in any parent context.
        <span className="block space-y-3">
          {citations.map((c, i) => (
            <CitationCard
              key={c.reportInfoIdent + i}
              citation={c}
              index={startIndex + i}
            />
          ))}
        </span>
      }
    />
  );
}

function CitationCard({
  citation,
  index,
}: {
  citation: Citation;
  index?: number;
}) {
  return (
    <span className="block space-y-1">
      <span className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-wider text-muted">
        {index !== undefined ? <span>[{index}]</span> : null}
        <span className="text-accent">{citation.reportInfoIdent}</span>
      </span>
      <span className="block text-[12px] leading-snug text-ink">
        {citation.rowSummary}
      </span>
      <a
        href={citation.url}
        target="_blank"
        rel="noreferrer"
        className="font-mono text-[11px] text-evidence underline decoration-dotted hover:text-accent"
      >
        Open source filing →
      </a>
    </span>
  );
}

function Popover({
  label,
  content,
}: {
  label: string;
  content: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  return (
    <span ref={ref} className="relative inline-block">
      <button
        type="button"
        onMouseEnter={() => setOpen(true)}
        onFocus={() => setOpen(true)}
        onClick={() => setOpen((v) => !v)}
        className="citation-chip"
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        {label}
      </button>
      {open ? (
        <span
          role="dialog"
          className="absolute left-0 top-full z-10 mt-1 block w-[320px] rounded-md border border-rule bg-white p-3 shadow-lg"
          onMouseLeave={() => setOpen(false)}
        >
          {content}
        </span>
      ) : null}
    </span>
  );
}

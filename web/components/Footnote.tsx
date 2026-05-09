"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
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
  content: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);
  const triggerRef = useRef<HTMLSpanElement>(null);
  const popoverRef = useRef<HTMLSpanElement>(null);
  const closeTimerRef = useRef<number | null>(null);

  const clearCloseTimer = useCallback(() => {
    if (closeTimerRef.current === null) return;
    window.clearTimeout(closeTimerRef.current);
    closeTimerRef.current = null;
  }, []);

  const closeSoon = useCallback(() => {
    clearCloseTimer();
    closeTimerRef.current = window.setTimeout(() => setOpen(false), 120);
  }, [clearCloseTimer]);

  const place = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const margin = 8;
    const gap = 6;
    const width = Math.min(320, Math.max(220, window.innerWidth - margin * 2));
    const maxLeft = Math.max(margin, window.innerWidth - width - margin);
    const left = Math.min(Math.max(margin, rect.left), maxLeft);
    const height = popoverRef.current?.offsetHeight ?? 160;
    const below = rect.bottom + gap;
    const top =
      below + height + margin > window.innerHeight
        ? Math.max(margin, rect.top - height - gap)
        : below;
    setPosition({ top, left, width });
  }, []);

  const openPopover = useCallback(() => {
    clearCloseTimer();
    place();
    setOpen(true);
  }, [clearCloseTimer, place]);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if (popoverRef.current?.contains(target)) return;
      setOpen(false);
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    const animation = window.requestAnimationFrame(place);
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onEsc);
    document.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.cancelAnimationFrame(animation);
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onEsc);
      document.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open, place]);

  useEffect(() => clearCloseTimer, [clearCloseTimer]);

  return (
    <span
      ref={triggerRef}
      className="inline-block"
      onMouseEnter={openPopover}
      onMouseLeave={closeSoon}
    >
      <button
        type="button"
        onFocus={openPopover}
        onBlur={(e) => {
          const next = e.relatedTarget as Node | null;
          if (next && popoverRef.current?.contains(next)) return;
          setOpen(false);
        }}
        onClick={(e) => {
          e.stopPropagation();
          openPopover();
        }}
        className="citation-chip"
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        {label}
      </button>
      {open && typeof document !== "undefined"
        ? createPortal(
            <span
              role="dialog"
              ref={popoverRef}
              className="fixed z-[100] block max-w-[calc(100vw-16px)] rounded-md border border-rule bg-white p-3 shadow-lg"
              style={{
                left: position?.left ?? 8,
                top: position?.top ?? 8,
                width: position?.width ?? 320,
              }}
              onMouseEnter={clearCloseTimer}
              onMouseLeave={closeSoon}
            >
              {content}
            </span>,
            document.body,
          )
        : null}
    </span>
  );
}

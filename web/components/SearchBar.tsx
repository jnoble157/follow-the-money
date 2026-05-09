"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { classify, suggestionHref, type Suggestion } from "@/lib/search/classify";

type Props = {
  variant?: "header" | "hero";
  initialQuery?: string;
  placeholder?: string;
  autoFocus?: boolean;
};

export function SearchBar({
  variant = "header",
  initialQuery,
  placeholder,
  autoFocus,
}: Props) {
  const [value, setValue] = useState(initialQuery ?? "");
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const suggestions = useMemo(() => {
    if (!value.trim()) return [];
    // Cap to keep the dropdown readable; the freeform "ask anyway" stays last.
    return classify(value).slice(0, 7);
  }, [value]);

  useEffect(() => {
    setActiveIdx(0);
  }, [value]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function go(s: Suggestion) {
    setOpen(false);
    setValue(displayLabel(s));
    // Dynamic routes (/profile/[slug]) aren't typedRoutes-friendly without
    // a cast; the classifier is the only producer of these strings.
    router.push(suggestionHref(s) as Route);
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const pick = suggestions[activeIdx] ?? {
      kind: "freeform" as const,
      question: value.trim(),
    };
    if (pick.kind === "freeform" && !pick.question) return;
    go(pick);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActiveIdx((i) => Math.min(i + 1, Math.max(suggestions.length - 1, 0)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  const isHero = variant === "hero";

  return (
    <div className={isHero ? "relative w-full" : "relative w-[420px] max-w-full"}>
      <form
        onSubmit={onSubmit}
        className={
          isHero
            ? "flex items-center gap-2 rounded-md border border-rule bg-white px-5 py-4 shadow-sm focus-within:border-ink focus-within:shadow"
            : "flex items-center gap-2 rounded-md border border-rule bg-white/80 px-3 py-1.5 backdrop-blur focus-within:border-ink focus-within:bg-white"
        }
      >
        <span
          className={
            isHero
              ? "font-mono text-[11px] uppercase tracking-wider text-muted"
              : "font-mono text-[10px] uppercase tracking-wider text-muted"
          }
        >
          Search
        </span>
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => {
            // Delay so click handlers on suggestions can fire first.
            setTimeout(() => setOpen(false), 120);
          }}
          onKeyDown={onKeyDown}
          autoFocus={autoFocus}
          placeholder={
            placeholder ??
            (isHero
              ? "Search a person, PAC, or question…"
              : "Search Texas Money…")
          }
          className={
            isHero
              ? "flex-1 bg-transparent text-base text-ink placeholder:text-muted/70 outline-none"
              : "flex-1 bg-transparent text-[13px] text-ink placeholder:text-muted/70 outline-none"
          }
        />
        <span className="pill-kbd hidden md:inline">Cmd K</span>
      </form>
      {open && suggestions.length > 0 ? (
        <ul
          role="listbox"
          className="absolute left-0 right-0 top-[calc(100%+4px)] z-30 max-h-[60vh] overflow-y-auto rounded-md border border-rule bg-white shadow-lg"
        >
          {suggestions.map((s, i) => (
            <li
              key={`${s.kind}:${suggestionHref(s)}:${i}`}
              role="option"
              aria-selected={i === activeIdx}
              className={`cursor-pointer border-b border-rule/60 px-4 py-2 last:border-b-0 ${
                i === activeIdx ? "bg-page" : "hover:bg-page"
              }`}
              onMouseDown={(e) => {
                e.preventDefault();
                go(s);
              }}
              onMouseEnter={() => setActiveIdx(i)}
            >
              <SuggestionRow suggestion={s} />
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function SuggestionRow({ suggestion }: { suggestion: Suggestion }) {
  switch (suggestion.kind) {
    case "profile":
      return (
        <div className="flex items-baseline justify-between gap-3">
          <span>
            <span className="font-mono text-[10px] uppercase tracking-wider text-accent">
              Profile
            </span>{" "}
            <span className="text-[14px] text-ink">{suggestion.name}</span>
            {suggestion.role ? (
              <span className="ml-2 text-[12px] text-muted">{suggestion.role}</span>
            ) : null}
          </span>
        </div>
      );
    case "investigation":
      return (
        <div>
          <span className="font-mono text-[10px] uppercase tracking-wider text-evidence">
            Investigation
          </span>{" "}
          <span className="text-[14px] text-ink">{suggestion.pillLabel}</span>
          <div className="mt-0.5 text-[12px] text-muted">{suggestion.question}</div>
        </div>
      );
    case "no_data":
      return (
        <div>
          <span className="font-mono text-[10px] uppercase tracking-wider text-muted">
            No data
          </span>{" "}
          <span className="text-[14px] text-ink">{suggestion.name}</span>
          <div className="mt-0.5 text-[12px] text-muted">
            Federal officials aren't in this dataset.
          </div>
        </div>
      );
    case "freeform":
      return (
        <div>
          <span className="font-mono text-[10px] uppercase tracking-wider text-muted">
            Ask
          </span>{" "}
          <span className="text-[14px] text-ink">"{suggestion.question}"</span>
          <div className="mt-0.5 text-[12px] text-muted">
            Run the agent against your own question.
          </div>
        </div>
      );
  }
}

function displayLabel(s: Suggestion): string {
  switch (s.kind) {
    case "profile":
      return s.name;
    case "investigation":
      return s.question;
    case "no_data":
      return s.name;
    case "freeform":
      return s.question;
  }
}

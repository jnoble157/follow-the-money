"use client";

import { useEffect, useRef, useState } from "react";
import { HERO_INVESTIGATIONS } from "@/lib/investigations/registry";

type Props = {
  disabled?: boolean;
  onAsk: (question: string) => void;
  initialQuestion?: string;
};

export function QuestionInput({ disabled, onAsk, initialQuestion }: Props) {
  const [value, setValue] = useState(initialQuestion ?? "");
  const inputRef = useRef<HTMLInputElement>(null);

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

  function submit() {
    const q = value.trim();
    if (!q || disabled) return;
    onAsk(q);
  }

  return (
    <div className="space-y-3">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="flex items-center gap-2 rounded-md border border-rule bg-white px-4 py-3 shadow-sm focus-within:border-ink focus-within:shadow"
      >
        <span className="font-mono text-[11px] uppercase tracking-wider text-muted">
          Ask
        </span>
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Who were the largest donors to the 2024 Austin mayor's race?"
          disabled={disabled}
          className="flex-1 bg-transparent text-base text-ink placeholder:text-muted/70 outline-none disabled:opacity-50"
        />
        <span className="pill-kbd hidden md:inline">Cmd K</span>
        <button
          type="submit"
          disabled={disabled || !value.trim()}
          className="rounded-sm bg-ink px-3 py-1.5 text-[12px] font-mono uppercase tracking-wider text-white disabled:opacity-40"
        >
          Investigate
        </button>
      </form>
      <div className="flex flex-wrap gap-2">
        <span className="self-center font-mono text-[11px] uppercase tracking-wider text-muted">
          Try
        </span>
        {HERO_INVESTIGATIONS.map((inv) => (
          <button
            key={inv.id}
            type="button"
            disabled={disabled}
            onClick={() => {
              setValue(inv.question);
              onAsk(inv.question);
            }}
            className="pill disabled:opacity-50"
          >
            {inv.pillLabel}
          </button>
        ))}
      </div>
    </div>
  );
}

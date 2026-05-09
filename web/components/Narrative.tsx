"use client";

import type { NarrativeChunk } from "@/lib/investigations/state";
import { FootnoteGroup } from "./Footnote";

type Props = {
  question: string | null;
  chunks: NarrativeChunk[];
  status: "idle" | "running" | "blocked" | "complete" | "failed";
  failureReason?: string;
};

export function Narrative({
  question,
  chunks,
  status,
  failureReason,
}: Props) {
  let runningIndex = 0;
  return (
    <article className="space-y-5">
      {question ? (
        <header className="space-y-1">
          <p className="font-mono text-[11px] uppercase tracking-wider text-muted">
            Investigation
          </p>
          <h1 className="font-serif text-[26px] leading-tight text-ink">
            {question}
          </h1>
        </header>
      ) : (
        <header className="space-y-3">
          <p className="font-mono text-[11px] uppercase tracking-wider text-muted">
            Texas Money Investigator · Agent demo
          </p>
          <h1 className="font-serif text-[28px] leading-snug text-ink">
            Ask a real money-in-politics question about Texas state or City of
            Austin government.
          </h1>
          <p className="text-[15px] leading-relaxed text-muted">
            The agent decomposes the question, calls bounded tools over public
            records — Texas Ethics Commission state filings and City of Austin
            campaign-finance and lobbyist disclosures — narrates its plan,
            asks for confirmation when an entity match is uncertain, and
            writes a sourced report. Every dollar amount carries a citation
            you can verify against the underlying filing.
          </p>
          <p className="font-mono text-[11px] uppercase tracking-wider text-muted">
            Pick one of the suggested questions to see the agent run end-to-end.
          </p>
        </header>
      )}
      {status === "failed" && failureReason ? (
        <p className="rounded-sm border border-accent/40 bg-accent/5 p-3 text-[14px] text-ink">
          {failureReason}
        </p>
      ) : null}
      {chunks.length === 0 && status !== "failed" ? (
        <p className="text-[14px] text-muted">
          {status === "idle"
            ? "Try one of the suggested questions above to see the agent work end-to-end."
            : "Drafting…"}
        </p>
      ) : (
        chunks.map((chunk) => {
          const idx = runningIndex + 1;
          runningIndex += chunk.citations.length;
          return (
            <p
              key={chunk.id}
              className="font-serif text-[17px] leading-relaxed text-ink"
            >
              {chunk.text}
              {chunk.citations.length > 0 ? (
                <FootnoteGroup
                  startIndex={idx}
                  citations={chunk.citations}
                />
              ) : null}
            </p>
          );
        })
      )}
      {status === "running" ? (
        <span
          aria-hidden
          className="inline-block h-4 w-1.5 animate-cursorBlink bg-ink"
        />
      ) : null}
    </article>
  );
}

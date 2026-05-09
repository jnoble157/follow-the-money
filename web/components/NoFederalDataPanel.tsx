// Honest refusal block for federal officials. AGENTS.md §1: failing
// gracefully on Ted Cruz is a stronger demo moment than fabricating numbers.

export function NoFederalDataPanel() {
  return (
    <aside
      aria-labelledby="no-federal-heading"
      className="rounded-md border border-dashed border-rule bg-white/60 p-4"
    >
      <h3
        id="no-federal-heading"
        className="font-mono text-[10px] uppercase tracking-[0.2em] text-accent"
      >
        Looking for a federal official?
      </h3>
      <p className="mt-2 text-[12px] leading-relaxed text-muted">
        This demo covers Texas Ethics Commission state filings and City of
        Austin filings only. Federal contributions live with the FEC, which we
        haven't ingested for this hackathon. Searching for "Ted Cruz",
        "John Cornyn", or other federal names will return no results — by
        design, not by accident.
      </p>
      <p className="mt-2 text-[11px] font-mono text-muted">
        See{" "}
        <a
          href="https://github.com/jnoble157/follow-the-money/blob/main/data/README.md"
          className="text-accent hover:text-ink underline decoration-dotted underline-offset-2"
        >
          data/README.md
        </a>{" "}
        for the full data inventory.
      </p>
    </aside>
  );
}

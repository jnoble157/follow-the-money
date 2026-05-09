export function AttributionFooter() {
  return (
    <footer className="border-t border-rule bg-page/60 text-[12px] text-muted">
      <div className="max-w-[1600px] mx-auto px-6 py-3 flex flex-wrap items-center gap-x-6 gap-y-1">
        <span className="font-mono text-[11px] uppercase tracking-wider text-ink/70">
          Texas Money Investigator
        </span>
        <span>
          Public records from{" "}
          <a
            href="https://www.ethics.state.tx.us/search/cf/"
            target="_blank"
            rel="noreferrer"
            className="underline decoration-dotted hover:text-accent"
          >
            Texas Ethics Commission
          </a>{" "}
          and{" "}
          <a
            href="https://data.austintexas.gov/"
            target="_blank"
            rel="noreferrer"
            className="underline decoration-dotted hover:text-accent"
          >
            City of Austin Open Data
          </a>
          .
        </span>
        <span className="ml-auto">
          Self-reported, not audited. The agent describes what is in the
          filings.
        </span>
      </div>
    </footer>
  );
}

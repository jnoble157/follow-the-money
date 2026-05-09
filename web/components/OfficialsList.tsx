import Link from "next/link";
import type { Route } from "next";
import { listOfficialsForHome } from "@/lib/profiles/registry";

const JURISDICTION_LABEL: Record<string, string> = {
  austin: "City of Austin",
  tx_state: "Texas State",
  tx_federal: "Federal",
};

export function OfficialsList() {
  const officials = listOfficialsForHome();
  return (
    <section aria-labelledby="officials-heading" className="space-y-3">
      <div className="flex items-baseline justify-between">
        <h2
          id="officials-heading"
          className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted"
        >
          Public officials
        </h2>
        <span className="text-[11px] font-mono text-muted">
          {officials.filter((o) => o.slug).length} profiled
        </span>
      </div>
      <ul className="rounded-md border border-rule bg-white">
        {officials.map((o, i) => (
          <li
            key={`${o.name}-${i}`}
            className={i === 0 ? "" : "border-t border-rule"}
          >
            {o.slug ? (
              <Link
                href={`/profile/${o.slug}` as Route}
                className="group flex items-baseline justify-between gap-3 px-4 py-3 hover:bg-page transition-colors"
              >
                <div className="min-w-0">
                  <div className="text-[14px] text-ink group-hover:underline decoration-accent decoration-1 underline-offset-4">
                    {o.name}
                  </div>
                  <div className="mt-0.5 text-[12px] text-muted truncate">
                    {o.role}
                  </div>
                </div>
                <span className="font-mono text-[10px] uppercase tracking-wider text-muted whitespace-nowrap">
                  {JURISDICTION_LABEL[o.jurisdiction]}
                </span>
              </Link>
            ) : (
              <div className="flex items-baseline justify-between gap-3 px-4 py-3 text-muted">
                <div className="min-w-0">
                  <div className="text-[14px]">{o.name}</div>
                  <div className="mt-0.5 text-[12px]">{o.role}</div>
                </div>
                <span className="font-mono text-[10px] uppercase tracking-wider whitespace-nowrap">
                  Listed only
                </span>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

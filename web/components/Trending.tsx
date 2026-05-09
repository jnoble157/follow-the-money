import Link from "next/link";
import type { Route } from "next";
import { HERO_INVESTIGATIONS } from "@/lib/investigations/registry";

// Hand-curated copy for the trending strip. Headlines come from the
// investigations themselves; the kicker / why-it-matters lines are
// editorial and are intentionally short.
const TRENDING = [
  {
    id: "s1-epstein",
    rank: 1,
    kicker: "ATX → statewide pipeline",
    why: "How a small Austin PAC fed three statewide PACs, and what the cluster of donor employer variants actually meant.",
  },
  {
    id: "a1-watson",
    rank: 2,
    kicker: "Senate → mayor transfer",
    why: "Watson's largest 2022 expenditure was a $1.18M transfer from his old Senate account into a new Austin committee.",
  },
  {
    id: "a2-endeavor",
    rank: 3,
    kicker: "One firm, three slices",
    why: "Endeavor Real Estate Group shows up as donors, lobby clients, and PAC funders — all three hidden behind employer-name variants.",
  },
] as const;

export function Trending() {
  const stories = TRENDING.map((t) => {
    const inv = HERO_INVESTIGATIONS.find((i) => i.id === t.id);
    if (!inv) throw new Error(`trending references missing investigation ${t.id}`);
    return { ...t, question: inv.question, pillLabel: inv.pillLabel };
  });

  return (
    <section aria-labelledby="trending-heading" className="space-y-3">
      <h2
        id="trending-heading"
        className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted"
      >
        Trending investigations
      </h2>
      <ul className="space-y-3">
        {stories.map((s) => (
          <li key={s.id}>
            <Link
              href={
                `/investigate?q=${encodeURIComponent(s.question)}` as Route
              }
              className="group block rounded-md border border-rule bg-white p-5 hover:border-ink hover:shadow-sm transition"
            >
              <div className="flex items-baseline gap-3">
                <span className="font-serif text-[28px] leading-none text-accent tnum">
                  {s.rank.toString().padStart(2, "0")}
                </span>
                <div className="flex-1">
                  <div className="font-mono text-[10px] uppercase tracking-wider text-evidence">
                    {s.kicker}
                  </div>
                  <h3 className="mt-1 font-serif text-[18px] leading-snug text-ink group-hover:underline decoration-accent decoration-1 underline-offset-4">
                    {s.question}
                  </h3>
                  <p className="mt-2 text-[13px] leading-relaxed text-muted">
                    {s.why}
                  </p>
                  <div className="mt-3 flex items-center gap-3 text-[11px] font-mono uppercase tracking-wider text-muted">
                    <span>{s.pillLabel}</span>
                    <span className="text-rule">·</span>
                    <span className="text-accent group-hover:text-ink">
                      Run investigation →
                    </span>
                  </div>
                </div>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

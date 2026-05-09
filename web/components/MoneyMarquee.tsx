import Link from "next/link";
import type { Route } from "next";
import { listOfficialsWithStats } from "@/lib/profiles/registry";
import { formatMoney } from "@/lib/formatMoney";

export function MoneyMarquee() {
  const items = listOfficialsWithStats()
    .slice()
    .sort((a, b) => b.totalRaised - a.totalRaised)
    .slice(0, 16)
    .map((o) => ({
      slug: o.slug,
      name: o.name,
      total: o.totalRaised,
    }));

  if (items.length === 0) return null;

  // Duplicate the list so the translate(-50%) loop has no visible seam.
  const loop = [...items, ...items];

  return (
    <div
      aria-label="Top Texas politicians by total funds raised"
      className="sticky top-[57px] z-40 overflow-hidden border-b border-rule bg-page/95 backdrop-blur"
    >
      <div className="relative flex items-center">
        <span className="hidden md:inline-flex shrink-0 items-center gap-1.5 border-r border-rule px-4 py-2 font-mono text-[10px] uppercase tracking-[0.18em] text-accent">
          <span className="h-1.5 w-1.5 rounded-full bg-accent animate-pulseRing" />
          Follow the money
        </span>
        <div
          className="flex w-full overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_4%,black_96%,transparent)]"
        >
          <div className="flex shrink-0 animate-marquee whitespace-nowrap will-change-transform">
            {loop.map((item, i) => (
              <Link
                key={`${item.slug}-${i}`}
                href={`/profile/${item.slug}` as Route}
                className="group inline-flex items-baseline gap-2 px-5 py-2 font-mono text-[12px] tracking-wide text-muted hover:text-ink transition-colors"
              >
                <span className="font-serif text-[13px] text-ink group-hover:text-accent transition-colors">
                  {item.name}
                </span>
                <span className="tnum text-accent">
                  {formatMoney(item.total, { compact: true })}
                </span>
                <span className="text-rule">·</span>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

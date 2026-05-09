import Link from "next/link";
import type { Route } from "next";

type Props = {
  // Optional right-side slot for mode toggles, ambient affordance, etc.
  right?: React.ReactNode;
  href?: Route;
};

export function Wordmark({ right, href = "/" as Route }: Props) {
  return (
    <header className="sticky top-0 z-50 border-b border-rule bg-page/90 backdrop-blur">
      <div className="mx-auto flex max-w-[1280px] items-center justify-between px-6 py-3">
        <Link href={href} className="group flex items-baseline gap-3">
          <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted group-hover:text-ink">
            TX · Money
          </span>
          <span className="font-serif text-[18px] leading-none text-ink">
            Texas Money Investigator
          </span>
          <span className="ml-1 inline-block h-1.5 w-1.5 rounded-full bg-accent" />
        </Link>
        <div className="flex items-center gap-3">{right}</div>
      </div>
    </header>
  );
}

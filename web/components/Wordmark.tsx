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
        <Link href={href} className="group flex items-center">
          <span className="font-serif text-[22px] leading-none tracking-tight transition-colors duration-200">
            <span className="text-accent">TX</span>
            <span className="text-ink">Money</span>
          </span>
        </Link>
        <div className="flex items-center gap-3">{right}</div>
      </div>
    </header>
  );
}

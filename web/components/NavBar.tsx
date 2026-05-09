import Link from "next/link";
import type { Route } from "next";

export function NavBar() {
  return (
    <nav className="flex items-center gap-6">
      <Link
        href={"/officials" as Route}
        className="font-mono text-[12px] uppercase tracking-wider text-muted hover:text-ink transition-colors"
      >
        Public officials
      </Link>
      <Link
        href={"/donors" as Route}
        className="font-mono text-[12px] uppercase tracking-wider text-muted hover:text-ink transition-colors"
      >
        Donors
      </Link>
    </nav>
  );
}

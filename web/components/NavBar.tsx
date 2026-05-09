"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Route } from "next";

const links = [
  { href: "/officials", label: "Public Officials" },
  { href: "/donors", label: "Donors" },
  { href: "/network", label: "Network" },
  { href: "/documentation", label: "Documentation" },
] as const;

export function NavBar() {
  const pathname = usePathname();

  return (
    <nav className="flex items-center gap-6">
      {links.map(({ href, label }) => {
        const active = pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href as Route}
            className={`group relative font-mono text-[12px] uppercase tracking-wider transition-colors duration-200 ${
              active ? "text-accent" : "text-muted hover:text-ink"
            }`}
          >
            {label}
            <span
              className={`absolute -bottom-0.5 left-0 h-px w-full bg-accent transition-transform duration-200 origin-left ${
                active ? "scale-x-100" : "scale-x-0 group-hover:scale-x-100"
              }`}
            />
          </Link>
        );
      })}
    </nav>
  );
}

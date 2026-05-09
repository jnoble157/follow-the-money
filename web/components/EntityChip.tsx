import Link from "next/link";
import type { Route } from "next";

type Props = {
  slug: string;
  name: string;
  role?: string;
};

// Compact reference to another profile. Renders as a Wikipedia-style
// inline-block chip; used in the related-profiles strip and anywhere a
// profile is mentioned in body copy.
export function EntityChip({ slug, name, role }: Props) {
  return (
    <Link
      href={`/profile/${slug}` as Route}
      className="group inline-flex items-baseline gap-2 rounded-sm border border-rule bg-white px-3 py-1.5 text-[12px] hover:border-ink hover:bg-page transition-colors"
    >
      <span className="text-ink group-hover:underline decoration-accent decoration-1 underline-offset-4">
        {name}
      </span>
      {role ? (
        <span className="font-mono text-[10px] uppercase tracking-wider text-muted">
          {role}
        </span>
      ) : null}
    </Link>
  );
}

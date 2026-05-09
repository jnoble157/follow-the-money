import Link from "next/link";
import type { Route } from "next";
import { listAllProfiles } from "@/lib/profiles/registry";

export default function ProfileNotFound() {
  const profiles = listAllProfiles();
  return (
    <main className="mx-auto flex w-full max-w-[820px] flex-col gap-6 px-6 py-12">
      <header className="space-y-1">
        <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-accent">
          Profile not found
        </p>
        <h1 className="font-serif text-[32px] leading-tight text-ink">
          We don't have a profile at that slug.
        </h1>
      </header>
      <p className="font-serif text-[16px] leading-relaxed text-muted">
        The Texas Money Investigator only ships profiles for entities with
        material data in the TEC state filings or City of Austin disclosures.
        Try one of the profiles we do have, or search a question instead.
      </p>
      <div className="flex flex-wrap gap-2">
        {profiles.map((p) => (
          <Link
            key={p.slug}
            href={`/profile/${p.slug}` as Route}
            className="rounded-sm border border-rule bg-white px-3 py-1.5 text-[13px] hover:border-ink hover:bg-page transition-colors"
          >
            {p.name}
          </Link>
        ))}
      </div>
    </main>
  );
}

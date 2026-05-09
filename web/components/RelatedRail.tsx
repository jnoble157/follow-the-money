"use client";

import Link from "next/link";
import type { Route } from "next";
import type { GraphNodeView } from "@/lib/investigations/state";
import { listAllProfiles } from "@/lib/profiles/registry";

type Props = {
  currentQuestion: string | null;
  graphNodes: GraphNodeView[];
  // LLM-generated follow-up, produced by a post-run OpenAI call once the
  // investigation completes. We deliberately do *not* fall back to a
  // tag-overlap pick across the hero registry: that pick is too noisy and
  // tends to surface investigations unrelated to the story the user just
  // read (e.g. recommending the s1-epstein hero after a question about
  // Uber). When `readNext` is missing, the investigation card is omitted
  // entirely; the related-profile card carries the rail on its own.
  readNext?: { question: string; kicker: string; rationale: string };
};

export function RelatedRail({ currentQuestion, graphNodes, readNext }: Props) {
  const profile = pickRelatedProfile(currentQuestion, graphNodes);
  if (!readNext && !profile) return null;
  return (
    <section
      aria-label="Read next"
      className="rounded-md border border-rule bg-white p-4"
    >
      <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.18em] text-muted">
        Read next
      </p>
      <div className="space-y-3">
        {readNext ? (
          <Link
            href={
              `/investigate?q=${encodeURIComponent(readNext.question)}` as Route
            }
            className="group block rounded-sm border border-rule p-3 hover:border-ink"
          >
            <p className="font-mono text-[10px] uppercase tracking-wider text-evidence">
              Follow the money · {readNext.kicker}
            </p>
            <p className="mt-1 font-serif text-[14px] leading-snug text-ink group-hover:underline decoration-accent decoration-1 underline-offset-4">
              {readNext.question}
            </p>
            <p className="mt-2 font-mono text-[10px] uppercase tracking-wide text-muted">
              {readNext.rationale}
            </p>
          </Link>
        ) : null}
        {profile ? (
          <Link
            href={`/profile/${profile.slug}` as Route}
            className="group block rounded-sm border border-rule p-3 hover:border-ink"
          >
            <p className="font-mono text-[10px] uppercase tracking-wider text-accent">
              Profile · {profile.role ?? profile.kind}
            </p>
            <p className="mt-1 font-serif text-[14px] leading-snug text-ink group-hover:underline decoration-accent decoration-1 underline-offset-4">
              {profile.name}
            </p>
          </Link>
        ) : null}
      </div>
    </section>
  );
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9'\s]/g, " ").replace(/\s+/g, " ").trim();
}

function pickRelatedProfile(
  currentQuestion: string | null,
  graphNodes: GraphNodeView[],
) {
  // First: any node in the evidence graph that already declares a profile
  // slug is a confirmed match. Use the first such node.
  for (const n of graphNodes) {
    if (n.profileSlug) {
      const profile = listAllProfiles().find((p) => p.slug === n.profileSlug);
      if (profile) return profile;
    }
  }

  // Second: substring overlap between profile aliases and the question +
  // any graph node label. Cheap and surprisingly accurate at this scale.
  if (!currentQuestion && graphNodes.length === 0) return null;
  const haystack = normalize(
    [currentQuestion ?? "", ...graphNodes.map((n) => n.label)].join(" "),
  );
  for (const profile of listAllProfiles()) {
    const terms = [profile.name, ...(profile.aliases ?? [])].map(normalize);
    if (terms.some((t) => t && haystack.includes(t))) return profile;
  }
  return null;
}

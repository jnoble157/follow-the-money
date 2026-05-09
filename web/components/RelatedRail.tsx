"use client";

import Link from "next/link";
import type { Route } from "next";
import type { GraphNodeView } from "@/lib/investigations/state";
import { HERO_INVESTIGATIONS } from "@/lib/investigations/registry";
import { listAllProfiles } from "@/lib/profiles/registry";

type Props = {
  currentQuestion: string | null;
  graphNodes: GraphNodeView[];
};

// Two onward-navigation cards: a related investigation (by topic tag
// overlap with the current one) and a related profile (by entity overlap
// with the graph). Either can be null; we render an empty pane in that
// case so the layout doesn't reflow.
export function RelatedRail({ currentQuestion, graphNodes }: Props) {
  const investigation = pickRelatedInvestigation(currentQuestion);
  const profile = pickRelatedProfile(currentQuestion, graphNodes);
  if (!investigation && !profile) return null;
  return (
    <section
      aria-label="Read next"
      className="rounded-md border border-rule bg-white p-4"
    >
      <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.18em] text-muted">
        Read next
      </p>
      <div className="space-y-3">
        {investigation ? (
          <Link
            href={
              `/investigate?q=${encodeURIComponent(investigation.question)}` as Route
            }
            className="group block rounded-sm border border-rule p-3 hover:border-ink"
          >
            <p className="font-mono text-[10px] uppercase tracking-wider text-evidence">
              Investigation · {investigation.pillLabel}
            </p>
            <p className="mt-1 font-serif text-[14px] leading-snug text-ink group-hover:underline decoration-accent decoration-1 underline-offset-4">
              {investigation.question}
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

function pickRelatedInvestigation(currentQuestion: string | null) {
  if (!currentQuestion) return null;
  const others = HERO_INVESTIGATIONS.filter(
    (inv) => normalize(inv.question) !== normalize(currentQuestion),
  );
  if (others.length === 0) return null;

  const currentTags = tagsForQuestion(currentQuestion);

  // Score by tag overlap; ties broken by registry order.
  let best = others[0];
  let bestScore = -1;
  for (const cand of others) {
    const score = cand.tags.filter((t) => currentTags.has(t)).length;
    if (score > bestScore) {
      best = cand;
      bestScore = score;
    }
  }
  return best;
}

// The current investigation's tags. We resolve the registry entry by
// question; for live-run questions that aren't in the registry we fall
// back to the empty set, which means the rail picks the first registered
// investigation other than the current one.
function tagsForQuestion(question: string): Set<string> {
  const norm = normalize(question);
  const inv = HERO_INVESTIGATIONS.find(
    (i) => normalize(i.question) === norm,
  );
  return new Set(inv?.tags ?? []);
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

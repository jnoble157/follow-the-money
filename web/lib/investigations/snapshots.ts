import type { InvestigationState } from "./state";

// Per-tab cache of completed investigation state, keyed by normalized
// question. Solves two real UX problems:
//   1. Browser back from a profile page used to land on a blank report
//      because the page route remounts and the client state is lost.
//   2. Re-submitting a question you just ran shouldn't re-stream the SSE
//      cascade for a couple of seconds.
//
// SessionStorage (not localStorage) on purpose: the snapshots are tied to
// the tab's lifetime, not persisted across sessions. The recorded JSONL
// fixtures and the ad-hoc cache live server-side and survive across tabs.

const PREFIX = "txmoney:inv:";
// Bumped to 2 when InvestigationState added `topRecipients`. Old snapshots
// would deserialize with the field undefined and crash RecipientTable.
const VERSION = 2;

type Snapshot = {
  v: number;
  question: string;
  savedAt: number;
  state: InvestigationState;
};

export function saveSnapshot(question: string, state: InvestigationState): void {
  if (typeof window === "undefined") return;
  if (state.status !== "complete") return;
  const snap: Snapshot = {
    v: VERSION,
    question,
    savedAt: Date.now(),
    state,
  };
  try {
    sessionStorage.setItem(key(question), JSON.stringify(snap));
  } catch {
    // sessionStorage can be over quota or disabled; this is a best-effort
    // affordance, not a correctness requirement.
  }
}

export function loadSnapshot(question: string): InvestigationState | null {
  if (typeof window === "undefined") return null;
  let raw: string | null = null;
  try {
    raw = sessionStorage.getItem(key(question));
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const snap = JSON.parse(raw) as Snapshot;
    if (snap.v !== VERSION) return null;
    return snap.state;
  } catch {
    return null;
  }
}

function key(question: string): string {
  return `${PREFIX}${normalize(question)}`;
}

function normalize(q: string): string {
  return q.trim().toLowerCase().replace(/\s+/g, " ");
}

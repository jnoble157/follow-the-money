// Process-local session map shared by the agent runner and the
// /api/investigate/resume endpoint. Mirrors the shape of the stub's
// sessions map so the resume endpoint code in web/ doesn't need to know
// which engine is running.

type PendingDisambiguation = {
  id: string;
  resolve: (merged: boolean) => void;
};

type Session = {
  sessionId: string;
  pending?: PendingDisambiguation;
};

const SESSIONS = new Map<string, Session>();

export function createSession(sessionId: string): Session {
  const s: Session = { sessionId };
  SESSIONS.set(sessionId, s);
  return s;
}

export function destroySession(sessionId: string): void {
  SESSIONS.delete(sessionId);
}

export function setPending(
  sessionId: string,
  pending: PendingDisambiguation,
): void {
  const s = SESSIONS.get(sessionId);
  if (!s) return;
  s.pending = pending;
}

export function clearPending(sessionId: string): void {
  const s = SESSIONS.get(sessionId);
  if (s) s.pending = undefined;
}

// Called by the resume endpoint. Returns false if no session is waiting
// or the disambiguation id doesn't match — the caller surfaces a 404 in
// that case.
export function resolveDisambiguation(
  sessionId: string,
  disambiguationId: string,
  merged: boolean,
): boolean {
  const s = SESSIONS.get(sessionId);
  if (!s?.pending) return false;
  if (s.pending.id !== disambiguationId) return false;
  s.pending.resolve(merged);
  return true;
}

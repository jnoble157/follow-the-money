"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";
import type { InvestigationEvent } from "./types";
import { initialState, reduce, type InvestigationState } from "./state";
import { loadSnapshot, saveSnapshot } from "./snapshots";

type Action =
  | { kind: "event"; event: InvestigationEvent }
  | { kind: "reset" }
  | { kind: "hydrate"; state: InvestigationState };

function rootReducer(
  state: InvestigationState,
  action: Action,
): InvestigationState {
  if (action.kind === "reset") return { ...initialState };
  if (action.kind === "hydrate") return action.state;
  return reduce(state, action.event);
}

export type RunOptions = { speed?: number };

export function useInvestigation() {
  const [state, dispatch] = useReducer(rootReducer, initialState);
  const sessionIdRef = useRef<string>(newSessionId());
  const abortRef = useRef<AbortController | null>(null);
  // Strict-mode dev double-mounts components. If we abort on unmount, the
  // *first* mount's fetch dies before its events reach the *second* mount's
  // reducer — and the screen sits at IDLE while the server quietly streams
  // a full investigation into the void. Instead we gate dispatches on this
  // ref: events from a torn-down instance are dropped, but the underlying
  // fetch is allowed to drain naturally. The next ask() aborts the previous
  // controller, so we don't leak streams across user-initiated runs.
  const aliveRef = useRef(true);
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  const safeDispatch = useCallback((action: Action) => {
    if (!aliveRef.current) return;
    dispatch(action);
  }, []);

  // Save the snapshot once an investigation completes, so the next mount
  // for the same question can hydrate instead of re-streaming.
  useEffect(() => {
    if (state.status !== "complete" || !state.question) return;
    saveSnapshot(state.question, state);
  }, [state.status, state.question, state]);

  const ask = useCallback(async (question: string, opts: RunOptions = {}) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    sessionIdRef.current = newSessionId();

    // The snapshot is the back-from-profile affordance: when the user
    // tabs over to an entity profile and bounces back, we want them to
    // land on the same report state without watching the stream replay.
    // For *every other* entry into this page — clicking a trending pill
    // on the home page, picking a related-rail card, opening a fresh
    // search, hitting Enter on the search bar — they should see the
    // animation, even if the answer is server-cached. Same destination,
    // but the agent feels live each time.
    if (shouldHydrateFromSnapshot()) {
      const snap = loadSnapshot(question);
      if (snap) {
        safeDispatch({ kind: "hydrate", state: snap });
        return;
      }
    }

    safeDispatch({ kind: "reset" });

    let res: Response;
    try {
      res = await fetch("/api/investigate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          question,
          sessionId: sessionIdRef.current,
          speed: opts.speed,
        }),
      });
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      safeDispatch({
        kind: "event",
        event: {
          type: "investigation_failed",
          reason: `Network error: ${(err as Error).message}`,
        },
      });
      return;
    }

    if (!res.ok || !res.body) {
      safeDispatch({
        kind: "event",
        event: {
          type: "investigation_failed",
          reason: `Server returned ${res.status}`,
        },
      });
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let idx = buf.indexOf("\n\n");
        while (idx !== -1) {
          const frame = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          for (const line of frame.split("\n")) {
            if (!line.startsWith("data:")) continue;
            const json = line.slice(5).trim();
            if (!json) continue;
            try {
              const ev = JSON.parse(json) as InvestigationEvent;
              safeDispatch({ kind: "event", event: ev });
            } catch {
              // ignore malformed chunk; the stream will recover or end
            }
          }
          idx = buf.indexOf("\n\n");
        }
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        safeDispatch({
          kind: "event",
          event: {
            type: "investigation_failed",
            reason: `Stream error: ${(err as Error).message}`,
          },
        });
      }
    }
  }, [safeDispatch]);

  const resolveDisambiguation = useCallback(
    async (disambiguationId: string, merged: boolean) => {
      await fetch("/api/investigate/resume", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sessionId: sessionIdRef.current,
          disambiguationId,
          merged,
        }),
      });
    },
    [],
  );

  const cancel = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  return useMemo(
    () => ({ state, ask, resolveDisambiguation, cancel }),
    [state, ask, resolveDisambiguation, cancel],
  );
}

function newSessionId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `s-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

// True only when the most recent navigation came from a profile page.
// document.referrer is the same-origin URL the browser navigated from; for
// an in-app link from /profile/<slug> it's the absolute URL of that page.
// On a fresh tab open, a search-bar submit, or a click from /, the
// referrer is either empty or doesn't match — and we re-stream.
function shouldHydrateFromSnapshot(): boolean {
  if (typeof document === "undefined") return false;
  const ref = document.referrer;
  if (!ref) return false;
  try {
    const url = new URL(ref);
    if (url.origin !== window.location.origin) return false;
    return /^\/profile\//.test(url.pathname);
  } catch {
    return false;
  }
}

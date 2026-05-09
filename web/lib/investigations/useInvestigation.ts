"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";
import type { InvestigationEvent } from "./types";
import { initialState, reduce, type InvestigationState } from "./state";

type Action =
  | { kind: "event"; event: InvestigationEvent }
  | { kind: "reset" };

function rootReducer(
  state: InvestigationState,
  action: Action,
): InvestigationState {
  if (action.kind === "reset") return { ...initialState };
  return reduce(state, action.event);
}

export type RunOptions = { speed?: number };

export function useInvestigation() {
  const [state, dispatch] = useReducer(rootReducer, initialState);
  const sessionIdRef = useRef<string>(newSessionId());
  const abortRef = useRef<AbortController | null>(null);

  // Cancel any in-flight stream when the component unmounts.
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const ask = useCallback(async (question: string, opts: RunOptions = {}) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    sessionIdRef.current = newSessionId();
    dispatch({ kind: "reset" });

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
      dispatch({
        kind: "event",
        event: {
          type: "investigation_failed",
          reason: `Network error: ${(err as Error).message}`,
        },
      });
      return;
    }

    if (!res.ok || !res.body) {
      dispatch({
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
              dispatch({ kind: "event", event: ev });
            } catch {
              // ignore malformed chunk; the stream will recover or end
            }
          }
          idx = buf.indexOf("\n\n");
        }
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        dispatch({
          kind: "event",
          event: {
            type: "investigation_failed",
            reason: `Stream error: ${(err as Error).message}`,
          },
        });
      }
    }
  }, []);

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

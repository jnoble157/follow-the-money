import type {
  HeroInvestigation,
  InvestigationEvent,
  ScriptStep,
} from "./types";
import { findHeroByQuestion } from "./registry";

// Deterministic engine: drives one HeroInvestigation script through the same
// event stream the real agent loop will eventually produce. Sessions live in
// a process-local Map keyed by sessionId; on the dev server this is fine. In
// production we'd swap to a Redis-backed store; for the hackathon demo this
// machine is the production environment.

type Session = {
  sessionId: string;
  investigation: HeroInvestigation;
};

const SESSIONS = new Map<string, Session>();

export type EngineDelays = {
  // Multiplier on the script's natural delays. <1 speeds up (handy for tests
  // and ambient mode); 1 is realistic; >1 slows down for stage demos.
  speed?: number;
};

export class UnknownInvestigationError extends Error {
  constructor(question: string) {
    super(`No hero investigation registered for question: ${question}`);
    this.name = "UnknownInvestigationError";
  }
}

export async function* runInvestigation(
  sessionId: string,
  question: string,
  delays: EngineDelays = {},
): AsyncGenerator<InvestigationEvent> {
  const investigation = findHeroByQuestion(question);
  if (!investigation) {
    throw new UnknownInvestigationError(question);
  }
  const session: Session = { sessionId, investigation };
  SESSIONS.set(sessionId, session);

  try {
    for await (const ev of executeSteps(investigation.steps, delays)) {
      yield ev;
    }
  } finally {
    SESSIONS.delete(sessionId);
  }
}

async function* executeSteps(
  steps: ScriptStep[],
  delays: EngineDelays,
): AsyncGenerator<InvestigationEvent> {
  const speed = delays.speed ?? 1;
  for (const step of steps) {
    yield step.event;
    // Hand-scripted heroes don't carry a wall-clock timestamp; inject one
    // right after plan_started so the status strip can show elapsed. The
    // live agent emits this event itself.
    if (step.event.type === "plan_started") {
      yield { type: "investigation_started", startedAt: Date.now() };
    }
    if (step.delayAfterMs > 0) {
      await sleep(step.delayAfterMs * speed);
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

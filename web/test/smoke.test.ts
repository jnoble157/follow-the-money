import { test } from "node:test";
import assert from "node:assert/strict";

// HTTP smoke test against a running dev server. Run with:
//   npm run dev    # in another terminal
//   npm test
// Or set BASE_URL to point at a deployed instance.

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";

type ClassifierSuggestion =
  | { kind: "profile"; slug: string; name: string; role?: string }
  | { kind: "investigation"; id: string; question: string; pillLabel: string }
  | { kind: "no_data"; reason: string; name: string }
  | { kind: "freeform"; question: string };

async function classifyOverHttp(query: string): Promise<ClassifierSuggestion[]> {
  const res = await fetch(`${BASE_URL}/api/classify?q=${encodeURIComponent(query)}`);
  assert.ok(res.ok, `classify endpoint returned ${res.status}`);
  const body = (await res.json()) as { suggestions: ClassifierSuggestion[] };
  return body.suggestions;
}
const HEADLINE_QUESTION =
  "Who was the biggest individual political spender in Austin's 2018 ballot cycle?";

const HERO_QUESTIONS = [
  HEADLINE_QUESTION,
  "Where did Kirk Watson's biggest political spending in 2022 actually go?",
  "What's the relationship between Endeavor Real Estate Group and Mayor Watson?",
  "Which Austin city lobbyists also lobby the Texas state legislature?",
  "Who funded Save Austin Now PAC for the 2021 Prop B campaign?",
  "Who funded Ridesharing Works for Austin in 2016?",
];

type Event = { type: string; [k: string]: unknown };

async function* streamEvents(
  question: string,
  sessionId: string,
  speed: number,
): AsyncGenerator<Event> {
  const res = await fetch(`${BASE_URL}/api/investigate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ sessionId, question, speed }),
  });
  if (!res.ok || !res.body) {
    throw new Error(`bad response: ${res.status}`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
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
        yield JSON.parse(json);
      }
      idx = buf.indexOf("\n\n");
    }
  }
}

async function resolve(
  sessionId: string,
  disambiguationId: string,
  merged: boolean,
) {
  const res = await fetch(`${BASE_URL}/api/investigate/resume`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ sessionId, disambiguationId, merged }),
  });
  if (!res.ok) {
    throw new Error(`resume failed: ${res.status}`);
  }
}

test("server is reachable", async () => {
  const res = await fetch(BASE_URL);
  assert.ok(
    res.ok,
    `dev server must be running on ${BASE_URL} (status ${res.status})`,
  );
});

test("S1 hero completes under 12s with merge=true", async () => {
  const sessionId = "smoke-s1";
  const start = Date.now();
  let firstEventAt = 0;
  let saw = { complete: false, failed: false, disambiguation: false };

  for await (const ev of streamEvents(HEADLINE_QUESTION, sessionId, 0.05)) {
    if (firstEventAt === 0) firstEventAt = Date.now();
    if (ev.type === "disambiguation_required") {
      saw.disambiguation = true;
      await resolve(sessionId, ev.id as string, true);
    }
    if (ev.type === "investigation_complete") saw.complete = true;
    if (ev.type === "investigation_failed") saw.failed = true;
  }

  const elapsed = Date.now() - start;
  assert.ok(
    firstEventAt - start < 1000,
    `first event should arrive promptly, got ${firstEventAt - start}ms`,
  );
  assert.ok(elapsed < 12_000, `S1 should complete in <12s, took ${elapsed}ms`);
  assert.ok(saw.disambiguation, "S1 must hit the disambiguation moment");
  assert.ok(saw.complete, "S1 must complete");
  assert.ok(!saw.failed, "S1 must not fail");
});

test("ambient cycle: every hero investigation completes when auto-merged", async () => {
  for (const question of HERO_QUESTIONS) {
    const sessionId = `ambient-${Math.random().toString(36).slice(2)}`;
    let saw = { complete: false, failed: false };
    for await (const ev of streamEvents(question, sessionId, 0.01)) {
      if (ev.type === "disambiguation_required") {
        // Same auto-confirm path the ambient console uses.
        await resolve(sessionId, ev.id as string, true);
      }
      if (ev.type === "investigation_complete") saw.complete = true;
      if (ev.type === "investigation_failed") saw.failed = true;
    }
    assert.ok(saw.complete, `${question} must complete`);
    assert.ok(!saw.failed, `${question} must not fail`);
  }
});

test("unknown question returns a friendly failure event", async () => {
  let failed: { reason?: string } | undefined;
  for await (const ev of streamEvents(
    "what is the meaning of life?",
    "smoke-unknown",
    0.01,
  )) {
    if (ev.type === "investigation_failed") {
      failed = ev as { reason?: string };
    }
  }
  assert.ok(failed, "unknown question should yield a failure event");
  assert.match(
    String(failed!.reason ?? ""),
    /stub/i,
    "failure should explain it's a stub demo",
  );
});

// Page-level smokes — render the HTML and look for the things a judge needs
// to see immediately. We don't shell up a headless browser; React server
// components ship the strings we care about in the initial HTML.

async function html(path: string): Promise<string> {
  const res = await fetch(`${BASE_URL}${path}`);
  assert.ok(res.ok, `${path} returned ${res.status}`);
  return res.text();
}

test("home page renders trending strip and officials roster", async () => {
  const body = await html("/");
  assert.match(body, /Trending investigations/i);
  assert.match(body, /Public officials/i);
  assert.match(body, /Kirk Watson/);
  assert.match(body, /Greg Abbott/);
  assert.match(body, /Looking for a federal official\?/);
});

test("/profile/kirk-watson renders the profile", async () => {
  const body = await html("/profile/kirk-watson");
  assert.match(body, /Kirk Watson/);
  assert.match(body, /Mayor of Austin/);
  assert.match(body, /Investigate this/);
  // Stat surface should include the headline transfer dollar figure.
  assert.match(body, /\$1,186,764/);
});

test("/investigate?q=<hero question> sends the question to the client", async () => {
  // The page server-renders the InvestigationConsole shell with the question
  // as initial state; the agent stream itself is started client-side. We only
  // assert the page renders with the question bound, not the stream.
  const q = encodeURIComponent(
    "Where did Kirk Watson's biggest political spending in 2022 actually go?",
  );
  const body = await html(`/investigate?q=${q}`);
  // The QuestionInput's `defaultValue` is the bound question, so it must
  // appear somewhere in the HTML payload.
  assert.match(
    body,
    /Where did Kirk Watson's biggest political spending in 2022 actually go\?/,
  );
});

test("/profile/no-federal-data renders the refusal page", async () => {
  const body = await html("/profile/no-federal-data");
  assert.match(body, /We don't have federal records\./);
  assert.match(body, /Federal Election Commission/i);
});

// Classifier shape. Hits /api/classify so the test process doesn't have to
// resolve Next path aliases.

test("classifier: profile name returns a profile suggestion", async () => {
  const out = await classifyOverHttp("kirk watson");
  const profile = out.find((s) => s.kind === "profile");
  assert.ok(profile, "kirk watson must classify as a profile");
  assert.equal(profile.kind === "profile" && profile.slug, "kirk-watson");
});

test("classifier: hero question returns an investigation suggestion", async () => {
  const out = await classifyOverHttp("Save Austin Now PAC");
  const inv = out.find((s) => s.kind === "investigation");
  assert.ok(inv, "Save Austin Now PAC must surface a hero investigation");
});

test("classifier: federal name returns a no_data suggestion", async () => {
  const out = await classifyOverHttp("ted cruz");
  const refusal = out.find((s) => s.kind === "no_data");
  assert.ok(refusal, "ted cruz must classify as no_data");
  // Profile and federal names are mutually exclusive — ted cruz must not
  // accidentally surface a profile match.
  const profile = out.find((s) => s.kind === "profile");
  assert.equal(profile, undefined, "ted cruz must not match a profile");
});

test("classifier: freeform always available as a fallback", async () => {
  const out = await classifyOverHttp("zzzzzz quetzalcoatl wormhole");
  const free = out.find((s) => s.kind === "freeform");
  assert.ok(free, "freeform fallback must always be present");
});

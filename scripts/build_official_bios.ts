// Builds the tracked cache of short public-official biographies.
//
// Run from the repo root:
//   npm run build:official-bios -- --limit 100

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { loadDotEnv } from "../agent/src/env.ts";
import { listOfficialsWithStats } from "../web/lib/profiles/registry.ts";
import details from "../web/lib/profiles/official_details_manifest.json";
import type {
  OfficialBio,
  OfficialDetail,
  OfficialWithStats,
} from "../web/lib/profiles/types.ts";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..");
const OUT_PATH = path.join(
  REPO_ROOT,
  "web",
  "lib",
  "profiles",
  "official_bios_manifest.json",
);

const DEFAULT_LIMIT = 100;
const DEFAULT_MODEL = "gpt-5-mini";
const DEFAULT_REASONING = "low";
const MAX_ATTEMPTS = 4;
const PROMPT_CACHE_KEY = "official-bios-v2";

type Args = {
  limit: number;
  refresh: boolean;
  dryRun: boolean;
  web: "auto" | "off";
};

type ProfileInput = {
  slug: string;
  displayName: string;
  role: string;
  jurisdiction: string;
  party: string | null;
  aliases: string[];
  nameCandidates: string[];
};

type ModelBio = {
  status: "write" | "skip";
  confidence: "high" | "low";
  canonicalName: string;
  bio: string;
  reason: string;
};

type BioSource = {
  title: string;
  url: string;
};

type ResponsePayload = {
  output_text?: string;
  incomplete_details?: {
    reason?: string;
  } | null;
  output?: Array<{
    type?: string;
    action?: {
      sources?: unknown[];
    };
    content?: Array<{
      type?: string;
      text?: string;
      refusal?: string;
      annotations?: unknown[];
    }>;
  }>;
};

const DETAILS_BY_SLUG = new Map(
  (details as OfficialDetail[]).map((row) => [row.slug, row]),
);

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    status: { type: "string", enum: ["write", "skip"] },
    confidence: { type: "string", enum: ["high", "low"] },
    canonicalName: { type: "string" },
    bio: { type: "string" },
    reason: { type: "string" },
  },
  required: ["status", "confidence", "canonicalName", "bio", "reason"],
  additionalProperties: false,
};

const INSTRUCTIONS = [
  "Write a neutral short public biography for one Texas Money Investigator public-official page.",
  "Return JSON that matches the schema exactly.",
  "Only write when you are highly certain the supplied names identify one public person.",
  "Some display names and aliases are campaign committees; infer the person only when the name is unambiguous.",
  "Use stable public facts you already know. When web_search is available, use it only if your own knowledge is not enough to be highly certain.",
  "Return status skip, confidence low, an empty bio, and a short reason when identity or biography facts are uncertain.",
  "Use durable wording. Prefer has served, has worked, or is a Texas public official instead of saying the person currently serves, represents, oversees, or is the officeholder.",
  "The bio must be exactly two sentences, under eighty words total, and mention the person's public role.",
  "If your draft is one sentence, split it into two before returning it.",
  "Do not include dates, years, district numbers, ages, dollar amounts, counts, private donor names, or election totals.",
  "Do not mention this app, profiles, filings, filing aliases, campaign-finance records, donors, contributions, or source material.",
  "Do not speculate about motives, ideology, controversies, policy positions, religion, ethnicity, family, or private life.",
  "Do not use markdown or footnotes.",
].join("\n");

function parseArgs(argv: string[]): Args {
  const out: Args = {
    limit: envLimit(),
    refresh: false,
    dryRun: false,
    web: envWebMode(),
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--limit") {
      const raw = argv[++i];
      const n = Number(raw);
      if (!Number.isInteger(n) || n <= 0) {
        throw new Error("--limit must be a positive integer");
      }
      out.limit = n;
    } else if (arg === "--refresh") {
      out.refresh = true;
    } else if (arg === "--dry-run") {
      out.dryRun = true;
    } else if (arg === "--web") {
      const raw = argv[++i];
      if (raw !== "auto" && raw !== "off") {
        throw new Error("--web must be auto or off");
      }
      out.web = raw;
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }

  return out;
}

function envLimit(): number {
  const raw = process.env.OPENAI_PROFILE_BIO_LIMIT;
  if (!raw) return DEFAULT_LIMIT;
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error("OPENAI_PROFILE_BIO_LIMIT must be a positive integer");
  }
  return n;
}

function envWebMode(): "auto" | "off" {
  const raw = process.env.OPENAI_PROFILE_BIO_WEB ?? "auto";
  if (raw !== "auto" && raw !== "off") {
    throw new Error("OPENAI_PROFILE_BIO_WEB must be auto or off");
  }
  return raw;
}

function readExisting(): OfficialBio[] {
  if (!fs.existsSync(OUT_PATH)) return [];
  const raw = fs.readFileSync(OUT_PATH, "utf8").trim();
  if (!raw) return [];
  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error(`${path.relative(REPO_ROOT, OUT_PATH)} must be a JSON array`);
  }
  return parsed.filter(isOfficialBio);
}

function isOfficialBio(value: unknown): value is OfficialBio {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.slug === "string" &&
    typeof row.text === "string" &&
    typeof row.model === "string" &&
    (
      row.grounding === "manual" ||
      row.grounding === "model_knowledge" ||
      row.grounding === "web_search"
    ) &&
    typeof row.generatedAt === "string" &&
    Array.isArray(row.sources)
  );
}

function profileInput(official: OfficialWithStats): ProfileInput {
  const detail = DETAILS_BY_SLUG.get(official.slug);
  const aliases = detail?.aliases ?? [];
  const rawNames = [
    official.name,
    slugName(official.slug),
    ...aliases,
    ...sourceNames(official),
  ];

  return {
    slug: official.slug,
    displayName: official.name,
    role: official.role,
    jurisdiction: jurisdictionLabel(official.jurisdiction),
    party: official.partyAffiliation?.label ?? null,
    aliases: aliases.slice(0, 8),
    nameCandidates: unique(rawNames.map(cleanNameCandidate).filter(Boolean)).slice(0, 10),
  };
}

function sourceNames(official: OfficialWithStats): string[] {
  const summaries = [
    official.source.rowSummary,
    official.partyAffiliation?.source.rowSummary,
  ].filter((summary): summary is string => typeof summary === "string");
  const out: string[] = [];
  for (const summary of summaries) {
    for (const pattern of [
      /\blists\s+([A-Z][A-Za-z.' -]+?)\s+with party\b/g,
      /\bprofile for (?:Representative|Senator)\s+([A-Z][A-Za-z.' -]+?)\s+lists\b/g,
    ]) {
      for (const match of summary.matchAll(pattern)) {
        const name = match[1]?.trim();
        if (name) out.push(name);
      }
    }
  }
  return out;
}

function jurisdictionLabel(jurisdiction: OfficialWithStats["jurisdiction"]): string {
  switch (jurisdiction) {
    case "austin":
      return "City of Austin";
    case "tx_state":
      return "Texas state";
    case "tx_federal":
      return "Federal";
  }
}

function requestBody(
  profile: ProfileInput,
  model: string,
  reasoning: string | null,
  allowWebSearch: boolean,
  retryNote: string | null,
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model,
    instructions: retryNote
      ? `${INSTRUCTIONS}\nPrevious output failed validation: ${retryNote}. Return exactly two complete sentences or skip.`
      : INSTRUCTIONS,
    input: JSON.stringify({ profile }, null, 2),
    max_output_tokens: 1200,
    prompt_cache_key: PROMPT_CACHE_KEY,
    text: {
      format: {
        type: "json_schema",
        name: "official_bio",
        strict: true,
        schema: RESPONSE_SCHEMA,
      },
    },
  };

  if (reasoning) {
    body.reasoning = { effort: reasoning };
  }

  if (allowWebSearch) {
    body.tools = [
      {
        type: "web_search",
        filters: {
          allowed_domains: [
            "austintexas.gov",
            "ballotpedia.org",
            "capitol.texas.gov",
            "en.wikipedia.org",
            "gov.texas.gov",
            "house.texas.gov",
            "justfacts.votesmart.org",
            "ltgov.texas.gov",
            "lrl.texas.gov",
            "senate.texas.gov",
            "sos.state.tx.us",
            "sos.texas.gov",
            "texasattorneygeneral.gov",
            "texastribune.org",
          ],
        },
        user_location: {
          type: "approximate",
          country: "US",
          region: "Texas",
          timezone: "America/Chicago",
        },
      },
    ];
    body.tool_choice = "auto";
    body.include = ["web_search_call.action.sources"];
  }

  return body;
}

async function createBio(
  profile: ProfileInput,
  apiKey: string,
  model: string,
  reasoning: string | null,
  allowWebSearch: boolean,
  retryNote: string | null = null,
): Promise<{ bio: OfficialBio | null; reason: string }> {
  const payload = await postResponse(
    requestBody(profile, model, reasoning, allowWebSearch, retryNote),
    apiKey,
  );
  const text = responseText(payload);
  let parsed: ModelBio;
  try {
    parsed = JSON.parse(text) as ModelBio;
  } catch {
    const reason = payload.incomplete_details?.reason
      ? `malformed JSON (${payload.incomplete_details.reason})`
      : "malformed JSON";
    return { bio: null, reason };
  }
  const webUsed = responseUsedWeb(payload);
  const grounding = webUsed ? "web_search" : "model_knowledge";

  if (parsed.status !== "write" || parsed.confidence !== "high") {
    return { bio: null, reason: parsed.reason || "model skipped" };
  }

  const bioText = cleanText(parsed.bio);
  const rejected = rejectionReason(bioText, profile);
  if (rejected) {
    return { bio: null, reason: rejected };
  }

  return {
    bio: {
      slug: profile.slug,
      text: bioText,
      model,
      grounding,
      sources: webUsed ? responseSources(payload) : [],
      generatedAt: new Date().toISOString(),
    },
    reason: "",
  };
}

async function postResponse(
  body: Record<string, unknown>,
  apiKey: string,
): Promise<ResponsePayload> {
  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 60_000);
    try {
      const res = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (res.ok) return (await res.json()) as ResponsePayload;

      const retryAfter = retryAfterMs(res.headers.get("retry-after"));
      const raw = await res.text();
      lastError = new Error(`OpenAI ${res.status}: ${raw.slice(0, 500)}`);
      if (res.status !== 429 && res.status < 500) break;
      await sleep(retryAfter ?? 1000 * attempt * attempt);
    } catch (err) {
      clearTimeout(timer);
      lastError = err instanceof Error ? err : new Error(String(err));
      await sleep(1000 * attempt * attempt);
    }
  }
  throw lastError ?? new Error("OpenAI request failed");
}

function responseText(payload: ResponsePayload): string {
  if (typeof payload.output_text === "string") return payload.output_text;
  for (const item of payload.output ?? []) {
    for (const content of item.content ?? []) {
      if (content.type === "refusal" && content.refusal) {
        throw new Error(`model refusal: ${content.refusal}`);
      }
      if (typeof content.text === "string") return content.text;
    }
  }
  throw new Error("OpenAI response did not include output text");
}

function responseUsedWeb(payload: ResponsePayload): boolean {
  return (payload.output ?? []).some((item) => item.type === "web_search_call");
}

function responseSources(payload: ResponsePayload): BioSource[] {
  const sources: BioSource[] = [];
  const seen = new Set<string>();
  const push = (url: unknown, title: unknown) => {
    if (typeof url !== "string" || !/^https?:\/\//.test(url)) return;
    if (seen.has(url)) return;
    seen.add(url);
    sources.push({
      title: typeof title === "string" && title.trim() ? title.trim() : sourceTitle(url),
      url,
    });
  };

  for (const item of payload.output ?? []) {
    for (const source of item.action?.sources ?? []) {
      if (!source || typeof source !== "object") continue;
      const row = source as Record<string, unknown>;
      push(row.url, row.title);
    }
    for (const content of item.content ?? []) {
      for (const annotation of content.annotations ?? []) {
        if (!annotation || typeof annotation !== "object") continue;
        const row = annotation as Record<string, unknown>;
        if (row.type === "url_citation") {
          push(row.url, row.title);
        }
      }
    }
  }

  return sources.slice(0, 6);
}

function sourceTitle(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function retryAfterMs(value: string | null): number | null {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(value);
  if (Number.isFinite(date)) return Math.max(0, date - Date.now());
  return null;
}

function cleanText(text: string): string {
  return text
    .replace(/\bU\.S\./g, "US")
    .replace(/\bJr\./g, "Jr")
    .replace(/\bSr\./g, "Sr")
    .replace(/\bGov\.\s*/g, "Governor ")
    .replace(/\bLt\.\s*Gov\.\s*/g, "Lieutenant Governor ")
    .replace(/\bRep\.\s*/g, "Representative ")
    .replace(/\bSen\.\s*/g, "Senator ")
    .replace(/[“”]/g, "\"")
    .replace(/[‘’]/g, "'")
    .replace(/[–—]/g, ", ")
    .replace(/\s+/g, " ")
    .trim();
}

function rejectionReason(text: string, profile: ProfileInput): string | null {
  if (!text) return "empty bio";
  if (sentenceCount(text) < 2 || sentenceCount(text) > 3) {
    return "not a two- or three-sentence bio";
  }
  if (wordCount(text) > 80) return "bio is over eighty words";
  if (/[0-9$]/.test(text)) return "contains a numeric claim";
  if (!mentionsKnownName(text, profile)) return "does not name the official";
  if (!mentionsPublicRole(text)) return "does not mention a public role";
  if (currentOfficeClaim(text)) return "uses a current-tense office claim";
  if (/\b(this app|profile|filing|filings|campaign-finance|donor|donors|contribution|source material|appears in)\b/i.test(text)) {
    return "mentions app or filing context";
  }
  if (/\b(probably|possibly|may be|might be|unclear|appears to|seems to)\b/i.test(text)) {
    return "hedged claim";
  }
  if (/\bfrom district\b|\bfor the district\b/i.test(text)) {
    return "lost district value";
  }
  return null;
}

function canRetry(reason: string): boolean {
  return (
    reason === "not a two- or three-sentence bio" ||
    reason === "bio is over eighty words" ||
    reason === "contains a numeric claim" ||
    reason === "mentions app or filing context" ||
    reason === "does not mention a public role" ||
    reason === "uses a current-tense office claim"
  );
}

function sentenceCount(text: string): number {
  return text.match(/[^.!?]+[.!?]+/g)?.length ?? (text ? 1 : 0);
}

function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

function mentionsKnownName(text: string, profile: ProfileInput): boolean {
  const haystack = personKey(text) ?? "";
  return nameTokenSets(profile).some((tokens) => {
    if (tokens.length >= 2) return tokens.every((token) => haystack.includes(token));
    return tokens.length === 1 && haystack.includes(tokens[0]);
  });
}

function mentionsPublicRole(text: string): boolean {
  return /\b(governor|lieutenant governor|attorney general|representative|senator|mayor|council|commissioner|judge|legislator|lawmaker|candidate|officeholder|public official|politician)\b/i.test(text);
}

function currentOfficeClaim(text: string): boolean {
  return /\b(currently serves|serves as|serving as|serves in|serves on|represents constituents|oversees|leads statewide governance|is the (?:governor|lieutenant governor|attorney general|secretary of state|comptroller|land commissioner|mayor)|is a (?:state senator|state representative|railroad commissioner|justice of the supreme court))\b/i.test(text);
}

function nameTokenSets(profile: ProfileInput): string[][] {
  return profile.nameCandidates
    .map((name) =>
      (personKey(name) ?? "")
        .split(" ")
        .filter((token) => token.length > 2 && !NAME_STOPWORDS.has(token)),
    )
    .filter((tokens) => tokens.length > 0);
}

const NAME_STOPWORDS = new Set([
  "campaign",
  "committee",
  "for",
  "friends",
  "governor",
  "inc",
  "pac",
  "texans",
  "texas",
  "the",
]);

function cleanNameCandidate(name: string): string {
  return reorderCommaName(name)
    .replace(/\([^)]*\)/g, " ")
    .replace(/\b(The Honorable|Honorable|Mr|Mrs|Ms|Dr|Jr|Sr|II|III|IV)\b/gi, " ")
    .replace(/\b(Campaign|Committee|PAC|Inc|Texans|Friends)\b/gi, " ")
    .replace(/\bfor\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function reorderCommaName(name: string): string {
  const clean = name.trim();
  if (!clean.includes(",")) return clean;
  const [last, first] = clean.split(",", 2).map((part) => part.trim());
  return first ? `${first} ${last}` : last;
}

function personKey(text: string): string | null {
  const key = text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
  return key || null;
}

function slugName(slug: string): string {
  return slug.replace(/-[0-9]+$/, "").replace(/-/g, " ");
}

function unique(values: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const key = personKey(value);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}

function writeBios(bios: OfficialBio[], order: Map<string, number>): void {
  const deduped = new Map<string, OfficialBio>();
  for (const bio of bios) deduped.set(bio.slug, bio);
  const sorted = [...deduped.values()].sort(
    (a, b) => (order.get(a.slug) ?? 999999) - (order.get(b.slug) ?? 999999),
  );
  const tmp = `${OUT_PATH}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(sorted, null, 2)}\n`);
  fs.renameSync(tmp, OUT_PATH);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main(): Promise<void> {
  const envPath = loadDotEnv();
  const args = parseArgs(process.argv.slice(2));
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_PROFILE_BIO_MODEL || DEFAULT_MODEL;
  const reasoning =
    process.env.OPENAI_PROFILE_BIO_REASONING ??
    (model.startsWith("gpt-5") ? DEFAULT_REASONING : "");
  if (!args.dryRun && !apiKey) {
    throw new Error("OPENAI_API_KEY is required");
  }

  const officials = listOfficialsWithStats().sort((a, b) =>
    b.totalRaised !== a.totalRaised
      ? b.totalRaised - a.totalRaised
      : a.name.localeCompare(b.name),
  );
  const order = new Map(officials.map((official, i) => [official.slug, i]));
  const existing = args.refresh ? [] : readExisting();
  const existingSlugs = new Set(existing.map((bio) => bio.slug));
  const bios = [...existing];
  const missing = officials.filter((official) => !existingSlugs.has(official.slug));
  const batch = missing.slice(0, args.limit);

  if (envPath) console.log(`Loaded ${path.relative(REPO_ROOT, envPath)}`);
  console.log(`Writing ${path.relative(REPO_ROOT, OUT_PATH)}`);
  console.log(`Model ${model}; web ${args.web}; limit ${args.limit}`);

  let written = 0;
  let skipped = 0;
  for (const official of batch) {
    const profile = profileInput(official);
    if (args.dryRun) {
      console.log(`[dry] ${profile.slug} ${profile.displayName}`);
      continue;
    }

    const local = await createBio(
      profile,
      apiKey ?? "",
      model,
      reasoning || null,
      false,
    );
    let bio = local.bio;
    let reason = local.reason;

    if (!bio && canRetry(reason)) {
      const retried = await createBio(
        profile,
        apiKey ?? "",
        model,
        reasoning || null,
        false,
        reason,
      );
      bio = retried.bio;
      reason = retried.reason;
    }

    if (!bio && args.web === "auto") {
      const searched = await createBio(
        profile,
        apiKey ?? "",
        model,
        reasoning || null,
        true,
      );
      bio = searched.bio;
      reason = searched.reason;

      if (!bio && canRetry(reason)) {
        const retried = await createBio(
          profile,
          apiKey ?? "",
          model,
          reasoning || null,
          true,
          reason,
        );
        bio = retried.bio;
        reason = retried.reason;
      }
    }

    if (!bio) {
      skipped++;
      console.log(`[skip] ${profile.slug} ${reason}`);
      continue;
    }

    bios.push(bio);
    existingSlugs.add(bio.slug);
    written++;
    writeBios(bios, order);
    console.log(`[ok ] ${bio.slug} ${bio.grounding}`);
  }

  if (!args.dryRun) writeBios(bios, order);
  console.log(`Done. ${written} written, ${skipped} skipped, ${bios.length} cached.`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});

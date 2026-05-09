import fs from "node:fs/promises";
import path from "node:path";
import type { EntityKind, NetworkNode } from "./build";

// Image enrichment for the network graph (Wikipedia → Wikidata → Clearbit →
// SerpAPI cascade). Cache lives in lib/network/images.json; bump
// FILTER_VERSION to invalidate stale entries.
//
// Strategy: for each entity (politician, donor, employer, lobbyist, lobby
// client) we generate one or more search terms from the raw filing string,
// hit the MediaWiki search+pageimages API in a single round-trip per term,
// and stop at the first hit. Results — including misses, recorded as
// `null` — are persisted to disk so the next server boot is instant.
//
// We do NOT block the API response on this. The first call to enrichNodes
// returns whatever is already in the cache; uncached names are scheduled
// in the background, with results visible after a page refresh. That keeps
// /network responsive even on cold cache.

const CACHE_PATH = path.resolve(
  process.cwd(),
  "lib",
  "network",
  "images.json",
);

const WIKI_API = "https://en.wikipedia.org/w/api.php";
const USER_AGENT =
  "follow-the-money/0.1 (https://github.com/anthropics/claude-code; political-finance-explorer)";

type CacheEntry = {
  url: string | null;
  fetchedAt: string;
  // The matched Wikipedia title, kept for debugging — easy to spot when the
  // search picked a wrong-but-plausible page (e.g., a baseball player named
  // Greg Abbott instead of the governor).
  title?: string;
  // Filter version that produced this entry. When we tighten the relevance
  // check we bump this so existing entries re-fetch instead of locking in
  // the old false positives.
  v?: number;
};

const FILTER_VERSION = 9;

type Cache = Record<string, CacheEntry>;

let memCache: Cache | null = null;
let inFlight: Promise<void> | null = null;

async function loadCache(): Promise<Cache> {
  if (memCache) return memCache;
  try {
    const raw = await fs.readFile(CACHE_PATH, "utf-8");
    memCache = JSON.parse(raw) as Cache;
  } catch {
    memCache = {};
  }
  return memCache;
}

async function saveCache(cache: Cache): Promise<void> {
  // Sort keys so diffs are reviewable in git.
  const sorted: Cache = {};
  for (const k of Object.keys(cache).sort()) sorted[k] = cache[k];
  await fs.writeFile(CACHE_PATH, JSON.stringify(sorted, null, 2));
}

// Build search candidates from a filing-style entity name. Filings are noisy
// — "Watson, Kirk P." for a person, "Texans for Greg Abbott" for a
// committee, "Endeavor Real Estate Group, LLC" for a company — so we hand
// MediaWiki a few rewordings ranked by likelihood of a useful page.
function searchTerms(name: string, kind: EntityKind): string[] {
  const terms: string[] = [];
  const cleaned = name
    .replace(
      /,?\s*(Inc\.?|LLC\.?|L\.L\.C\.?|Corp\.?|Corporation|L\.P\.?|LP|Ltd\.?)\.?$/i,
      "",
    )
    .replace(/\(The Honorable\)/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();

  if (cleaned.includes(",") && (kind === "politician" || kind === "donor" || kind === "lobbyist")) {
    // "Last, First M." → "First Last"
    const [last, rest] = cleaned.split(",", 2);
    const first = (rest ?? "")
      .trim()
      .replace(/\b[A-Z]\.\s*/g, "")
      .replace(/\s{2,}/g, " ")
      .trim();
    if (first) terms.push(`${first} ${last.trim()}`);
  }

  // "Texans for X" / "Friends of X" → X
  const stripPrefix = cleaned.match(
    /^(?:Texans\s+for|Friends\s+of|Committee\s+to\s+Elect|Citizens\s+for)\s+(.+)$/i,
  );
  if (stripPrefix) terms.push(stripPrefix[1]);

  // "X Campaign" / "X PAC" / "X Committee" → X
  const stripped = cleaned.replace(
    /\s+(Campaign|Committee|PAC|Political Action Committee)$/i,
    "",
  );
  if (stripped !== cleaned) terms.push(stripped);

  terms.push(cleaned);

  // Dedupe while preserving order.
  return Array.from(new Set(terms.filter(Boolean)));
}

type WikiHit = {
  title: string;
  thumbnail?: { source: string; width: number; height: number };
};

type WikiSearchResp = {
  query?: {
    pages?: Record<
      string,
      { pageid: number; title: string; index?: number; thumbnail?: WikiHit["thumbnail"] }
    >;
  };
};

// Generic words that share between query and title don't constitute a real
// match. Drop them before computing word overlap so "Austin Board of
// Realtors" doesn't pass when Wikipedia returns "Austin, Texas".
const STOPWORDS = new Set([
  "the", "and", "for", "with", "from", "into", "of", "to", "in", "on", "at",
  "a", "an", "as", "by", "or", "is",
  // generic political / corporate suffixes
  "campaign", "committee", "pac", "fund", "association", "society", "group",
  "club", "council", "alliance", "coalition", "league", "league",
  "company", "corp", "corporation", "inc", "incorporated", "llc", "ltd",
  "lp", "trust", "foundation", "partnership", "partners", "holdings",
  "international", "national", "global", "american", "states", "united",
  // texas geography and political fixtures — these come back constantly on
  // generic Austin-related pages and make for very tempting false positives
  "texas", "texan", "texans", "austin", "houston", "dallas", "san", "antonio",
  // role / kind suffixes
  "political", "action", "real", "estate", "industry", "industries",
  "service", "services", "system", "systems",
  "name", "names", "people",
]);

function tokens(s: string): string[] {
  return s
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t));
}

// True if the matched Wikipedia title plausibly refers to the same entity
// as the search query. Tiered token-overlap rule:
//   1 query token  → that token must appear (substring-tolerant) in title
//   2+ query tokens → at least 2 must appear; this is what stops common
//                     surname collisions ("Kelly, Mackenzie" matching
//                     "Kelly Kruger") from sneaking through with a single
//                     overlap.
//   Acronym fallback: a short all-caps query is accepted if the title's
//                     word-initials spell it (AFSCME → "American Federation
//                     of State…").
function isRelevantMatch(query: string, title: string): boolean {
  const qTokens = tokens(query);
  const tTokens = tokens(title);
  if (qTokens.length === 0) return false;

  const tSet = new Set(tTokens);
  let overlap = 0;
  for (const q of qTokens) {
    if (tSet.has(q)) {
      overlap++;
      continue;
    }
    // Loose match: query token is a prefix of a title token (or vice
    // versa) when both sides are long enough that the prefix carries
    // signal. "Watson" matches "Watsons" but "abbo" doesn't drag along
    // the cricketer "Sean Abbott".
    for (const t of tTokens) {
      if (q.length >= 5 && (t.startsWith(q) || q.startsWith(t))) {
        overlap++;
        break;
      }
    }
  }

  const required = qTokens.length === 1 ? 1 : 2;
  if (overlap >= required) {
    // Extra rule for single-token queries: the title must start with that
    // token (or equal it). Otherwise "ORACLE" pulls "Consulting the
    // Oracle", "RECA" pulls "RecA" (a protein), etc. — Wikipedia has lots
    // of pages where a single content word appears in passing.
    if (qTokens.length === 1) {
      const q = qTokens[0];
      const firstTitleToken = tTokens[0] ?? "";
      if (firstTitleToken !== q && !firstTitleToken.startsWith(q)) return false;
    }
    return true;
  }

  // Acronym fallback. "AFSCME" → "American Federation of State, County and
  // Municipal Employees" (skipping `of` and `and`). Note: this uses a
  // *minimal* stopword list, not the broader content-stopword set above —
  // "American" is a content stopword for overlap purposes, but it provides
  // the leading "A" of AFSCME and must NOT be skipped here.
  const ACRONYM_SKIP = new Set(["of", "the", "and", "for", "in", "on", "&"]);
  const acronym = query.match(/^[A-Z][A-Z0-9]{2,8}$/);
  if (acronym) {
    const initials = title
      .split(/\s+/)
      .filter((w) => /^[A-Z]/.test(w) && !ACRONYM_SKIP.has(w.toLowerCase()))
      .map((w) => w[0])
      .join("");
    if (initials.toLowerCase().includes(acronym[0].toLowerCase())) return true;
  }
  return false;
}

// One MediaWiki call that combines search + thumbnail. `gsrsearch` does the
// search, `prop=pageimages` returns the lead image, `pithumbsize=160` is
// just big enough to look sharp on a vis-network circularImage node.
async function searchWikiOnce(query: string): Promise<WikiHit | null> {
  const url = new URL(WIKI_API);
  url.searchParams.set("action", "query");
  url.searchParams.set("format", "json");
  url.searchParams.set("prop", "pageimages");
  url.searchParams.set("piprop", "thumbnail");
  url.searchParams.set("pithumbsize", "160");
  url.searchParams.set("generator", "search");
  url.searchParams.set("gsrsearch", query);
  url.searchParams.set("gsrlimit", "1");
  url.searchParams.set("origin", "*");

  const res = await fetch(url, {
    headers: { "user-agent": USER_AGENT },
  });
  if (!res.ok) return null;
  const json = (await res.json()) as WikiSearchResp;
  const pages = json.query?.pages;
  // Wikipedia silently degrades when hammered: returns HTTP 200 with no
  // `query.pages` for a real query. Retry once after a short backoff.
  if (!pages) {
    await new Promise((r) => setTimeout(r, 1200));
    const retry = await fetch(url, { headers: { "user-agent": USER_AGENT } });
    if (!retry.ok) return null;
    const retryJson = (await retry.json()) as WikiSearchResp;
    const retryPages = retryJson.query?.pages;
    if (!retryPages) return null;
    return processWikiPages(query, retryPages);
  }
  return processWikiPages(query, pages);
}

function processWikiPages(
  query: string,
  pages: NonNullable<NonNullable<WikiSearchResp["query"]>["pages"]>,
): WikiHit | null {
  // The "pages" map is keyed by pageid; pick the entry with index === 1
  // (the top search hit). Fall back to whichever entry exists if needed.
  const entries = Object.values(pages);
  if (entries.length === 0) return null;
  entries.sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  const top = entries[0];
  if (!top.thumbnail) return null;
  // Reject when Wikipedia's top hit is thematically related but not the
  // entity we asked about. Without this check, generic Austin/Texas pages
  // pollute the graph with skyline photos.
  if (!isRelevantMatch(query, top.title)) return null;
  return { title: top.title, thumbnail: top.thumbnail };
}

// Wikidata: broader than Wikipedia. Many minor politicians, lobbyists, and
// regional firms have a Wikidata entity (with a P18 image) even when no
// Wikipedia article exists. We call wbsearchentities for the candidate, then
// pull the P18 (image) claim.
type WikidataSearchResp = {
  search?: { id: string; label: string; description?: string }[];
};
type WikidataClaimsResp = {
  claims?: { P18?: { mainsnak: { datavalue?: { value: string } } }[] };
};
async function searchWikidataOnce(query: string): Promise<WikiHit | null> {
  const searchUrl = new URL("https://www.wikidata.org/w/api.php");
  searchUrl.searchParams.set("action", "wbsearchentities");
  searchUrl.searchParams.set("search", query);
  searchUrl.searchParams.set("language", "en");
  searchUrl.searchParams.set("format", "json");
  searchUrl.searchParams.set("limit", "3");
  searchUrl.searchParams.set("origin", "*");
  const sRes = await fetch(searchUrl, { headers: { "user-agent": USER_AGENT } });
  if (!sRes.ok) return null;
  const sJson = (await sRes.json()) as WikidataSearchResp;
  for (const candidate of sJson.search ?? []) {
    if (!isRelevantMatch(query, candidate.label)) continue;
    const claimsUrl = new URL("https://www.wikidata.org/w/api.php");
    claimsUrl.searchParams.set("action", "wbgetclaims");
    claimsUrl.searchParams.set("entity", candidate.id);
    claimsUrl.searchParams.set("property", "P18");
    claimsUrl.searchParams.set("format", "json");
    claimsUrl.searchParams.set("origin", "*");
    const cRes = await fetch(claimsUrl, {
      headers: { "user-agent": USER_AGENT },
    });
    if (!cRes.ok) continue;
    const cJson = (await cRes.json()) as WikidataClaimsResp;
    const filename = cJson.claims?.P18?.[0]?.mainsnak?.datavalue?.value;
    if (!filename) continue;
    const fileUrl = `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(
      filename,
    )}?width=160`;
    return {
      title: candidate.label,
      thumbnail: { source: fileUrl, width: 160, height: 160 },
    };
  }
  return null;
}

// SerpAPI Google Images: covers the long tail of obscure local politicians,
// lobbyists, and small firms that no encyclopedia has indexed. Activates
// only when SERPAPI_KEY is set in the environment; without it we silently
// skip this source. The key is read fresh on each call so adding it to
// .env.local doesn't require a server restart.
//
// (We had Bing here originally. Microsoft retired the Bing Search APIs
// in August 2025; SerpAPI is the working drop-in.)
type SerpImage = {
  title?: string;
  source?: string;
  thumbnail?: string;
  original?: string;
  link?: string;
};
type SerpResp = { images_results?: SerpImage[] };
async function searchSerpOnce(query: string): Promise<WikiHit | null> {
  const key = process.env.SERPAPI_KEY;
  if (!key) return null;
  const url = new URL("https://serpapi.com/search.json");
  url.searchParams.set("engine", "google_images");
  url.searchParams.set("q", query);
  url.searchParams.set("ijn", "0");
  url.searchParams.set("api_key", key);
  const res = await fetch(url, { headers: { "user-agent": USER_AGENT } });
  if (!res.ok) return null;
  const json = (await res.json()) as SerpResp;
  for (const img of json.images_results ?? []) {
    const thumb = img.thumbnail ?? img.original;
    if (!thumb) continue;
    // SerpAPI's title and source domain together give us a workable
    // haystack for the relevance check — e.g., a photo of Alison Alter
    // hosted on austincouncil.gov passes because "alter" appears in the
    // title. Without this check the API gladly returns generic stock
    // photos for any query.
    const haystack = `${img.title ?? ""} ${img.source ?? ""} ${img.link ?? ""}`;
    if (!isRelevantMatch(query, haystack)) continue;
    return {
      title: img.title ?? query,
      thumbnail: { source: thumb, width: 160, height: 160 },
    };
  }
  return null;
}

// Clearbit autocomplete: a free, unauthenticated company-suggest endpoint
// that returns a name + domain + logo. Hits surprisingly often on tech and
// real-estate firms; misses on small local lobby clients.
type ClearbitSuggestion = { name: string; domain: string; logo: string };
async function searchClearbitOnce(query: string): Promise<WikiHit | null> {
  const url = new URL("https://autocomplete.clearbit.com/v1/companies/suggest");
  url.searchParams.set("query", query);
  const res = await fetch(url, { headers: { "user-agent": USER_AGENT } });
  if (!res.ok) return null;
  const list = (await res.json()) as ClearbitSuggestion[];
  for (const s of list) {
    if (!s.logo) continue;
    if (!isRelevantMatch(query, s.name)) continue;
    return {
      title: s.name,
      thumbnail: { source: s.logo, width: 128, height: 128 },
    };
  }
  return null;
}

// Order matters: Wikipedia first (best photo coverage when present), then
// Wikidata (covers minor figures), then Clearbit (covers companies that
// neither encyclopedia bothered with). The relevance filter applies to all
// three so a hit only registers when the source's matched name plausibly
// refers to the same entity.
export async function lookupImage(name: string, kind: EntityKind): Promise<CacheEntry> {
  const queries = searchTerms(name, kind);
  const sources: Array<{
    label: "wiki" | "wikidata" | "clearbit" | "serp";
    fn: (q: string) => Promise<WikiHit | null>;
    only?: EntityKind[];
  }> = [
    { label: "wiki", fn: searchWikiOnce },
    { label: "wikidata", fn: searchWikidataOnce },
    // Clearbit is a logo source — only meaningful for org-shaped entities.
    {
      label: "clearbit",
      fn: searchClearbitOnce,
      only: ["employer", "client", "donor", "politician"],
    },
    // SerpAPI as the catch-all for the long tail. Skipped silently when
    // SERPAPI_KEY isn't set, so this source is a no-op for anyone running
    // without a key.
    { label: "serp", fn: searchSerpOnce },
  ];

  for (const src of sources) {
    if (src.only && !src.only.includes(kind)) continue;
    for (const q of queries) {
      try {
        const hit = await src.fn(q);
        if (hit?.thumbnail?.source) {
          return {
            url: hit.thumbnail.source,
            title: `${hit.title} [${src.label}]`,
            fetchedAt: new Date().toISOString(),
            v: FILTER_VERSION,
          };
        }
      } catch {
        // Swallow per-source errors and try the next.
      }
    }
  }

  return { url: null, fetchedAt: new Date().toISOString(), v: FILTER_VERSION };
}

// Fixed-concurrency map with a small per-task delay. Wikipedia and Wikidata
// silently degrade when hammered — the search endpoint starts returning
// empty result sets for valid queries — so we keep parallelism low and
// pace each worker. The cost is a slower first-fetch (~60–90s for 140
// nodes); subsequent calls hit the disk cache and are instant.
async function pmap<T, U>(
  items: T[],
  worker: (item: T) => Promise<U>,
  concurrency: number,
  perTaskDelayMs = 80,
): Promise<U[]> {
  const out: U[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (true) {
        const i = next++;
        if (i >= items.length) return;
        out[i] = await worker(items[i]);
        if (perTaskDelayMs > 0) {
          await new Promise((r) => setTimeout(r, perTaskDelayMs));
        }
      }
    }),
  );
  return out;
}

// Background enrichment. Reads the cache, returns immediately with whatever
// is already known, and kicks off a fetch for the rest. The cache file is
// updated incrementally so partial progress survives a crash or restart.
//
// Stale entries (older filter version) are treated as missing so a tighter
// relevance check auto-cleans previously-cached false positives.
export async function enrichNodes(
  nodes: NetworkNode[],
): Promise<NetworkNode[]> {
  const cache = await loadCache();
  const isStale = (e: CacheEntry | undefined) =>
    !e || (e.v ?? 0) < FILTER_VERSION;
  const enriched = nodes.map((n) => {
    const e = cache[n.id];
    return e?.url && !isStale(e) ? { ...n, image: e.url } : n;
  });

  const missing = nodes.filter((n) => isStale(cache[n.id]));
  if (missing.length > 0 && !inFlight) {
    inFlight = (async () => {
      try {
        await pmap(
          missing,
          async (n) => {
            const result = await lookupImage(n.label, n.kind);
            cache[n.id] = result;
            // Persist after each batch of ~10 to amortize file writes.
            if (Object.keys(cache).length % 10 === 0) {
              await saveCache(cache).catch(() => {
                /* read-only fs is fine; in-memory cache still works */
              });
            }
          },
          1,
          250,
        );
        await saveCache(cache).catch(() => {});
      } finally {
        inFlight = null;
      }
    })();
  }

  return enriched;
}

// Test/debug hook: force a refetch of a single name. Not exported via index.
export async function _refetch(name: string, kind: EntityKind): Promise<CacheEntry> {
  const cache = await loadCache();
  const result = await lookupImage(name, kind);
  // Use the same id format build.ts produces.
  cache[`${kind}:${name}`] = result;
  await saveCache(cache);
  return result;
}

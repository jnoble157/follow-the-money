import { z } from "zod";
import { distance } from "fastest-levenshtein";
import { query } from "../db/connect.ts";
import { Citation, Confidence } from "../schemas/index.ts";
import {
  austinLobbyRegistrantCitation,
  tecLobbyRegistrationCitation,
} from "../citations.ts";
import type { Tool } from "./types.ts";

// Find people who appear in both the Austin city lobby register and the
// TEC state lobby register for a given year. The IDs (REGISTRANT_ID vs.
// FilerID) are different namespaces; the join goes through fuzzy name
// match plus optional employer agreement.

const Args = z.object({
  year: z.number().int().min(2018).max(2030).default(2025),
  threshold: z.number().min(0).max(1).default(0.85),
  limit: z.number().int().positive().max(100).default(40),
});

const Match = z.object({
  name: z.string(),
  austinEmployer: z.string().nullable(),
  stateEmployer: z.string().nullable(),
  confidence: Confidence,
  // Two citations: one per side of the join. The agent should cite both
  // when reporting that someone appears in both registers.
  austinSource: Citation,
  stateSource: Citation,
});

const Result = z.object({
  year: z.number(),
  matches: z.array(Match),
  threshold: z.number(),
});

type AustinRow = {
  registrantId: string;
  fullName: string | null;
  first: string | null;
  last: string | null;
  employer: string | null;
};
type StateRow = {
  filerId: string;
  filerName: string;
  business: string | null;
  year: string;
};

async function run(rawArgs: z.input<typeof Args>): Promise<z.infer<typeof Result>> {
  const args = Args.parse(rawArgs);
  // The Austin lobby registry is small (~320 rows) so we pull it whole.
  const austin = await query<AustinRow>(
    `
    SELECT
      REGISTRANT_ID         AS registrantId,
      REGISTRANT_FULL_NAME  AS fullName,
      REGISTRANT_FIRST_NAME AS first,
      REGISTRANT_LAST_NAME  AS last,
      EMPLOYER              AS employer
    FROM austin_lobby_registrants
    WHERE REGISTRANT_LAST_NAME IS NOT NULL
    `,
  );
  const tec = await query<StateRow>(
    `
    SELECT
      FilerID              AS filerId,
      "Filer Name"         AS filerName,
      Business             AS business,
      year
    FROM tec_lobby_registrations
    WHERE year = ?
    `,
    [String(args.year)],
  );

  const austinKeys = austin.map((a) => ({
    raw: a,
    norm: normalizeName(`${a.last ?? ""} ${a.first ?? ""}`),
  }));
  const tecKeys = tec.map((t) => ({
    raw: t,
    norm: normalizeName(stripEmployerSuffix(t.filerName)),
  }));

  const matches: z.infer<typeof Match>[] = [];
  const seen = new Set<string>();
  for (const a of austinKeys) {
    if (!a.norm) continue;
    for (const t of tecKeys) {
      if (!t.norm) continue;
      const sim = similarity(a.norm, t.norm);
      if (sim < args.threshold) continue;
      const key = `${a.raw.registrantId}::${t.raw.filerId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      matches.push({
        name: prettyName(a.raw),
        austinEmployer: a.raw.employer,
        stateEmployer: t.raw.business,
        confidence: sim,
        austinSource: austinLobbyRegistrantCitation({
          registrantId: a.raw.registrantId,
          fullName: a.raw.fullName ?? prettyName(a.raw),
          employer: a.raw.employer ?? "",
        }),
        stateSource: tecLobbyRegistrationCitation({
          filerId: t.raw.filerId,
          filerName: t.raw.filerName,
          business: t.raw.business ?? "",
          year: t.raw.year,
        }),
      });
      // One Austin row → one TEC row is the typical case; once we've
      // matched skip ahead.
      break;
    }
  }

  matches.sort((a, b) => b.confidence - a.confidence);
  return {
    year: args.year,
    threshold: args.threshold,
    matches: matches.slice(0, args.limit),
  };
}

function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// TEC sometimes appends the firm in parentheses to the filer name, e.g.
// "McDaniel, Demetrius (Greenberg Traurig LLP)". Strip it for the match.
function stripEmployerSuffix(s: string): string {
  return s.replace(/\s*\([^)]*\)\s*$/, "");
}

function prettyName(a: AustinRow): string {
  if (a.fullName) return a.fullName;
  return [a.first, a.last].filter(Boolean).join(" ");
}

function similarity(a: string, b: string): number {
  if (!a || !b) return 0;
  const d = distance(a, b);
  const max = Math.max(a.length, b.length);
  return Math.max(0, 1 - d / max);
}

export const crossReferenceLobby: Tool<typeof Args, typeof Result> = {
  name: "cross_reference_lobby",
  description:
    "Match Austin city lobbyists to TEC state lobbyists for a given year. The two registries use different ID namespaces; the join is a fuzzy name match (defaults to 0.85 confidence). The agent should describe matches below 0.9 as 'possible' rather than 'confirmed'.",
  argsSchema: Args,
  resultSchema: Result,
  run,
};

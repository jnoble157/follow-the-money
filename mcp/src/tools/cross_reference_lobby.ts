import { z } from "zod";
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
// match.
//
// The fuzzy join runs inside DuckDB using its native `levenshtein()`
// function, with each side normalized via a CTE. The previous version
// pulled both registries into JS for an O(n*m) loop (320 * 10k = 3.2M
// comparisons per call); this one is a single SQL statement and stays
// inside the engine.

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

type JoinRow = {
  registrantId: string;
  fullName: string | null;
  first: string | null;
  last: string | null;
  austinEmployer: string | null;
  filerId: string;
  filerName: string;
  business: string | null;
  yearStr: string;
  confidence: number;
};

async function run(rawArgs: z.input<typeof Args>): Promise<z.infer<typeof Result>> {
  const args = Args.parse(rawArgs);
  // Single statement: normalize both sides in CTEs, join on the
  // Levenshtein-derived similarity, drop matches below threshold, and let
  // DuckDB rank + cap. The DISTINCT ON-equivalent (qualify ROW_NUMBER) keeps
  // the best match per austin registrant; one Austin row -> one TEC row is
  // the typical case.
  const rows = await query<JoinRow>(
    `
    WITH austin AS (
      SELECT
        REGISTRANT_ID                       AS registrantId,
        REGISTRANT_FULL_NAME                AS fullName,
        REGISTRANT_FIRST_NAME               AS first,
        REGISTRANT_LAST_NAME                AS last,
        EMPLOYER                            AS austinEmployer,
        regexp_replace(
          lower(coalesce(REGISTRANT_LAST_NAME, '') || ' ' || coalesce(REGISTRANT_FIRST_NAME, '')),
          '[^a-z ]+', ' ', 'g') AS norm
      FROM austin_lobby_registrants
      WHERE REGISTRANT_LAST_NAME IS NOT NULL
    ),
    tec AS (
      SELECT
        FilerID                             AS filerId,
        "Filer Name"                        AS filerName,
        Business                            AS business,
        year                                AS yearStr,
        regexp_replace(
          lower(regexp_replace("Filer Name", '\\s*\\([^)]*\\)\\s*$', '', 'g')),
          '[^a-z ]+', ' ', 'g') AS norm
      FROM tec_lobby_registrations
      WHERE year = ?
    ),
    paired AS (
      SELECT
        a.registrantId, a.fullName, a.first, a.last, a.austinEmployer,
        t.filerId, t.filerName, t.business, t.yearStr,
        1.0 - levenshtein(a.norm, t.norm)::DOUBLE
            / GREATEST(length(a.norm), length(t.norm))  AS confidence
      FROM austin a
      JOIN tec t
        ON length(a.norm) > 0 AND length(t.norm) > 0
        -- DuckDB's levenshtein is fast but quadratic per pair; pre-filter
        -- by length difference so we skip 90%+ of candidate pairs.
        AND abs(length(a.norm) - length(t.norm)) <= GREATEST(2, length(a.norm) / 4)
        AND levenshtein(a.norm, t.norm)
            <= GREATEST(length(a.norm), length(t.norm)) * (1 - ?)
    )
    SELECT *
    FROM paired
    QUALIFY ROW_NUMBER() OVER (
      PARTITION BY registrantId ORDER BY confidence DESC
    ) = 1
    ORDER BY confidence DESC
    LIMIT ?
    `,
    [String(args.year), args.threshold, args.limit],
  );

  const matches: z.infer<typeof Match>[] = rows.map((r) => ({
    name: r.fullName ?? [r.first, r.last].filter(Boolean).join(" "),
    austinEmployer: r.austinEmployer,
    stateEmployer: r.business,
    confidence: r.confidence,
    austinSource: austinLobbyRegistrantCitation({
      registrantId: r.registrantId,
      fullName: r.fullName ?? [r.first, r.last].filter(Boolean).join(" "),
      employer: r.austinEmployer ?? "",
    }),
    stateSource: tecLobbyRegistrationCitation({
      filerId: r.filerId,
      filerName: r.filerName,
      business: r.business ?? "",
      year: r.yearStr,
    }),
  }));

  return {
    year: args.year,
    threshold: args.threshold,
    matches,
  };
}

export const crossReferenceLobby: Tool<typeof Args, typeof Result> = {
  name: "cross_reference_lobby",
  description:
    "Match Austin city lobbyists to TEC state lobbyists for a given year. The two registries use different ID namespaces; the join is a fuzzy name match (defaults to 0.85 confidence). The agent should describe matches below 0.9 as 'possible' rather than 'confirmed'.",
  argsSchema: Args,
  resultSchema: Result,
  run,
};

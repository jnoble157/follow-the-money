import path from "node:path";
import { fileURLToPath } from "node:url";
import { DuckDBInstance, type DuckDBConnection } from "@duckdb/node-api";

// In-memory DuckDB connection that exposes the project's Parquet files as
// stable named views. The agent and MCP tools query these views, never the
// underlying paths — so we can reorganize the parquet layout without
// rewriting tools.

// Resolve the repo root from this file's URL. Works regardless of where the
// process is launched from (web/, mcp/, or repo root).
const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..", "..", "..");
const PARQUET = path.join(REPO_ROOT, "data", "parquet");

// View name -> parquet path or glob, relative to data/parquet/. Globs let us
// union the per-year TEC lobby files at query time so the agent doesn't have
// to know about the per-year layout.
const VIEWS: Record<string, string> = {
  austin_contributions: "austin/cf/contributions.parquet",
  austin_expenditures: "austin/cf/expenditures.parquet",
  austin_transactions: "austin/cf/transaction_detail.parquet",
  austin_loans: "austin/cf/loans.parquet",
  austin_lobby_registrants: "austin/lobby/registrants.parquet",
  austin_lobby_clients: "austin/lobby/clients.parquet",
  austin_lobby_subjects: "austin/lobby/municipal_questions.parquet",
  austin_lobby_reports: "austin/lobby/reports.parquet",
  tec_filers: "tec/cf/filers.parquet",
  tec_contributions: "tec/cf/contributions.parquet",
  tec_expenditures: "tec/cf/expenditures.parquet",
  tec_lobby_registrations: "tec/lobby/registrations/*.parquet",
  tec_lobby_subject_matter: "tec/lobby/subject_matter/*.parquet",
  tec_lobby_registered: "tec/lobby/registered/*.parquet",
  tec_lobby_political_funds: "tec/lobby/political_funds/*.parquet",
};

let cached: Promise<DuckDBConnection> | null = null;

export async function getConnection(): Promise<DuckDBConnection> {
  if (cached) return cached;
  cached = (async () => {
    const instance = await DuckDBInstance.create(":memory:");
    const conn = await instance.connect();
    for (const [view, rel] of Object.entries(VIEWS)) {
      const abs = path.join(PARQUET, rel).replace(/'/g, "''");
      try {
        await conn.run(
          `CREATE OR REPLACE VIEW ${view} AS SELECT * FROM '${abs}'`,
        );
      } catch (err) {
        // A missing parquet file (e.g. when only a subset of the data
        // ships in a deploy) should not poison the entire connection —
        // earlier behavior failed every subsequent query. Log and skip
        // so the views that DO have data stay queryable.
        const msg = err instanceof Error ? err.message : String(err);
        // eslint-disable-next-line no-console
        console.warn(
          `db: skipping view "${view}" (path ${abs}): ${msg}`,
        );
      }
    }
    return conn;
  })();
  return cached;
}

// Run a parameterized query and return rows as plain JS objects. Numeric and
// date values are converted to native JS where possible (`getRowObjectsJS`).
// We don't expose the raw DuckDBResultReader to callers — staying inside this
// module keeps the surface small and lets us swap the binding later.
export async function query<T extends Record<string, unknown>>(
  sql: string,
  params: ReadonlyArray<string | number | boolean | null> = [],
): Promise<T[]> {
  const conn = await getConnection();
  const reader = await conn.runAndReadAll(sql, params as never);
  return reader.getRowObjectsJS() as T[];
}

// Test helper: drop the cached connection. Useful for the smoke test which
// exercises view registration on a fresh boot. Not part of the production
// surface.
export function _resetForTest(): void {
  cached = null;
}

import { tokens, nameWhere, confidence } from "./names.ts";

// Assertion-style smoke for names.ts. Run with
// `npx tsx mcp/src/db/names_smoke.ts`. Failures throw, so the script
// exits non-zero; pass prints a one-line summary.

let failed = 0;

function eq<T>(label: string, got: T, want: T): void {
  const a = JSON.stringify(got);
  const b = JSON.stringify(want);
  if (a === b) {
    console.log(`  ok  ${label}`);
    return;
  }
  failed++;
  console.log(`  FAIL ${label}\n       got  ${a}\n       want ${b}`);
}

function near(label: string, got: number, want: number, eps = 0.01): void {
  if (Math.abs(got - want) <= eps) {
    console.log(`  ok  ${label}  (${got.toFixed(3)})`);
    return;
  }
  failed++;
  console.log(`  FAIL ${label}  got ${got.toFixed(3)} want ${want.toFixed(3)} (eps ${eps})`);
}

console.log("--- tokens ---");
eq("kirk watson natural", tokens("Kirk Watson"), ["kirk", "watson"]);
eq("watson kirk last-first w/ title parens", tokens("Watson, Kirk P. (The Honorable)"), ["watson", "kirk"]);
eq("newman jake mr in parens", tokens("Newman, Jake (Mr.)"), ["newman", "jake"]);
eq("texans for greg abbott", tokens("Texans for Greg Abbott"), ["texans", "greg", "abbott"]);
eq("friends of kirk watson", tokens("Friends of Kirk Watson"), ["friends", "kirk", "watson"]);
eq("mr. robert epstein jr.", tokens("Mr. Robert Epstein Jr."), ["robert", "epstein"]);
eq("ampersand committee", tokens("Goode Casseb & Watson Committee"), ["goode", "casseb", "watson", "committee"]);
eq("only a title returns nothing", tokens("Mr."), []);
eq("empty string", tokens(""), []);

console.log("\n--- nameWhere (single column) ---");
{
  const m = nameWhere(["filerName"], "Kirk Watson");
  if (!m) throw new Error("expected non-null");
  eq("two-token sql", m.sql, "filerName ILIKE ? AND filerName ILIKE ?");
  eq("two-token params", m.params, ["%kirk%", "%watson%"]);
}
{
  const m = nameWhere(["Recipient"], "Watson");
  if (!m) throw new Error("expected non-null");
  eq("single-token sql", m.sql, "Recipient ILIKE ?");
  eq("single-token params", m.params, ["%watson%"]);
}
eq("untokenizable returns null", nameWhere(["filerName"], "the"), null);

console.log("\n--- nameWhere (multi-column, decomposed) ---");
{
  const cols = ["contributorNameOrganization", "contributorNameLast", "contributorNameFirst"];
  const m = nameWhere(cols, "Robert Epstein");
  if (!m) throw new Error("expected non-null");
  eq(
    "multi-column sql",
    m.sql,
    "(contributorNameOrganization ILIKE ? OR contributorNameLast ILIKE ? OR contributorNameFirst ILIKE ?)" +
      " AND " +
      "(contributorNameOrganization ILIKE ? OR contributorNameLast ILIKE ? OR contributorNameFirst ILIKE ?)",
  );
  eq("multi-column params", m.params, [
    "%robert%",
    "%robert%",
    "%robert%",
    "%epstein%",
    "%epstein%",
    "%epstein%",
  ]);
}

console.log("\n--- confidence ---");
near("kirk watson <-> watson kirk p the honorable", confidence("Kirk Watson", "Watson, Kirk P. (The Honorable)"), 1.0);
near("watson <-> watson kirk p", confidence("Watson", "Watson, Kirk P."), 0.5);
near("brian watson <-> watson kirk p", confidence("Brian Watson", "Watson, Kirk P."), 1 / 3);
near("texans for greg abbott self", confidence("Texans for Greg Abbott", "Texans for Greg Abbott"), 1.0);
near("ted cruz <-> kirkland steven e", confidence("Ted Cruz", "Kirkland, Steven E."), 0);
near("untokenizable input", confidence("the", "Watson, Kirk P."), 0);

if (failed > 0) {
  console.error(`\n${failed} assertion(s) failed`);
  process.exit(1);
}
console.log("\nall ok");

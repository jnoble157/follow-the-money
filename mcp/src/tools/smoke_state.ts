import { findStateFiler } from "./find_state_filer.ts";
import { topStateDonors } from "./top_state_donors.ts";
import { getStateContributions } from "./get_state_contributions.ts";
import { getStateExpenditures } from "./get_state_expenditures.ts";

// Smoke test the four new TEC tools against the freshly built parquet. Run
// with `npx tsx mcp/src/tools/smoke_state.ts` from the repo root.

async function main(): Promise<void> {
  console.log("--- find_state_filer (Paxton) ---");
  const f = await findStateFiler.run({ name: "Paxton", limit: 5 });
  for (const m of f.matches) {
    console.log(
      `  ${m.confidence.toFixed(2)}  ${m.contributionsCount.toString().padStart(6)}  $${m.totalRaised.toLocaleString("en-US").padStart(13)}  ${m.filerTypeCd?.padEnd(4) ?? "    "}  ${m.filerIdent.padEnd(12)}  ${m.filerName}`,
    );
  }

  if (f.matches.length === 0) {
    console.log("  no matches!");
    return;
  }

  const top = f.matches[0];
  console.log(`\n--- top_state_donors (${top.filerName}, 2022) ---`);
  const d = await topStateDonors.run({
    filerIdent: top.filerIdent,
    cycle: "2022",
    limit: 5,
  });
  for (const r of d.donors) {
    console.log(
      `  #${r.rank}  $${r.totalAmount.toLocaleString("en-US").padStart(11)}  ${r.donor.padEnd(36)}  ${r.donorEmployer ?? ""}`,
    );
  }

  // Regression guard for the natural-order name lookup. TEC stores
  // filerName as "LAST, FIRST [TITLE]"; this used to return zero rows
  // and produce "not in this view" on Watson PAC questions.
  console.log("\n--- find_state_filer (natural-order: 'Kirk Watson') ---");
  const w = await findStateFiler.run({ name: "Kirk Watson", limit: 3 });
  if (w.matches.length === 0) throw new Error("FAIL: Kirk Watson should resolve");
  for (const m of w.matches) {
    console.log(
      `  ${m.confidence.toFixed(2)}  ${m.contributionsCount.toString().padStart(6)}  $${m.totalRaised.toLocaleString("en-US").padStart(13)}  ${m.filerIdent}  ${m.filerName}`,
    );
  }

  // Regression guard for the filerActivity signal. Watson's TEC activity
  // ends in 2020 — a recent cycle returns zero donors, but the signal
  // should still tell the agent that the filer has lifetime data outside
  // the requested window. Without this signal the agent reads "no rows"
  // as "not in this view" and ends the run with an empty body.
  console.log("\n--- top_state_donors (Watson, 2024 cycle: empty + filerActivity) ---");
  const watsonEmpty = await topStateDonors.run({
    filerIdent: "00023391",
    cycle: "2024",
    limit: 5,
  });
  if (watsonEmpty.donors.length !== 0)
    throw new Error("FAIL: Watson 2024 cycle should be empty");
  if (!watsonEmpty.filerActivity)
    throw new Error("FAIL: filerActivity should be populated when donors empty");
  console.log(
    `  donors: ${watsonEmpty.donors.length}  filerActivity: first=${watsonEmpty.filerActivity.firstYear} last=${watsonEmpty.filerActivity.lastYear} n=${watsonEmpty.filerActivity.totalContributions}`,
  );

  // And the lifetime call that the agent SHOULD fall back to: returns
  // the actual top PAC donors, no filerActivity (because donors > 0).
  console.log("\n--- top_state_donors (Watson, lifetime, organization scope) ---");
  const watsonLifetime = await topStateDonors.run({
    filerIdent: "00023391",
    donorScope: "organization",
    limit: 5,
  });
  if (watsonLifetime.donors.length === 0)
    throw new Error("FAIL: Watson lifetime ENTITY donors should be non-empty");
  for (const r of watsonLifetime.donors) {
    console.log(
      `  #${r.rank}  $${r.totalAmount.toLocaleString("en-US").padStart(11)}  ${r.donor}`,
    );
  }

  console.log("\n--- find_state_filer (Talarico) ---");
  const t = await findStateFiler.run({ name: "Talarico", limit: 3 });
  for (const m of t.matches) {
    console.log(
      `  ${m.confidence.toFixed(2)}  ${m.contributionsCount.toString().padStart(6)}  $${m.totalRaised.toLocaleString("en-US").padStart(13)}  ${m.filerName}`,
    );
  }

  console.log("\n--- get_state_contributions (Talarico, 2024) ---");
  const c = await getStateContributions.run({
    filerName: "Talarico",
    dateFrom: "2024-01-01",
    dateTo: "2024-12-31",
    limit: 5,
    minAmount: 5000,
  });
  for (const r of c.rows) {
    console.log(
      `  $${r.amount.toLocaleString("en-US").padStart(10)}  ${r.contributor.padEnd(36)}  -> ${r.filerName}`,
    );
  }

  console.log("\n--- get_state_expenditures (Texans for Greg Abbott, 2022 max items) ---");
  const e = await getStateExpenditures.run({
    filerName: "Texans for Greg Abbott",
    dateFrom: "2022-01-01",
    dateTo: "2022-12-31",
    limit: 5,
  });
  for (const r of e.rows) {
    console.log(
      `  $${r.amount.toLocaleString("en-US").padStart(11)}  ${r.payee.padEnd(36)}  '${r.description ?? ""}'`,
    );
  }
}

void main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });

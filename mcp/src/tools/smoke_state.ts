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

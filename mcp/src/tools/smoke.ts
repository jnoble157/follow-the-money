import { TOOLS } from "./index.ts";

// Smoke test: call every tool with realistic args and print one line per
// result. Run with `npx tsx mcp/src/tools/smoke.ts` from the repo root.

async function main(): Promise<void> {
  console.log("--- find_filer ---");
  const f = await TOOLS[0].run({ name: "Watson, Kirk", jurisdiction: "austin", limit: 3 });
  for (const m of (f as { matches: Array<{ filerName: string; contributionsCount: number; totalRaised: number; confidence: number }> }).matches) {
    console.log(`  ${m.confidence.toFixed(2)}  ${m.contributionsCount.toString().padStart(5)}  $${m.totalRaised.toLocaleString("en-US")}  ${m.filerName}`);
  }

  console.log("\n--- top_donors (Watson, 2024) ---");
  const d = await TOOLS[1].run({ recipient: "Watson, Kirk", cycle: "2024", limit: 5 });
  for (const r of (d as { donors: Array<{ rank: number; donor: string; rolledEmployer: string | null; totalAmount: number }> }).donors) {
    console.log(`  #${r.rank}  $${r.totalAmount.toLocaleString("en-US").padStart(11)}  ${r.donor.padEnd(28)}  ${r.rolledEmployer ?? ""}`);
  }

  console.log("\n--- top_pacs (2018) ---");
  const p = await TOOLS[2].run({ year: 2018, limit: 5 });
  for (const r of (p as { recipients: Array<{ rank: number; recipient: string; totalRaised: number; uniqueDonors: number }> }).recipients) {
    console.log(`  #${r.rank}  $${r.totalRaised.toLocaleString("en-US").padStart(11)}  ${r.uniqueDonors.toString().padStart(5)} donors  ${r.recipient}`);
  }

  console.log("\n--- get_contributions (Epstein, 2018) ---");
  const c = await TOOLS[3].run({ donor: "Epstein, Robert", dateFrom: "2018-01-01", dateTo: "2018-12-31", limit: 5 });
  for (const r of (c as { rows: Array<{ amount: number; donor: string; recipient: string; employer: string | null; date: string | null }> }).rows) {
    console.log(`  $${r.amount.toLocaleString("en-US").padStart(11)}  ${r.donor} -> ${r.recipient}  emp=${r.employer ?? "-"}`);
  }

  console.log("\n--- get_expenditures (Watson, 2022 transfers) ---");
  const e = await TOOLS[4].run({ paidBy: "Watson, Kirk", dateFrom: "2022-01-01", dateTo: "2022-12-31", limit: 3 });
  for (const r of (e as { rows: Array<{ amount: number; paidBy: string; payee: string; description: string | null }> }).rows) {
    console.log(`  $${r.amount.toLocaleString("en-US").padStart(11)}  ${r.paidBy} -> ${r.payee}  '${r.description ?? ""}'`);
  }

  console.log("\n--- cluster_employer_variants (Endeavor) ---");
  const cl = await TOOLS[5].run({ stem: "Endeavor", recipient: "Watson, Kirk" });
  for (const c of (cl as { clusters: Array<{ canonical: string; mergedTotal: number; mergedCount: number; confidence: number; variants: Array<{ variant: string; totalAmount: number; contributionsCount: number }> }> }).clusters.slice(0, 3)) {
    console.log(`  cluster: ${c.canonical}  ($${c.mergedTotal.toLocaleString("en-US")} / ${c.mergedCount} contribs / conf ${c.confidence.toFixed(2)})`);
    for (const v of c.variants) {
      console.log(`     - ${v.variant.padEnd(30)}  $${v.totalAmount.toLocaleString("en-US")} / ${v.contributionsCount}`);
    }
  }

  console.log("\n--- cross_reference_lobby (2025) ---");
  const x = await TOOLS[6].run({ year: 2025, threshold: 0.85, limit: 8 });
  for (const m of (x as { matches: Array<{ name: string; confidence: number; austinEmployer: string | null; stateEmployer: string | null }> }).matches) {
    console.log(`  ${m.confidence.toFixed(2)}  ${m.name.padEnd(30)}  atx=${(m.austinEmployer ?? "").slice(0, 28).padEnd(28)}  tec=${m.stateEmployer ?? ""}`);
  }
}

void main().then(() => process.exit(0)).catch((err) => {
  console.error(err);
  process.exit(1);
});

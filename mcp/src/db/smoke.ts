import { query } from "./connect.ts";

// One-shot smoke test: every registered view returns a row count, and a
// representative query against the contributions view returns the expected
// shape. Run with `npm run smoke -w mcp`.

const VIEWS = [
  "austin_contributions",
  "austin_expenditures",
  "austin_transactions",
  "austin_lobby_registrants",
  "austin_lobby_clients",
  "tec_filers",
  "tec_contributions",
  "tec_cover_sheet1",
  "tec_expenditures",
  "tec_lobby_registrations",
  "tec_lobby_subject_matter",
];

async function main(): Promise<void> {
  for (const view of VIEWS) {
    const rows = await query<{ n: number }>(`SELECT COUNT(*)::INTEGER AS n FROM ${view}`);
    const n = rows[0]?.n ?? 0;
    console.log(`${view.padEnd(28)} ${n.toLocaleString()} rows`);
  }

  const sample = await query<{ donor: string; recipient: string; amount: number; tid: string }>(
    `
    SELECT Donor AS donor,
           Recipient AS recipient,
           CAST(Contribution_Amount AS DOUBLE) AS amount,
           TRANSACTION_ID AS tid
    FROM austin_contributions
    WHERE Donor ILIKE 'Epstein, Robert%' AND CAST(Contribution_Amount AS DOUBLE) > 100000
    ORDER BY amount DESC
    LIMIT 3
    `,
  );
  console.log("\nlargest Epstein contributions:");
  for (const r of sample) {
    console.log(`  ${r.tid}  $${r.amount.toLocaleString()}  ${r.donor} -> ${r.recipient}`);
  }
}

void main().then(() => process.exit(0)).catch((err) => {
  console.error(err);
  process.exit(1);
});

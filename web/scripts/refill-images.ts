// Wipes any v < CURRENT entries from images.json and re-runs the
// enrichment pipeline against every node in the network graph. Run this
// after bumping FILTER_VERSION or whenever the dev-server background
// fetch left a wave of incorrectly-null entries behind.
//
//   $ cd web && npx tsx scripts/refill-images.ts
import fs from "node:fs/promises";
import path from "node:path";
import { getNetworkRaw } from "../lib/network/build";
import { enrichNodes } from "../lib/network/images";

const CACHE_PATH = path.resolve(process.cwd(), "lib", "network", "images.json");

async function main() {
  // Wipe first so the bulk fetcher starts from a clean slate. Use the
  // *raw* network (no enrichment) so we don't fire two background-fetch
  // waves that race each other.
  await fs.writeFile(CACHE_PATH, "{}");
  const data = await getNetworkRaw();
  console.log(`enriching ${data.nodes.length} nodes …`);
  await enrichNodes(data.nodes);

  // Poll the on-disk cache until it reaches the expected size, then exit.
  const target = data.nodes.length;
  let last = 0;
  while (true) {
    await new Promise((r) => setTimeout(r, 4000));
    const raw = await fs.readFile(CACHE_PATH, "utf-8").catch(() => "{}");
    const c = JSON.parse(raw);
    const n = Object.keys(c).length;
    if (n !== last) {
      console.log(`progress: ${n}/${target}`);
      last = n;
    }
    if (n >= target) break;
  }

  // Final summary.
  const raw = await fs.readFile(CACHE_PATH, "utf-8");
  const c = JSON.parse(raw);
  const hits = Object.values(c).filter((e: any) => e.url).length;
  console.log(`done. ${hits}/${target} have images.`);
  process.exit(0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});

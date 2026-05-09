// Build a static snapshot of the network graph (with image enrichment baked
// in) and write it to web/lib/network/snapshot.json. Production runtimes
// without local parquet read this snapshot instead of querying DuckDB.
//
//   $ cd web && npx tsx scripts/bake-network.ts
import fs from "node:fs/promises";
import path from "node:path";
import { getNetworkRaw } from "../lib/network/build";
import { enrichNodes } from "../lib/network/images";

const SNAPSHOT_PATH = path.resolve(
  process.cwd(),
  "lib",
  "network",
  "snapshot.json",
);

async function main() {
  const data = await getNetworkRaw();
  console.log(`baking ${data.nodes.length} nodes / ${data.edges.length} edges …`);
  // Enrich nodes synchronously against the existing image cache. enrichNodes
  // returns whatever's already cached and schedules background fetches for
  // misses; we accept the in-memory result as-is for the snapshot.
  const nodes = await enrichNodes(data.nodes);
  const snapshot = { nodes, edges: data.edges };
  await fs.writeFile(SNAPSHOT_PATH, JSON.stringify(snapshot));
  const sizeKB = Math.round((await fs.stat(SNAPSHOT_PATH)).size / 1024);
  const withImages = nodes.filter((n) => n.image).length;
  console.log(
    `wrote snapshot.json (${sizeKB} KB) — ${withImages}/${nodes.length} nodes have images`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

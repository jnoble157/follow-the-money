// Populate slug→image-url for the officials + donors profile pages by reusing
// the network-graph image cascade (Wikipedia → Wikidata → Clearbit → SerpAPI).
// Output is web/lib/profiles/avatars.json, consumed by Avatar.tsx. Restartable:
// existing entries are kept so a re-run only fills in newly added profiles.
//
//   $ cd web && npx tsx scripts/fetch-profile-avatars.ts
//   $ cd web && npx tsx scripts/fetch-profile-avatars.ts --officials=all --donors=300
import fs from "node:fs/promises";
import path from "node:path";
import { lookupImage } from "../lib/network/images";

type OfficialEntry = { slug: string; name: string };
type DonorEntry = { slug: string; displayName: string; donorType: "individual" | "organization" };

const PROFILES_DIR = path.resolve(process.cwd(), "lib", "profiles");
const OUT = path.join(PROFILES_DIR, "avatars.json");
const OFFICIALS = path.join(PROFILES_DIR, "officials_manifest.json");
const DONORS = path.join(PROFILES_DIR, "donors_manifest.json");

// Defaults are tuned to cover the demo path (every profile a judge actually
// reaches) without burning the SerpAPI quota on the long tail. Pass
// --officials=all / --donors=all to fill everything.
const DEFAULTS = { officials: 300, donors: 200 };

function parseArgs(): { officials: number; donors: number } {
  const out = { ...DEFAULTS };
  for (const arg of process.argv.slice(2)) {
    const m = arg.match(/^--(officials|donors)=(\d+|all)$/);
    if (!m) continue;
    out[m[1] as "officials" | "donors"] = m[2] === "all" ? Infinity : Number(m[2]);
  }
  return out;
}

async function loadJson<T>(p: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await fs.readFile(p, "utf-8")) as T;
  } catch {
    return fallback;
  }
}

async function saveAvatars(map: Record<string, string>): Promise<void> {
  const sorted: Record<string, string> = {};
  for (const k of Object.keys(map).sort()) sorted[k] = map[k];
  await fs.writeFile(OUT, JSON.stringify(sorted, null, 2) + "\n");
}

async function main() {
  const { officials: officialLimit, donors: donorLimit } = parseArgs();
  const avatars = await loadJson<Record<string, string>>(OUT, {});
  const officials = await loadJson<OfficialEntry[]>(OFFICIALS, []);
  const donors = await loadJson<DonorEntry[]>(DONORS, []);

  type Job = { slug: string; name: string; kind: "politician" | "donor" };
  const jobs: Job[] = [
    ...officials.slice(0, officialLimit).map((o) => ({
      slug: o.slug,
      name: o.name,
      kind: "politician" as const,
    })),
    ...donors.slice(0, donorLimit).map((d) => ({
      slug: d.slug,
      name: d.displayName,
      kind: "donor" as const,
    })),
  ];

  const pending = jobs.filter((j) => !avatars[j.slug]);
  console.log(
    `${jobs.length} candidates, ${avatars[pending[0]?.slug] ? 0 : pending.length} need fetching ` +
      `(${jobs.length - pending.length} already cached)`,
  );
  if (pending.length === 0) return;

  let done = 0;
  let hits = 0;
  for (const job of pending) {
    try {
      const result = await lookupImage(job.name, job.kind);
      if (result.url) {
        avatars[job.slug] = result.url;
        hits++;
      }
    } catch (err) {
      console.error(`  ${job.slug}: ${(err as Error).message}`);
    }
    done++;
    if (done % 10 === 0) {
      await saveAvatars(avatars);
      console.log(`  progress ${done}/${pending.length} (${hits} hits)`);
    }
  }
  await saveAvatars(avatars);
  console.log(`done. ${hits}/${pending.length} new hits, ${Object.keys(avatars).length} total.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

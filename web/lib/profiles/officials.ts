import fs from "node:fs";
import path from "node:path";
import type { OfficialBio, OfficialDetail } from "./types";
import { applyOfficialOverride } from "./registry";
import details from "./official_details_manifest.json";

const OFFICIAL_DETAILS = details as OfficialDetail[];
const DETAILS_BY_SLUG = new Map(OFFICIAL_DETAILS.map((o) => [o.slug, o]));
const BIO_MANIFEST_PATHS = [
  path.join(process.cwd(), "web/lib/profiles/official_bios_manifest.json"),
  path.join(process.cwd(), "lib/profiles/official_bios_manifest.json"),
];
let bioManifest: {
  path: string | null;
  mtimeMs: number | null;
  rows: Map<string, OfficialBio>;
} = {
  path: null,
  mtimeMs: null,
  rows: new Map(),
};

export function getOfficialDetailBySlug(slug: string): OfficialDetail | null {
  const detail = DETAILS_BY_SLUG.get(slug);
  if (!detail) return null;
  const official = applyOfficialOverride(detail);
  const bio = readOfficialBios().get(official.slug);
  return bio ? { ...official, bio } : official;
}

function readOfficialBios(): Map<string, OfficialBio> {
  const manifestPath = BIO_MANIFEST_PATHS.find((candidate) => fs.existsSync(candidate));
  if (!manifestPath) {
    bioManifest = { path: null, mtimeMs: null, rows: new Map() };
    return bioManifest.rows;
  }

  const mtimeMs = fs.statSync(manifestPath).mtimeMs;
  if (bioManifest.path === manifestPath && bioManifest.mtimeMs === mtimeMs) {
    return bioManifest.rows;
  }

  const parsed = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as unknown;
  if (!Array.isArray(parsed)) return new Map();
  bioManifest = {
    path: manifestPath,
    mtimeMs,
    rows: new Map(parsed.filter(isOfficialBio).map((bio) => [bio.slug, bio])),
  };
  return bioManifest.rows;
}

function isOfficialBio(value: unknown): value is OfficialBio {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.slug === "string" &&
    typeof row.text === "string" &&
    typeof row.model === "string" &&
    (
      row.grounding === "manual" ||
      row.grounding === "model_knowledge" ||
      row.grounding === "web_search"
    ) &&
    typeof row.generatedAt === "string" &&
    Array.isArray(row.sources)
  );
}

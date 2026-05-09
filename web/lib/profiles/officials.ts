import type { OfficialDetail } from "./types";
import { applyOfficialOverride } from "./registry";
import details from "./official_details_manifest.json";

const OFFICIAL_DETAILS = details as OfficialDetail[];
const DETAILS_BY_SLUG = new Map(OFFICIAL_DETAILS.map((o) => [o.slug, o]));

export function getOfficialDetailBySlug(slug: string): OfficialDetail | null {
  const detail = DETAILS_BY_SLUG.get(slug);
  return detail ? applyOfficialOverride(detail) : null;
}

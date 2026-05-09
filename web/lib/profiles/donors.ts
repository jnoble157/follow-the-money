import type { DonorWithStats } from "./types";
import details from "./donor_details_manifest.json";

const DONOR_DETAILS = details as DonorWithStats[];
const DETAILS_BY_SLUG = new Map(DONOR_DETAILS.map((d) => [d.slug, d]));

export function getDonorDetailBySlug(slug: string): DonorWithStats | null {
  return DETAILS_BY_SLUG.get(slug) ?? null;
}

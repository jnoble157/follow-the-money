import { notFound } from "next/navigation";
import { OfficialProfile } from "@/components/OfficialProfile";
import { Profile } from "@/components/Profile";
import { getOfficialDetailBySlug } from "@/lib/profiles/officials";
import {
  getProfileBySlug,
  listAllProfileSlugs,
} from "@/lib/profiles/registry";

type Params = { slug: string };

export function generateStaticParams(): Params[] {
  return listAllProfileSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}) {
  const { slug } = await params;
  const profile = getProfileBySlug(slug);
  if (profile) {
    return {
      title: `${profile.name} · Texas Money Investigator`,
      description: profile.bio.text,
    };
  }
  const official = getOfficialDetailBySlug(slug);
  if (!official) return { title: "Profile not found · Texas Money Investigator" };
  return {
    title: `${official.name} · Texas Money Investigator`,
    description: `${official.role} campaign-finance aggregate.`,
  };
}

export default async function ProfilePage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { slug } = await params;
  const profile = getProfileBySlug(slug);
  const official = getOfficialDetailBySlug(slug);
  if (profile) return <Profile profile={profile} officialDetail={official} />;
  if (official) return <OfficialProfile official={official} />;
  return notFound();
}

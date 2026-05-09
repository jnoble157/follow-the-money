import { notFound } from "next/navigation";
import { Profile } from "@/components/Profile";
import { getProfileBySlug, listAllProfiles } from "@/lib/profiles/registry";

type Params = { slug: string };

export function generateStaticParams(): Params[] {
  return listAllProfiles().map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}) {
  const { slug } = await params;
  const profile = getProfileBySlug(slug);
  if (!profile) return { title: "Profile not found · Texas Money Investigator" };
  return {
    title: `${profile.name} · Texas Money Investigator`,
    description: profile.bio.text,
  };
}

export default async function ProfilePage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { slug } = await params;
  const profile = getProfileBySlug(slug);
  if (!profile) return notFound();
  return <Profile profile={profile} />;
}

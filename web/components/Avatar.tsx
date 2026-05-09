import type { ProfileKind } from "@/lib/profiles/types";
import avatarMap from "@/lib/profiles/avatars.json";

type Props = {
  name: string;
  kind: ProfileKind;
  size?: number;
  // Look up a real photo for this slug. Falls back to initials when missing.
  // Populated by scripts/fetch-profile-avatars.ts.
  slug?: string;
};

const KIND_TINT: Record<ProfileKind, string> = {
  official: "bg-evidence/10 text-evidence border-evidence/30",
  candidate: "bg-evidence/5 text-evidence border-evidence/20",
  lobbyist: "bg-page text-muted border-rule",
  firm: "bg-amber-50 text-amber-900 border-amber-200",
  pac: "bg-accent/10 text-accent border-accent/30",
};

const AVATARS = avatarMap as Record<string, string>;

export function Avatar({ name, kind, size = 56, slug }: Props) {
  const url = slug ? AVATARS[slug] : undefined;
  if (url) {
    return (
      <img
        src={url}
        alt=""
        aria-hidden
        loading="lazy"
        width={size}
        height={size}
        style={{ width: size, height: size }}
        className={`inline-block rounded-full border object-cover ${KIND_TINT[kind]}`}
      />
    );
  }

  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
  return (
    <span
      aria-hidden
      style={{ width: size, height: size, fontSize: size * 0.36 }}
      className={`inline-flex items-center justify-center rounded-full border font-serif font-medium ${KIND_TINT[kind]}`}
    >
      {initials || "·"}
    </span>
  );
}

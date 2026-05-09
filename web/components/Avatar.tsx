import type { ProfileKind } from "@/lib/profiles/types";

type Props = {
  name: string;
  kind: ProfileKind;
  size?: number;
};

const KIND_TINT: Record<ProfileKind, string> = {
  official: "bg-evidence/10 text-evidence border-evidence/30",
  candidate: "bg-evidence/5 text-evidence border-evidence/20",
  lobbyist: "bg-page text-muted border-rule",
  firm: "bg-amber-50 text-amber-900 border-amber-200",
  pac: "bg-accent/10 text-accent border-accent/30",
};

// Initials-in-a-circle stand-in until we have photo assets. The plan calls
// this out explicitly as a hackathon shortcut.
export function Avatar({ name, kind, size = 56 }: Props) {
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

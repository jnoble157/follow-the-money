import { ProfileRosterPage } from "@/components/ProfileRosterPage";
import { readProfileRoster } from "@/lib/profiles/rosterData";

export default function OfficialsPage() {
  const initial = readProfileRoster({
    kind: "officials",
    page: 1,
    perPage: 20,
    sortKey: "total",
    sortDir: "desc",
    query: "",
    jurisdiction: "all",
    donorType: "organization",
  });

  return (
    <main className="mx-auto flex w-full max-w-[1280px] flex-col gap-10 px-6 py-10">
      <h1 className="font-serif text-[44px] leading-tight text-ink">
        Public officials
      </h1>
      <ProfileRosterPage initial={initial} />
    </main>
  );
}

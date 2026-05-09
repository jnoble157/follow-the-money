import { NoFederalDataPanel } from "@/components/NoFederalDataPanel";
import { OfficialsList } from "@/components/OfficialsList";
import { SearchBar } from "@/components/SearchBar";
import { Trending } from "@/components/Trending";

export default function HomePage() {
  return (
    <main className="mx-auto flex w-full max-w-[1280px] flex-col gap-10 px-6 py-10">
      <section className="space-y-4">
        <h1 className="font-serif text-[44px] leading-tight text-ink">
          Follow the money in Texas state and Austin city politics.
        </h1>
        <p className="max-w-[820px] text-[16px] leading-relaxed text-muted">
          Every number cites the underlying TEC or City of Austin filing.
        </p>
        <div className="pt-2">
          <SearchBar variant="hero" autoFocus />
        </div>
      </section>

      <div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Trending />
        <div className="space-y-6">
          <OfficialsList />
          <NoFederalDataPanel />
        </div>
      </div>
    </main>
  );
}

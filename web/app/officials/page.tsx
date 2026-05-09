import { OfficialsList } from "@/components/OfficialsList";

export default function OfficialsPage() {
  return (
    <main className="mx-auto flex w-full max-w-[1280px] flex-col gap-10 px-6 py-10">
      <h1 className="font-serif text-[44px] leading-tight text-ink">
        Public officials
      </h1>
      <OfficialsList perPage={null} />
    </main>
  );
}

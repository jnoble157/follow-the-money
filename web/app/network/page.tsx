import { NetworkGraph } from "@/components/NetworkGraph";
import { getNetwork } from "@/lib/network/build";

// Server-rendered: we run the DuckDB query at request time and ship the
// shaped graph to the client component. The build module memoizes the result
// so subsequent renders are cheap.
export const dynamic = "force-static";

export default async function NetworkPage() {
  const data = await getNetwork();

  return (
    <main className="mx-auto flex w-full max-w-[1280px] flex-col gap-6 px-6 py-10">
      <div className="space-y-2">
        <h1 className="font-serif text-[44px] leading-tight text-ink">
          Money network
        </h1>
        <p className="max-w-[68ch] text-[14px] text-muted">
          Top entities across the Austin campaign-finance and lobby filings —
          politicians, donors, employers, lobbyists, and lobby clients — sized
          by the dollars flowing through them. Click a node to dim everything
          it isn&apos;t connected to.
        </p>
      </div>
      <NetworkGraph data={data} />
    </main>
  );
}

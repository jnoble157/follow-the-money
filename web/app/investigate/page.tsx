import { Suspense } from "react";
import { InvestigationConsole } from "@/components/InvestigationConsole";

type SearchParams = { q?: string | string[] };

function pickQuestion(params: SearchParams): string | undefined {
  const raw = params.q;
  if (Array.isArray(raw)) return raw[0];
  return raw;
}

export default async function InvestigatePage({
  searchParams,
}: {
  // Next 16: searchParams is a Promise on the server.
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const initialQuestion = pickQuestion(sp);

  return (
    <Suspense fallback={null}>
      <InvestigationConsole initialQuestion={initialQuestion} />
    </Suspense>
  );
}

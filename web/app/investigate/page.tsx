import { redirect } from "next/navigation";
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
  const initialQuestion = pickQuestion(sp)?.trim();

  // The investigate page exists to host a running or completed investigation.
  // Anyone who lands here without a question came from a stale link or
  // navigation; bounce them to the home page where the search and trending
  // tiles live. Server-side redirect → no flash of the empty state.
  if (!initialQuestion) {
    redirect("/");
  }

  return (
    <Suspense fallback={null}>
      <InvestigationConsole initialQuestion={initialQuestion} />
    </Suspense>
  );
}

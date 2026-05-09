"use client";

import { formatMoney } from "@/lib/formatMoney";
import type { RecipientRow } from "@/lib/investigations/types";
import { Footnote } from "./Footnote";

type Props = {
  recipients: RecipientRow[];
};

// Outflow counterpart to DonorTable. Same shape, opposite direction:
// instead of "who funded this filer," this ranks "where did this filer's
// money go." The agent emits topRecipients in complete_investigation when
// the question is outflow-shaped ("what is X funding," "where does X
// give"); the InvestigationConsole renders whichever of donors or
// recipients is non-empty.
export function RecipientTable({ recipients }: Props) {
  if (recipients.length === 0) return null;

  return (
    <div className="space-y-2 rounded-md border border-rule bg-white p-4">
      <h2 className="font-mono text-[11px] uppercase tracking-wider text-muted">
        Top recipients
      </h2>
      <div className="overflow-hidden rounded-md border border-rule bg-white">
        <table className="w-full text-[13px]">
          <thead className="border-b border-rule text-[11px] font-mono uppercase tracking-wider text-muted">
            <tr>
              <th className="px-3 py-2 text-left font-normal w-6">#</th>
              <th className="px-3 py-2 text-left font-normal">Recipient</th>
              <th className="px-3 py-2 text-right font-normal">Gifts</th>
              <th className="px-3 py-2 text-right font-normal">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-rule">
            {recipients.map((r) => (
              <tr key={r.rank}>
                <td className="px-3 py-2 font-mono text-muted">{r.rank}</td>
                <td className="px-3 py-2 text-ink">
                  {r.recipient}
                  <Footnote index={r.rank} citation={r.citation} />
                </td>
                <td className="px-3 py-2 text-right font-mono tnum text-ink">
                  {r.contributions}
                </td>
                <td className="px-3 py-2 text-right font-mono tnum text-ink">
                  {formatMoney(r.total)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

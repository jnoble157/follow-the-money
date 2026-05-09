"use client";

import { Fragment, useState } from "react";
import { formatMoney } from "@/lib/formatMoney";
import type { DonorRow } from "@/lib/investigations/types";
import { Footnote } from "./Footnote";

type Props = {
  donors: DonorRow[];
};

export function DonorTable({ donors }: Props) {
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  if (donors.length === 0) {
    return (
      <div className="space-y-2">
        <h2 className="font-mono text-[11px] uppercase tracking-wider text-muted">
          Top contributors
        </h2>
        <p className="text-[12px] text-muted">
          A ranked table appears here when the investigation completes.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <h2 className="font-mono text-[11px] uppercase tracking-wider text-muted">
        Top contributors
      </h2>
      <div className="overflow-hidden rounded-md border border-rule bg-white">
        <table className="w-full text-[13px]">
          <thead className="border-b border-rule text-[11px] font-mono uppercase tracking-wider text-muted">
            <tr>
              <th className="px-3 py-2 text-left font-normal w-6">#</th>
              <th className="px-3 py-2 text-left font-normal">Donor</th>
              <th className="px-3 py-2 text-left font-normal">Employer</th>
              <th className="px-3 py-2 text-right font-normal">Gifts</th>
              <th className="px-3 py-2 text-right font-normal">Total</th>
              <th className="px-3 py-2 text-right font-normal w-8" />
            </tr>
          </thead>
          <tbody className="divide-y divide-rule">
            {donors.map((d) => {
              const isOpen = expanded.has(d.rank);
              const hasVariants = !!d.variants && d.variants.length > 0;
              return (
                <Fragment key={d.rank}>
                  <tr>
                    <td className="px-3 py-2 font-mono text-muted">
                      {d.rank}
                    </td>
                    <td className="px-3 py-2 text-ink">
                      {d.donor}
                      <Footnote index={d.rank} citation={d.citation} />
                    </td>
                    <td className="px-3 py-2 text-ink">
                      {d.rolledEmployer ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-right font-mono tnum text-ink">
                      {d.contributions}
                    </td>
                    <td className="px-3 py-2 text-right font-mono tnum text-ink">
                      {formatMoney(d.total)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {hasVariants ? (
                        <button
                          type="button"
                          className="font-mono text-[10px] uppercase tracking-wider text-muted hover:text-accent"
                          onClick={() =>
                            setExpanded((prev) => {
                              const next = new Set(prev);
                              if (next.has(d.rank)) next.delete(d.rank);
                              else next.add(d.rank);
                              return next;
                            })
                          }
                          aria-label={isOpen ? "Hide variants" : "Show variants"}
                        >
                          {isOpen ? "−" : "+"}
                        </button>
                      ) : null}
                    </td>
                  </tr>
                  {hasVariants && isOpen ? (
                    <tr>
                      <td />
                      <td colSpan={5} className="px-3 pb-3 pt-0">
                        <div className="rounded-sm border border-rule bg-page p-2">
                          <p className="mb-1 font-mono text-[10px] uppercase tracking-wider text-muted">
                            Rolled-up employer variants
                          </p>
                          <ul className="space-y-0.5 text-[12px] text-ink">
                            {d.variants!.map((v) => (
                              <li key={v} className="font-mono">
                                {v}
                              </li>
                            ))}
                          </ul>
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

import Link from "next/link";
import type { Route } from "next";
import { formatMoney } from "@/lib/formatMoney";
import type { OfficialDonorLink } from "@/lib/profiles/types";
import { Footnote } from "./Footnote";

type Props = {
  donors: OfficialDonorLink[];
  startIndex?: number;
};

export function OfficialDonorLinks({ donors, startIndex = 40 }: Props) {
  if (donors.length === 0) return null;
  return (
    <section aria-labelledby="official-donors-heading">
      <h2
        id="official-donors-heading"
        className="mb-2 font-mono text-[11px] uppercase tracking-[0.2em] text-muted"
      >
        Top organization donors
      </h2>
      <div className="overflow-hidden rounded-md border border-rule bg-white">
        <table className="w-full text-[13px]">
          <thead className="border-b border-rule text-[11px] font-mono uppercase tracking-wider text-muted">
            <tr>
              <th className="w-8 px-3 py-2 text-left font-normal">#</th>
              <th className="px-3 py-2 text-left font-normal">Donor</th>
              <th className="w-24 px-3 py-2 text-right font-normal">
                Contributions
              </th>
              <th className="w-[28%] px-3 py-2 text-right font-normal">
                Total
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-rule">
            {donors.map((donor, i) => (
              <tr key={`${donor.displayName}-${i}`}>
                <td className="px-3 py-2 font-mono text-muted">{i + 1}</td>
                <td className="px-3 py-2 text-ink">
                  {donor.donorSlug ? (
                    <Link
                      href={`/donor/${donor.donorSlug}` as Route}
                      className="hover:underline decoration-accent decoration-1 underline-offset-4"
                    >
                      {donor.displayName}
                    </Link>
                  ) : (
                    donor.displayName
                  )}
                </td>
                <td className="px-3 py-2 text-right font-mono tnum text-ink">
                  {donor.contributionCount.toLocaleString()}
                </td>
                <td className="px-3 py-2 text-right font-mono tnum text-ink">
                  {formatMoney(donor.total, { cents: true })}
                  {donor.contributionCount === 1 ? (
                    <Footnote index={startIndex + i} citation={donor.source} />
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

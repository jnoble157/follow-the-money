"use client";

import Link from "next/link";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useState, useMemo } from "react";
import { formatMoney } from "@/lib/formatMoney";
import type { OfficialWithStats } from "@/lib/profiles/types";
import { getProfileBySlug, listOfficialsWithStats } from "@/lib/profiles/registry";
import { Avatar } from "./Avatar";

type SortKey = "name" | "donationCount" | "totalRaised" | "avgDonation" | "yearsActive";
type SortDir = "desc" | "asc";

const JURISDICTION_LABEL: Record<string, string> = {
  austin: "Austin",
  tx_state: "State",
  tx_federal: "Federal",
};

const HEADERS: { key: SortKey; label: string; align: "left" | "right" }[] = [
  { key: "name", label: "Name", align: "left" },
  { key: "donationCount", label: "Donations", align: "right" },
  { key: "totalRaised", label: "Total", align: "right" },
  { key: "avgDonation", label: "Avg", align: "right" },
  { key: "yearsActive", label: "Years", align: "right" },
];

function sortOfficials(
  rows: OfficialWithStats[],
  key: SortKey | null,
  dir: SortDir,
): OfficialWithStats[] {
  const sorted = [...rows];
  if (!key) {
    sorted.sort((a, b) =>
      b.totalRaised !== a.totalRaised
        ? b.totalRaised - a.totalRaised
        : a.name.localeCompare(b.name),
    );
    return sorted;
  }
  sorted.sort((a, b) => {
    if (key === "name") {
      const cmp = a.name.localeCompare(b.name);
      return dir === "asc" ? cmp : -cmp;
    }
    const diff = a[key] - b[key];
    if (diff !== 0) return dir === "asc" ? diff : -diff;
    if (b.totalRaised !== a.totalRaised) return b.totalRaised - a.totalRaised;
    return a.name.localeCompare(b.name);
  });
  return sorted;
}

type Props = {
  perPage?: number | null;
};

export function OfficialsList({ perPage = 8 }: Props) {
  const router = useRouter();
  const raw = listOfficialsWithStats();
  const [sortKey, setSortKey] = useState<SortKey | null>("totalRaised");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [page, setPage] = useState(1);
  const [tab, setTab] = useState<"officials" | "donors">("officials");

  const officials = useMemo(
    () => sortOfficials(raw, sortKey, sortDir),
    [raw, sortKey, sortDir],
  );

  const effectivePerPage = perPage ?? officials.length;
  const totalPages = Math.max(1, Math.ceil(officials.length / effectivePerPage));
  const paged = officials.slice((page - 1) * effectivePerPage, page * effectivePerPage);

  function handleHeaderClick(key: SortKey) {
    if (sortKey === key) {
      if (sortDir === "desc") {
        setSortDir("asc");
      } else {
        setSortKey(null);
        setSortDir("desc");
      }
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
    setPage(1);
  }

  if (officials.length === 0) {
    return (
      <section aria-labelledby="officials-heading" className="space-y-3">
        <h2
          id="officials-heading"
          className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted"
        >
          Public officials
        </h2>
        <p className="text-[12px] text-muted">
          No officials data available. Run the build script.
        </p>
      </section>
    );
  }

  return (
    <section aria-labelledby="officials-heading" className="space-y-3">
      <div className="flex items-baseline justify-between">
        <h2
          id="officials-heading"
          className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted"
        >
          {tab === "officials" ? "Public officials" : "Donors"}
        </h2>
        {tab === "officials" && (
          <Link
            href={"/officials" as Route}
            className="text-[11px] font-mono text-muted hover:text-ink transition-colors"
          >
            View all
          </Link>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setTab("officials")}
          className={
            tab === "officials"
              ? "rounded-sm border border-ink bg-ink px-3 py-1.5 text-[12px] font-mono text-white"
              : "rounded-sm border border-rule bg-white/70 px-3 py-1.5 text-[12px] font-mono text-ink hover:border-ink hover:bg-white"
          }
        >
          Officials
        </button>
        <button
          type="button"
          onClick={() => setTab("donors")}
          className={
            tab === "donors"
              ? "rounded-sm border border-ink bg-ink px-3 py-1.5 text-[12px] font-mono text-white"
              : "rounded-sm border border-rule bg-white/70 px-3 py-1.5 text-[12px] font-mono text-ink hover:border-ink hover:bg-white"
          }
        >
          Donors
        </button>
      </div>

      <div className="overflow-hidden rounded-md border border-rule bg-white">
        <table className="w-full text-[13px] table-fixed">
          <thead className="border-b border-rule text-[11px] font-mono uppercase tracking-wider text-muted">
            <tr>
              <th className="w-10 px-2 py-2 text-left font-normal" />
              {HEADERS.map((h) => {
                const active = sortKey === h.key;
                const arrow = active ? (sortDir === "desc" ? " ↓" : " ↑") : "";
                return (
                  <th
                    key={h.key}
                    className={`px-2 py-2 font-normal ${h.align === "right" ? "text-right" : "text-left"} ${h.key === "name" ? "w-[35%]" : h.key === "donationCount" ? "w-[16%]" : h.key === "totalRaised" ? "w-[16%]" : h.key === "avgDonation" ? "w-[14%]" : "w-[10%]"}`}
                  >
                    <button
                      type="button"
                      onClick={() => handleHeaderClick(h.key)}
                      className={`w-full ${h.align === "right" ? "text-right" : "text-left"} hover:text-ink`}
                    >
                      {h.label}
                      <span className="text-ink">{arrow}</span>
                    </button>
                  </th>
                );
              })}
              <th className="w-[12%] px-2 pr-4 py-2 text-right font-normal" />
            </tr>
          </thead>
          <tbody className="divide-y divide-rule">
            {paged.map((o) => {
              const hasProfile = getProfileBySlug(o.slug) !== null;
              return (
                <tr
                  key={o.slug}
                  className={`transition-colors ${hasProfile ? "hover:bg-page cursor-pointer" : "hover:bg-page"}`}
                  onClick={() => {
                    if (hasProfile) {
                      router.push(`/profile/${o.slug}` as Route);
                    }
                  }}
                >
                  <td className="px-2 py-2">
                    {hasProfile ? (
                      <Link
                        href={`/profile/${o.slug}` as Route}
                        className="inline-block"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Avatar name={o.name} kind="official" size={32} />
                      </Link>
                    ) : (
                      <Avatar name={o.name} kind="official" size={32} />
                    )}
                  </td>
                  <td className="px-2 py-2">
                    {hasProfile ? (
                      <Link
                        href={`/profile/${o.slug}` as Route}
                        className="group inline-block min-w-0"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="truncate text-[14px] text-ink group-hover:underline decoration-accent decoration-1 underline-offset-4">
                          {o.name}
                        </div>
                        <div className="mt-0.5 line-clamp-2 text-[12px] text-muted leading-tight">
                          {o.role}
                        </div>
                      </Link>
                    ) : (
                      <div className="inline-block min-w-0">
                        <div className="truncate text-[14px] text-ink">
                          {o.name}
                        </div>
                        <div className="mt-0.5 line-clamp-2 text-[12px] text-muted leading-tight">
                          {o.role}
                        </div>
                      </div>
                    )}
                  </td>
                  <td className="px-2 py-2 text-right font-mono tnum text-ink whitespace-nowrap">
                    {o.donationCount.toLocaleString()}
                  </td>
                  <td className="px-2 py-2 text-right font-mono tnum text-ink whitespace-nowrap">
                    {formatMoney(o.totalRaised, { compact: true })}
                  </td>
                  <td className="px-2 py-2 text-right font-mono tnum text-ink whitespace-nowrap">
                    {formatMoney(o.avgDonation, { cents: true })}
                  </td>
                  <td className="px-2 py-2 text-right font-mono tnum text-ink whitespace-nowrap">
                    {o.yearsActive}
                  </td>
                  <td className="px-2 pr-4 py-2 text-right whitespace-nowrap">
                    <span className="font-mono text-[10px] uppercase tracking-wider text-muted">
                      {JURISDICTION_LABEL[o.jurisdiction]}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-1">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="rounded-sm border border-rule bg-white px-3 py-1.5 text-[12px] font-mono text-ink hover:border-ink disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Previous
          </button>
          <span className="text-[12px] font-mono text-muted">
            Page {page} of {totalPages}
          </span>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="rounded-sm border border-rule bg-white px-3 py-1.5 text-[12px] font-mono text-ink hover:border-ink disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Next
          </button>
        </div>
      )}
    </section>
  );
}

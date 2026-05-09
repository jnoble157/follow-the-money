"use client";

import Link from "next/link";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { Fragment, useDeferredValue, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { formatMoney } from "@/lib/formatMoney";
import type {
  DonorSummary,
  Jurisdiction,
  OfficialWithStats,
} from "@/lib/profiles/types";
import {
  filterDonors,
  filterOfficials,
  sortDonors,
  sortOfficials,
  type DonorTypeFilter,
  type EntityTab,
  type JurisdictionFilter,
  type SortDir,
  type SortKey,
} from "@/lib/profiles/roster";
import {
  hasProfilePage,
  listDonorsWithStats,
  listOfficialsWithStats,
} from "@/lib/profiles/registry";
import { Avatar } from "./Avatar";
import { Footnote } from "./Footnote";
import { PartyBadge } from "./PartyBadge";

const JURISDICTION_LABEL: Record<Jurisdiction, string> = {
  austin: "Austin",
  tx_state: "State",
  tx_federal: "Federal",
};

const OFFICIAL_HEADERS: { key: SortKey; label: string; align: "left" | "right" }[] = [
  { key: "name", label: "Name", align: "left" },
  { key: "count", label: "Itemized", align: "right" },
  { key: "total", label: "Reported", align: "right" },
  { key: "avg", label: "Avg item", align: "right" },
  { key: "yearsActive", label: "Years", align: "right" },
];

const DONOR_HEADERS: { key: SortKey; label: string; align: "left" | "right" }[] = [
  { key: "name", label: "Name", align: "left" },
  { key: "count", label: "Contributions", align: "right" },
  { key: "total", label: "Total", align: "right" },
  { key: "avg", label: "Avg", align: "right" },
  { key: "yearsActive", label: "Years", align: "right" },
];

type Props = {
  perPage?: number | null;
  defaultTab?: EntityTab;
};

export function OfficialsList({
  perPage = 8,
  defaultTab = "officials",
}: Props) {
  const router = useRouter();
  const officialRows = useMemo(() => listOfficialsWithStats(), []);
  const donorRows = useMemo(() => listDonorsWithStats(), []);
  const [sortKey, setSortKey] = useState<SortKey | null>("total");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [page, setPage] = useState(1);
  const [tab, setTab] = useState<EntityTab>(defaultTab);
  const [jurisdiction, setJurisdiction] = useState<JurisdictionFilter>("all");
  const [donorType, setDonorType] = useState<DonorTypeFilter>("organization");
  const [officialQuery, setOfficialQuery] = useState("");
  const [donorQuery, setDonorQuery] = useState("");
  const [expandedOfficials, setExpandedOfficials] = useState<Set<string>>(new Set());
  const deferredOfficialQuery = useDeferredValue(officialQuery);
  const deferredDonorQuery = useDeferredValue(donorQuery);

  const officials = useMemo(() => {
    const filtered = filterOfficials(
      officialRows,
      jurisdiction,
      deferredOfficialQuery,
    );
    return sortOfficials(filtered, sortKey, sortDir);
  }, [officialRows, jurisdiction, deferredOfficialQuery, sortKey, sortDir]);

  const donors = useMemo(() => {
    const filtered = filterDonors(donorRows, donorType, deferredDonorQuery);
    return sortDonors(filtered, sortKey, sortDir);
  }, [donorRows, donorType, deferredDonorQuery, sortKey, sortDir]);

  const rowCount = tab === "officials" ? officials.length : donors.length;
  const effectivePerPage = perPage ?? Math.max(1, rowCount);
  const totalPages = Math.max(1, Math.ceil(rowCount / effectivePerPage));
  const start = (page - 1) * effectivePerPage;
  const pagedOfficials = officials.slice(start, start + effectivePerPage);
  const pagedDonors = donors.slice(start, start + effectivePerPage);
  const headers = tab === "officials" ? OFFICIAL_HEADERS : DONOR_HEADERS;

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

  function chooseTab(next: EntityTab) {
    setTab(next);
    setPage(1);
  }

  if (officialRows.length === 0 && donorRows.length === 0) {
    return (
      <section aria-labelledby="officials-heading" className="space-y-3">
        <h2
          id="officials-heading"
          className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted"
        >
          Public officials
        </h2>
        <p className="text-[12px] text-muted">
          No profile data available. Run the build script.
        </p>
      </section>
    );
  }

  return (
    <section aria-labelledby="officials-heading" className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-baseline sm:justify-between">
        <h2
          id="officials-heading"
          className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted"
        >
          {tab === "officials" ? "Public officials" : "Donors"}
        </h2>
        <div className="flex flex-wrap gap-2">
          <TabButton active={tab === "officials"} onClick={() => chooseTab("officials")}>
            Officials
          </TabButton>
          <TabButton active={tab === "donors"} onClick={() => chooseTab("donors")}>
            Donors
          </TabButton>
        </div>
      </div>

      {tab === "officials" ? (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-2">
            <TabButton
              active={jurisdiction === "all"}
              onClick={() => {
                setJurisdiction("all");
                setPage(1);
              }}
            >
              All
            </TabButton>
            <TabButton
              active={jurisdiction === "austin"}
              onClick={() => {
                setJurisdiction("austin");
                setPage(1);
              }}
            >
              Austin
            </TabButton>
            <TabButton
              active={jurisdiction === "tx_state"}
              onClick={() => {
                setJurisdiction("tx_state");
                setPage(1);
              }}
            >
              State
            </TabButton>
            <TabButton
              active={jurisdiction === "tx_federal"}
              onClick={() => {
                setJurisdiction("tx_federal");
                setPage(1);
              }}
            >
              Federal
            </TabButton>
          </div>
          <input
            value={officialQuery}
            onChange={(e) => {
              setOfficialQuery(e.target.value);
              setPage(1);
            }}
            placeholder="Search official name"
            className="h-9 w-full rounded-sm border border-rule bg-white px-3 text-[13px] text-ink outline-none focus:border-ink sm:w-[280px]"
          />
        </div>
      ) : (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-2">
            <TabButton
              active={donorType === "all"}
              onClick={() => {
                setDonorType("all");
                setPage(1);
              }}
            >
              All
            </TabButton>
            <TabButton
              active={donorType === "individual"}
              onClick={() => {
                setDonorType("individual");
                setPage(1);
              }}
            >
              Individual
            </TabButton>
            <TabButton
              active={donorType === "organization"}
              onClick={() => {
                setDonorType("organization");
                setPage(1);
              }}
            >
              Organization
            </TabButton>
          </div>
          <input
            value={donorQuery}
            onChange={(e) => {
              setDonorQuery(e.target.value);
              setPage(1);
            }}
            placeholder="Search donor or employer"
            className="h-9 w-full rounded-sm border border-rule bg-white px-3 text-[13px] text-ink outline-none focus:border-ink sm:w-[280px]"
          />
        </div>
      )}

      <div className="overflow-hidden rounded-md border border-rule bg-white">
        <table className="w-full table-fixed text-[13px]">
          <thead className="border-b border-rule text-[11px] font-mono uppercase tracking-wider text-muted">
            <tr>
              <th className="w-10 px-2 py-2 text-left font-normal" />
              {headers.map((h) => {
                const active = sortKey === h.key;
                const arrow = active ? (sortDir === "desc" ? " ↓" : " ↑") : "";
                return (
                  <th
                    key={h.key}
                    className={`px-2 py-2 font-normal ${h.align === "right" ? "text-right" : "text-left"} ${h.key === "name" ? "w-[35%]" : h.key === "count" ? "w-[16%]" : h.key === "total" ? "w-[16%]" : h.key === "avg" ? "w-[14%]" : "w-[10%]"}`}
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
              <th className="w-[12%] px-2 py-2 pr-4 text-right font-normal" />
            </tr>
          </thead>
          <tbody className="divide-y divide-rule">
            {tab === "officials" ? (
              pagedOfficials.length > 0 ? (
                pagedOfficials.map((o, i) => (
                  <OfficialRow
                    key={o.slug}
                    official={o}
                    sourceIndex={start + i + 1}
                    expanded={expandedOfficials.has(o.slug)}
                    onToggle={() =>
                      setExpandedOfficials((prev) => {
                        const next = new Set(prev);
                        if (next.has(o.slug)) next.delete(o.slug);
                        else next.add(o.slug);
                        return next;
                      })
                    }
                    router={router}
                  />
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-[13px] text-muted">
                    No public officials match the current filters.
                  </td>
                </tr>
              )
            ) : pagedDonors.length > 0 ? (
              pagedDonors.map((d, i) => (
                <DonorRow
                  key={d.slug}
                  donor={d}
                  sourceIndex={start + i + 1}
                  router={router}
                />
              ))
            ) : (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-[13px] text-muted">
                  No donors match the current filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-1">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="rounded-sm border border-rule bg-white px-3 py-1.5 text-[12px] font-mono text-ink hover:border-ink disabled:cursor-not-allowed disabled:opacity-40"
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
            className="rounded-sm border border-rule bg-white px-3 py-1.5 text-[12px] font-mono text-ink hover:border-ink disabled:cursor-not-allowed disabled:opacity-40"
          >
            Next
          </button>
        </div>
      )}
    </section>
  );
}

function OfficialRow({
  official,
  sourceIndex,
  expanded,
  onToggle,
  router,
}: {
  official: OfficialWithStats;
  sourceIndex: number;
  expanded: boolean;
  onToggle: () => void;
  router: ReturnType<typeof useRouter>;
}) {
  const hasProfile = hasProfilePage(official.slug);
  const hasDonors = official.topOrganizationDonors.length > 0;
  return (
    <Fragment>
      <tr
        className={`transition-colors ${hasProfile ? "cursor-pointer hover:bg-page" : "hover:bg-page"}`}
        onClick={() => {
          if (hasProfile) {
            router.push(`/profile/${official.slug}` as Route);
          }
        }}
      >
        <td className="px-2 py-2">
          {hasProfile ? (
            <Link
              href={`/profile/${official.slug}` as Route}
              className="inline-block"
              onClick={(e) => e.stopPropagation()}
            >
              <Avatar name={official.name} kind="official" size={32} slug={official.slug} />
            </Link>
          ) : (
            <Avatar name={official.name} kind="official" size={32} slug={official.slug} />
          )}
        </td>
        <td className="px-2 py-2">
          {hasProfile ? (
            <Link
              href={`/profile/${official.slug}` as Route}
              className="group inline-block min-w-0"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex min-w-0 items-center gap-1.5">
                <div className="truncate text-[14px] text-ink group-hover:underline decoration-accent decoration-1 underline-offset-4">
                  {official.name}
                </div>
                {official.partyAffiliation ? (
                  <PartyBadge party={official.partyAffiliation} compact />
                ) : null}
              </div>
              <div className="mt-0.5 line-clamp-2 text-[12px] text-muted leading-tight">
                {official.role}
              </div>
            </Link>
          ) : (
            <div className="inline-block min-w-0">
              <div className="flex min-w-0 items-center gap-1.5">
                <div className="truncate text-[14px] text-ink">{official.name}</div>
                {official.partyAffiliation ? (
                  <PartyBadge party={official.partyAffiliation} compact />
                ) : null}
              </div>
              <div className="mt-0.5 line-clamp-2 text-[12px] text-muted leading-tight">
                {official.role}
              </div>
            </div>
          )}
        </td>
        <td className="px-2 py-2 text-right font-mono tnum text-ink whitespace-nowrap">
          {official.donationCount.toLocaleString()}
        </td>
        <td className="px-2 py-2 text-right font-mono tnum text-ink whitespace-nowrap">
          {formatMoney(official.totalRaised, { compact: true })}
          <Footnote index={sourceIndex} citation={official.source} />
        </td>
        <td className="px-2 py-2 text-right font-mono tnum text-ink whitespace-nowrap">
          {formatMoney(official.avgDonation, { cents: true })}
        </td>
        <td className="px-2 py-2 text-right font-mono tnum text-ink whitespace-nowrap">
          {official.yearsActive}
        </td>
        <td className="px-2 py-2 pr-4 text-right whitespace-nowrap">
          <div className="flex items-center justify-end gap-2">
            <span className="font-mono text-[10px] uppercase tracking-wider text-muted">
              {JURISDICTION_LABEL[official.jurisdiction]}
            </span>
            {hasDonors ? (
              <button
                type="button"
                className="font-mono text-[12px] text-muted hover:text-accent"
                aria-label={expanded ? "Hide donors" : "Show donors"}
                onClick={(e) => {
                  e.stopPropagation();
                  onToggle();
                }}
              >
                {expanded ? "-" : "+"}
              </button>
            ) : null}
          </div>
        </td>
      </tr>
      {expanded && hasDonors ? (
        <tr>
          <td />
          <td colSpan={6} className="px-2 pb-3 pt-0">
            <div className="rounded-sm border border-rule bg-page p-3">
              <p className="mb-2 font-mono text-[10px] uppercase tracking-wider text-muted">
                Top organization donors
              </p>
              <div className="grid gap-2 sm:grid-cols-3">
                {official.topOrganizationDonors.map((donor, i) => (
                  <div key={`${donor.displayName}-${i}`} className="min-w-0">
                    {donor.donorSlug ? (
                      <Link
                        href={`/donor/${donor.donorSlug}` as Route}
                        className="block truncate text-[13px] text-ink hover:underline decoration-accent decoration-1 underline-offset-4"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {donor.displayName}
                      </Link>
                    ) : (
                      <div className="truncate text-[13px] text-ink">
                        {donor.displayName}
                      </div>
                    )}
                    <div className="font-mono text-[11px] tnum text-muted">
                      {formatMoney(donor.total, { compact: true })}
                      <Footnote index={sourceIndex + i + 1000} citation={donor.source} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </td>
        </tr>
      ) : null}
    </Fragment>
  );
}

function DonorRow({
  donor,
  sourceIndex,
  router,
}: {
  donor: DonorSummary;
  sourceIndex: number;
  router: ReturnType<typeof useRouter>;
}) {
  const detailHref = `/donor/${donor.slug}` as Route;
  const subline =
    donor.primaryEmployer ??
    [donor.primaryCity, donor.primaryZip].filter(Boolean).join(", ");
  return (
    <tr
      className="cursor-pointer transition-colors hover:bg-page"
      onClick={() => {
        router.push(detailHref);
      }}
    >
      <td className="px-2 py-2">
        <Link
          href={detailHref}
          className="inline-block"
          onClick={(e) => e.stopPropagation()}
        >
          <Avatar
            name={donor.displayName}
            kind={donor.donorType === "organization" ? "firm" : "lobbyist"}
            size={32}
            slug={donor.slug}
          />
        </Link>
      </td>
      <td className="px-2 py-2">
        <div className="min-w-0">
          <div className="flex min-w-0 items-baseline gap-1">
            <Link
              href={detailHref}
              className="group min-w-0"
              onClick={(e) => e.stopPropagation()}
            >
              <span className="block truncate text-[14px] text-ink group-hover:underline decoration-accent decoration-1 underline-offset-4">
                {donor.displayName}
              </span>
            </Link>
            <Footnote index={sourceIndex} citation={donor.source} />
          </div>
          <div className="mt-0.5 line-clamp-2 text-[12px] text-muted leading-tight">
            {subline || donor.primaryZip}
          </div>
        </div>
      </td>
      <td className="px-2 py-2 text-right font-mono tnum text-ink whitespace-nowrap">
        {donor.contributionCount.toLocaleString()}
      </td>
      <td className="px-2 py-2 text-right font-mono tnum text-ink whitespace-nowrap">
        {formatMoney(donor.totalGiven, { compact: true })}
      </td>
      <td className="px-2 py-2 text-right font-mono tnum text-ink whitespace-nowrap">
        {formatMoney(donor.avgContribution, { cents: true })}
      </td>
      <td className="px-2 py-2 text-right font-mono tnum text-ink whitespace-nowrap">
        {donor.yearsActive}
      </td>
      <td className="px-2 py-2 pr-4 text-right whitespace-nowrap">
        <span className="font-mono text-[10px] uppercase tracking-wider text-muted">
          {donor.donorType === "organization" ? "Org" : "Individual"}
        </span>
      </td>
    </tr>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        active
          ? "rounded-sm border border-ink bg-ink px-3 py-1.5 text-[12px] font-mono text-white"
          : "rounded-sm border border-rule bg-white/70 px-3 py-1.5 text-[12px] font-mono text-ink hover:border-ink hover:bg-white"
      }
    >
      {children}
    </button>
  );
}

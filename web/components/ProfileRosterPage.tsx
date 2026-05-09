"use client";

import Link from "next/link";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import {
  Fragment,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import { formatMoney } from "@/lib/formatMoney";
import type {
  DonorSummary,
  Jurisdiction,
  OfficialWithStats,
} from "@/lib/profiles/types";
import type {
  DonorTypeFilter,
  EntityTab,
  JurisdictionFilter,
  ProfileRosterResult,
  SortDir,
  SortKey,
} from "@/lib/profiles/roster";
import { Avatar } from "./Avatar";
import { Footnote } from "./Footnote";

const JURISDICTION_LABEL: Record<Jurisdiction, string> = {
  austin: "Austin",
  tx_state: "State",
  tx_federal: "Federal",
};

const OFFICIAL_HEADERS: { key: SortKey; label: string; align: "left" | "right" }[] = [
  { key: "name", label: "Name", align: "left" },
  { key: "count", label: "Donations", align: "right" },
  { key: "total", label: "Total", align: "right" },
  { key: "avg", label: "Avg", align: "right" },
  { key: "yearsActive", label: "Years", align: "right" },
];

const DONOR_HEADERS: { key: SortKey; label: string; align: "left" | "right" }[] = [
  { key: "name", label: "Name", align: "left" },
  { key: "count", label: "Contributions", align: "right" },
  { key: "total", label: "Total", align: "right" },
  { key: "avg", label: "Avg", align: "right" },
  { key: "yearsActive", label: "Years", align: "right" },
];

type RosterArgs = {
  kind: EntityTab;
  page: number;
  perPage: number;
  sortKey: SortKey | null;
  sortDir: SortDir;
  query: string;
  jurisdiction: JurisdictionFilter;
  donorType: DonorTypeFilter;
};

type Props = {
  initial: ProfileRosterResult;
};

export function ProfileRosterPage({ initial }: Props) {
  const [sortKey, setSortKey] = useState<SortKey | null>("total");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [page, setPage] = useState(initial.page);
  const [jurisdiction, setJurisdiction] = useState<JurisdictionFilter>("all");
  const [donorType, setDonorType] = useState<DonorTypeFilter>("organization");
  const [officialQuery, setOfficialQuery] = useState("");
  const [donorQuery, setDonorQuery] = useState("");
  const [expandedOfficials, setExpandedOfficials] = useState<Set<string>>(new Set());
  const [data, setData] = useState<ProfileRosterResult>(initial);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const deferredOfficialQuery = useDeferredValue(officialQuery);
  const deferredDonorQuery = useDeferredValue(donorQuery);
  const cache = useRef(
    new Map<string, ProfileRosterResult>([
      [
        cacheKey({
          kind: initial.kind,
          page: initial.page,
          perPage: initial.perPage,
          sortKey: "total",
          sortDir: "desc",
          query: "",
          jurisdiction: "all",
          donorType: "organization",
        }),
        initial,
      ],
    ]),
  );

  const args = useMemo<RosterArgs>(
    () => ({
      kind: initial.kind,
      page,
      perPage: initial.perPage,
      sortKey,
      sortDir,
      query: initial.kind === "officials" ? deferredOfficialQuery : deferredDonorQuery,
      jurisdiction,
      donorType,
    }),
    [
      initial.kind,
      initial.perPage,
      page,
      sortKey,
      sortDir,
      deferredOfficialQuery,
      deferredDonorQuery,
      jurisdiction,
      donorType,
    ],
  );

  useEffect(() => {
    const key = cacheKey(args);
    const cached = cache.current.get(key);
    if (cached) {
      setData(cached);
      setError(null);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    setError(null);

    fetch(`/api/profile-roster?${queryString(args)}`, {
      signal: controller.signal,
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(`Roster request failed: ${res.status}`);
        return (await res.json()) as ProfileRosterResult;
      })
      .then((next) => {
        cache.current.set(key, next);
        setData(next);
        if (next.page !== page) setPage(next.page);
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [args, page]);

  const headers = data.kind === "officials" ? OFFICIAL_HEADERS : DONOR_HEADERS;

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

  return (
    <section
      aria-labelledby="profile-roster-heading"
      aria-busy={loading}
      className="space-y-3"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-baseline sm:justify-between">
        <h2
          id="profile-roster-heading"
          className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted"
        >
          {data.kind === "officials" ? "Public officials" : "Donors"}
        </h2>
        {loading ? (
          <span className="font-mono text-[11px] uppercase tracking-wider text-muted">
            Loading
          </span>
        ) : null}
      </div>

      {data.kind === "officials" ? (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-2">
            <Pill
              active={jurisdiction === "all"}
              onClick={() => {
                setJurisdiction("all");
                setPage(1);
              }}
            >
              All
            </Pill>
            <Pill
              active={jurisdiction === "austin"}
              onClick={() => {
                setJurisdiction("austin");
                setPage(1);
              }}
            >
              Austin
            </Pill>
            <Pill
              active={jurisdiction === "tx_state"}
              onClick={() => {
                setJurisdiction("tx_state");
                setPage(1);
              }}
            >
              State
            </Pill>
            <Pill
              active={jurisdiction === "tx_federal"}
              onClick={() => {
                setJurisdiction("tx_federal");
                setPage(1);
              }}
            >
              Federal
            </Pill>
          </div>
          <input
            value={officialQuery}
            onChange={(e) => {
              setOfficialQuery(e.target.value);
              setPage(1);
            }}
            placeholder="Search official name"
            className="h-11 w-full rounded-sm border border-rule bg-white px-4 text-[15px] text-ink outline-none focus:border-ink sm:w-[520px]"
          />
        </div>
      ) : (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-2">
            <Pill
              active={donorType === "all"}
              onClick={() => {
                setDonorType("all");
                setPage(1);
              }}
            >
              All
            </Pill>
            <Pill
              active={donorType === "individual"}
              onClick={() => {
                setDonorType("individual");
                setPage(1);
              }}
            >
              Individual
            </Pill>
            <Pill
              active={donorType === "organization"}
              onClick={() => {
                setDonorType("organization");
                setPage(1);
              }}
            >
              Organization
            </Pill>
          </div>
          <input
            value={donorQuery}
            onChange={(e) => {
              setDonorQuery(e.target.value);
              setPage(1);
            }}
            placeholder="Search donor or employer"
            className="h-11 w-full rounded-sm border border-rule bg-white px-4 text-[15px] text-ink outline-none focus:border-ink sm:w-[520px]"
          />
        </div>
      )}

      {error ? (
        <p className="rounded-sm border border-rule bg-white px-3 py-2 text-[13px] text-muted">
          {error}
        </p>
      ) : null}

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
            {data.kind === "officials" ? (
              data.rows.length > 0 ? (
                data.rows.map((o, i) => (
                  <OfficialRosterRow
                    key={o.slug}
                    official={o}
                    sourceIndex={data.start + i + 1}
                    expanded={expandedOfficials.has(o.slug)}
                    onToggle={() =>
                      setExpandedOfficials((prev) => {
                        const next = new Set(prev);
                        if (next.has(o.slug)) next.delete(o.slug);
                        else next.add(o.slug);
                        return next;
                      })
                    }
                  />
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-[13px] text-muted">
                    No public officials match the current filters.
                  </td>
                </tr>
              )
            ) : data.rows.length > 0 ? (
              data.rows.map((d, i) => (
                <DonorRosterRow
                  key={d.slug}
                  donor={d}
                  sourceIndex={data.start + i + 1}
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

      <RosterPagination data={data} loading={loading} onPage={setPage} />
    </section>
  );
}

function RosterPagination({
  data,
  loading,
  onPage,
}: {
  data: ProfileRosterResult;
  loading: boolean;
  onPage: (page: number) => void;
}) {
  const firstRow = data.rowCount === 0 ? 0 : data.start + 1;
  const lastRow = Math.min(data.start + data.rows.length, data.rowCount);
  const pages = paginationWindow(data.page, data.totalPages);

  return (
    <div className="flex flex-col gap-3 pt-1 sm:flex-row sm:items-center sm:justify-between">
      <div className="font-mono text-[12px] text-muted">
        Showing {firstRow.toLocaleString()}-{lastRow.toLocaleString()} of{" "}
        {data.rowCount.toLocaleString()}
      </div>
      {data.totalPages > 1 ? (
        <nav
          aria-label="Pagination"
          className="flex flex-wrap items-center gap-1.5"
        >
          <PageStep
            label="First"
            disabled={data.page === 1 || loading}
            onClick={() => onPage(1)}
          />
          <PageStep
            label="Prev"
            disabled={data.page === 1 || loading}
            onClick={() => onPage(Math.max(1, data.page - 1))}
          />
          <div className="flex flex-wrap items-center gap-1">
            {pages.map((p, i) =>
              p === "gap" ? (
                <span
                  key={`gap-${i}`}
                  className="flex h-9 min-w-8 items-center justify-center px-1 font-mono text-[12px] text-muted"
                >
                  ...
                </span>
              ) : (
                <PageNumber
                  key={p}
                  page={p}
                  active={p === data.page}
                  disabled={loading}
                  onClick={() => onPage(p)}
                />
              ),
            )}
          </div>
          <PageStep
            label="Next"
            disabled={data.page === data.totalPages || loading}
            onClick={() => onPage(Math.min(data.totalPages, data.page + 1))}
          />
          <PageStep
            label="Last"
            disabled={data.page === data.totalPages || loading}
            onClick={() => onPage(data.totalPages)}
          />
        </nav>
      ) : null}
    </div>
  );
}

function PageStep({
  label,
  disabled,
  onClick,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="h-9 rounded-sm border border-rule bg-white px-3 text-[12px] font-mono text-ink hover:border-ink disabled:cursor-not-allowed disabled:opacity-40"
    >
      {label}
    </button>
  );
}

function PageNumber({
  page,
  active,
  disabled,
  onClick,
}: {
  page: number;
  active: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={active || disabled}
      aria-current={active ? "page" : undefined}
      className={
        active
          ? "h-9 min-w-9 rounded-sm border border-ink bg-ink px-2 text-[12px] font-mono text-white"
          : "h-9 min-w-9 rounded-sm border border-rule bg-white px-2 text-[12px] font-mono text-ink hover:border-ink disabled:cursor-not-allowed disabled:opacity-40"
      }
    >
      {page}
    </button>
  );
}

function paginationWindow(
  page: number,
  totalPages: number,
): Array<number | "gap"> {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }

  const pages = new Set<number>([1, totalPages, page - 1, page, page + 1]);
  if (page <= 4) {
    for (let i = 2; i <= 5; i += 1) pages.add(i);
  }
  if (page >= totalPages - 3) {
    for (let i = totalPages - 4; i < totalPages; i += 1) pages.add(i);
  }

  const sorted = [...pages]
    .filter((p) => p >= 1 && p <= totalPages)
    .sort((a, b) => a - b);
  const out: Array<number | "gap"> = [];
  for (const p of sorted) {
    const prev = out[out.length - 1];
    if (typeof prev === "number" && p - prev > 1) out.push("gap");
    out.push(p);
  }
  return out;
}

function OfficialRosterRow({
  official,
  sourceIndex,
  expanded,
  onToggle,
}: {
  official: OfficialWithStats;
  sourceIndex: number;
  expanded: boolean;
  onToggle: () => void;
}) {
  const router = useRouter();
  const detailHref = `/profile/${official.slug}` as Route;
  const hasDonors = official.topOrganizationDonors.length > 0;
  return (
    <Fragment>
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
            <Avatar name={official.name} kind="official" size={32} />
          </Link>
        </td>
        <td className="px-2 py-2">
          <Link
            href={detailHref}
            className="group inline-block min-w-0"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="truncate text-[14px] text-ink group-hover:underline decoration-accent decoration-1 underline-offset-4">
              {official.name}
            </div>
            <div className="mt-0.5 line-clamp-2 text-[12px] text-muted leading-tight">
              {official.role}
            </div>
          </Link>
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

function DonorRosterRow({
  donor,
  sourceIndex,
}: {
  donor: DonorSummary;
  sourceIndex: number;
}) {
  const router = useRouter();
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

function Pill({
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

function queryString(args: RosterArgs): string {
  const params = new URLSearchParams({
    kind: args.kind,
    page: String(args.page),
    perPage: String(args.perPage),
    sortKey: args.sortKey ?? "none",
    sortDir: args.sortDir,
    query: args.query,
    jurisdiction: args.jurisdiction,
    donorType: args.donorType,
  });
  return params.toString();
}

function cacheKey(args: RosterArgs): string {
  return queryString(args);
}

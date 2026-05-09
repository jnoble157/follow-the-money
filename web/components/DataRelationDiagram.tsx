"use client";

import { useMemo, useState } from "react";

type GroupId = "tec-cf" | "tec-lobby" | "atx-cf" | "atx-lobby";
type NodeId =
  | "tec-filers"
  | "tec-contribs"
  | "tec-expend"
  | "tec-cover"
  | "tec-lobby-reg"
  | "tec-lobby-group"
  | "tec-lobby-subj"
  | "tec-lobby-funds"
  | "atx-contribs"
  | "atx-expend"
  | "atx-trans"
  | "atx-lobby-reg"
  | "atx-lobby-clients"
  | "atx-lobby-reports"
  | "atx-lobby-muni";

type Side = "top" | "right" | "bottom" | "left";
type Active =
  | { kind: "node"; id: NodeId }
  | { kind: "link"; id: string }
  | null;

type GroupBox = {
  id: GroupId;
  label: string;
  namespace: string;
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
};

type TableNode = {
  id: NodeId;
  label: string;
  group: GroupId;
  x: number;
  y: number;
  w?: number;
};

type TableLink = {
  id: string;
  from: NodeId;
  to: NodeId;
  fromSide: Side;
  toSide: Side;
  label: string;
  kind: "hard" | "candidate";
  bend?: number;
  labelX?: number;
  labelY?: number;
};

const SVG_W = 1080;
const SVG_H = 500;
const NODE_W = 160;
const NODE_H = 30;
const NODE_RX = 4;

// Palette pulled from the design tokens (tailwind.config.ts):
//   evidence #1F3A5F · accent #8B1A1A · accentMuted #C28A8A
// State sources are blue tones; City sources are warm tones.
const COLOR_STATE_CF = "#1F3A5F"; // evidence
const COLOR_STATE_LOBBY = "#5C7CA1"; // paler evidence
const COLOR_CITY_CF = "#8B1A1A"; // accent
const COLOR_CITY_LOBBY = "#B5612C"; // warm muted

const GROUPS: Record<GroupId, GroupBox> = {
  "tec-cf": {
    id: "tec-cf",
    label: "TEC · campaign finance",
    namespace: "filerIdent · reportInfoIdent",
    x: 62,
    y: 60,
    w: 426,
    h: 200,
    color: COLOR_STATE_CF,
  },
  "atx-cf": {
    id: "atx-cf",
    label: "Austin · campaign finance",
    namespace: "TRANSACTION_ID",
    x: 592,
    y: 60,
    w: 426,
    h: 200,
    color: COLOR_CITY_CF,
  },
  "tec-lobby": {
    id: "tec-lobby",
    label: "TEC · lobby",
    namespace: "FilerID · ClientName",
    x: 62,
    y: 296,
    w: 426,
    h: 168,
    color: COLOR_STATE_LOBBY,
  },
  "atx-lobby": {
    id: "atx-lobby",
    label: "Austin · lobby",
    namespace: "REGISTRANT_ID · REPORT_ID",
    x: 592,
    y: 296,
    w: 426,
    h: 168,
    color: COLOR_CITY_LOBBY,
  },
};

const NODES: TableNode[] = [
  { id: "tec-filers", label: "filers.csv", group: "tec-cf", x: 196, y: 122 },
  { id: "tec-contribs", label: "contribs", group: "tec-cf", x: 110, y: 178, w: 148 },
  { id: "tec-expend", label: "expend", group: "tec-cf", x: 294, y: 178, w: 148 },
  { id: "tec-cover", label: "cover", group: "tec-cf", x: 196, y: 222 },

  { id: "atx-contribs", label: "contributions", group: "atx-cf", x: 632, y: 122 },
  { id: "atx-expend", label: "expenditures", group: "atx-cf", x: 632, y: 202 },
  {
    id: "atx-trans",
    label: "transaction_detail",
    group: "atx-cf",
    x: 830,
    y: 162,
    w: 170,
  },

  {
    id: "tec-lobby-reg",
    label: "RegisteredLobbyists",
    group: "tec-lobby",
    x: 104,
    y: 350,
    w: 170,
  },
  {
    id: "tec-lobby-group",
    label: "LobbyGroupByLobbyist",
    group: "tec-lobby",
    x: 104,
    y: 404,
    w: 170,
  },
  {
    id: "tec-lobby-subj",
    label: "LobbySubjMatter",
    group: "tec-lobby",
    x: 302,
    y: 372,
    w: 160,
  },
  {
    id: "tec-lobby-funds",
    label: "Pol_FundsByLobbyists",
    group: "tec-lobby",
    x: 302,
    y: 422,
    w: 170,
  },

  { id: "atx-lobby-reg", label: "registrants", group: "atx-lobby", x: 632, y: 350 },
  { id: "atx-lobby-clients", label: "clients", group: "atx-lobby", x: 632, y: 414 },
  { id: "atx-lobby-reports", label: "reports", group: "atx-lobby", x: 830, y: 350 },
  {
    id: "atx-lobby-muni",
    label: "municipal_questions",
    group: "atx-lobby",
    x: 830,
    y: 414,
    w: 170,
  },
];

const LINKS: TableLink[] = [
  {
    id: "tec-cf-filers-contribs",
    from: "tec-filers",
    to: "tec-contribs",
    fromSide: "bottom",
    toSide: "top",
    label: "filerIdent",
    kind: "hard",
    bend: -18,
  },
  {
    id: "tec-cf-filers-expend",
    from: "tec-filers",
    to: "tec-expend",
    fromSide: "bottom",
    toSide: "top",
    label: "filerIdent",
    kind: "hard",
    bend: 18,
  },
  {
    id: "tec-cf-contribs-cover",
    from: "tec-contribs",
    to: "tec-cover",
    fromSide: "bottom",
    toSide: "left",
    label: "reportInfoIdent",
    kind: "hard",
  },
  {
    id: "tec-cf-expend-cover",
    from: "tec-expend",
    to: "tec-cover",
    fromSide: "bottom",
    toSide: "right",
    label: "reportInfoIdent",
    kind: "hard",
  },
  {
    id: "atx-cf-contribs-trans",
    from: "atx-contribs",
    to: "atx-trans",
    fromSide: "right",
    toSide: "left",
    label: "TRANSACTION_ID",
    kind: "hard",
    bend: 14,
  },
  {
    id: "atx-cf-expend-trans",
    from: "atx-expend",
    to: "atx-trans",
    fromSide: "right",
    toSide: "left",
    label: "TRANSACTION_ID",
    kind: "hard",
    bend: -14,
  },
  {
    id: "tec-lobby-reg-group",
    from: "tec-lobby-reg",
    to: "tec-lobby-group",
    fromSide: "bottom",
    toSide: "top",
    label: "FilerID",
    kind: "hard",
  },
  {
    id: "tec-lobby-group-subj",
    from: "tec-lobby-group",
    to: "tec-lobby-subj",
    fromSide: "right",
    toSide: "left",
    label: "FilerID + ClientName",
    kind: "hard",
    bend: -18,
  },
  {
    id: "tec-lobby-reg-funds",
    from: "tec-lobby-reg",
    to: "tec-lobby-funds",
    fromSide: "right",
    toSide: "left",
    label: "FilerID",
    kind: "hard",
    bend: 26,
  },
  {
    id: "atx-lobby-reg-clients",
    from: "atx-lobby-reg",
    to: "atx-lobby-clients",
    fromSide: "bottom",
    toSide: "top",
    label: "REGISTRANT_ID",
    kind: "hard",
  },
  {
    id: "atx-lobby-reg-reports",
    from: "atx-lobby-reg",
    to: "atx-lobby-reports",
    fromSide: "right",
    toSide: "left",
    label: "REGISTRANT_ID",
    kind: "hard",
  },
  {
    id: "atx-lobby-reports-muni",
    from: "atx-lobby-reports",
    to: "atx-lobby-muni",
    fromSide: "bottom",
    toSide: "top",
    label: "REPORT_ID",
    kind: "hard",
  },
  {
    id: "candidate-donor",
    from: "tec-contribs",
    to: "atx-contribs",
    fromSide: "right",
    toSide: "left",
    label: "donor name",
    kind: "candidate",
    labelX: 540,
    labelY: 149,
  },
  {
    id: "candidate-payee",
    from: "tec-expend",
    to: "atx-expend",
    fromSide: "right",
    toSide: "left",
    label: "payee name",
    kind: "candidate",
    labelX: 540,
    labelY: 207,
  },
  {
    id: "candidate-lobbyist",
    from: "tec-lobby-reg",
    to: "atx-lobby-reg",
    fromSide: "right",
    toSide: "left",
    label: "lobbyist name",
    kind: "candidate",
    labelX: 540,
    labelY: 365,
  },
  {
    id: "candidate-client",
    from: "tec-lobby-group",
    to: "atx-lobby-clients",
    fromSide: "right",
    toSide: "left",
    label: "client name",
    kind: "candidate",
    labelX: 540,
    labelY: 419,
  },
];

const NODE_BY_ID = new Map(NODES.map((node) => [node.id, node]));

function nodeWidth(node: TableNode) {
  return node.w ?? NODE_W;
}

function anchor(node: TableNode, side: Side) {
  const w = nodeWidth(node);
  switch (side) {
    case "top":
      return { x: node.x + w / 2, y: node.y };
    case "right":
      return { x: node.x + w, y: node.y + NODE_H / 2 };
    case "bottom":
      return { x: node.x + w / 2, y: node.y + NODE_H };
    case "left":
      return { x: node.x, y: node.y + NODE_H / 2 };
  }
}

function controlPoint(
  start: { x: number; y: number },
  side: Side,
  tension: number,
  bend: number,
) {
  if (side === "left") return { x: start.x - tension, y: start.y + bend };
  if (side === "right") return { x: start.x + tension, y: start.y + bend };
  if (side === "top") return { x: start.x + bend, y: start.y - tension };
  return { x: start.x + bend, y: start.y + tension };
}

function linkPath(link: TableLink) {
  const from = NODE_BY_ID.get(link.from)!;
  const to = NODE_BY_ID.get(link.to)!;
  const start = anchor(from, link.fromSide);
  const end = anchor(to, link.toSide);
  const dist = Math.hypot(end.x - start.x, end.y - start.y);
  const tension = Math.min(Math.max(dist * 0.32, 16), 120);
  const bend = link.bend ?? 0;
  const c1 = controlPoint(start, link.fromSide, tension, bend);
  const c2 = controlPoint(end, link.toSide, tension, -bend);

  return `M ${start.x} ${start.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${end.x} ${end.y}`;
}

function activeSets(active: Active) {
  const nodes = new Set<NodeId>();
  const links = new Set<string>();

  if (active?.kind === "node") {
    nodes.add(active.id);
    for (const link of LINKS) {
      if (link.from === active.id || link.to === active.id) {
        links.add(link.id);
        nodes.add(link.from);
        nodes.add(link.to);
      }
    }
  }

  if (active?.kind === "link") {
    links.add(active.id);
    const link = LINKS.find((candidate) => candidate.id === active.id);
    if (link) {
      nodes.add(link.from);
      nodes.add(link.to);
    }
  }

  return { nodes, links };
}

export function DataRelationDiagram() {
  const [active, setActive] = useState<Active>(null);
  const { nodes: activeNodes, links: activeLinks } = useMemo(
    () => activeSets(active),
    [active],
  );
  const hasActive = active !== null;

  return (
    <figure className="overflow-hidden rounded-md border border-rule bg-white">
      <div className="overflow-x-auto bg-page">
        <svg
          viewBox={`0 0 ${SVG_W} ${SVG_H}`}
          className="block min-w-[820px] w-full"
          role="img"
          aria-labelledby="data-relation-title data-relation-description"
          onMouseLeave={() => setActive(null)}
        >
          <title id="data-relation-title">
            How the four datasets relate
          </title>
          <desc id="data-relation-description">
            Solid arrows are exact joins inside a single source. Dashed
            links cross the state/city boundary by name and remain
            candidates until verified.
          </desc>
          <defs>
            <marker
              id="join-arrow"
              viewBox="0 0 8 6"
              refX="7"
              refY="3"
              markerWidth="8"
              markerHeight="6"
              orient="auto"
            >
              <path d="M 0 0 L 8 3 L 0 6 Z" fill="#7A776E" />
            </marker>
            <marker
              id="join-arrow-active"
              viewBox="0 0 8 6"
              refX="7"
              refY="3"
              markerWidth="8"
              markerHeight="6"
              orient="auto"
            >
              <path d="M 0 0 L 8 3 L 0 6 Z" fill="#1A1A1A" />
            </marker>
          </defs>

          <rect width={SVG_W} height={SVG_H} fill="#FAFAF7" />

          <text
            x="62"
            y="34"
            fill="#5C5C58"
            fontFamily="var(--font-mono), ui-monospace, monospace"
            fontSize="10"
            letterSpacing="0.16em"
          >
            STATE
          </text>
          <text
            x={SVG_W - 62}
            y="34"
            textAnchor="end"
            fill="#5C5C58"
            fontFamily="var(--font-mono), ui-monospace, monospace"
            fontSize="10"
            letterSpacing="0.16em"
          >
            CITY
          </text>

          <line
            x1={SVG_W / 2}
            y1="48"
            x2={SVG_W / 2}
            y2="478"
            stroke="#E4E2DC"
            strokeDasharray="2 8"
            strokeLinecap="round"
          />
          <g>
            <rect
              x={SVG_W / 2 - 78}
              y="20"
              width="156"
              height="22"
              rx="11"
              fill="#FAFAF7"
              stroke="#E3C8C8"
            />
            <text
              x={SVG_W / 2}
              y="35"
              textAnchor="middle"
              fill="#8B1A1A"
              fontFamily="var(--font-mono), ui-monospace, monospace"
              fontSize="10"
              letterSpacing="0.16em"
            >
              NO SHARED ID
            </text>
          </g>

          {Object.values(GROUPS).map((group) => {
            const groupNodes = NODES.filter((node) => node.group === group.id);
            const groupActive =
              !hasActive || groupNodes.some((node) => activeNodes.has(node.id));

            return (
              <g
                key={group.id}
                opacity={groupActive ? 1 : 0.3}
                style={{ transition: "opacity 160ms ease" }}
              >
                <rect
                  x={group.x}
                  y={group.y}
                  width={group.w}
                  height={group.h}
                  rx="6"
                  fill="#FFFFFF"
                  stroke="#E4E2DC"
                />
                <rect
                  x={group.x}
                  y={group.y}
                  width="3"
                  height={group.h}
                  rx="1.5"
                  fill={group.color}
                />
                <text
                  x={group.x + 18}
                  y={group.y + 27}
                  fill={group.color}
                  fontFamily="var(--font-mono), ui-monospace, monospace"
                  fontSize="11"
                  fontWeight="700"
                  letterSpacing="0.04em"
                >
                  {group.label}
                </text>
                <text
                  x={group.x + 18}
                  y={group.y + 45}
                  fill="#7A776E"
                  fontFamily="var(--font-mono), ui-monospace, monospace"
                  fontSize="10"
                >
                  {group.namespace}
                </text>
              </g>
            );
          })}

          {LINKS.map((link) => {
            const path = linkPath(link);
            const activeLink = activeLinks.has(link.id);
            const muted = hasActive && !activeLink;
            const stroke =
              link.kind === "candidate"
                ? activeLink
                  ? "#8B1A1A"
                  : "#C28A8A"
                : activeLink
                  ? "#1A1A1A"
                  : "#7A776E";

            return (
              <g key={link.id}>
                <path
                  d={path}
                  fill="none"
                  stroke="transparent"
                  strokeWidth="18"
                  aria-label={`${link.kind === "candidate" ? "Candidate name link" : "Exact join"}: ${link.label}`}
                  onMouseEnter={() => setActive({ kind: "link", id: link.id })}
                  onFocus={() => setActive({ kind: "link", id: link.id })}
                  onBlur={() => setActive(null)}
                  style={{ cursor: "pointer" }}
                  tabIndex={0}
                />
                <path
                  d={path}
                  fill="none"
                  stroke={stroke}
                  strokeWidth={activeLink ? 2.1 : 1.25}
                  strokeLinecap="round"
                  strokeDasharray={link.kind === "candidate" ? "5 6" : undefined}
                  markerEnd={
                    link.kind === "hard"
                      ? activeLink
                        ? "url(#join-arrow-active)"
                        : "url(#join-arrow)"
                      : undefined
                  }
                  opacity={muted ? 0.13 : 1}
                  style={{
                    transition:
                      "opacity 160ms ease, stroke 160ms ease, stroke-width 160ms ease",
                  }}
                />
              </g>
            );
          })}

          {LINKS.filter((link) => link.kind === "candidate").map((link) => {
            const activeLink = activeLinks.has(link.id);
            const muted = hasActive && !activeLink;
            const labelWidth = Math.max(80, link.label.length * 6.4 + 22);
            const x = (link.labelX ?? SVG_W / 2) - labelWidth / 2;
            const y = (link.labelY ?? 0) - 11;

            return (
              <g
                key={`${link.id}-label`}
                opacity={muted ? 0.25 : 1}
                style={{ transition: "opacity 160ms ease" }}
              >
                <rect
                  x={x}
                  y={y}
                  width={labelWidth}
                  height="22"
                  rx="11"
                  fill="#FAFAF7"
                  stroke={activeLink ? "#8B1A1A" : "#E3C8C8"}
                />
                <text
                  x={link.labelX ?? SVG_W / 2}
                  y={(link.labelY ?? 0) + 4}
                  textAnchor="middle"
                  fill={activeLink ? "#8B1A1A" : "#8B1A1A"}
                  fontFamily="var(--font-mono), ui-monospace, monospace"
                  fontSize="10"
                  opacity={activeLink ? 1 : 0.78}
                >
                  {link.label}
                </text>
              </g>
            );
          })}

          {NODES.map((node) => {
            const group = GROUPS[node.group];
            const activeNode = activeNodes.has(node.id);
            const muted = hasActive && !activeNode;
            const w = nodeWidth(node);

            return (
              <g
                key={node.id}
                onMouseEnter={() => setActive({ kind: "node", id: node.id })}
                onFocus={() => setActive({ kind: "node", id: node.id })}
                onBlur={() => setActive(null)}
                tabIndex={0}
                aria-label={`${node.label} in ${group.label}`}
                opacity={muted ? 0.24 : 1}
                style={{
                  cursor: "pointer",
                  transition: "opacity 160ms ease",
                }}
              >
                <rect
                  x={node.x}
                  y={node.y}
                  width={w}
                  height={NODE_H}
                  rx={NODE_RX}
                  fill={activeNode ? group.color : "#FFFFFF"}
                  stroke={activeNode ? group.color : "#CFCBC2"}
                  strokeWidth={activeNode ? 1.8 : 1}
                />
                <rect
                  x={node.x}
                  y={node.y}
                  width="4"
                  height={NODE_H}
                  rx="2"
                  fill={group.color}
                  opacity={activeNode ? 1 : 0.7}
                />
                <text
                  x={node.x + w / 2}
                  y={node.y + NODE_H / 2 + 4}
                  textAnchor="middle"
                  fill={activeNode ? "#FFFFFF" : "#1A1A1A"}
                  fontFamily="var(--font-mono), ui-monospace, monospace"
                  fontSize="10"
                  fontWeight={activeNode ? 700 : 500}
                >
                  {node.label}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      <figcaption className="flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-rule bg-white/70 px-4 py-3 font-mono text-[11px] text-muted">
        <LegendKey kind="hard" label="Exact join inside one source" />
        <LegendKey kind="candidate" label="Candidate name match across sources" />
        <span className="ml-auto text-[10px] uppercase tracking-[0.16em]">
          Hover any table or link
        </span>
      </figcaption>
    </figure>
  );
}

function LegendKey({
  kind,
  label,
}: {
  kind: "hard" | "candidate";
  label: string;
}) {
  return (
    <span className="inline-flex items-center gap-2">
      <svg
        width="40"
        height="10"
        viewBox="0 0 40 10"
        aria-hidden="true"
        className="shrink-0"
      >
        {kind === "hard" ? (
          <>
            <line
              x1="0"
              y1="5"
              x2="32"
              y2="5"
              stroke="#7A776E"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
            <path
              d="M 32 1.5 L 38 5 L 32 8.5 Z"
              fill="#7A776E"
            />
          </>
        ) : (
          <line
            x1="0"
            y1="5"
            x2="40"
            y2="5"
            stroke="#8B1A1A"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeDasharray="5 6"
          />
        )}
      </svg>
      <span className="text-ink/80">{label}</span>
    </span>
  );
}

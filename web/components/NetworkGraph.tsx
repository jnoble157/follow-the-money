"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { DataSet } from "vis-data/peer";
import { Network } from "vis-network/peer";
import "vis-network/styles/vis-network.css";
import type {
  EntityKind,
  NetworkData,
  NetworkEdge,
  NetworkNode,
} from "@/lib/network/build";
import { formatMoney } from "@/lib/formatMoney";

// Solid + faded variants for each entity kind. The faded color is what we
// swap in when a node is unrelated to the user's selection — it stays in
// place but visually drops to the background.
const KIND_COLOR: Record<
  EntityKind,
  { solid: string; border: string; faded: string; fadedBorder: string }
> = {
  politician: {
    solid: "#8B1A1A",
    border: "#5A0F0F",
    faded: "rgba(139,26,26,0.12)",
    fadedBorder: "rgba(139,26,26,0.18)",
  },
  donor: {
    solid: "#2E7D6E",
    border: "#1F574E",
    faded: "rgba(46,125,110,0.12)",
    fadedBorder: "rgba(46,125,110,0.18)",
  },
  employer: {
    solid: "#B17A1A",
    border: "#7E5712",
    faded: "rgba(177,122,26,0.12)",
    fadedBorder: "rgba(177,122,26,0.18)",
  },
  lobbyist: {
    solid: "#4A6FA5",
    border: "#2F4A75",
    faded: "rgba(74,111,165,0.12)",
    fadedBorder: "rgba(74,111,165,0.18)",
  },
  client: {
    solid: "#6E3A8A",
    border: "#4A2660",
    faded: "rgba(110,58,138,0.12)",
    fadedBorder: "rgba(110,58,138,0.18)",
  },
};

const KIND_LABEL: Record<EntityKind, string> = {
  politician: "Politician / PAC",
  donor: "Donor (individual)",
  employer: "Employer",
  lobbyist: "Lobbyist",
  client: "Lobby client",
};

type Props = {
  data: NetworkData;
  className?: string;
};

export function NetworkGraph({ data, className }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const networkRef = useRef<Network | null>(null);
  const nodesDsRef = useRef<DataSet<VisNode> | null>(null);
  const edgesDsRef = useRef<DataSet<VisEdge> | null>(null);
  const [selected, setSelected] = useState<NetworkNode | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [query, setQuery] = useState("");

  // Track fullscreen state via the platform event so the toggle button's
  // label stays correct even when the user exits with Esc.
  useEffect(() => {
    const onChange = () => {
      setIsFullscreen(document.fullscreenElement === wrapperRef.current);
    };
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  async function toggleFullscreen() {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
    } else if (wrapperRef.current) {
      await wrapperRef.current.requestFullscreen();
    }
  }

  // Adjacency map for the click-to-isolate behavior. Built once per data
  // change; the network instance also exposes getConnectedNodes but a
  // precomputed Set keeps the per-click work O(1).
  const neighbors = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const n of data.nodes) m.set(n.id, new Set([n.id]));
    for (const e of data.edges) {
      m.get(e.from)?.add(e.to);
      m.get(e.to)?.add(e.from);
    }
    return m;
  }, [data]);

  const byId = useMemo(() => {
    const m = new Map<string, NetworkNode>();
    for (const n of data.nodes) m.set(n.id, n);
    return m;
  }, [data.nodes]);

  // Size scaling derived from the actual flow distribution. Using sqrt so
  // node *area* (not diameter) is proportional to flow — that's what the eye
  // reads as "this entity moves N× as much money." Clamped to a visible
  // minimum so the smallest still register.
  const sizeForFlow = useMemo(() => {
    let max = 0;
    for (const n of data.nodes) if (n.flow > max) max = n.flow;
    return (flow: number) => sizeFromFlow(flow, max);
  }, [data.nodes]);

  // (Re)build the graph whenever data changes. We tear down the network on
  // each rebuild rather than diffing — the data is fetched once on mount,
  // so this runs at most once per page view.
  useEffect(() => {
    if (!containerRef.current) return;
    const nodesDs = new DataSet<VisNode>(
      data.nodes.map((n) => toVisNode(n, sizeForFlow(n.flow))),
    );
    const edgesDs = new DataSet<VisEdge>(data.edges.map(toVisEdge));
    nodesDsRef.current = nodesDs;
    edgesDsRef.current = edgesDs;

    const network = new Network(
      containerRef.current,
      { nodes: nodesDs as never, edges: edgesDs as never },
      {
        autoResize: true,
        physics: {
          // Run the simulator only during the initial stabilization so the
          // graph settles into a layout once and then freezes. Without
          // this, vis-network keeps the simulator hot and nodes drift
          // forever. We turn physics off in the `stabilized` callback
          // below — but `stabilization.enabled: true` is still needed so
          // the initial layout actually runs.
          enabled: true,
          stabilization: { enabled: true, iterations: 320, fit: true },
          barnesHut: {
            // Stronger repulsion + longer rest length gives the graph more
            // breathing room. avoidOverlap=1 reserves the full node radius
            // so circular avatars never collide.
            gravitationalConstant: -22000,
            centralGravity: 0.08,
            springLength: 240,
            springConstant: 0.025,
            damping: 0.75,
            avoidOverlap: 1,
          },
        },
        interaction: {
          hover: true,
          dragNodes: true,
          dragView: true,
          zoomView: true,
        },
        nodes: {
          shape: "dot",
          borderWidth: 1.5,
          font: {
            face: "ui-sans-serif, system-ui, Inter, Arial, sans-serif",
            color: "#1A1A1A",
            size: 12,
            strokeWidth: 3,
            strokeColor: "#FAFAF7",
          },
          // We pre-scale `size` ourselves (see toVisNode) instead of letting
          // vis-network do it, so nodes stay consistent across rebuilds.
        },
        edges: {
          color: { color: "rgba(92,92,88,0.45)", highlight: "#1A1A1A" },
          smooth: { type: "continuous", roundness: 0.3 } as never,
          arrows: { to: { enabled: false } },
        },
      },
    );
    networkRef.current = network;

    // Once the initial Barnes-Hut pass converges, swap to a low-energy
    // physics regime instead of disabling the simulator outright. With
    // weak forces and high damping the layout doesn't drift apart, but
    // nodes pick up a faint breathing motion — enough to feel alive
    // without the chaotic sliding of the default physics. Dragging still
    // moves only the dragged node since neighbors are barely coupled.
    network.once("stabilizationIterationsDone", () => {
      network.setOptions({
        physics: {
          enabled: true,
          barnesHut: {
            // Mirrors the initial pass scaled down: same long springs and
            // overlap reservation so the breathing motion stays inside
            // the spaced layout, just with much weaker forces.
            gravitationalConstant: -300,
            centralGravity: 0.002,
            springLength: 240,
            springConstant: 0.0015,
            damping: 0.95,
            avoidOverlap: 1,
          },
          minVelocity: 0.05,
        },
      });
    });

    network.on("click", (params: { nodes: Array<string | number> }) => {
      const id = params.nodes?.[0];
      // Any click cancels an active search so we don't end up with two
      // overlapping dimming modes.
      setQuery("");
      if (id == null) {
        clearIsolation();
        setSelected(null);
        return;
      }
      const node = byId.get(String(id));
      if (!node) return;
      isolate(String(id));
      setSelected(node);
    });

    network.on("hoverNode", () => {
      if (containerRef.current) containerRef.current.style.cursor = "pointer";
    });
    network.on("blurNode", () => {
      if (containerRef.current) containerRef.current.style.cursor = "default";
    });

    return () => {
      network.destroy();
      networkRef.current = null;
      nodesDsRef.current = null;
      edgesDsRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  // Apply a "keep" set to the graph: nodes inside the set render at full
  // saturation, everything else fades. Edges fade unless both endpoints
  // are in the set. Used by both click-to-isolate (keep = node + neighbors)
  // and the search box (keep = nodes whose label matches the query).
  function applyKeep(keep: Set<string>, emphasized?: string) {
    const nodesDs = nodesDsRef.current;
    const edgesDs = edgesDsRef.current;
    if (!nodesDs || !edgesDs) return;
    const updates: Partial<VisNode>[] = data.nodes.map((n) => {
      const c = KIND_COLOR[n.kind];
      const active = keep.has(n.id);
      return {
        id: n.id,
        size: sizeForFlow(n.flow),
        color: active
          ? { background: c.solid, border: c.border }
          : { background: c.faded, border: c.fadedBorder },
        // Per-node opacity is the only way to dim the image overlay on
        // `circularImage` nodes; recoloring the disc alone isn't visible
        // when a photo is on top of it.
        opacity: active ? 1 : 0.15,
        font: {
          color: active ? "#1A1A1A" : "rgba(26,26,26,0.25)",
          size: 12,
          strokeWidth: 3,
          strokeColor: "#FAFAF7",
        },
        borderWidth: n.id === emphasized ? 3 : 1.5,
      };
    });
    nodesDs.update(updates as never);

    const edgeUpdates: Partial<VisEdge>[] = data.edges.map((e) => {
      const active = keep.has(e.from) && keep.has(e.to);
      return {
        id: e.id,
        color: active
          ? { color: "rgba(26,26,26,0.6)" }
          : { color: "rgba(92,92,88,0.05)" },
        width: active ? Math.max(1, edgeWidth(e.weight)) : 0.5,
      };
    });
    edgesDs.update(edgeUpdates as never);
  }

  function isolate(nodeId: string) {
    const keep = neighbors.get(nodeId) ?? new Set([nodeId]);
    applyKeep(keep, nodeId);
  }

  function clearIsolation() {
    const nodesDs = nodesDsRef.current;
    const edgesDs = edgesDsRef.current;
    const network = networkRef.current;
    if (!nodesDs || !edgesDs) return;
    // Explicit opacity:1 in addition to the toVisNode spread because
    // vis-network's DataSet.update merges shallow properties — passing the
    // full canonical node object is the most reliable way to clobber
    // applyKeep's opacity:0.15 when we restore the default look.
    nodesDs.update(
      data.nodes.map((n) => ({
        ...toVisNode(n, sizeForFlow(n.flow)),
        hidden: false,
        opacity: 1,
      })) as never,
    );
    edgesDs.update(
      data.edges.map((e) => ({ ...toVisEdge(e), hidden: false })) as never,
    );
    // Force a paint pass — without this, the fade-back animation on
    // circular images can stall on Safari until the next interaction.
    network?.redraw();
  }

  // Search-driven hiding: hide every node that doesn't match. Edges are
  // hidden when either endpoint is hidden, since a half-attached edge
  // would dangle into empty space. After applying, fit the view to the
  // remaining nodes so the user sees the matches at full size.
  function applyVisibleOnly(visible: Set<string>) {
    const nodesDs = nodesDsRef.current;
    const edgesDs = edgesDsRef.current;
    const network = networkRef.current;
    if (!nodesDs || !edgesDs || !network) return;
    const nodeUpdates: Partial<VisNode>[] = data.nodes.map((n) => ({
      id: n.id,
      hidden: !visible.has(n.id),
    }));
    nodesDs.update(nodeUpdates as never);
    const edgeUpdates: Partial<VisEdge>[] = data.edges.map((e) => ({
      id: e.id,
      hidden: !(visible.has(e.from) && visible.has(e.to)),
    }));
    edgesDs.update(edgeUpdates as never);
    if (visible.size > 0) {
      network.fit({
        nodes: Array.from(visible),
        animation: { duration: 350, easingFunction: "easeInOutQuad" },
      });
    }
  }

  // Search-driven hiding. A non-empty query removes every node whose label
  // doesn't contain the query (case-insensitive) and re-fits the view to
  // the matches. Clearing the query restores the full graph. Click-
  // isolation is reset whenever the search becomes active so the two
  // modes don't fight over the DataSet state.
  useEffect(() => {
    if (!nodesDsRef.current) return;
    const q = query.trim().toLowerCase();
    if (!q) {
      if (!selected) clearIsolation();
      return;
    }
    if (selected) setSelected(null);
    const visible = new Set<string>();
    for (const n of data.nodes) {
      if (n.label.toLowerCase().includes(q)) visible.add(n.id);
    }
    applyVisibleOnly(visible);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, data]);

  // The fullscreen target: the wrapper, not the canvas, so the legend +
  // selected-panel + button stay visible above the graph in fullscreen
  // mode. Tailwind's `fullscreen:` variant kicks in only when the element
  // itself is the active fullscreen root.
  return (
    <div
      ref={wrapperRef}
      className="relative bg-white fullscreen:bg-page"
    >
      <div
        ref={containerRef}
        className={
          isFullscreen
            ? "h-screen w-screen bg-white"
            : (className ??
              "h-[78vh] w-full rounded-md border border-rule bg-white")
        }
      />
      <Legend />
      <div className="absolute right-3 top-3 z-10 flex items-stretch gap-2">
        <SearchBox
          query={query}
          matchCount={
            query.trim()
              ? data.nodes.filter((n) =>
                  n.label.toLowerCase().includes(query.trim().toLowerCase()),
                ).length
              : 0
          }
          onChange={setQuery}
        />
        <button
          type="button"
          onClick={toggleFullscreen}
          className="rounded-sm border border-rule bg-white/90 px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider text-muted hover:border-ink hover:text-ink backdrop-blur"
        >
          {isFullscreen ? "Exit fullscreen · esc" : "Fullscreen ⤢"}
        </button>
      </div>
      {selected ? (
        <SelectedPanel
          node={selected}
          onClose={() => {
            clearIsolation();
            setSelected(null);
          }}
        />
      ) : null}
      {!isFullscreen ? (
        <p className="mt-3 text-[12px] text-muted">
          {data.nodes.length} entities · {data.edges.length} connections. Click a
          node to isolate its neighbors. Click empty space to reset.
        </p>
      ) : null}
    </div>
  );
}

type VisNode = {
  id: string;
  label: string;
  title?: string;
  size: number;
  shape: "dot" | "circularImage";
  image?: string;
  brokenImage?: string;
  color: { background: string; border: string };
  borderWidth: number;
  // vis-network 9+ supports per-node opacity that applies to the image
  // overlay too — without this, dimmed `circularImage` nodes would still
  // show their photo at full saturation.
  opacity?: number;
  font: { color: string; size: number; strokeWidth: number; strokeColor: string };
};

type VisEdge = {
  id: string;
  from: string;
  to: string;
  width: number;
  color: { color: string };
};

function toVisNode(n: NetworkNode, size: number): VisNode {
  const c = KIND_COLOR[n.kind];
  // Every node gets an image. When the Wikipedia/Wikidata/Clearbit
  // enrichment found a real photo, we use it. Otherwise we fall back to a
  // deterministic initials avatar — same colored disc as a `dot`-shape
  // node, but with the entity's initials drawn on top so each node still
  // carries a unique mark.
  const image = n.image ?? initialsAvatar(n.label, c.solid);
  return {
    id: n.id,
    label: n.label,
    title:
      `${KIND_LABEL[n.kind]}\n${n.label}\nFlow: ${formatMoney(n.flow, { compact: true })}`,
    size,
    shape: "circularImage",
    image,
    color: { background: c.solid, border: c.border },
    opacity: 1,
    borderWidth: n.image ? 3 : 2,
    font: {
      color: "#1A1A1A",
      size: 12,
      strokeWidth: 3,
      strokeColor: "#FAFAF7",
    },
  };
}

// Build a data-URI SVG showing the entity's initials on the kind color.
// Inline so we don't need an external avatar service (DiceBear / ui-avatars
// would work but add a network round-trip per fallback node, ~110 of them).
function initialsAvatar(label: string, bg: string): string {
  const initials = label
    .replace(/[,.()"']/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .filter((w) => !/^(LLC|Inc|Ltd|LP|Corp|Co|PAC|Jr|Sr|The|For|Of|And)\.?$/i.test(w))
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("")
    .slice(0, 2) || "?";
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80">` +
    `<rect width="80" height="80" rx="40" fill="${bg}"/>` +
    `<text x="40" y="48" text-anchor="middle" font-family="ui-sans-serif,system-ui,Inter,Arial,sans-serif" ` +
    `font-size="34" font-weight="600" fill="#FAFAF7">${escapeXml(initials)}</text>` +
    `</svg>`;
  // encodeURIComponent + a couple of whitelist swaps gives a smaller
  // data-URI than base64 and renders identically in vis-network.
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function escapeXml(s: string): string {
  return s.replace(/[<>&"']/g, (ch) => {
    switch (ch) {
      case "<": return "&lt;";
      case ">": return "&gt;";
      case "&": return "&amp;";
      case '"': return "&quot;";
      case "'": return "&apos;";
      default: return ch;
    }
  });
}

function toVisEdge(e: NetworkEdge): VisEdge {
  return {
    id: e.id,
    from: e.from,
    to: e.to,
    width: edgeWidth(e.weight),
    color: { color: "rgba(92,92,88,0.45)" },
  };
}

// Diameter ∝ √flow so node *area* tracks dollars — the eye reads area as
// magnitude. Scale relative to the data's own max so the largest entity
// fills MAX_SIZE and small ones still meet a visible minimum.
const MIN_SIZE = 8;
const MAX_SIZE = 60;
function sizeFromFlow(flow: number, maxFlow: number): number {
  if (maxFlow <= 0) return MIN_SIZE;
  const ratio = Math.sqrt(Math.max(flow, 0) / maxFlow);
  return MIN_SIZE + (MAX_SIZE - MIN_SIZE) * ratio;
}

function edgeWidth(weight: number): number {
  if (weight <= 0) return 0.5;
  const v = Math.log10(weight);
  return Math.max(0.5, Math.min(6, v - 2));
}

function Legend() {
  const items: { kind: EntityKind; label: string }[] = [
    { kind: "politician", label: "Politician / PAC" },
    { kind: "donor", label: "Donor" },
    { kind: "employer", label: "Employer" },
    { kind: "lobbyist", label: "Lobbyist" },
    { kind: "client", label: "Lobby client" },
  ];
  return (
    <div className="pointer-events-none absolute left-3 top-3 flex flex-wrap gap-3 rounded-sm border border-rule bg-white/85 px-3 py-2 backdrop-blur">
      {items.map((it) => (
        <div key={it.kind} className="flex items-center gap-1.5">
          <span
            aria-hidden
            className="inline-block h-2.5 w-2.5 rounded-full"
            style={{ background: KIND_COLOR[it.kind].solid }}
          />
          <span className="font-mono text-[10px] uppercase tracking-wider text-muted">
            {it.label}
          </span>
        </div>
      ))}
    </div>
  );
}

function SearchBox({
  query,
  matchCount,
  onChange,
}: {
  query: string;
  matchCount: number;
  onChange: (q: string) => void;
}) {
  return (
    <div className="flex items-center gap-2 rounded-sm border border-rule bg-white/90 px-2 py-1 backdrop-blur">
      <span aria-hidden className="font-mono text-[11px] text-muted">
        ⌕
      </span>
      <input
        type="search"
        value={query}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Find by name…"
        className="w-[200px] bg-transparent text-[12px] text-ink outline-none placeholder:text-muted focus:w-[260px] transition-[width] duration-150"
        // Stop key events from bubbling into vis-network's keyboard
        // bindings (which would otherwise pan/zoom on arrow keys).
        onKeyDown={(e) => e.stopPropagation()}
      />
      {query.trim() ? (
        <>
          <span className="font-mono text-[10px] tnum text-muted">
            {matchCount}
          </span>
          <button
            type="button"
            onClick={() => onChange("")}
            className="font-mono text-[10px] uppercase text-muted hover:text-ink"
            aria-label="Clear search"
          >
            ×
          </button>
        </>
      ) : null}
    </div>
  );
}

function SelectedPanel({
  node,
  onClose,
}: {
  node: NetworkNode;
  onClose: () => void;
}) {
  return (
    <div className="absolute right-3 top-12 max-w-[280px] rounded-sm border border-rule bg-white/95 px-3 py-2 shadow-sm backdrop-blur">
      <div className="flex items-baseline justify-between gap-3">
        <p className="font-mono text-[10px] uppercase tracking-wider text-muted">
          {KIND_LABEL[node.kind]}
        </p>
        <button
          type="button"
          onClick={onClose}
          className="font-mono text-[10px] uppercase tracking-wider text-muted hover:text-ink"
        >
          Reset
        </button>
      </div>
      <p className="mt-1 text-[14px] text-ink leading-snug">{node.label}</p>
      <p className="mt-1 font-mono text-[11px] tnum text-muted">
        Flow: {formatMoney(node.flow, { compact: true })}
      </p>
    </div>
  );
}

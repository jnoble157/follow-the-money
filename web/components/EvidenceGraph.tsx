"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { DataSet } from "vis-data/peer";
import { Network } from "vis-network/peer";
import "vis-network/styles/vis-network.css";
import type {
  GraphEdgeView,
  GraphNodeView,
} from "@/lib/investigations/state";
import type { GraphNodeKind } from "@/lib/investigations/types";

type Props = {
  nodes: GraphNodeView[];
  edges: GraphEdgeView[];
  // Map of node id → profile slug for click-through. Merged with any
  // `profileSlug` already on the node objects; the prop wins.
  nodeIdToProfileSlug?: Record<string, string>;
};

// Color tokens kept inline because vis-network reads color strings, not CSS
// classes. The palette mirrors tailwind.config.ts so the graph reads as part
// of the same design system.
const NODE_COLORS: Record<GraphNodeKind, { bg: string; border: string }> = {
  donor: { bg: "#FFF5F5", border: "#8B1A1A" },
  filer: { bg: "#F1F4F9", border: "#1F3A5F" },
  pac: { bg: "#F1F4F9", border: "#1F3A5F" },
  employer: { bg: "#FFFAF0", border: "#8A6D3B" },
  lobbyist: { bg: "#F4F0E6", border: "#5C5C58" },
  client: { bg: "#FAFAF7", border: "#5C5C58" },
};

const KIND_LABEL: Record<GraphNodeKind, string> = {
  donor: "Donor",
  filer: "Filer",
  pac: "PAC",
  employer: "Employer",
  lobbyist: "Lobbyist",
  client: "Client",
};

// vis-network's own `fit()` is unpredictable with our hierarchical layout —
// it uses a fixed margin and an internal aspect-ratio fudge that leaves
// sparse graphs rendering at ~30% of the modal viewport (the "lost in
// space" bug). We compute scale ourselves from node positions and a target
// fill ratio instead. These clamps still bound the result so a 2-node
// graph doesn't fill the entire modal and a 20-node graph doesn't go
// microscopic.
const MIN_FIT_ZOOM = 0.7;
const MAX_FIT_ZOOM = 1.8;
const TARGET_FILL_RATIO = 0.78;
// Padding around the bounding box, in vis world units (~ pixels at 1×
// scale). Accounts for node widths/heights since `getPositions` returns
// node centers, not corners.
const FIT_PAD_X = 160;
const FIT_PAD_Y = 90;
const ZOOM_STEP = 1.25;
const GRAPH_NODE_LIMIT = 5;

export function EvidenceGraph({ nodes, edges, nodeIdToProfileSlug }: Props) {
  const visibleNodes = useMemo(
    () => nodes.slice(0, GRAPH_NODE_LIMIT),
    [nodes],
  );
  const visibleEdges = useMemo(() => {
    const ids = new Set(visibleNodes.map((n) => n.id));
    return edges.filter((e) => ids.has(e.from) && ids.has(e.to));
  }, [edges, visibleNodes]);

  const slugMap = useMemo(() => {
    const m: Record<string, string> = {};
    for (const n of visibleNodes) if (n.profileSlug) m[n.id] = n.profileSlug;
    if (nodeIdToProfileSlug) Object.assign(m, nodeIdToProfileSlug);
    return m;
  }, [visibleNodes, nodeIdToProfileSlug]);

  const [expanded, setExpanded] = useState(false);

  // Trap ESC + restore body scroll while the modal is up.
  useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setExpanded(false);
    };
    document.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [expanded]);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="font-mono text-[11px] uppercase tracking-wider text-muted">
          Evidence graph
        </h2>
        {visibleNodes.length > 0 ? (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="font-mono text-[11px] uppercase tracking-wider text-evidence hover:text-ink"
          >
            Expand →
          </button>
        ) : null}
      </div>
      <GraphFrame
        nodes={visibleNodes}
        edges={visibleEdges}
        slugMap={slugMap}
        className="h-[320px] w-full rounded-md border border-rule bg-white"
      />
      {visibleNodes.length === 0 ? (
        <p className="text-[12px] text-muted">
          Donors, filers, PACs, and lobbyists are added here as the agent
          discovers them.
        </p>
      ) : null}
      {expanded ? (
        <GraphModal
          nodes={visibleNodes}
          edges={visibleEdges}
          slugMap={slugMap}
          onClose={() => setExpanded(false)}
        />
      ) : null}
    </div>
  );
}

// Imperative surface the controls bar uses to drive the canvas. Stays small
// on purpose — adding methods here is how this component grows tentacles.
type CanvasHandle = {
  zoomIn: () => void;
  zoomOut: () => void;
  fit: () => void;
};

type FrameProps = {
  nodes: GraphNodeView[];
  edges: GraphEdgeView[];
  slugMap: Record<string, string>;
  className: string;
};

// Holds the canvas, the zoom/recenter controls (bottom-right), and the
// selection action card (bottom-left). Selection state lives here so the
// card sits next to the canvas without re-rendering it on every selection.
function GraphFrame({ nodes, edges, slugMap, className }: FrameProps) {
  const canvasRef = useRef<CanvasHandle>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const router = useRouter();

  // Drop selection when the underlying node disappears (new investigation).
  useEffect(() => {
    if (selectedId && !nodes.some((n) => n.id === selectedId)) {
      setSelectedId(null);
    }
  }, [nodes, selectedId]);

  const selected = selectedId
    ? (nodes.find((n) => n.id === selectedId) ?? null)
    : null;
  const selectedSlug = selectedId ? slugMap[selectedId] : undefined;

  const onNavigate = useCallback(
    (slug: string) => {
      router.push(`/profile/${slug}` as Route);
    },
    [router],
  );

  return (
    <div className={`relative isolate overflow-hidden ${className}`}>
      <GraphCanvas
        ref={canvasRef}
        nodes={nodes}
        edges={edges}
        slugMap={slugMap}
        selectedId={selectedId}
        onSelect={setSelectedId}
        onNavigate={onNavigate}
        className="absolute inset-0 z-0 h-full w-full"
      />
      {nodes.length > 0 ? (
        <GraphControls
          onZoomIn={() => canvasRef.current?.zoomIn()}
          onZoomOut={() => canvasRef.current?.zoomOut()}
          onFit={() => {
            setSelectedId(null);
            canvasRef.current?.fit();
          }}
        />
      ) : null}
      {selected ? (
        <NodeActionCard
          node={selected}
          slug={selectedSlug}
          onOpenProfile={selectedSlug ? () => onNavigate(selectedSlug) : null}
          onClose={() => setSelectedId(null)}
        />
      ) : null}
    </div>
  );
}

type CanvasProps = {
  nodes: GraphNodeView[];
  edges: GraphEdgeView[];
  slugMap: Record<string, string>;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onNavigate: (slug: string) => void;
  className: string;
};

// One vis-network instance and the effects that keep it in sync with
// nodes / edges / slugMap / selection. The frame above owns layout chrome;
// this component owns the canvas and the imperative handle.
const GraphCanvas = forwardRef<CanvasHandle, CanvasProps>(function GraphCanvas(
  { nodes, edges, slugMap, selectedId, onSelect, onNavigate, className },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const networkRef = useRef<Network | null>(null);
  const nodesRef = useRef<DataSet<{ id: string }> | null>(null);
  const edgesRef = useRef<DataSet<{ id: string }> | null>(null);
  // network.fit() reaches into network.view.fit(), and view doesn't exist
  // until the first frame has rendered. ResizeObserver fires immediately
  // on observe — before any nodes are added — so any fit before this flag
  // flips throws "undefined is not an object (evaluating 'this.view.fit')".
  const readyRef = useRef(false);

  // Latest-prop refs so the network's event handlers — registered once at
  // mount — always see current values without re-binding.
  const slugMapRef = useRef(slugMap);
  slugMapRef.current = slugMap;
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const onNavigateRef = useRef(onNavigate);
  onNavigateRef.current = onNavigate;

  useImperativeHandle(
    ref,
    () => ({
      zoomIn: () => {
        const n = networkRef.current;
        if (!n || !readyRef.current) return;
        try {
          n.moveTo({
            scale: clamp(n.getScale() * ZOOM_STEP, 0.2, 4),
            animation: { duration: 150, easingFunction: "easeInOutCubic" },
          });
        } catch {
          /* same teardown race as fitWithClamp */
        }
      },
      zoomOut: () => {
        const n = networkRef.current;
        if (!n || !readyRef.current) return;
        try {
          n.moveTo({
            scale: clamp(n.getScale() / ZOOM_STEP, 0.2, 4),
            animation: { duration: 150, easingFunction: "easeInOutCubic" },
          });
        } catch {
          /* same teardown race as fitWithClamp */
        }
      },
      fit: () => {
        const n = networkRef.current;
        if (!n || !readyRef.current) return;
        fitWithClamp(n, containerRef.current);
      },
    }),
    [],
  );

  // Mount the network once. All sync to React state happens via the
  // DataSet effects below or the ResizeObserver. Keep this dep list empty
  // so we don't churn the instance on prop changes.
  useEffect(() => {
    if (!containerRef.current) return;
    const nodesDs = new DataSet<{ id: string }>([]);
    const edgesDs = new DataSet<{ id: string }>([]);
    nodesRef.current = nodesDs;
    edgesRef.current = edgesDs;
    const network = new Network(
      containerRef.current,
      { nodes: nodesDs as never, edges: edgesDs as never },
      {
        autoResize: true,
        // Hierarchical L→R reads as a sentence: source on the left, money
        // flows right. Edges sit between, no curve-cross-node overlap. Far
        // more readable than physics for our DAG-shaped investigations.
        layout: {
          hierarchical: {
            enabled: true,
            direction: "LR",
            sortMethod: "directed",
            shakeTowards: "leaves",
            // Generous spacing gives edge labels real room to sit above
            // the arrow without overlapping the next node. The dollar
            // amount is the headline; treat it as primary, not as an
            // afterthought tucked between two boxes. The agent sometimes
            // emits descriptive labels ("Austin PAC support") that are
            // 18+ characters long; the wrapper below splits those over
            // two lines, but the spacing also has to be wide enough that
            // even the wrapped form has room.
            levelSeparation: 320,
            nodeSpacing: 180,
            treeSpacing: 220,
            blockShifting: true,
            edgeMinimization: true,
            parentCentralization: true,
          },
        },
        // Physics off — hierarchical positions are deterministic and we
        // freeze them so panning doesn't drift the layout around.
        physics: { enabled: false },
        interaction: {
          hover: true,
          dragNodes: false,
          dragView: true,
          zoomView: true,
          selectable: true,
          selectConnectedEdges: false,
        },
        nodes: {
          shape: "box",
          margin: { top: 8, bottom: 8, left: 12, right: 12 } as never,
          borderWidth: 1,
          font: {
            face: "ui-sans-serif, system-ui, Inter, Arial, sans-serif",
            color: "#1A1A1A",
            size: 13,
          },
          shadow: false,
          widthConstraint: { maximum: 220 } as never,
        },
        edges: {
          color: { color: "#5C5C58", highlight: "#8B1A1A" },
          arrows: { to: { enabled: true, scaleFactor: 0.55 } },
          font: {
            face: "ui-monospace, SF Mono, Menlo, monospace",
            color: "#1A1A1A",
            size: 13,
            // Solid white background + a fat stroke = a real plate behind
            // the text, not an outline that gets punched through by an
            // arrow head. vis-network's edge rendering can draw the arrow
            // *over* the label in some configurations; vadjust below
            // sidesteps the whole problem by lifting the text off the line.
            background: "#FFFFFF",
            strokeWidth: 4,
            strokeColor: "#FFFFFF",
            // Horizontal keeps the dollar amount upright regardless of
            // edge angle. 'middle' (the default) rotates it to follow the
            // edge, which renders tiny and sideways on diagonal segments.
            align: "horizontal",
            // Lift the label above the arrow line in screen-space. The
            // arrow now passes underneath the label rather than through
            // the middle of every glyph, which was the unreadable case.
            vadjust: -14,
          },
          // 'continuous' draws nearly straight L→R lines for hierarchical
          // layouts and only bows around obstacles. Cleaner than cubicBezier
          // for our DAG-shaped investigations and keeps labels close to the
          // visual midpoint of the edge.
          smooth: {
            enabled: true,
            type: "continuous",
            roundness: 0.5,
          } as never,
        },
      },
    );
    networkRef.current = network;

    network.on("click", (params: { nodes: Array<string | number> }) => {
      const id = params.nodes?.[0];
      if (id == null) {
        onSelectRef.current(null);
        return;
      }
      onSelectRef.current(String(id));
    });
    network.on("doubleClick", (params: { nodes: Array<string | number> }) => {
      const id = params.nodes?.[0];
      if (id == null) return;
      const slug = slugMapRef.current[String(id)];
      if (slug) onNavigateRef.current(slug);
    });
    network.on("hoverNode", (params: { node: string | number }) => {
      const slug = slugMapRef.current[String(params.node)];
      if (containerRef.current) {
        containerRef.current.style.cursor = slug ? "pointer" : "grab";
      }
    });
    network.on("blurNode", () => {
      if (containerRef.current) containerRef.current.style.cursor = "grab";
    });
    network.once("afterDrawing", () => {
      readyRef.current = true;
      fitWithClamp(network, containerRef.current);
    });

    // Refit on container resize so the inline → modal transition (or any
    // window resize) doesn't leave the graph anchored to a stale viewport.
    const ro = new ResizeObserver(() => {
      if (networkRef.current !== network || !readyRef.current) return;
      if ((nodesRef.current?.length ?? 0) === 0) return;
      fitWithClamp(network, containerRef.current);
    });
    if (containerRef.current) ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      readyRef.current = false;
      network.destroy();
      networkRef.current = null;
      nodesRef.current = null;
      edgesRef.current = null;
    };
  }, []);

  // Reconcile the DataSet with the React props on every change. Walk the
  // desired set, drop ids no longer wanted, then add or update the rest.
  // Cheap; the graph never has more than ~20 nodes.
  useEffect(() => {
    const ds = nodesRef.current;
    if (!ds) return;
    const wanted = new Set(nodes.map((n) => n.id));
    const existingIds = ds.getIds().map(String);
    for (const id of existingIds) {
      if (!wanted.has(id)) ds.remove(id);
    }
    const existing = new Set(existingIds.filter((id) => wanted.has(id)));
    for (const n of nodes) {
      const colors = NODE_COLORS[n.kind];
      const linkable = !!slugMap[n.id];
      const isSelected = n.id === selectedId;
      const update = {
        id: n.id,
        label: n.label,
        title: n.sublabel ?? undefined,
        color: {
          background: isSelected ? "#FFFFFF" : colors.bg,
          border: colors.border,
          highlight: { background: "#FFFFFF", border: colors.border },
        },
        borderWidth: isSelected ? 3 : linkable ? 2 : 1,
        font: {
          face: "ui-sans-serif, system-ui, Inter, Arial, sans-serif",
          color: "#1A1A1A",
          size: 13,
        },
      } as Record<string, unknown>;
      if (existing.has(n.id)) {
        ds.update(update as never);
      } else {
        ds.add(update as never);
      }
    }
    // Refit when the node set actually changes shape; selection-only
    // updates skip this so we don't yank the viewport around on click.
    const network = networkRef.current;
    if (network && readyRef.current && nodes.length > 0) {
      const sizeChanged = existingIds.length !== nodes.length;
      if (sizeChanged) {
        requestAnimationFrame(() =>
          fitWithClamp(network, containerRef.current),
        );
      }
    }
  }, [nodes, slugMap, selectedId]);

  useEffect(() => {
    const ds = edgesRef.current;
    if (!ds) return;
    const wanted = new Set(edges.map((e) => `${e.from}->${e.to}`));
    for (const id of ds.getIds().map(String)) {
      if (!wanted.has(id)) ds.remove(id);
    }
    const existing = new Set(ds.getIds().map(String));
    for (const e of edges) {
      const id = `${e.from}->${e.to}`;
      if (existing.has(id)) continue;
      ds.add({
        id,
        from: e.from,
        to: e.to,
        label: wrapEdgeLabel(e.label ?? ""),
        width: e.weight ? Math.max(1, Math.log10(e.weight) - 2) : 1,
      } as never);
    }
  }, [edges]);

  return <div ref={containerRef} className={className} />;
});

type ControlsProps = {
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFit: () => void;
};

function GraphControls({ onZoomIn, onZoomOut, onFit }: ControlsProps) {
  return (
    <div
      role="toolbar"
      aria-label="Graph zoom controls"
      // Inline position to bypass a Tailwind HMR weirdness where
      // `absolute bottom-3 right-3` rendered at top-left in this file.
      // Colors/borders still come from Tailwind tokens.
      style={{
        position: "absolute",
        right: 12,
        bottom: 12,
        zIndex: 10,
      }}
      className="pointer-events-auto flex flex-col overflow-hidden rounded-lg border border-ink/10 bg-white/95 shadow-[0_4px_14px_rgba(26,26,26,0.08)] backdrop-blur"
    >
      <ControlButton label="Zoom in" onClick={onZoomIn}>
        <PlusGlyph />
      </ControlButton>
      <Divider />
      <ControlButton label="Zoom out" onClick={onZoomOut}>
        <MinusGlyph />
      </ControlButton>
      <Divider />
      <ControlButton label="Fit graph to view" onClick={onFit}>
        <FitGlyph />
      </ControlButton>
    </div>
  );
}

function Divider() {
  return (
    <div
      aria-hidden
      style={{ height: 1, background: "rgba(26,26,26,0.08)" }}
    />
  );
}

function ControlButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      style={{ width: 24, height: 24 }}
      className="group flex items-center justify-center text-ink/70 transition-colors hover:bg-page hover:text-ink"
    >
      {children}
    </button>
  );
}

// Three matched icons. Same viewBox, stroke width, line cap, and visual
// weight so the toolbar reads as one coherent control rather than three
// random glyphs (which is how text +/− next to an SVG felt before).

function PlusGlyph() {
  return (
    <svg
      viewBox="0 0 16 16"
      width="10"
      height="10"
      aria-hidden
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
    >
      <line x1="8" y1="4" x2="8" y2="12" />
      <line x1="4" y1="8" x2="12" y2="8" />
    </svg>
  );
}

function MinusGlyph() {
  return (
    <svg
      viewBox="0 0 16 16"
      width="10"
      height="10"
      aria-hidden
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
    >
      <line x1="4" y1="8" x2="12" y2="8" />
    </svg>
  );
}

function FitGlyph() {
  return (
    <svg
      viewBox="0 0 16 16"
      width="10"
      height="10"
      aria-hidden
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3.5 6 V3.5 H6" />
      <path d="M10 3.5 H12.5 V6" />
      <path d="M12.5 10 V12.5 H10" />
      <path d="M6 12.5 H3.5 V10" />
    </svg>
  );
}

type ActionCardProps = {
  node: GraphNodeView;
  slug?: string;
  onOpenProfile: (() => void) | null;
  onClose: () => void;
};

function NodeActionCard({
  node,
  slug,
  onOpenProfile,
  onClose,
}: ActionCardProps) {
  const colors = NODE_COLORS[node.kind];
  return (
    <div
      role="dialog"
      aria-label={`${node.label} actions`}
      // Inline positioning for the same reason as GraphControls: bypass
      // the upstream class-collision that pushed both overlays to the
      // top-left. Color tokens stay on Tailwind.
      style={{
        position: "absolute",
        left: 12,
        bottom: 12,
        zIndex: 10,
        width: 280,
        maxWidth: "calc(100% - 1.5rem)",
      }}
      className="pointer-events-auto rounded-md border border-ink/15 bg-page p-3 shadow-lg"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-2">
            <span
              aria-hidden
              className="inline-block h-2.5 w-2.5 rounded-sm"
              style={{
                background: colors.bg,
                borderColor: colors.border,
                borderWidth: 1,
                borderStyle: "solid",
              }}
            />
            <span className="font-mono text-[10px] uppercase tracking-wider text-muted">
              {KIND_LABEL[node.kind]}
            </span>
          </div>
          <p
            className="truncate text-[14px] font-medium text-ink"
            title={node.label}
          >
            {node.label}
          </p>
          {node.sublabel ? (
            <p className="text-[12px] leading-snug text-muted">
              {node.sublabel}
            </p>
          ) : null}
        </div>
        <button
          type="button"
          aria-label="Close selection"
          onClick={onClose}
          className="-mr-1 -mt-1 flex h-6 w-6 items-center justify-center rounded-sm font-mono text-[16px] leading-none text-muted hover:bg-white hover:text-ink"
        >
          ×
        </button>
      </div>
      <div className="mt-3">
        {onOpenProfile ? (
          <button
            type="button"
            onClick={onOpenProfile}
            className="rounded-sm bg-ink px-2.5 py-1.5 font-mono text-[11px] uppercase tracking-wider text-white transition-colors hover:bg-accent"
          >
            Open profile →
          </button>
        ) : (
          <span
            className="rounded-sm border border-dashed border-rule px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-wider text-muted"
            title="No profile is registered for this entity"
          >
            No profile
          </span>
        )}
      </div>
      {slug && onOpenProfile ? (
        <p className="mt-2 font-mono text-[10px] text-muted">
          Double-click the node to open.
        </p>
      ) : null}
    </div>
  );
}

type ModalProps = {
  nodes: GraphNodeView[];
  edges: GraphEdgeView[];
  slugMap: Record<string, string>;
  onClose: () => void;
};

// Portal-mounted fullscreen variant. Same GraphFrame inside, just bigger,
// wrapped in a dim backdrop that closes on click. Rendered to document.body
// via a portal so the modal escapes the report's max-width column.
function GraphModal({ nodes, edges, slugMap, onClose }: ModalProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const onBackdrop = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.target === e.currentTarget) onClose();
    },
    [onClose],
  );
  if (!mounted) return null;
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Evidence graph (expanded)"
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/60 px-4 py-6"
      onClick={onBackdrop}
    >
      <div className="flex h-full max-h-[92vh] w-full max-w-[1200px] flex-col rounded-md border border-rule bg-page shadow-2xl">
        <div className="flex items-center justify-between border-b border-rule px-4 py-3">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted">
            Evidence graph
          </p>
          <button
            type="button"
            onClick={onClose}
            className="rounded-sm border border-rule px-2 py-1 font-mono text-[11px] uppercase tracking-wider text-muted hover:border-ink hover:text-ink"
          >
            Close · esc
          </button>
        </div>
        <GraphFrame
          nodes={nodes}
          edges={edges}
          slugMap={slugMap}
          className="h-full w-full bg-white"
        />
      </div>
    </div>,
    document.body,
  );
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

// Edge labels are usually short ("$3.2M", "supports", "registers") but the
// agent occasionally emits descriptive phrases ("Austin PAC support",
// "State caucus checks") that physically overflow the available edge
// length and bleed into the destination node. Break those onto two lines
// at the space nearest the midpoint. Untouched if the label is short or
// has no breakable space.
const EDGE_LABEL_WRAP_AT = 14;
function wrapEdgeLabel(label: string): string {
  if (label.length <= EDGE_LABEL_WRAP_AT) return label;
  const mid = Math.floor(label.length / 2);
  let breakAt = -1;
  for (let i = 0; i < label.length; i++) {
    if (label[i] !== " ") continue;
    if (breakAt === -1 || Math.abs(i - mid) < Math.abs(breakAt - mid)) {
      breakAt = i;
    }
  }
  if (breakAt < 0) return label;
  return `${label.slice(0, breakAt)}\n${label.slice(breakAt + 1)}`;
}

// Fit the graph by computing the scale ourselves from node positions and
// the live container size. We aim for the graph to occupy ~78% of the
// smaller container axis, then clamp to keep small and large graphs both
// readable. This replaces vis-network's `fit()`, which fights us with a
// fixed margin that leaves sparse graphs at ~30% of a modal viewport.
//
// Guarded with try/catch because vis's view module can briefly be
// undefined during teardown or rapid mount/unmount cycles (e.g. modal
// open/close racing the ResizeObserver). Throwing there blanks the canvas.
function fitWithClamp(network: Network, container: HTMLDivElement | null): void {
  if (!container) return;
  try {
    const positions = network.getPositions();
    const ids = Object.keys(positions);
    if (ids.length === 0) return;
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const id of ids) {
      const p = positions[id];
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
    const rect = container.getBoundingClientRect();
    if (rect.width < 50 || rect.height < 50) return;
    const graphWidth = maxX - minX + FIT_PAD_X * 2;
    const graphHeight = maxY - minY + FIT_PAD_Y * 2;
    const scaleX = (rect.width * TARGET_FILL_RATIO) / graphWidth;
    const scaleY = (rect.height * TARGET_FILL_RATIO) / graphHeight;
    const targetScale = clamp(
      Math.min(scaleX, scaleY),
      MIN_FIT_ZOOM,
      MAX_FIT_ZOOM,
    );
    network.moveTo({
      scale: targetScale,
      position: { x: (minX + maxX) / 2, y: (minY + maxY) / 2 },
      animation: false,
    });
  } catch {
    // intentional: a fit during teardown is a no-op, not an error worth
    // surfacing to the user.
  }
}

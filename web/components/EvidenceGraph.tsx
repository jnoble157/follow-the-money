"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
  // Map of node id → profile slug for "follow the money" click-through.
  // Merged with any `profileSlug` already on the node objects; the prop wins.
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

export function EvidenceGraph({ nodes, edges, nodeIdToProfileSlug }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const networkRef = useRef<Network | null>(null);
  const nodesRef = useRef<DataSet<{ id: string }> | null>(null);
  const edgesRef = useRef<DataSet<{ id: string }> | null>(null);
  const router = useRouter();
  // Effective slug map: per-node `profileSlug` plus the optional override prop.
  const slugMap = useMemo(() => {
    const m: Record<string, string> = {};
    for (const n of nodes) if (n.profileSlug) m[n.id] = n.profileSlug;
    if (nodeIdToProfileSlug) Object.assign(m, nodeIdToProfileSlug);
    return m;
  }, [nodes, nodeIdToProfileSlug]);
  // Latest slug map kept in a ref so the network's click handler (bound once)
  // always reads the current snapshot.
  const slugMapRef = useRef(slugMap);
  slugMapRef.current = slugMap;

  const hasLinkable = Object.keys(slugMap).length > 0;
  const [hintDismissed, setHintDismissed] = useState(false);

  useEffect(() => {
    if (!containerRef.current) return;
    const nodesDs = new DataSet<{ id: string }>([]);
    const edgesDs = new DataSet<{ id: string }>([]);
    nodesRef.current = nodesDs;
    edgesRef.current = edgesDs;
    const network = new Network(
      containerRef.current,
      // vis-network types over DataSet are awkward; cast at the boundary.
      { nodes: nodesDs as never, edges: edgesDs as never },
      {
        autoResize: true,
        physics: {
          stabilization: { iterations: 80, fit: true },
          barnesHut: {
            gravitationalConstant: -2400,
            springLength: 110,
            springConstant: 0.06,
            damping: 0.6,
          },
        },
        interaction: {
          hover: true,
          dragNodes: true,
          dragView: true,
          zoomView: true,
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
        },
        edges: {
          color: { color: "#5C5C58", highlight: "#8B1A1A" },
          arrows: { to: { enabled: true, scaleFactor: 0.5 } },
          font: {
            face: "ui-monospace, SF Mono, Menlo, monospace",
            color: "#1A1A1A",
            size: 11,
            background: "rgba(250, 250, 247, 0.85)",
            strokeWidth: 0,
          },
          smooth: { type: "dynamic", roundness: 0.4 } as never,
        },
      },
    );
    networkRef.current = network;

    // Click → /profile/<slug> when the node maps to a known profile. Hover
    // changes the cursor to communicate the affordance.
    network.on("click", (params: { nodes: Array<string | number> }) => {
      const id = params.nodes?.[0];
      if (id == null) return;
      const slug = slugMapRef.current[String(id)];
      if (!slug) return;
      router.push(`/profile/${slug}` as Route);
    });
    network.on("hoverNode", (params: { node: string | number }) => {
      const slug = slugMapRef.current[String(params.node)];
      if (containerRef.current) {
        containerRef.current.style.cursor = slug ? "pointer" : "default";
      }
    });
    network.on("blurNode", () => {
      if (containerRef.current) containerRef.current.style.cursor = "default";
    });

    return () => {
      network.destroy();
      networkRef.current = null;
      nodesRef.current = null;
      edgesRef.current = null;
    };
  }, [router]);

  // Sync nodes — re-applies styling when the slug map changes so newly
  // linkable nodes get the heavier border without rebuilding the DataSet.
  useEffect(() => {
    const ds = nodesRef.current;
    if (!ds) return;
    const existing = new Set(ds.getIds().map(String));
    for (const n of nodes) {
      const colors = NODE_COLORS[n.kind];
      const linkable = !!slugMap[n.id];
      const update = {
        id: n.id,
        label: n.sublabel ? `${n.label}\n${n.sublabel}` : n.label,
        color: { background: colors.bg, border: colors.border },
        borderWidth: linkable ? 2 : 1,
        font: {
          face: "ui-sans-serif, system-ui, Inter, Arial, sans-serif",
          color: "#1A1A1A",
          size: 13,
          ...(linkable
            ? { multi: "html" as const }
            : {}),
        },
      } as Record<string, unknown>;
      if (existing.has(n.id)) {
        ds.update(update as never);
      } else {
        ds.add(update as never);
      }
    }
  }, [nodes, slugMap]);

  useEffect(() => {
    const ds = edgesRef.current;
    if (!ds) return;
    const existing = new Set(ds.getIds().map(String));
    for (const e of edges) {
      const id = `${e.from}->${e.to}`;
      if (existing.has(id)) continue;
      ds.add({
        id,
        from: e.from,
        to: e.to,
        label: e.label ?? "",
        width: e.weight ? Math.max(1, Math.log10(e.weight) - 2) : 1,
      } as never);
    }
  }, [edges]);

  return (
    <div className="space-y-2">
      <h2 className="font-mono text-[11px] uppercase tracking-wider text-muted">
        Evidence graph
      </h2>
      <div
        ref={containerRef}
        className="h-[320px] w-full rounded-md border border-rule bg-white"
      />
      {nodes.length === 0 ? (
        <p className="text-[12px] text-muted">
          Donors, filers, PACs, and lobbyists are added here as the agent
          discovers them.
        </p>
      ) : (
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="font-mono text-[11px] text-muted">
            {nodes.length} nodes · {edges.length} edges
          </p>
          {hasLinkable && !hintDismissed ? (
            <button
              type="button"
              onClick={() => setHintDismissed(true)}
              className="font-mono text-[11px] text-accent hover:text-ink"
            >
              Click a bordered node to open its profile · dismiss
            </button>
          ) : null}
        </div>
      )}
    </div>
  );
}

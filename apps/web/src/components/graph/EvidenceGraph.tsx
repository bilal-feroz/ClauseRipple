"use client";

import {
  Background,
  Controls,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useMemo, useState } from "react";
import { LABEL_STYLE, REL_LABEL, STATUS_COLOR, type NodeStatus } from "@/lib/graph-style";
import { layoutGraph } from "@/lib/layout3d";
import type { EvidenceBundle, GraphSnapshot, PathNode, Verdict } from "@/lib/types";
import { ShapeGlyph } from "./RippleSpace";

type CardData = { label: string; name: string; status: NodeStatus; sub?: string };

function Card({ data }: NodeProps<Node<CardData>>) {
  const color = data.status === "neutral" ? "#2a3544" : STATUS_COLOR[data.status];
  return (
    <div
      className="min-w-[132px] max-w-[190px] rounded-lg border bg-ink-850 px-2.5 py-1.5 shadow-lg"
      style={{ borderColor: color, boxShadow: data.status !== "neutral" ? `0 0 18px -6px ${color}` : undefined }}
    >
      <Handle type="target" position={Position.Left} className="!h-1.5 !w-1.5 !border-0 !bg-slate-600" />
      <div className="flex items-center gap-1.5 text-[9.5px] font-semibold uppercase tracking-wider text-fog">
        <ShapeGlyph label={data.label} color={data.status === "neutral" ? "#94a3b8" : color} />
        {LABEL_STYLE[data.label]?.title ?? data.label}
      </div>
      <div className="mt-0.5 text-[12px] font-medium leading-tight text-snow">{data.name}</div>
      {data.sub && <div className="mt-0.5 text-[10.5px] leading-tight text-fog">{data.sub}</div>}
      <Handle type="source" position={Position.Right} className="!h-1.5 !w-1.5 !border-0 !bg-slate-600" />
    </div>
  );
}

function Note({ data }: NodeProps<Node<{ text: string }>>) {
  return (
    <div className="max-w-[260px] rounded-lg border border-dashed border-safe/50 bg-ink-850/90 px-3 py-2 text-[11px] text-mist">
      <Handle type="target" position={Position.Left} className="!opacity-0" />
      {data.text}
    </div>
  );
}

const nodeTypes = { card: Card, note: Note };

type EdgeInfo = { type: string; quote?: string | null; src?: string | null; line?: number | null };

export function EvidenceGraph({
  bundle,
  verdict,
  vendorName,
}: {
  bundle: EvidenceBundle | undefined;
  verdict: Verdict | undefined;
  vendorName: string;
}) {
  const [picked, setPicked] = useState<EdgeInfo | null>(null);

  const { nodes, edges } = useMemo(() => buildEvidence(bundle, verdict, vendorName), [bundle, verdict, vendorName]);

  if (!bundle || !verdict) {
    return <div className="flex h-full items-center justify-center text-sm text-fog">Select a customer to see its evidence graph.</div>;
  }
  return (
    <div className="relative h-full w-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.18 }}
        minZoom={0.3}
        proOptions={{ hideAttribution: true }}
        nodesDraggable={false}
        nodesConnectable={false}
        onEdgeClick={(_, e) => setPicked((e.data as EdgeInfo) ?? null)}
      >
        <Background color="#1b2430" gap={28} />
        <Controls showInteractive={false} position="bottom-right" />
      </ReactFlow>
      <div className="pointer-events-none absolute left-3 top-3 rounded-md border border-line bg-ink-900/85 px-2.5 py-1.5 text-[11px] text-mist">
        <span className="font-semibold text-snow">{verdict.customer_name}</span> · {verdict.reason}
      </div>
      {picked && (
        <div className="absolute bottom-3 left-3 max-w-[70%] rounded-lg border border-line-strong bg-ink-900/95 p-3 text-[12px] shadow-xl" role="status">
          <div className="eyebrow mb-1">
            {picked.type} · {picked.src}
            {picked.line ? `:L${picked.line}` : ""}
          </div>
          <p className="text-snow">“{picked.quote ?? "Derived edge (no direct quote)"}”</p>
          <button type="button" onClick={() => setPicked(null)} className="pointer-events-auto mt-2 text-[11px] text-signal hover:underline">
            Close
          </button>
        </div>
      )}
    </div>
  );
}

function buildEvidence(bundle: EvidenceBundle | undefined, verdict: Verdict | undefined, vendorName: string) {
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  if (!bundle || !verdict) return { nodes, edges };
  const impacted = verdict.affected;
  const allowed = new Set(verdict.allowed_regions);
  const dx = 220;
  const statusFor = (n: PathNode): NodeStatus => {
    if (n.label === "Customer") return impacted ? "impacted" : "safe";
    if (n.label === "Vendor") return verdict.dependency_path_exists ? "changed" : "neutral";
    if (n.label === "Obligation") return impacted ? "impacted" : "safe";
    return impacted && ["Product", "System"].includes(n.label) ? "impacted" : "neutral";
  };
  const add = (n: PathNode, x: number, y: number, sub?: string) => {
    if (nodes.some((m) => m.id === n.id)) return;
    nodes.push({ id: n.id, type: "card", position: { x, y }, data: { label: n.label, name: n.name, status: statusFor(n), sub } });
  };
  const edge = (id: string, source: string, target: string, info: EdgeInfo, color: string, opts: Partial<Edge> = {}) =>
    edges.push({
      id,
      source,
      target,
      label: REL_LABEL[info.type] ?? info.type,
      data: info,
      style: { stroke: color, strokeWidth: 1.8 },
      labelStyle: { fill: "#b9c4d2", fontSize: 10 },
      labelBgStyle: { fill: "#0b0f15" },
      markerEnd: { type: MarkerType.ArrowClosed, color },
      ...opts,
    });

  const dep = bundle.dependency_paths[0];
  const con = bundle.contract_paths.length ? bundle.contract_paths : [];
  const customer = dep?.nodes[0] ?? con[0]?.nodes[0];
  if (customer) add(customer, 0, 125);

  if (dep) {
    dep.nodes.slice(1).forEach((n, i) => add(n, (i + 1) * dx, 0));
    dep.nodes.slice(1).forEach((n, i) => {
      const e = dep.edges[i];
      edge(`dep-${i}`, dep.nodes[i].id, n.id, { type: e.type ?? "", quote: e.quote, src: e.src, line: e.line }, impacted ? "#f87171" : "#475569", {
        animated: impacted,
      });
    });
  } else {
    nodes.push({
      id: "no-path",
      type: "note",
      position: { x: dx, y: -10 },
      data: { text: `No dependency path to ${vendorName}. ${bundle.no_path_proof ?? ""}` },
    });
    edges.push({ id: "no-path-e", source: customer?.id ?? "", target: "no-path", style: { stroke: "#22c55e", strokeDasharray: "4 4" } });
  }

  // contract path(s): one row per allowed region path; nodes de-duplicated
  const contract = con[0];
  if (contract) {
    contract.nodes.slice(1, -1).forEach((n, i) => add(n, (i + 1) * dx, 250));
    contract.nodes.slice(1, -1).forEach((n, i) => {
      const e = contract.edges[i];
      edge(`con-${i}`, contract.nodes[i].id, n.id, { type: e.type ?? "", quote: e.quote, src: e.src, line: e.line }, "#64748b");
    });
  }

  // regions column
  const regionX = 4 * dx + 60;
  const regions = [...bundle.vendor_regions].sort((a, b) => a.code.localeCompare(b.code));
  const allRegionCodes = new Set([...regions.map((r) => r.code), ...allowed]);
  const regionIds = new Map<string, string>();
  [...allRegionCodes].sort().forEach((code, i) => {
    const r = regions.find((x) => x.code === code);
    const id = r?.region_id ?? `region:${code.toLowerCase()}`;
    regionIds.set(code, id);
    const bad = verdict.violating_regions.includes(code);
    nodes.push({
      id,
      type: "card",
      position: { x: regionX, y: -40 + i * 135 },
      data: {
        label: "DataRegion",
        name: r?.name ?? code,
        status: bad ? "impacted" : r?.change_id ? "changed" : allowed.has(code) ? "safe" : "neutral",
        sub: bad ? "not allowed by contract" : allowed.has(code) ? "allowed by contract" : undefined,
      },
    });
  });

  const vendorNode = dep?.nodes[dep.nodes.length - 1];
  if (vendorNode) {
    for (const r of regions) {
      const isNew = !!r.change_id;
      edge(
        `pi-${r.code}`,
        vendorNode.id,
        r.region_id,
        { type: "PROCESSES_IN", quote: r.quote, src: r.src, line: r.line },
        isNew ? "#f59e0b" : "#475569",
        { animated: isNew, label: isNew ? "processes in (NEW v2)" : "processes in" },
      );
    }
  }
  const obligation = contract?.nodes[contract.nodes.length - 2];
  if (obligation) {
    for (const code of allowed) {
      const target = regionIds.get(code);
      if (!target) continue;
      const path = bundle.contract_paths.find((p) => p.nodes[p.nodes.length - 1].id === target);
      const last = path?.edges[path.edges.length - 1];
      edge(`allows-${code}`, obligation.id, target, { type: "ALLOWS", quote: last?.quote, src: last?.src, line: last?.line }, "#22c55e");
    }
    for (const code of verdict.violating_regions) {
      const target = regionIds.get(code);
      if (!target) continue;
      edges.push({
        id: `conflict-${code}`,
        source: obligation.id,
        target,
        label: `✕ ${code} not allowed`,
        style: { stroke: "#ef4444", strokeWidth: 2, strokeDasharray: "6 4" },
        labelStyle: { fill: "#fecaca", fontSize: 10.5, fontWeight: 600 },
        labelBgStyle: { fill: "#2a0f12" },
        data: { type: "CONFLICT", quote: verdict.reason },
      });
    }
  }
  return { nodes, edges };
}

/** Whole-graph 2D view (used as the WebGL fallback): same semantic layout, projected to 2D. */
export function WholeGraph2D({ graph, statuses }: { graph: GraphSnapshot | undefined; statuses: Map<string, NodeStatus> }) {
  const { nodes, edges } = useMemo(() => {
    if (!graph) return { nodes: [] as Node[], edges: [] as Edge[] };
    const visible = graph.nodes.filter((n) => n.label !== "Action");
    const ids = new Set(visible.map((n) => n.id));
    const es = graph.edges.filter((e) => ids.has(e.source) && ids.has(e.target));
    const pos = layoutGraph(visible, es);
    const ns: Node[] = visible.flatMap((n) => {
      const p = pos.get(n.id);
      if (!p) return [];
      return [
        {
          id: n.id,
          type: "card",
          position: { x: p[0] * 70, y: -p[1] * 95 + p[2] * 34 },
          data: { label: n.label, name: n.label === "DataRegion" ? n.code ?? n.name : n.ref ?? n.name, status: statuses.get(n.id) ?? "neutral" },
        },
      ];
    });
    const ed: Edge[] = es.map((e) => {
      const hot = (statuses.get(e.source) ?? "neutral") !== "neutral" && (statuses.get(e.target) ?? "neutral") !== "neutral";
      return { id: e.id, source: e.source, target: e.target, style: { stroke: hot ? "#f87171" : "#334155", strokeWidth: hot ? 1.8 : 1 } };
    });
    return { nodes: ns, edges: ed };
  }, [graph, statuses]);
  return (
    <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} fitView minZoom={0.1} proOptions={{ hideAttribution: true }} nodesDraggable={false}>
      <Background color="#1b2430" gap={28} />
      <Controls showInteractive={false} position="bottom-right" />
    </ReactFlow>
  );
}

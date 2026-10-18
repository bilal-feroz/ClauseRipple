"use client";

import {
  Background,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  useNodesInitialized,
  useReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Building2, Cloud, Cog, FileText, Landmark, MapPin, ShieldCheck, Store, type LucideIcon } from "lucide-react";
import { useEffect, useMemo } from "react";
import type { NodeStatus } from "@/lib/graph-style";
import type { GraphSnapshot, ImpactAnalysis } from "@/lib/types";
import { cn } from "@/lib/utils";
import { plainVerdict } from "./plain";

type Tone = "neutral" | "change" | "flow" | "impact" | "safe" | "muted";

const TONE: Record<Tone, { border: string; glow: string; icon: string; title: string }> = {
  neutral: { border: "border-slate-600/60", glow: "", icon: "text-sky-300", title: "text-snow" },
  change: { border: "border-amber-400", glow: "shadow-[0_0_28px_-6px_rgba(245,158,11,0.75)]", icon: "text-amber-300", title: "text-snow" },
  flow: { border: "border-orange-400/80", glow: "shadow-[0_0_22px_-8px_rgba(251,146,60,0.7)]", icon: "text-orange-300", title: "text-snow" },
  impact: { border: "border-red-500", glow: "shadow-[0_0_30px_-6px_rgba(239,68,68,0.8)]", icon: "text-red-400", title: "text-snow" },
  safe: { border: "border-emerald-500/80", glow: "shadow-[0_0_24px_-8px_rgba(34,197,94,0.6)]", icon: "text-emerald-400", title: "text-snow" },
  muted: { border: "border-dashed border-slate-600/60", glow: "", icon: "text-slate-500", title: "text-mist" },
};

const EDGE_COLOR: Record<Tone, string> = {
  neutral: "#475569",
  change: "#f59e0b",
  flow: "#fb923c",
  impact: "#ef4444",
  safe: "#22c55e",
  muted: "#334155",
};

type CardData = { icon: LucideIcon; title: string; sub?: string; tone: Tone; clickable?: boolean };
type HeaderData = { text: string };

function Card({ data }: NodeProps<Node<CardData>>) {
  const t = TONE[data.tone];
  const Icon = data.icon;
  return (
    <div
      className={cn(
        "flex h-full w-full items-center gap-3 rounded-xl border-2 bg-ink-850/95 px-3 py-2 transition-[border-color,box-shadow] duration-500",
        t.border,
        t.glow,
        data.clickable && "cursor-pointer hover:brightness-125",
      )}
    >
      <Handle id="l" type="target" position={Position.Left} className="!h-1 !w-1 !border-0 !bg-transparent" />
      <Handle id="t" type="target" position={Position.Top} className="!h-1 !w-1 !border-0 !bg-transparent" />
      <Icon className={cn("h-6 w-6 shrink-0 transition-colors duration-500", t.icon)} />
      <div className="min-w-0">
        <div className={cn("truncate text-[15px] font-semibold leading-tight", t.title)}>{data.title}</div>
        {data.sub && <div className="mt-0.5 line-clamp-2 text-[12.5px] leading-snug text-mist">{data.sub}</div>}
      </div>
      <Handle id="r" type="source" position={Position.Right} className="!h-1 !w-1 !border-0 !bg-transparent" />
      <Handle id="b" type="source" position={Position.Bottom} className="!h-1 !w-1 !border-0 !bg-transparent" />
    </div>
  );
}

function Header({ data }: NodeProps<Node<HeaderData>>) {
  return <div className="w-full text-center text-[12px] font-semibold uppercase tracking-[0.16em] text-slate-400">{data.text}</div>;
}

const nodeTypes = { card: Card, header: Header };
const CARD_W = 244;
const CARD_H = 74;

/** Re-fit the view whenever the diagram's content changes (new region, statuses), without remounting. */
function AutoFit({ signature }: { signature: string }) {
  const { fitView } = useReactFlow();
  const ready = useNodesInitialized();
  useEffect(() => {
    if (!ready) return;
    const id = requestAnimationFrame(() => void fitView({ padding: 0.1, duration: 400 }));
    return () => cancelAnimationFrame(id);
  }, [signature, ready, fitView]);
  return null;
}

function toneOf(status: NodeStatus | undefined): Tone {
  switch (status) {
    case "changed":
    case "new":
      return "change";
    case "traversed":
    case "downstream":
      return "flow";
    case "impacted":
    case "case":
      return "impact";
    case "safe":
      return "safe";
    default:
      return "neutral";
  }
}

const SEGMENT_ICON: Record<string, LucideIcon> = {
  Banking: Landmark,
  Insurance: ShieldCheck,
  Retail: Store,
  Government: Building2,
};

export function ImpactFlow({
  impact,
  graph,
  statuses,
  updated,
  showVerdicts,
  onSelectCustomer,
}: {
  impact: ImpactAnalysis | undefined;
  graph: GraphSnapshot | undefined;
  statuses: Map<string, NodeStatus>;
  updated: boolean;
  showVerdicts: boolean;
  onSelectCustomer: (id: string) => void;
}) {
  const { nodes, edges, key } = useMemo(() => build(impact, graph, statuses, updated, showVerdicts), [impact, graph, statuses, updated, showVerdicts]);
  if (!impact || !graph) {
    return <div className="flex h-full items-center justify-center text-sm text-fog">Loading the company map…</div>;
  }
  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      fitView
      fitViewOptions={{ padding: 0.12 }}
      minZoom={0.3}
      maxZoom={1.4}
      proOptions={{ hideAttribution: true }}
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable={false}
      panOnDrag={false}
      zoomOnScroll={false}
      zoomOnPinch={false}
      zoomOnDoubleClick={false}
      onNodeClick={(_, n) => {
        if (n.id.startsWith("customer:")) onSelectCustomer(n.id);
      }}
    >
      <Background color="#1b2430" gap={26} />
      <AutoFit signature={key} />
    </ReactFlow>
  );
}

function build(
  impact: ImpactAnalysis | undefined,
  graph: GraphSnapshot | undefined,
  statuses: Map<string, NodeStatus>,
  updated: boolean,
  showVerdicts: boolean,
) {
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  if (!impact || !graph) return { nodes, edges, key: "empty" };
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const X = { vendor: 0, system: 280, product: 560, customer: 840 };
  const ROW = 104;

  // Group customers that share a product so their branches never cross or overlap.
  const groups = new Map<string, typeof impact.verdicts>();
  for (const v of impact.verdicts.filter((x) => x.routes.length > 0)) {
    const k = v.routes[0].product_id;
    groups.set(k, [...(groups.get(k) ?? []), v]);
  }
  const connected = [...groups.values()].flat();
  const unconnected = impact.verdicts.filter((v) => v.routes.length === 0);
  const yOf = new Map<string, number>();
  connected.forEach((v, i) => yOf.set(v.customer_id, i * ROW));

  const productCustomers = new Map<string, { name: string; ys: number[]; systems: Set<string> }>();
  const systemProducts = new Map<string, { name: string; products: Set<string> }>();
  for (const v of connected) {
    for (const r of v.routes) {
      const p = productCustomers.get(r.product_id) ?? { name: r.product, ys: [], systems: new Set<string>() };
      p.ys.push(yOf.get(v.customer_id)!);
      p.systems.add(r.system_id);
      productCustomers.set(r.product_id, p);
      const s = systemProducts.get(r.system_id) ?? { name: r.system, products: new Set<string>() };
      s.products.add(r.product_id);
      systemProducts.set(r.system_id, s);
    }
  }
  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
  const spread = (m: Map<string, number>) => {
    // keep at least one row between cards in the same column
    let last = -Infinity;
    for (const [id, y] of [...m].sort((a, b) => a[1] - b[1])) {
      const ny = Math.max(y, last + ROW);
      m.set(id, ny);
      last = ny;
    }
    return m;
  };
  const productY = spread(new Map([...productCustomers].map(([id, p]) => [id, mean(p.ys)])));
  const systemY = spread(new Map([...systemProducts].map(([id, s]) => [id, mean([...s.products].map((p) => productY.get(p) ?? 0))])));
  const vendorY = mean([...systemY.values()]);

  const vendorTone = toneOf(statuses.get(impact.vendor_id));
  const newRegions = impact.vendor_region_evidence.filter((r) => r.change_id);
  const regionsVisible = updated && newRegions.length > 0 && vendorTone === "change";

  const header = (id: string, x: number, text: string) =>
    nodes.push({ id, type: "header", position: { x, y: -70 }, width: CARD_W, height: 20, data: { text }, selectable: false });
  header("h-vendor", X.vendor, "Supplier");
  header("h-system", X.system, "Our system");
  header("h-product", X.product, "Our product");
  header("h-customer", X.customer, "Customer");

  nodes.push({
    id: impact.vendor_id,
    type: "card",
      width: CARD_W,
      height: CARD_H,
    position: { x: X.vendor, y: vendorY },
    data: {
      icon: Cloud,
      title: impact.vendor_name,
      sub: updated ? "Contract updated (DPA v2)" : "Contract DPA v1",
      tone: vendorTone,
    },
  });

  if (regionsVisible) {
    newRegions.forEach((r, i) => {
      const id = `new-${r.region_id}`;
      nodes.push({
        id,
        type: "card",
      width: CARD_W,
      height: CARD_H,
        position: { x: X.vendor, y: vendorY + 150 + i * ROW },
        data: { icon: MapPin, title: r.code === "US" ? "United States" : r.name, sub: "Newly allowed for data", tone: "change" },
      });
      edges.push(edge(`e-${id}`, impact.vendor_id, id, "change", true, true));
    });
  }

  for (const [id, s] of systemProducts) {
    const tone = toneOf(statuses.get(id));
    nodes.push({
      id,
      type: "card",
      width: CARD_W,
      height: CARD_H,
      position: { x: X.system, y: systemY.get(id) ?? 0 },
      data: { icon: Cog, title: s.name, sub: `Sends data to ${impact.vendor_name}`, tone },
    });
    edges.push(edge(`e-v-${id}`, impact.vendor_id, id, tone, tone !== "neutral"));
  }
  for (const [id, p] of productCustomers) {
    const tone = toneOf(statuses.get(id));
    nodes.push({
      id,
      type: "card",
      width: CARD_W,
      height: CARD_H,
      position: { x: X.product, y: productY.get(id) ?? 0 },
      data: { icon: FileText, title: p.name, sub: `Runs on ${[...p.systems].map((s) => systemProducts.get(s)?.name).join(", ")}`, tone },
    });
    for (const s of p.systems) edges.push(edge(`e-${s}-${id}`, s, id, tone, tone !== "neutral"));
  }
  const added = newRegions.map((r) => r.code);
  for (const v of connected) {
    const status = statuses.get(v.customer_id);
    const tone = toneOf(status);
    const verdictKnown = showVerdicts && (tone === "impact" || tone === "safe");
    const plain = plainVerdict(v, updated, added, impact.vendor_name);
    nodes.push({
      id: v.customer_id,
      type: "card",
      width: CARD_W,
      height: CARD_H,
      position: { x: X.customer, y: yOf.get(v.customer_id) ?? 0 },
      data: {
        icon: SEGMENT_ICON[byId.get(v.customer_id)?.segment ?? ""] ?? Building2,
        title: v.customer_name,
        sub: verdictKnown ? plain.reason : tone === "flow" ? "Checking contract…" : "Customer",
        tone,
        clickable: true,
      },
    });
    for (const r of v.routes) edges.push(edge(`e-${r.product_id}-${v.customer_id}`, r.product_id, v.customer_id, tone, tone !== "neutral"));
  }
  unconnected.forEach((v, i) => {
    const status = statuses.get(v.customer_id);
    nodes.push({
      id: v.customer_id,
      type: "card",
      width: CARD_W,
      height: CARD_H,
      position: { x: X.customer, y: connected.length * ROW + 40 + i * ROW },
      data: {
        icon: SEGMENT_ICON[byId.get(v.customer_id)?.segment ?? ""] ?? Building2,
        title: v.customer_name,
        sub: `Not connected to ${impact.vendor_name}`,
        tone: status === "safe" && showVerdicts ? "safe" : "muted",
        clickable: true,
      },
    });
  });

  const key = `${nodes.length}-${regionsVisible ? 1 : 0}`;
  return { nodes, edges, key };
}

function edge(id: string, source: string, target: string, tone: Tone, animated: boolean, vertical = false): Edge {
  const color = EDGE_COLOR[tone];
  return {
    id,
    source,
    target,
    type: "smoothstep",
    animated,
    sourceHandle: vertical ? "b" : "r",
    targetHandle: vertical ? "t" : "l",
    style: { stroke: color, strokeWidth: tone === "neutral" ? 1.5 : 2.5, transition: "stroke 0.5s" },
    markerEnd: { type: MarkerType.ArrowClosed, color, width: 16, height: 16 },
  };
}

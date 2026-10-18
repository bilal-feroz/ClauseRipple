"use client";

import {
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  getBezierPath,
  useNodesInitialized,
  useReactFlow,
  useStore,
  type Edge,
  type EdgeProps,
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

// Glass cards: the tone drives the border, the glow, the icon tile and the status dot.
const TONE: Record<Tone, { border: string; glow: string; tile: string; icon: string; dot: string; ping: boolean }> = {
  neutral: {
    border: "border-sky-300/25",
    glow: "shadow-[0_0_24px_-10px_rgba(56,189,248,0.55)]",
    tile: "bg-gradient-to-br from-sky-400/25 to-cyan-500/5 ring-1 ring-sky-300/25",
    icon: "text-sky-200",
    dot: "bg-emerald-400",
    ping: false,
  },
  change: {
    border: "border-amber-300/80",
    glow: "shadow-[0_0_34px_-6px_rgba(245,158,11,0.8)]",
    tile: "bg-gradient-to-br from-amber-400/40 to-orange-500/10 ring-1 ring-amber-300/50",
    icon: "text-amber-200",
    dot: "bg-amber-300",
    ping: true,
  },
  flow: {
    border: "border-orange-300/70",
    glow: "shadow-[0_0_30px_-8px_rgba(251,146,60,0.75)]",
    tile: "bg-gradient-to-br from-orange-400/35 to-amber-500/5 ring-1 ring-orange-300/40",
    icon: "text-orange-200",
    dot: "bg-orange-400",
    ping: true,
  },
  impact: {
    border: "border-rose-400/90",
    glow: "",
    tile: "bg-gradient-to-br from-rose-500/45 to-red-600/10 ring-1 ring-rose-300/50",
    icon: "text-rose-100",
    dot: "bg-rose-500",
    ping: true,
  },
  safe: {
    border: "border-emerald-300/60",
    glow: "shadow-[0_0_28px_-10px_rgba(52,211,153,0.7)]",
    tile: "bg-gradient-to-br from-emerald-400/35 to-teal-500/5 ring-1 ring-emerald-300/40",
    icon: "text-emerald-200",
    dot: "bg-emerald-400",
    ping: false,
  },
  muted: {
    border: "border-dashed border-slate-400/30",
    glow: "",
    tile: "bg-slate-500/10 ring-1 ring-slate-400/20",
    icon: "text-slate-400",
    dot: "",
    ping: false,
  },
};

const EDGE_COLOR: Record<Tone, string> = {
  neutral: "#38bdf8",
  change: "#fbbf24",
  flow: "#fb923c",
  impact: "#f43f5e",
  safe: "#34d399",
  muted: "#334155",
};

type CardData = { icon: LucideIcon; title: string; sub?: string; tone: Tone; clickable?: boolean };
type HeaderData = { text: string };
type FlowData = { tone: Tone; still?: boolean };

function Card({ data }: NodeProps<Node<CardData>>) {
  const t = TONE[data.tone];
  const Icon = data.icon;
  return (
    <div
      className={cn(
        "relative flex h-full w-full items-center gap-3 rounded-2xl border bg-[linear-gradient(180deg,rgba(18,30,60,0.92),rgba(7,13,30,0.94))] px-3 py-2 transition-[border-color,box-shadow,transform] duration-500",
        t.border,
        t.glow,
        data.tone === "impact" && "alarm",
        data.tone === "change" && "pop-in",
        data.clickable && "cursor-pointer hover:-translate-y-0.5 hover:brightness-125",
      )}
    >
      {data.tone === "flow" && <span aria-hidden className="scan-beam" />}
      <Handle id="l" type="target" position={Position.Left} className="!h-1 !w-1 !border-0 !bg-transparent" />
      <Handle id="t" type="target" position={Position.Top} className="!h-1 !w-1 !border-0 !bg-transparent" />
      <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-colors duration-500", t.tile)}>
        <Icon className={cn("h-5 w-5 transition-colors duration-500", t.icon)} strokeWidth={1.9} />
      </span>
      <div className="min-w-0 pr-3">
        <div className="truncate text-[14.5px] font-semibold leading-tight text-snow">{data.title}</div>
        {data.sub && <div className="mt-1 line-clamp-2 text-[12px] leading-snug text-mist">{data.sub}</div>}
      </div>
      {t.dot && (
        <span aria-hidden className="absolute right-2.5 top-2.5 flex h-2 w-2">
          {t.ping && <span className={cn("ping-soft absolute inset-0 rounded-full", t.dot)} />}
          <span className={cn("relative h-2 w-2 rounded-full shadow-[0_0_8px_currentColor]", t.dot)} />
        </span>
      )}
      <Handle id="r" type="source" position={Position.Right} className="!h-1 !w-1 !border-0 !bg-transparent" />
      <Handle id="b" type="source" position={Position.Bottom} className="!h-1 !w-1 !border-0 !bg-transparent" />
    </div>
  );
}

function Header({ data }: NodeProps<Node<HeaderData>>) {
  return (
    <div className="flex w-full flex-col items-center gap-1.5">
      <div className="text-[12px] font-semibold uppercase tracking-[0.22em] text-sky-200/80 text-glow-cyan">{data.text}</div>
      <div className="h-px w-16 bg-gradient-to-r from-transparent via-sky-300/60 to-transparent" />
    </div>
  );
}

/** A living connection: a soft glow, a crisp stroke and data packets travelling along it. */
function FlowEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data, markerEnd }: EdgeProps<Edge<FlowData>>) {
  const [path] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition, curvature: 0.32 });
  const tone = data?.tone ?? "neutral";
  const color = EDGE_COLOR[tone];
  const hot = tone !== "neutral" && tone !== "muted";
  const dur = tone === "impact" ? 1.1 : hot ? 1.5 : 3.4;
  const packets = hot ? 3 : 2;
  return (
    <g>
      <path d={path} fill="none" stroke={color} strokeOpacity={hot ? 0.3 : 0.12} strokeWidth={hot ? 9 : 6} style={{ filter: "blur(4px)" }} />
      <path
        id={id}
        d={path}
        fill="none"
        stroke={color}
        strokeOpacity={hot ? 0.95 : 0.45}
        strokeWidth={hot ? 2.2 : 1.5}
        markerEnd={markerEnd}
        className={tone === "impact" || tone === "change" ? "dash-flow" : undefined}
        style={{ transition: "stroke 0.5s, stroke-opacity 0.5s" }}
      />
      {!data?.still &&
        Array.from({ length: packets }, (_, i) => (
          <circle key={`${tone}-${i}`} r={hot ? 3.4 : 2.4} fill={hot ? "#fff7ed" : "#e0f2fe"} style={{ filter: `drop-shadow(0 0 5px ${color}) drop-shadow(0 0 2px ${color})` }}>
            <animateMotion dur={`${dur}s`} repeatCount="indefinite" begin={`${(-i * dur) / packets}s`} path={path} />
          </circle>
        ))}
    </g>
  );
}

const nodeTypes = { card: Card, header: Header };
const edgeTypes = { flow: FlowEdge };
const CARD_W = 222;
const CARD_H = 72;

/** Re-fit the view whenever the diagram's content or the panel size changes, without remounting. */
function AutoFit({ signature }: { signature: string }) {
  const { fitView } = useReactFlow();
  const ready = useNodesInitialized();
  const width = useStore((st) => st.width);
  const height = useStore((st) => st.height);
  useEffect(() => {
    if (!ready) return;
    const id = requestAnimationFrame(() => void fitView({ padding: 0.08, duration: 500 }));
    return () => cancelAnimationFrame(id);
  }, [signature, ready, fitView, width, height]);
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
  reducedMotion,
  onSelectCustomer,
}: {
  impact: ImpactAnalysis | undefined;
  graph: GraphSnapshot | undefined;
  statuses: Map<string, NodeStatus>;
  updated: boolean;
  showVerdicts: boolean;
  reducedMotion: boolean;
  onSelectCustomer: (id: string) => void;
}) {
  const { nodes, edges, key } = useMemo(
    () => build(impact, graph, statuses, updated, showVerdicts, reducedMotion),
    [impact, graph, statuses, updated, showVerdicts, reducedMotion],
  );
  if (!impact || !graph) {
    return <div className="flex h-full items-center justify-center text-sm text-fog">Loading the company map…</div>;
  }
  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      fitView
      fitViewOptions={{ padding: 0.08 }}
      minZoom={0.3}
      maxZoom={1.35}
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
  still: boolean,
) {
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  if (!impact || !graph) return { nodes, edges, key: "empty" };
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const X = { vendor: 0, system: 272, product: 544, customer: 816 };
  const ROW = 116;

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
    nodes.push({ id, type: "header", position: { x, y: -56 }, width: CARD_W, height: 24, data: { text }, selectable: false });
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
      edges.push(edge(`e-${id}`, impact.vendor_id, id, "change", still, true));
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
    edges.push(edge(`e-v-${id}`, impact.vendor_id, id, tone, still));
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
    for (const s of p.systems) edges.push(edge(`e-${s}-${id}`, s, id, tone, still));
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
    for (const r of v.routes) edges.push(edge(`e-${r.product_id}-${v.customer_id}`, r.product_id, v.customer_id, tone, still));
  }
  unconnected.forEach((v, i) => {
    const status = statuses.get(v.customer_id);
    nodes.push({
      id: v.customer_id,
      type: "card",
      width: CARD_W,
      height: CARD_H,
      position: { x: X.customer, y: connected.length * ROW + 16 + i * ROW },
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

function edge(id: string, source: string, target: string, tone: Tone, still: boolean, vertical = false): Edge<FlowData> {
  const color = EDGE_COLOR[tone];
  return {
    id,
    source,
    target,
    type: "flow",
    data: { tone, still },
    sourceHandle: vertical ? "b" : "r",
    targetHandle: vertical ? "t" : "l",
    markerEnd: { type: MarkerType.ArrowClosed, color, width: 14, height: 14 },
  };
}

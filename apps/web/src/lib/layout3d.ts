// Deterministic semantic layout for RippleSpace. No physics, no randomness: every label lives
// on a fixed "floor" and lane so the picture tells the dependency story.
//
//   upper floor  (y > 0)   memory + organisation:  Cases  Decisions  Tickets  Teams  People  AgentRun
//   middle floor (y = 0)   dependency chain:  Customers  Products  Systems  Vendors  ChangeEvent
//   lower floor  (y < 0)   contracts:          Contracts  Clauses  Obligations  Controls  Regions
//
// Inside a lane, nodes spread along z (depth) and are ordered by the barycentre of their
// STRUCTURAL neighbours, so related nodes line up — and adding memory nodes (cases, runs,
// decisions) never moves the knowledge graph.

import type { GEdge, GNode } from "./types";

export type Vec3 = [number, number, number];

type Lane = { x: number; y: number; spacing: number; perColumn: number; fixed?: "name" | "ref" | "code" };

export const FLOOR_Y = { upper: 5.5, middle: 0, lower: -5.5 };

export const LANES: Record<string, Lane> = {
  ImpactCase: { x: -13.2, y: 5.5, spacing: 3.2, perColumn: 4, fixed: "ref" },
  Customer: { x: -9, y: 0, spacing: 3.0, perColumn: 6 },
  Product: { x: -4.6, y: 0, spacing: 3.4, perColumn: 6 },
  System: { x: -0.2, y: 0, spacing: 2.6, perColumn: 6 },
  Vendor: { x: 4.4, y: 0, spacing: 3.4, perColumn: 6, fixed: "name" },
  ChangeEvent: { x: 8.4, y: 0, spacing: 2.4, perColumn: 4, fixed: "ref" },
  Contract: { x: -9, y: -5.5, spacing: 3.0, perColumn: 6 },
  Clause: { x: -5.2, y: -5.5, spacing: 1.7, perColumn: 8 },
  Obligation: { x: -1.4, y: -5.5, spacing: 1.7, perColumn: 8 },
  Control: { x: 2.2, y: -5.5, spacing: 2.6, perColumn: 4, fixed: "ref" },
  DataRegion: { x: 5.6, y: -5.5, spacing: 3.2, perColumn: 4, fixed: "code" },
  Decision: { x: -9.2, y: 5.5, spacing: 3.0, perColumn: 6, fixed: "ref" },
  Ticket: { x: -5.6, y: 5.5, spacing: 2.4, perColumn: 4, fixed: "ref" },
  Team: { x: -1.2, y: 5.5, spacing: 2.6, perColumn: 6 },
  Person: { x: 2.6, y: 5.5, spacing: 1.7, perColumn: 6 },
  AgentRun: { x: 8.4, y: 5.5, spacing: 2.4, perColumn: 4, fixed: "ref" },
};

// Edges used to order the knowledge graph (memory / agent edges are ignored on purpose).
const STRUCTURAL = new Set([
  "USES",
  "POWERED_BY",
  "DEPENDS_ON",
  "BOUND_BY",
  "HAS_CLAUSE",
  "IMPOSES",
  "OWNED_BY",
  "LEADS",
  "MEMBER_OF",
  "SATISFIED_BY",
  "IMPLEMENTED_IN",
]);

// Lane processing order for barycentre ordering (anchor lanes first).
const ORDER = [
  "Vendor",
  "System",
  "Product",
  "Customer",
  "Contract",
  "Clause",
  "Obligation",
  "Control",
  "DataRegion",
  "Team",
  "Person",
  "Decision",
  "Ticket",
  "ImpactCase",
  "ChangeEvent",
  "AgentRun",
];

const REGION_ORDER: Record<string, number> = { UAE: 0, EU: 1, US: 2 };

export function layoutGraph(nodes: GNode[], edges: GEdge[]): Map<string, Vec3> {
  const byLabel = new Map<string, GNode[]>();
  for (const n of nodes) {
    if (!LANES[n.label]) continue;
    byLabel.set(n.label, [...(byLabel.get(n.label) ?? []), n]);
  }
  const neighbours = new Map<string, string[]>();
  for (const e of edges) {
    if (!STRUCTURAL.has(e.type)) continue;
    neighbours.set(e.source, [...(neighbours.get(e.source) ?? []), e.target]);
    neighbours.set(e.target, [...(neighbours.get(e.target) ?? []), e.source]);
  }
  const pos = new Map<string, Vec3>();

  const place = (label: string, ordered: GNode[]) => {
    const lane = LANES[label];
    const cols = Math.ceil(ordered.length / lane.perColumn);
    ordered.forEach((n, i) => {
      const col = Math.floor(i / lane.perColumn);
      const inCol = Math.min(lane.perColumn, ordered.length - col * lane.perColumn);
      const idx = i % lane.perColumn;
      const z = (idx - (inCol - 1) / 2) * lane.spacing;
      const x = lane.x + (col - (cols - 1) / 2) * 1.6;
      pos.set(n.id, [x, lane.y, z]);
    });
  };

  const fixedSort = (kind: Lane["fixed"]) => (a: GNode, b: GNode) => {
    if (kind === "code") return (REGION_ORDER[a.code ?? ""] ?? 9) - (REGION_ORDER[b.code ?? ""] ?? 9);
    const ka = kind === "ref" ? a.ref ?? a.name : a.name;
    const kb = kind === "ref" ? b.ref ?? b.name : b.name;
    return ka.localeCompare(kb);
  };

  for (let pass = 0; pass < 2; pass++) {
    for (const label of ORDER) {
      const lane = LANES[label];
      const list = [...(byLabel.get(label) ?? [])].sort((a, b) => a.name.localeCompare(b.name));
      if (lane.fixed) {
        list.sort(fixedSort(lane.fixed));
      } else {
        const score = (n: GNode) => {
          const zs = (neighbours.get(n.id) ?? []).map((id) => pos.get(id)?.[2]).filter((z): z is number => z !== undefined);
          return zs.length ? zs.reduce((s, z) => s + z, 0) / zs.length : 0;
        };
        list.sort((a, b) => score(a) - score(b) || a.name.localeCompare(b.name));
      }
      place(label, list);
    }
  }
  return pos;
}

export function boundsOf(points: Vec3[]): { center: Vec3; radius: number } {
  if (!points.length) return { center: [0, 0, 0], radius: 10 };
  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const p of points) {
    for (let i = 0; i < 3; i++) {
      min[i] = Math.min(min[i], p[i]);
      max[i] = Math.max(max[i], p[i]);
    }
  }
  const center: Vec3 = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];
  const radius = Math.max(4, Math.hypot(max[0] - min[0], max[1] - min[1], max[2] - min[2]) / 2);
  return { center, radius };
}

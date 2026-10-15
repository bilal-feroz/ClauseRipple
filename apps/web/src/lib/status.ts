// Node status model for RippleSpace / Evidence Graph.
//  - At rest: statuses derive from the live backend impact analysis + graph (cases, assignments).
//  - During an agent run: statuses are revealed progressively from real tool events (ripple hints).

import { hintToStatus, type NodeStatus } from "./graph-style";
import type { GraphSnapshot, ImpactAnalysis, ToolCompletedEvent } from "./types";

export type Reveal = { status: NodeStatus; depth: number; step: number; order: number };

const PRIORITY: Record<NodeStatus, number> = {
  neutral: 0,
  checked: 1,
  downstream: 2,
  traversed: 3,
  safe: 4,
  owner: 5,
  memory: 5,
  new: 6,
  changed: 6,
  case: 7,
  impacted: 8,
};

function put(map: Map<string, NodeStatus>, id: string, status: NodeStatus) {
  const cur = map.get(id);
  if (!cur || PRIORITY[status] >= PRIORITY[cur]) map.set(id, status);
}

/** Final (at-rest) statuses from backend data. */
export function restingStatuses(
  graph: GraphSnapshot | undefined,
  impact: ImpactAnalysis | undefined,
  updated: boolean,
): Map<string, NodeStatus> {
  const map = new Map<string, NodeStatus>();
  if (!graph || !impact || !updated) return map;
  const vendorId = impact.vendor_id;
  put(map, vendorId, "changed");
  for (const r of impact.vendor_region_evidence) if (r.change_id) put(map, r.region_id, "new");
  for (const n of graph.nodes) if (n.label === "ChangeEvent") put(map, n.id, "changed");

  const out = new Map<string, { type: string; target: string }[]>();
  for (const e of graph.edges) out.set(e.source, [...(out.get(e.source) ?? []), { type: e.type, target: e.target }]);
  const nodeType = new Map(graph.nodes.map((n) => [n.id, n]));

  for (const v of impact.verdicts) {
    put(map, v.customer_id, v.affected ? "impacted" : "safe");
    if (v.affected) {
      for (const r of v.routes) {
        put(map, r.product_id, "impacted");
        put(map, r.system_id, "impacted");
      }
    }
    // obligations behind this customer's residency verdict
    for (const c of out.get(v.customer_id) ?? []) {
      if (c.type !== "BOUND_BY") continue;
      for (const cl of out.get(c.target) ?? []) {
        if (cl.type !== "HAS_CLAUSE") continue;
        for (const ob of out.get(cl.target) ?? []) {
          if (ob.type !== "IMPOSES" || nodeType.get(ob.target)?.type !== "DATA_RESIDENCY") continue;
          if (v.dependency_path_exists) {
            put(map, ob.target, v.affected ? "impacted" : "safe");
            put(map, cl.target, v.affected ? "impacted" : "safe");
          }
        }
      }
    }
  }
  for (const n of graph.nodes) {
    if (n.label !== "ImpactCase") continue;
    put(map, n.id, "case");
    for (const e of out.get(n.id) ?? []) {
      if (e.type === "ASSIGNED_TO") put(map, e.target, "owner");
      if (e.type === "RELATED_TO") put(map, e.target, "memory");
    }
  }
  for (const n of graph.nodes) if (n.label === "AgentRun") put(map, n.id, "owner");
  return map;
}

/** Progressive reveal from completed agent steps (order = arrival order of the hint). */
export function revealsFromSteps(steps: ToolCompletedEvent[]): Map<string, Reveal> {
  const map = new Map<string, Reveal>();
  let order = 0;
  for (const s of steps) {
    if (s.status !== "ok") continue;
    for (const h of s.ripple ?? []) {
      const status = hintToStatus(h.status);
      const cur = map.get(h.id);
      if (!cur || PRIORITY[status] >= PRIORITY[cur.status]) {
        map.set(h.id, { status, depth: h.depth, step: s.step, order: order++ });
      }
    }
  }
  return map;
}

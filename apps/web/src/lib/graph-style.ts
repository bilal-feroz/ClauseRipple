// Visual vocabulary for the company graph. Status colours are restrained and always paired
// with a shape + text label (never colour alone).

export type Shape =
  | "sphere"
  | "dodeca"
  | "box"
  | "hex"
  | "ring"
  | "slab"
  | "slabSmall"
  | "shield"
  | "tetra"
  | "torus"
  | "smallSphere"
  | "diamond"
  | "ticket"
  | "ico"
  | "prism"
  | "agent";

export type LabelStyle = { shape: Shape; size: number; tone: string; title: string; plural: string };

export const LABEL_STYLE: Record<string, LabelStyle> = {
  Customer: { shape: "sphere", size: 0.58, tone: "#7dd3fc", title: "Customer", plural: "Customers" },
  Product: { shape: "dodeca", size: 0.5, tone: "#93c5fd", title: "Product", plural: "Products" },
  System: { shape: "box", size: 0.62, tone: "#a5b4fc", title: "System", plural: "Systems" },
  Vendor: { shape: "hex", size: 0.6, tone: "#c4b5fd", title: "Vendor", plural: "Vendors" },
  DataRegion: { shape: "ring", size: 0.5, tone: "#5eead4", title: "Data region", plural: "Regions" },
  Contract: { shape: "slab", size: 0.62, tone: "#94a3b8", title: "Contract", plural: "Contracts" },
  Clause: { shape: "slabSmall", size: 0.5, tone: "#94a3b8", title: "Clause", plural: "Clauses" },
  Obligation: { shape: "shield", size: 0.46, tone: "#cbd5e1", title: "Obligation", plural: "Obligations" },
  Control: { shape: "tetra", size: 0.42, tone: "#99f6e4", title: "Control", plural: "Controls" },
  Team: { shape: "torus", size: 0.46, tone: "#67e8f9", title: "Team", plural: "Teams" },
  Person: { shape: "smallSphere", size: 0.32, tone: "#a5f3fc", title: "Person", plural: "People" },
  Decision: { shape: "diamond", size: 0.46, tone: "#d8b4fe", title: "Decision", plural: "Decisions" },
  Ticket: { shape: "ticket", size: 0.4, tone: "#d8b4fe", title: "Ticket", plural: "Tickets" },
  ChangeEvent: { shape: "ico", size: 0.46, tone: "#fbbf24", title: "Change event", plural: "Change events" },
  ImpactCase: { shape: "prism", size: 0.56, tone: "#f87171", title: "Impact case", plural: "Impact cases" },
  Action: { shape: "ticket", size: 0.32, tone: "#fca5a5", title: "Action", plural: "Actions" },
  AgentRun: { shape: "agent", size: 0.46, tone: "#67e8f9", title: "Agent run", plural: "Agent runs" },
};

export type NodeStatus =
  | "neutral"
  | "changed"
  | "new"
  | "traversed"
  | "downstream"
  | "impacted"
  | "safe"
  | "owner"
  | "memory"
  | "case"
  | "checked";

export const STATUS_COLOR: Record<NodeStatus, string> = {
  neutral: "#7f8ea3",
  changed: "#f59e0b",
  new: "#f59e0b",
  traversed: "#fb923c",
  downstream: "#fb923c",
  impacted: "#ef4444",
  safe: "#22c55e",
  owner: "#38bdf8",
  memory: "#c084fc",
  case: "#f43f5e",
  checked: "#e2e8f0",
};

export const STATUS_TEXT: Record<NodeStatus, string> = {
  neutral: "",
  changed: "changed",
  new: "new fact",
  traversed: "depends on vendor",
  downstream: "downstream",
  impacted: "impacted",
  safe: "not impacted",
  owner: "owner",
  memory: "recalled",
  case: "case opened",
  checked: "checked",
};

// Ripple hint statuses emitted by backend tools -> node status
export function hintToStatus(hint: string): NodeStatus {
  switch (hint) {
    case "changed":
      return "changed";
    case "new":
      return "new";
    case "traversed":
      return "traversed";
    case "downstream":
      return "downstream";
    case "impacted":
    case "violated":
      return "impacted";
    case "safe":
    case "satisfied":
      return "safe";
    case "owner":
    case "assigned":
      return "owner";
    case "recalled":
      return "memory";
    case "case":
      return "case";
    default:
      return "checked";
  }
}

export const REL_LABEL: Record<string, string> = {
  USES: "uses",
  POWERED_BY: "powered by",
  DEPENDS_ON: "depends on",
  PROCESSES_IN: "processes in",
  BOUND_BY: "bound by",
  HAS_CLAUSE: "has clause",
  IMPOSES: "imposes",
  ALLOWS: "allows",
  OWNED_BY: "owned by",
  LEADS: "leads",
  MEMBER_OF: "member of",
  APPLIES_TO: "applies to",
  INVOLVES: "involves",
  AFFECTS: "affects",
  ASSIGNED_TO: "assigned to",
  RELATED_TO: "related to",
  SATISFIED_BY: "satisfied by",
};

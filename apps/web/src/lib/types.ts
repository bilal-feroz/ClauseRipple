// Shapes returned by the ClauseRipple API (apps/api). Kept in one place so every panel
// renders real backend data — nothing in the UI is hardcoded.

export type Health = {
  api: string;
  falkordb: "connected" | "unavailable";
  falkordb_version?: string | null;
  graph: string;
  graph_present: boolean;
  agent: "ready" | "paused";
  planner: string;
  llm: "configured" | "not_configured";
  llm_provider?: string | null;
  llm_model?: string | null;
  embeddings: boolean;
  demo_mode: boolean;
};

export type GraphStats = {
  nodes: number;
  relationships: number;
  by_label: Record<string, number>;
  documents?: number;
  cases?: number;
  decisions?: number;
  agent_runs?: number;
};

export type DemoState = {
  state: "BASELINE" | "UPDATED" | "EMPTY";
  dpa_version: number | null;
  latest_change_id: string | null;
  change_events: number;
  stats: GraphStats;
};

export type GNode = {
  id: string;
  label: string;
  name: string;
  ref?: string;
  code?: string;
  type?: string;
  status?: string;
  severity?: string;
  role?: string;
  segment?: string;
  regulated?: boolean;
  tier?: string;
  acv_usd?: number;
  src?: string;
  created_at?: string;
};

export type GEdge = {
  id: string;
  source: string;
  target: string;
  type: string;
  src?: string;
  quote?: string;
  loc?: string;
  line?: number;
  change_id?: string;
};

export type GraphSnapshot = { nodes: GNode[]; edges: GEdge[] };

export type PathNode = { id: string; name: string; label: string; code?: string };

export type Route = {
  product_id: string;
  product: string;
  system_id: string;
  system: string;
  hops: number;
  path_nodes?: PathNode[];
};

export type VerdictStatus = "IMPACTED" | "ALLOWED" | "NO_DEPENDENCY" | "NO_RESIDENCY_OBLIGATION";

export type Verdict = {
  customer_id: string;
  customer_name: string;
  status: VerdictStatus;
  affected: boolean;
  severity: "CRITICAL" | "HIGH" | "NONE";
  dependency_path_exists: boolean;
  vendor_regions: string[];
  allowed_regions: string[];
  violating_regions: string[];
  introduced_by_change: string[];
  reason: string;
  regulated: boolean;
  acv_usd?: number | null;
  routes: Route[];
};

export type RegionEvidence = {
  region_id: string;
  code: string;
  name: string;
  src: string;
  src_ver: number;
  quote: string;
  loc: string;
  line: number;
  change_id?: string | null;
};

export type ImpactAnalysis = {
  vendor_id: string;
  vendor_name: string;
  vendor_regions: string[];
  vendor_region_evidence: RegionEvidence[];
  verdicts: Verdict[];
  absence_proofs: Record<string, string>;
  summary: {
    customers_evaluated: number;
    customers_with_dependency: number;
    customers_impacted: number;
    products_involved: string[];
    systems_involved: string[];
    acv_at_risk_usd: number;
  };
  ripple_depths: Record<string, number>;
};

export type DiffLine = { kind: "hunk" | "add" | "del" | "ctx"; text: string };

export type PendingChange = {
  doc_id: string;
  title: string;
  kind: string;
  current_version: number;
  new_version: number;
  applied: boolean;
  diff: DiffLine[];
};

export type AddedFact = { src: string; type: string; dst: string; quote: string; line: number };

export type ChangeResult = {
  change_id: string;
  ref: string;
  type: string;
  doc_id: string;
  old_version: number;
  new_version: number;
  added_facts: AddedFact[];
  removed_facts: unknown[];
  applied: { added: number; removed: number; retained: number };
  diff: DiffLine[];
  incremental_update_ms: number;
};

export type RippleHint = { id: string; depth: number; status: string };

export type EvidenceQuote = {
  type?: string;
  src?: string | null;
  quote?: string | null;
  line?: number | null;
  loc?: string | null;
};

export type ToolMetrics = {
  graph_reads?: number;
  graph_writes?: number;
  db_time_ms?: number;
  queries?: string[];
};

export type AgentEvent =
  | { type: "run_started"; run_id: string; ref?: string; planner: string; change_id?: string; replay?: boolean }
  | { type: "tools_listed"; run_id: string; via: string; tools: string[] }
  | {
      type: "tool_started";
      run_id: string;
      step: number;
      tool: string;
      input: Record<string, unknown>;
      planner: string;
    }
  | {
      type: "tool_completed";
      run_id: string;
      step: number;
      tool: string;
      input: Record<string, unknown>;
      planner: string;
      status: "ok" | "error" | "refused";
      error?: string | null;
      summary: string | null;
      data: Record<string, unknown> | null;
      touched: string[];
      ripple: RippleHint[];
      evidence: EvidenceQuote[];
      metrics: ToolMetrics;
      duration_ms: number;
      via?: string;
      replay?: boolean;
    }
  | { type: "planner_unavailable" | "completeness_check"; run_id: string; message: string }
  | {
      type: "run_completed";
      run_id: string;
      ref?: string;
      status: string;
      tool_count: number;
      graph_reads: number;
      graph_writes: number;
      db_time_ms: number;
      tool_time_ms: number;
      duration_ms: number;
      pacing_ms?: number;
      cases_created: string[];
      summary: string;
      llm_summary?: string;
      replay?: boolean;
    }
  | { type: "run_failed"; run_id: string; error: string };

export type ToolCompletedEvent = Extract<AgentEvent, { type: "tool_completed" }>;
export type RunCompletedEvent = Extract<AgentEvent, { type: "run_completed" }>;

export type ImpactCase = {
  id: string;
  ref: string;
  seq: number;
  name: string;
  title: string;
  severity: string;
  status: string;
  customer_name: string;
  vendor_name: string;
  product: string;
  system: string;
  violating_regions: string[];
  allowed_regions: string[];
  reason: string;
  recommended_action: string;
  suggested_owner: string;
  suggested_team: string;
  change_id: string;
  evidence_edges: number;
  evidence_docs: number;
  created_at: string;
  agent_note?: string;
  customer_id?: string;
  customer?: string;
  vendor?: string;
  assignee?: string | null;
  team?: string | null;
};

export type CaseAction = {
  id: string;
  title: string;
  kind: "REMEDIATE" | "REVIEW" | "NOTIFY";
  status: string;
  requires_approval: boolean;
  due_date?: string | null;
  owner: string;
  basis: string;
};

export type CaseDetail = {
  case: ImpactCase;
  customer_id: string;
  customer: string;
  vendor_id: string;
  vendor: string;
  involves: PathNode[];
  obligation_id: string;
  obligation: string;
  assignee_id: string | null;
  assignee: string | null;
  team_id: string | null;
  team: string | null;
  related_decisions: { id: string; ref: string; title: string; decision: string; date: string }[];
  documents: { doc_id: string; title: string; version: number }[];
  actions: CaseAction[];
  created_by_run: string | null;
  resolved_by: string[];
};

export type Decision = {
  decision_id: string;
  ref: string;
  title: string;
  date: string;
  status: string;
  decision: string;
  topics: string[];
  src?: string | null;
  origin?: string | null;
  customers: string[];
  vendors: string[];
  owner?: string | null;
  approved_by?: string | null;
  resolves_cases: string[];
};

export type AgentRunSummary = {
  id: string;
  ref: string;
  planner: string;
  status: string;
  started_at: string;
  completed_at?: string;
  tool_count?: number;
  graph_reads?: number;
  graph_writes?: number;
  db_time_ms?: number;
  tool_time_ms?: number;
  duration_ms?: number;
  summary?: string;
  created_cases: string[];
  referenced_decisions: string[];
  change_ref?: string | null;
};

export type EvidenceEdge = {
  type: string;
  src?: string | null;
  src_ver?: number | null;
  quote?: string | null;
  loc?: string | null;
  line?: number | null;
  change_id?: string | null;
  from: PathNode;
  to: PathNode;
};

export type EvidenceBundle = {
  customer_id: string;
  vendor_id: string;
  dependency_paths: { nodes: PathNode[]; edges: EvidenceQuote[] }[];
  contract_paths: { nodes: PathNode[]; edges: EvidenceQuote[] }[];
  vendor_regions: RegionEvidence[];
  edges: EvidenceEdge[];
  documents: string[];
  edge_count: number;
  doc_count: number;
  no_path_proof: string | null;
};

export type SourceDocument = {
  id: string;
  doc_id: string;
  title: string;
  kind: string;
  version: number;
  effective_date?: string;
  path?: string;
  owner?: string;
  sha256?: string;
  text?: string;
};

export type ResetResult = {
  state: string;
  documents: number;
  facts: { nodes: number; relationships: number; chunks: number };
  validation: { ok: boolean; passed: number; total: number; checks: { check: string; ok: boolean; detail: string }[] };
  duration_ms: number;
};

export type AskAnswer = {
  question: string;
  intent: string;
  answer: string;
  mode: string;
  path: string[];
  sources: { type?: string; src?: string | null; line?: number | null; quote: string }[];
  passages: { doc_id: string; section: string; line: number; text: string; score: number }[];
  retrieval: string;
  entities: Record<string, string[]>;
  cypher: string[];
  graph_reads: number;
  db_time_ms: number;
};

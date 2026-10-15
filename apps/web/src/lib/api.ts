import type {
  AgentRunSummary,
  AskAnswer,
  CaseDetail,
  ChangeResult,
  Decision,
  DemoState,
  EvidenceBundle,
  GraphSnapshot,
  Health,
  ImpactAnalysis,
  ImpactCase,
  PendingChange,
  ResetResult,
  SourceDocument,
} from "./types";

export const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000").replace(/\/$/, "");

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: { Accept: "application/json", ...(init?.body ? { "Content-Type": "application/json" } : {}) },
      cache: "no-store",
    });
  } catch {
    throw new ApiError(0, "ClauseRipple API unreachable");
  }
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = typeof body.detail === "string" ? body.detail : JSON.stringify(body.detail ?? body);
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(res.status, detail);
  }
  return (await res.json()) as T;
}

const enc = encodeURIComponent;

export const api = {
  health: () => request<Health>("/health"),
  state: () => request<DemoState>("/api/demo/state"),
  pending: () => request<PendingChange[]>("/api/demo/pending"),
  reset: () => request<ResetResult>("/api/demo/reset", { method: "POST" }),
  applyChange: (docId = "modelcloud_dpa") =>
    request<{ change: ChangeResult; run_id: string | null }>("/api/demo/apply-change", {
      method: "POST",
      body: JSON.stringify({ doc_id: docId, run_agent: true }),
    }),
  graph: () => request<GraphSnapshot>("/api/graph"),
  impact: (vendorId = "vendor:modelcloud") => request<ImpactAnalysis>(`/api/impact?vendor_id=${enc(vendorId)}`),
  evidence: (customerId: string, vendorId = "vendor:modelcloud") =>
    request<EvidenceBundle>(`/api/evidence?customer_id=${enc(customerId)}&vendor_id=${enc(vendorId)}`),
  cases: () => request<ImpactCase[]>("/api/cases"),
  caseDetail: (caseId: string) => request<CaseDetail>(`/api/cases/${enc(caseId)}`),
  approveCase: (caseId: string) =>
    request<{ case_id: string; status: string; decision_ref: string; created: boolean }>(
      `/api/cases/${enc(caseId)}/approve`,
      { method: "POST" },
    ),
  reviewCase: (caseId: string) => request<{ id: string; status: string }>(`/api/cases/${enc(caseId)}/review`, { method: "POST" }),
  decisions: () => request<Decision[]>("/api/memory/decisions"),
  changes: () =>
    request<{ id: string; ref: string; added_facts: string[]; detected_at: string; diff_add?: string[]; diff_del?: string[] }[]>(
      "/api/memory/changes",
    ),
  runs: () => request<AgentRunSummary[]>("/api/agent/runs"),
  document: (docId: string) => request<SourceDocument>(`/api/documents/${enc(docId)}`),
  documents: () => request<SourceDocument[]>("/api/documents"),
  ask: (question: string) =>
    request<AskAnswer>("/api/ask", { method: "POST", body: JSON.stringify({ question }) }),
  runEventsUrl: (runId: string) => `${API_URL}/api/agent/runs/${enc(runId)}/events`,
};

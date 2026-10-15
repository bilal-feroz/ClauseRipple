"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, BookOpen, Brain, CheckCheck, FileText, Gavel, Network, ShieldAlert, UserCheck, X } from "lucide-react";
import { useState } from "react";
import { Badge, Button, Quote } from "@/components/ui";
import { api } from "@/lib/api";
import { REL_LABEL } from "@/lib/graph-style";
import type { AgentRunSummary, Decision, EvidenceBundle, ImpactCase, SourceDocument, Verdict } from "@/lib/types";
import { cn, fmtMs } from "@/lib/utils";

export type BottomTab = "cases" | "why" | "memory" | "sources";

export function BottomPanel({
  tab,
  setTab,
  cases,
  selectedCaseId,
  onSelectCase,
  verdict,
  evidence,
  evidenceLoading,
  decisions,
  runs,
  documents,
  onViewGraph,
  onOpenEvidence,
}: {
  tab: BottomTab;
  setTab: (t: BottomTab) => void;
  cases: ImpactCase[];
  selectedCaseId: string | null;
  onSelectCase: (id: string) => void;
  verdict: Verdict | undefined;
  evidence: EvidenceBundle | undefined;
  evidenceLoading: boolean;
  decisions: Decision[];
  runs: AgentRunSummary[];
  documents: SourceDocument[];
  onViewGraph: (customerId: string) => void;
  onOpenEvidence: (customerId: string) => void;
}) {
  const [doc, setDoc] = useState<{ id: string; highlight?: string | null } | null>(null);
  const tabs: [BottomTab, string, React.ReactNode][] = [
    ["cases", `Impact cases${cases.length ? ` (${cases.length})` : ""}`, <ShieldAlert key="c" className="h-3.5 w-3.5" />],
    ["why", verdict ? `Why · ${verdict.customer_name}` : "Why? Evidence", <Network key="w" className="h-3.5 w-3.5" />],
    ["memory", "Company memory", <Brain key="m" className="h-3.5 w-3.5" />],
    ["sources", `Sources (${documents.length})`, <BookOpen key="s" className="h-3.5 w-3.5" />],
  ];
  return (
    <section className="panel flex h-full min-h-0 flex-col" aria-label="Evidence, decisions, cases and sources">
      <div role="tablist" className="flex gap-1 border-b border-line px-2 pt-1.5">
        {tabs.map(([key, label, icon]) => (
          <button
            key={key}
            role="tab"
            type="button"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={cn(
              "flex items-center gap-1.5 rounded-t-md border-b-2 px-2.5 py-1.5 text-[12px] transition",
              tab === key ? "border-signal text-snow" : "border-transparent text-fog hover:text-mist",
            )}
          >
            {icon}
            {label}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {tab === "cases" && (
          <CasesTab
            cases={cases}
            selectedCaseId={selectedCaseId}
            onSelectCase={onSelectCase}
            onViewGraph={onViewGraph}
            onOpenEvidence={onOpenEvidence}
            openDoc={(id) => setDoc({ id })}
          />
        )}
        {tab === "why" && (
          <WhyTab verdict={verdict} evidence={evidence} loading={evidenceLoading} openDoc={(id, highlight) => setDoc({ id, highlight })} />
        )}
        {tab === "memory" && <MemoryTab decisions={decisions} runs={runs} />}
        {tab === "sources" && <SourcesTab documents={documents} openDoc={(id) => setDoc({ id })} />}
      </div>
      {doc && <DocumentViewer docId={doc.id} highlight={doc.highlight} onClose={() => setDoc(null)} />}
    </section>
  );
}

// ── Cases ─────────────────────────────────────────────────────────────────────
function CasesTab({
  cases,
  selectedCaseId,
  onSelectCase,
  onViewGraph,
  onOpenEvidence,
  openDoc,
}: {
  cases: ImpactCase[];
  selectedCaseId: string | null;
  onSelectCase: (id: string) => void;
  onViewGraph: (customerId: string) => void;
  onOpenEvidence: (customerId: string) => void;
  openDoc: (id: string) => void;
}) {
  const active = selectedCaseId ?? cases[0]?.id ?? null;
  if (!cases.length)
    return (
      <p className="text-[12px] text-fog">
        No impact cases yet. When the agent finds a graph-verified violation it writes an ImpactCase into FalkorDB and assigns it to the
        owner it discovers through ownership edges.
      </p>
    );
  return (
    <div className="grid gap-3 lg:grid-cols-[260px_1fr]">
      <ul className="space-y-1.5">
        {cases.map((c) => (
          <li key={c.id}>
            <button
              type="button"
              onClick={() => onSelectCase(c.id)}
              aria-pressed={active === c.id}
              className={cn(
                "w-full rounded-md border px-2.5 py-2 text-left transition",
                active === c.id ? "border-impact/60 bg-impact/5" : "border-line bg-ink-900/50 hover:border-line-strong",
              )}
            >
              <div className="flex items-center gap-2">
                <span className="font-mono text-[12px] font-semibold text-red-200">{c.ref}</span>
                <Badge tone="impact">{c.severity}</Badge>
                <span className="ml-auto text-[10px] uppercase tracking-wide text-fog">{c.status.replaceAll("_", " ")}</span>
              </div>
              <div className="mt-0.5 text-[12px] text-snow">{c.customer ?? c.customer_name}</div>
              <div className="text-[11px] text-fog">→ {c.assignee ?? c.suggested_owner} · {c.team ?? c.suggested_team}</div>
            </button>
          </li>
        ))}
      </ul>
      {active && <CaseView caseId={active} onViewGraph={onViewGraph} onOpenEvidence={onOpenEvidence} openDoc={openDoc} />}
    </div>
  );
}

function CaseView({
  caseId,
  onViewGraph,
  onOpenEvidence,
  openDoc,
}: {
  caseId: string;
  onViewGraph: (customerId: string) => void;
  onOpenEvidence: (customerId: string) => void;
  openDoc: (id: string) => void;
}) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["case", caseId], queryFn: () => api.caseDetail(caseId) });
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["case", caseId] });
    void qc.invalidateQueries({ queryKey: ["cases"] });
    void qc.invalidateQueries({ queryKey: ["decisions"] });
    void qc.invalidateQueries({ queryKey: ["state"] });
    void qc.invalidateQueries({ queryKey: ["graph"] });
  };
  const approve = useMutation({ mutationFn: () => api.approveCase(caseId), onSuccess: refresh });
  const review = useMutation({ mutationFn: () => api.reviewCase(caseId), onSuccess: refresh });
  if (isLoading || !data) return <div className="text-[12px] text-fog">Loading case from FalkorDB…</div>;
  const c = data.case;
  const approved = c.status === "REMEDIATION_APPROVED" || data.resolved_by.length > 0;
  return (
    <article className="rounded-lg border border-line bg-ink-900/50 p-3" aria-label={`Impact case ${c.ref}`}>
      <header className="mb-2 flex flex-wrap items-center gap-2">
        <span className="font-mono text-[15px] font-semibold text-red-200">{c.ref}</span>
        <span className="text-[13px] font-semibold text-snow">{c.title}</span>
        <Badge tone="impact">{c.severity}</Badge>
        <Badge tone={approved ? "safe" : "change"}>{c.status.replaceAll("_", " ")}</Badge>
        {data.created_by_run && <span className="font-mono text-[10.5px] text-fog">created by {data.created_by_run.split(":")[1].toUpperCase()}</span>}
      </header>
      <dl className="mb-2.5 grid grid-cols-2 gap-x-4 gap-y-1 text-[11.5px] md:grid-cols-4">
        <Field k="Affected" v={data.customer} />
        <Field k="Changed vendor" v={data.vendor} />
        <Field k="Violating region" v={c.violating_regions.join(", ")} tone="impact" />
        <Field k="Allowed" v={c.allowed_regions.join(", ")} />
        <Field k="Product" v={c.product} />
        <Field k="System" v={c.system} />
        <Field k="Owner" v={data.assignee ?? c.suggested_owner} icon={<UserCheck className="h-3 w-3 text-signal" />} />
        <Field k="Team" v={data.team ?? c.suggested_team} />
      </dl>
      <div className="mb-2.5 rounded-md border border-signal/30 bg-signal/5 p-2">
        <div className="eyebrow mb-0.5 !text-sky-300/90">Recommended remediation</div>
        <p className="text-[12px] text-snow">{c.recommended_action}</p>
        {c.agent_note && <p className="mt-1 text-[11px] italic text-mist">Agent note: {c.agent_note}</p>}
      </div>
      {data.related_decisions.length > 0 && (
        <div className="mb-2.5 rounded-md border border-memory/40 bg-memory/5 p-2">
          <div className="eyebrow mb-0.5 flex items-center gap-1 !text-purple-300">
            <Brain className="h-3 w-3" /> Related memory found
          </div>
          {data.related_decisions.map((d) => (
            <p key={d.id} className="text-[12px] text-snow">
              <span className="font-mono font-semibold text-purple-200">{d.ref}</span> · {d.date} — {d.decision}
            </p>
          ))}
        </div>
      )}
      <div className="mb-2.5">
        <div className="eyebrow mb-1">Actions (owners resolved from graph relationships)</div>
        <ul className="space-y-1">
          {data.actions.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center gap-2 rounded-md border border-line bg-ink-950/50 px-2 py-1 text-[11.5px]">
              <Badge tone={a.kind === "REMEDIATE" ? "impact" : a.kind === "REVIEW" ? "signal" : "change"}>{a.kind}</Badge>
              <span className="min-w-0 flex-1 text-snow">{a.title}</span>
              <span className="text-fog">→ {a.owner}</span>
              {a.due_date && <span className="font-mono text-[10.5px] text-amber-200">due {a.due_date}</span>}
              <span className={cn("text-[10px] uppercase", a.status === "APPROVED" ? "text-green-300" : a.requires_approval ? "text-amber-300" : "text-fog")}>
                {a.requires_approval ? (a.status === "APPROVED" ? "approved" : "needs approval") : "auto"}
              </span>
            </li>
          ))}
        </ul>
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-1.5 text-[11px] text-fog">
        Evidence: {c.evidence_edges} graph relationships · {data.documents.length} source documents:
        {data.documents.map((d) => (
          <button key={d.doc_id} type="button" onClick={() => openDoc(d.doc_id)} className="rounded border border-line px-1 font-mono text-[10.5px] text-mist hover:text-snow">
            {d.doc_id} v{d.version}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-1.5">
        <Button variant="primary" onClick={() => approve.mutate()} disabled={approved || approve.isPending || !data.assignee_id}>
          <Gavel className="h-3.5 w-3.5" />
          {approved ? `Approved${data.resolved_by[0] ? ` · ${data.resolved_by[0]}` : ""}` : "Approve remediation"}
        </Button>
        <Button onClick={() => review.mutate()} disabled={review.isPending || c.status === "REVIEWED" || approved}>
          <CheckCheck className="h-3.5 w-3.5" /> Mark reviewed
        </Button>
        <Button onClick={() => onViewGraph(data.customer_id)}>
          <Network className="h-3.5 w-3.5" /> View graph
        </Button>
        <Button onClick={() => onOpenEvidence(data.customer_id)}>
          <FileText className="h-3.5 w-3.5" /> View evidence
        </Button>
      </div>
      {approve.data?.created && (
        <p className="mt-2 text-[11.5px] text-green-300" role="status">
          Remediation approved. Recorded as decision {approve.data.decision_ref} in FalkorDB — future agent runs will recall it.
        </p>
      )}
      {(approve.error || review.error) && (
        <p className="mt-2 text-[11.5px] text-red-300" role="alert">
          {String((approve.error ?? review.error)?.message)}
        </p>
      )}
    </article>
  );
}

function Field({ k, v, tone, icon }: { k: string; v?: string | null; tone?: "impact"; icon?: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wide text-fog">{k}</dt>
      <dd className={cn("flex items-center gap-1 text-snow", tone === "impact" && "font-semibold text-red-300")}>
        {icon}
        {v || "—"}
      </dd>
    </div>
  );
}

// ── Why? ──────────────────────────────────────────────────────────────────────
function WhyTab({
  verdict,
  evidence,
  loading,
  openDoc,
}: {
  verdict: Verdict | undefined;
  evidence: EvidenceBundle | undefined;
  loading: boolean;
  openDoc: (id: string, highlight?: string | null) => void;
}) {
  if (!verdict) return <p className="text-[12px] text-fog">Select a customer in the blast radius to see exactly why.</p>;
  if (loading || !evidence) return <p className="text-[12px] text-fog">Loading source-backed evidence from FalkorDB…</p>;
  const dep = evidence.dependency_paths[0];
  const con = evidence.contract_paths[0];
  const title = verdict.affected
    ? `Why is ${verdict.customer_name} impacted?`
    : `Why is ${verdict.customer_name} not impacted?`;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-[14px] font-semibold text-snow">{title}</h3>
        {verdict.affected ? <Badge tone="impact">{verdict.severity}</Badge> : <Badge tone="safe">no impact</Badge>}
        <span className="text-[11.5px] text-mist">{verdict.reason}</span>
      </div>
      <div className="grid gap-3 xl:grid-cols-2">
        <PathBlock
          title="Dependency path (FalkorDB traversal)"
          nodes={dep?.nodes.map((n) => n.name)}
          edges={dep?.edges}
          empty={evidence.no_path_proof ?? "No dependency path"}
          openDoc={openDoc}
        />
        <PathBlock
          title="Contract path"
          nodes={con?.nodes.slice(0, -1).map((n) => n.name)}
          edges={con?.edges.slice(0, -1)}
          empty="No residency obligation"
          openDoc={openDoc}
          tail={`allows ${verdict.allowed_regions.join(" / ")}`}
        />
      </div>
      <div>
        <div className="eyebrow mb-1">Vendor processing regions (ModelCloud DPA)</div>
        <div className="flex flex-wrap gap-1.5">
          {evidence.vendor_regions.map((r) => {
            const bad = verdict.violating_regions.includes(r.code);
            return (
              <button
                key={r.code}
                type="button"
                onClick={() => openDoc(r.src, r.quote)}
                className={cn(
                  "rounded-md border px-2 py-1 text-left text-[11.5px]",
                  bad ? "border-impact/60 bg-impact/10 text-red-100" : r.change_id ? "border-change/50 bg-change/10 text-amber-100" : "border-line bg-ink-900/60 text-mist",
                )}
              >
                <span className="font-semibold">{r.code}</span> {r.change_id ? "· new in v" + r.src_ver : ""}
                {bad && " · not allowed"}
                <span className="block font-mono text-[10px] opacity-75">
                  {r.src}.md:L{r.line}
                </span>
              </button>
            );
          })}
        </div>
      </div>
      {!verdict.affected && <GuardrailProbe customerId={verdict.customer_id} customerName={verdict.customer_name} />}
      <p className="text-[11px] text-fog">
        {evidence.edge_count} graph relationships · {evidence.doc_count} source documents. Every quote above is stored on the
        relationship in FalkorDB and was verified verbatim against its source at ingestion.
      </p>
    </div>
  );
}

function GuardrailProbe({ customerId, customerName }: { customerId: string; customerName: string }) {
  const probe = useMutation({ mutationFn: () => api.requestCase(customerId) });
  return (
    <div className="rounded-lg border border-dashed border-line-strong p-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11.5px] text-mist">Guardrail check: ask the agent&apos;s write tool to open a case for {customerName} anyway.</span>
        <Button onClick={() => probe.mutate()} disabled={probe.isPending}>
          <ShieldAlert className="h-3.5 w-3.5" /> Try create_impact_case
        </Button>
      </div>
      {probe.data && (
        <p className={cn("mt-1.5 text-[11.5px]", probe.data.refused ? "text-amber-200" : "text-red-200")} role="status">
          {probe.data.refused ? "Refused by the graph (via MCP): " : ""}
          {probe.data.message ?? (probe.data.created ? "Case created" : "")}
        </p>
      )}
    </div>
  );
}

function PathBlock({
  title,
  nodes,
  edges,
  empty,
  openDoc,
  tail,
}: {
  title: string;
  nodes?: string[];
  edges?: { type?: string; quote?: string | null; src?: string | null; line?: number | null }[];
  empty: string;
  openDoc: (id: string, highlight?: string | null) => void;
  tail?: string;
}) {
  return (
    <div className="rounded-lg border border-line bg-ink-900/50 p-2.5">
      <div className="eyebrow mb-1.5">{title}</div>
      {!nodes?.length ? (
        <p className="text-[11.5px] text-green-300">{empty}</p>
      ) : (
        <ol className="space-y-1.5">
          {nodes.map((name, i) => (
            <li key={`${name}-${i}`}>
              <div className="text-[12px] font-semibold text-snow">{name}</div>
              {edges?.[i] && (
                <div className="ml-2 border-l border-line-strong pl-2">
                  <div className="flex items-center gap-1 font-mono text-[10.5px] text-signal">
                    <ArrowRight className="h-3 w-3" />
                    {REL_LABEL[edges[i].type ?? ""] ?? edges[i].type}
                  </div>
                  {edges[i].quote && (
                    <button type="button" onClick={() => openDoc(edges[i].src ?? "", edges[i].quote)} className="w-full text-left">
                      <Quote text={edges[i].quote} source={edges[i].src} line={edges[i].line} />
                    </button>
                  )}
                </div>
              )}
            </li>
          ))}
          {tail && <li className="font-mono text-[11px] text-green-300">→ {tail}</li>}
        </ol>
      )}
    </div>
  );
}

// ── Memory ────────────────────────────────────────────────────────────────────
function MemoryTab({ decisions, runs }: { decisions: Decision[]; runs: AgentRunSummary[] }) {
  return (
    <div className="grid gap-3 lg:grid-cols-[1fr_340px]">
      <div>
        <div className="eyebrow mb-1.5">Decisions in FalkorDB</div>
        <ul className="space-y-1.5">
          {decisions.map((d) => (
            <li key={d.decision_id} className="rounded-md border border-line bg-ink-900/50 px-2.5 py-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-[12px] font-semibold text-purple-200">{d.ref}</span>
                <span className="text-[12px] text-snow">{d.title.replace(`${d.ref} — `, "")}</span>
                <Badge tone={d.origin === "human_approval" ? "safe" : "memory"} className="normal-case tracking-normal">
                  {d.origin === "human_approval" ? "approved in ClauseRipple" : "decision record"}
                </Badge>
                <span className="ml-auto text-[10.5px] text-fog">{d.date}</span>
              </div>
              <p className="mt-0.5 text-[11.5px] text-mist">{d.decision}</p>
              <p className="mt-0.5 text-[10.5px] text-fog">
                {[d.customers.length ? `applies to ${d.customers.join(", ")}` : null, d.vendors.length ? `involves ${d.vendors.join(", ")}` : null, d.owner ? `owner ${d.owner}` : null, d.approved_by ? `approved by ${d.approved_by}` : null, d.resolves_cases.length ? `resolves ${d.resolves_cases.join(", ")}` : null]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </li>
          ))}
        </ul>
      </div>
      <div>
        <div className="eyebrow mb-1.5">Agent runs (operational memory)</div>
        <ul className="space-y-1.5">
          {runs.map((r) => (
            <li key={r.id} className="rounded-md border border-line bg-ink-900/50 px-2.5 py-1.5 text-[11.5px]">
              <div className="flex items-center gap-2">
                <span className="font-mono font-semibold text-sky-200">{r.ref}</span>
                <span className="text-fog">{r.change_ref}</span>
                <Badge tone={r.status === "COMPLETED" ? "safe" : "change"}>{r.status}</Badge>
              </div>
              <div className="mt-0.5 font-mono text-[10.5px] text-fog">
                {r.tool_count ?? 0} tools · {r.graph_reads ?? 0} reads · {r.graph_writes ?? 0} writes · db {fmtMs(r.db_time_ms)}
              </div>
              <div className="text-[10.5px] text-mist">
                created {r.created_cases.join(", ") || "—"} · used {r.referenced_decisions.join(", ") || "—"}
              </div>
            </li>
          ))}
          {!runs.length && <li className="text-[11.5px] text-fog">No agent runs stored yet.</li>}
        </ul>
        <p className="mt-2 text-[10.5px] text-fog">
          Decisions, cases and runs are read back from FalkorDB on every load — restart the browser or the API and they are still here.
        </p>
      </div>
    </div>
  );
}

// ── Sources ───────────────────────────────────────────────────────────────────
function SourcesTab({ documents, openDoc }: { documents: SourceDocument[]; openDoc: (id: string) => void }) {
  return (
    <div className="grid gap-1.5 sm:grid-cols-2 xl:grid-cols-4">
      {documents.map((d) => (
        <button
          key={d.doc_id}
          type="button"
          onClick={() => openDoc(d.doc_id)}
          className="rounded-md border border-line bg-ink-900/50 px-2.5 py-1.5 text-left hover:border-line-strong"
        >
          <div className="flex items-center gap-1.5">
            <FileText className="h-3.5 w-3.5 text-fog" />
            <span className="truncate text-[12px] text-snow">{d.title}</span>
          </div>
          <div className="mt-0.5 font-mono text-[10px] text-fog">
            {d.kind} · v{d.version} · {d.doc_id}
          </div>
        </button>
      ))}
    </div>
  );
}

function DocumentViewer({ docId, highlight, onClose }: { docId: string; highlight?: string | null; onClose: () => void }) {
  const { data, isLoading, error } = useQuery({ queryKey: ["doc", docId], queryFn: () => api.document(docId) });
  const norm = (s: string) => s.replace(/\s+/g, " ").trim();
  const paragraphs = (data?.text ?? "").split(/\n\s*\n/);
  return (
    <div role="dialog" aria-modal="true" aria-label={`Source document ${docId}`} className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="panel max-h-[80vh] w-full max-w-3xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <header className="flex items-center gap-2 border-b border-line px-4 py-2.5">
          <FileText className="h-4 w-4 text-fog" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13px] font-semibold text-snow">{data?.title ?? docId}</div>
            <div className="font-mono text-[10.5px] text-fog">
              {data?.path} · v{data?.version} · {data?.kind} · sha256 {data?.sha256?.slice(0, 12)}…
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close document" className="rounded p-1 text-fog hover:text-snow">
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="max-h-[66vh] overflow-y-auto px-4 py-3 text-[12.5px] leading-relaxed text-mist">
          {isLoading && <p>Loading…</p>}
          {error && <p className="text-red-300">Could not load document.</p>}
          {paragraphs.map((p, i) => {
            const hit = highlight && norm(p).includes(norm(highlight));
            return (
              <p key={i} className={cn("mb-2 whitespace-pre-wrap rounded px-1", hit && "bg-change/15 text-snow ring-1 ring-change/50")}>
                {p}
              </p>
            );
          })}
        </div>
      </div>
    </div>
  );
}

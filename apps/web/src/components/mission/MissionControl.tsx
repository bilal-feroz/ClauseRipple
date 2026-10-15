"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Boxes, Network } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EvidenceGraph, WholeGraph2D } from "@/components/graph/EvidenceGraph";
import { RippleSpace } from "@/components/graph/RippleSpace";
import { useAgentRun } from "@/hooks/useAgentRun";
import { api } from "@/lib/api";
import type { NodeStatus } from "@/lib/graph-style";
import { restingStatuses, revealsFromSteps } from "@/lib/status";
import type { GNode } from "@/lib/types";
import { cn, prefersReducedMotion } from "@/lib/utils";
import { AgentTrace } from "./AgentTrace";
import { BlastRadius } from "./BlastRadius";
import { BottomPanel, type BottomTab } from "./BottomPanel";
import { ChangePanel, type AppliedChange } from "./ChangePanel";
import { TopBar } from "./TopBar";

const VENDOR = "vendor:modelcloud";

const STEP_CAPTION: Record<string, string> = {
  inspect_change: "Depth 0 · change detected at the vendor",
  trace_vendor_dependents: "Depth 1 · systems that depend on the vendor",
  find_impacted_customers: "Depth 2–3 · products and downstream customers",
  get_customer_obligations: "Depth 4 · contract obligations",
  evaluate_residency: "Depth 4 · obligations vs. processing regions",
  recall_related_decisions: "Memory · prior decisions recalled",
  find_owner: "Ownership · team and accountable lead",
  get_source_evidence: "Provenance · source quotes gathered",
  create_impact_case: "Action · impact case written to FalkorDB",
  assign_impact_case: "Action · case assigned to graph owner",
};

export function MissionControl() {
  const qc = useQueryClient();
  const health = useQuery({ queryKey: ["health"], queryFn: api.health, refetchInterval: 5000 });
  const graphUp = health.data?.falkordb === "connected" && !health.isError;
  const state = useQuery({ queryKey: ["state"], queryFn: api.state, enabled: graphUp });
  const pending = useQuery({ queryKey: ["pending"], queryFn: api.pending, enabled: graphUp });
  const graph = useQuery({ queryKey: ["graph"], queryFn: api.graph, enabled: graphUp });
  const impact = useQuery({ queryKey: ["impact"], queryFn: () => api.impact(VENDOR), enabled: graphUp });
  const cases = useQuery({ queryKey: ["cases"], queryFn: api.cases, enabled: graphUp });
  const decisions = useQuery({ queryKey: ["decisions"], queryFn: api.decisions, enabled: graphUp });
  const runs = useQuery({ queryKey: ["runs"], queryFn: api.runs, enabled: graphUp });
  const documents = useQuery({ queryKey: ["documents"], queryFn: api.documents, enabled: graphUp });

  const [runId, setRunId] = useState<string | null>(null);
  const run = useAgentRun(runId);
  const [applied, setApplied] = useState<AppliedChange | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<string | null>(null);
  const [selectedCase, setSelectedCase] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [centerTab, setCenterTab] = useState<"ripple" | "evidence">("ripple");
  const [bottomTab, setBottomTab] = useState<BottomTab>("cases");
  const [rippleKey, setRippleKey] = useState(0);
  const [reducedMotion] = useState(prefersReducedMotion);
  const [completedAt, setCompletedAt] = useState<number | null>(null);

  const updated = state.data?.state === "UPDATED";
  const running = run.phase === "running";

  const invalidateAll = useCallback(() => {
    for (const key of ["state", "pending", "graph", "impact", "cases", "decisions", "runs", "documents"]) {
      void qc.invalidateQueries({ queryKey: [key] });
    }
  }, [qc]);

  const reset = useMutation({
    mutationFn: api.reset,
    onSuccess: () => {
      setRunId(null);
      setApplied(null);
      setSelectedCase(null);
      setSelectedNode(null);
      setCompletedAt(null);
      invalidateAll();
    },
  });

  const apply = useMutation({
    mutationFn: () => api.applyChange("modelcloud_dpa"),
    onSuccess: (res) => {
      const subjectName = (id: string) =>
        graph.data?.nodes.find((n) => n.id === id)?.name ?? id.split(":")[1];
      setApplied({
        ref: res.change.ref,
        diff: res.change.diff,
        addedFacts: res.change.added_facts.map((f) => ({
          subject: subjectName(f.src),
          rel: f.type,
          object: graph.data?.nodes.find((n) => n.id === f.dst)?.name ?? f.dst,
          quote: f.quote,
        })),
        incrementalMs: res.change.incremental_update_ms,
        retained: res.change.applied.retained,
      });
      setCompletedAt(null);
      setRunId(res.run_id);
      setCenterTab("ripple");
      // the graph now contains the new fact + ChangeEvent; statuses stay gated by agent events
      void qc.invalidateQueries({ queryKey: ["graph"] });
      void qc.invalidateQueries({ queryKey: ["state"] });
      void qc.invalidateQueries({ queryKey: ["pending"] });
    },
  });

  // Live-run side effects driven by real tool events.
  const lastStep = run.steps[run.steps.length - 1];
  const seenSteps = useRef(0);
  useEffect(() => {
    if (run.steps.length <= seenSteps.current) {
      seenSteps.current = run.steps.length;
      return;
    }
    const fresh = run.steps.slice(seenSteps.current);
    seenSteps.current = run.steps.length;
    for (const s of fresh) {
      if (s.tool === "inspect_change" && s.status === "ok") setRippleKey((k) => k + 1);
      if (s.tool === "evaluate_residency") void qc.invalidateQueries({ queryKey: ["impact"] });
      if (s.tool === "create_impact_case" || s.tool === "assign_impact_case") {
        void qc.invalidateQueries({ queryKey: ["graph"] });
        void qc.invalidateQueries({ queryKey: ["cases"] });
      }
      if (s.tool === "create_impact_case" && s.status === "ok") {
        const data = s.data as { case_id?: string } | null;
        if (data?.case_id) setSelectedCase((cur) => cur ?? data.case_id!);
      }
    }
  }, [run.steps, qc]);

  useEffect(() => {
    if (run.phase === "completed" || run.phase === "failed") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCompletedAt(Date.now());
      invalidateAll();
    }
  }, [run.phase, invalidateAll]);

  // Restore the "detected change" card after a reload (read from FalkorDB change history).
  const changes = useQuery({ queryKey: ["changes"], queryFn: api.changes, enabled: graphUp && updated });
  const appliedView: AppliedChange | null = useMemo(() => {
    if (applied) return applied;
    const latest = changes.data?.[0];
    if (!latest || !graph.data) return null;
    const name = (id: string) => graph.data!.nodes.find((n) => n.id === id)?.name ?? id;
    return {
      ref: latest.ref,
      diff: [
        ...(latest.diff_del ?? []).map((text) => ({ kind: "del" as const, text })),
        ...(latest.diff_add ?? []).map((text) => ({ kind: "add" as const, text })),
      ],
      addedFacts: latest.added_facts.map((f) => {
        const [subject, rel, object] = f.split(" ");
        return { subject: name(subject), rel, object: name(object) };
      }),
    };
  }, [applied, changes.data, graph.data]);

  // Statuses: progressive reveal while the agent runs; persisted verdicts afterwards.
  const restingReady = !completedAt || impact.dataUpdatedAt > completedAt;
  const revealMode = running || (run.phase === "completed" && !restingReady);
  const reveals = useMemo(() => (revealMode ? revealsFromSteps(run.steps) : null), [revealMode, run.steps]);
  const resting = useMemo(() => restingStatuses(graph.data, impact.data, updated), [graph.data, impact.data, updated]);
  const statuses: Map<string, NodeStatus> = useMemo(() => {
    if (!reveals) return resting;
    return new Map([...reveals].map(([id, r]) => [id, r.status]));
  }, [reveals, resting]);

  const evaluated = run.steps.some((s) => s.tool === "evaluate_residency" && s.status === "ok");
  const revealedCustomers = running && !evaluated ? new Set<string>() : null;

  const verdicts = impact.data?.verdicts ?? [];
  const activeCustomer =
    selectedCustomer ??
    verdicts.find((v) => v.affected)?.customer_id ??
    verdicts.find((v) => v.dependency_path_exists)?.customer_id ??
    verdicts[0]?.customer_id ??
    null;
  const verdict = verdicts.find((v) => v.customer_id === activeCustomer);
  const evidence = useQuery({
    queryKey: ["evidence", activeCustomer, impact.dataUpdatedAt],
    queryFn: () => api.evidence(activeCustomer!, VENDOR),
    enabled: graphUp && !!activeCustomer,
  });

  // Prior decisions the agent actually used: live from recall steps, at rest from RELATED_TO edges.
  const decisionsRecalled = useMemo(() => {
    if (running) {
      const ids = run.steps
        .filter((s) => s.tool === "recall_related_decisions")
        .map((s) => (s.data as { best_match?: { decision_id: string } | null } | null)?.best_match?.decision_id)
        .filter(Boolean);
      return new Set(ids).size;
    }
    return new Set((graph.data?.edges ?? []).filter((e) => e.type === "RELATED_TO").map((e) => e.target)).size;
  }, [running, run.steps, graph.data]);

  const selectCustomer = (id: string) => {
    setSelectedCustomer(id);
    setSelectedNode(id);
    setBottomTab("why");
  };

  const onSelectNode = (n: GNode) => {
    setSelectedNode(n.id);
    if (n.label === "Customer") selectCustomer(n.id);
    if (n.label === "ImpactCase") {
      setSelectedCase(n.id);
      setBottomTab("cases");
    }
  };

  const caption = running && lastStep ? `${STEP_CAPTION[lastStep.tool] ?? lastStep.tool} — ${lastStep.summary ?? ""}` : null;
  const busy = running || apply.isPending || reset.isPending;

  return (
    <div className="flex min-h-dvh flex-col lg:h-dvh">
      <TopBar
        health={health.data}
        healthError={health.isError}
        state={state.data}
        onReset={() => reset.mutate()}
        resetting={reset.isPending}
        resetDisabled={running}
      />

      {(!graphUp && !health.isLoading) && (
        <div role="alert" className="border-b border-impact/40 bg-impact/10 px-4 py-2 text-[12.5px] text-red-100">
          {health.isError ? "ClauseRipple API unreachable." : "FalkorDB unavailable. Agent reasoning paused."} Start it with{" "}
          <code className="font-mono">docker compose up -d falkordb</code>.
        </div>
      )}
      {reset.data && !reset.data.validation.ok && (
        <div role="alert" className="border-b border-change/40 bg-change/10 px-4 py-2 text-[12px] text-amber-100">
          Graph validation failed ({reset.data.validation.passed}/{reset.data.validation.total}). Extraction missed critical facts — nothing was patched in.
        </div>
      )}

      <main className="grid min-h-0 flex-1 gap-2 p-2 lg:grid-cols-[318px_minmax(0,1fr)_372px] lg:grid-rows-[minmax(0,1fr)_282px]">
        <aside className="flex min-h-0 flex-col gap-2 lg:row-span-2 lg:overflow-y-auto" aria-label="Change event and blast radius">
          <ChangePanel
            pending={pending.data?.[0]}
            state={state.data}
            applied={appliedView}
            onApply={() => apply.mutate()}
            applying={apply.isPending}
            disabled={!graphUp || busy}
          />
          {apply.error && (
            <p role="alert" className="rounded-md border border-impact/40 bg-impact/10 p-2 text-[11.5px] text-red-200">
              {String(apply.error.message)}
            </p>
          )}
          <BlastRadius
            impact={impact.data}
            cases={cases.data ?? []}
            decisionsRecalled={decisionsRecalled}
            updated={updated && !(running && !evaluated)}
            selectedCustomer={activeCustomer}
            onSelectCustomer={selectCustomer}
            revealedCustomers={revealedCustomers}
          />
          <p className="px-1 text-[10.5px] leading-snug text-fog">
            Synthetic AtlasAI world — every company, person and document is fictional.
          </p>
        </aside>

        <section className="panel relative flex min-h-[60vh] flex-col overflow-hidden lg:min-h-0" aria-label="Graph views">
          <div role="tablist" className="flex items-center gap-1 border-b border-line px-2 pt-1.5">
            {(
              [
                ["ripple", "RippleSpace", <Boxes key="r" className="h-3.5 w-3.5" />],
                ["evidence", "Evidence graph", <Network key="e" className="h-3.5 w-3.5" />],
              ] as const
            ).map(([key, label, icon]) => (
              <button
                key={key}
                role="tab"
                type="button"
                aria-selected={centerTab === key}
                onClick={() => setCenterTab(key)}
                className={cn(
                  "flex items-center gap-1.5 rounded-t-md border-b-2 px-3 py-1.5 text-[12.5px] transition",
                  centerTab === key ? "border-signal text-snow" : "border-transparent text-fog hover:text-mist",
                )}
              >
                {icon}
                {label}
              </button>
            ))}
            <span className="ml-auto pb-1 text-[10.5px] text-fog">
              live FalkorDB graph · {graph.data?.nodes.length ?? 0} nodes · {graph.data?.edges.length ?? 0} relationships shown
            </span>
          </div>
          <div className="grid-backdrop relative min-h-0 flex-1">
            {centerTab === "ripple" ? (
              graph.data ? (
                <RippleSpace
                  graph={graph.data}
                  statuses={statuses}
                  reveals={reveals}
                  rippleOrigin={impact.data?.vendor_id ?? VENDOR}
                  rippleKey={rippleKey}
                  selectedId={selectedNode}
                  animate={running || updated}
                  reducedMotion={reducedMotion}
                  onSelect={onSelectNode}
                  focusTarget={selectedNode ?? VENDOR}
                  caption={caption}
                  fallback={<WholeGraph2D graph={graph.data} statuses={statuses} />}
                />
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-fog">Loading the company graph from FalkorDB…</div>
              )
            ) : (
              <EvidenceGraph bundle={evidence.data} verdict={verdict} vendorName={impact.data?.vendor_name ?? "ModelCloud"} />
            )}
          </div>
        </section>

        <aside className="flex min-h-[420px] flex-col lg:min-h-0" aria-label="Agent trace">
          <AgentTrace
            run={run}
            history={runs.data ?? []}
            onReplay={(id) => {
              setCompletedAt(null);
              setRunId(id);
            }}
            onFocusEntities={(ids) => setSelectedNode(ids.find((i) => i.startsWith("customer:") || i.startsWith("system:") || i.startsWith("case:")) ?? ids[0] ?? null)}
          />
        </aside>

        <div className="min-h-[300px] lg:col-span-2 lg:col-start-2 lg:min-h-0">
          <BottomPanel
            tab={bottomTab}
            setTab={setBottomTab}
            cases={cases.data ?? []}
            selectedCaseId={selectedCase}
            onSelectCase={(id) => {
              setSelectedCase(id);
              setSelectedNode(id);
            }}
            verdict={verdict}
            evidence={evidence.data}
            evidenceLoading={evidence.isLoading}
            decisions={decisions.data ?? []}
            runs={runs.data ?? []}
            documents={documents.data ?? []}
            onViewGraph={(customerId) => {
              setSelectedCustomer(customerId);
              setCenterTab("evidence");
            }}
            onOpenEvidence={(customerId) => {
              setSelectedCustomer(customerId);
              setBottomTab("why");
            }}
          />
        </div>
      </main>
    </div>
  );
}

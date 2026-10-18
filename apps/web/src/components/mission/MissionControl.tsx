"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Boxes, Network, Sparkles, Waypoints } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EvidenceGraph, WholeGraph2D } from "@/components/graph/EvidenceGraph";
import { RippleSpace } from "@/components/graph/RippleSpace";
import { useAgentRun } from "@/hooks/useAgentRun";
import { api } from "@/lib/api";
import type { NodeStatus } from "@/lib/graph-style";
import { restingStatuses, revealsFromSteps } from "@/lib/status";
import type { GNode } from "@/lib/types";
import { cn, prefersReducedMotion } from "@/lib/utils";
import { ChangeStory, type AppliedChange } from "@/components/story/ChangeStory";
import { Cosmos } from "@/components/story/Cosmos";
import { ImpactFlow } from "@/components/story/ImpactFlow";
import { ImpactResult } from "@/components/story/ImpactResult";
import { TOOL_PLAIN } from "@/components/story/plain";
import { AgentTrace } from "./AgentTrace";
import { BottomPanel, type BottomTab } from "./BottomPanel";
import { TopBar } from "./TopBar";

const VENDOR = "vendor:modelcloud";

export function MissionControl() {
  const qc = useQueryClient();
  const health = useQuery({
    queryKey: ["health"],
    queryFn: async () => {
      const t0 = performance.now();
      const h = await api.health();
      // network round trip from Resource Timing, so a busy main thread doesn't inflate it
      const entries = performance.getEntriesByType("resource").filter((e) => e.name.endsWith("/health"));
      const last = entries[entries.length - 1] as PerformanceResourceTiming | undefined;
      const latencyMs = last && last.responseEnd > 0 ? last.responseEnd - (last.requestStart || last.startTime) : performance.now() - t0;
      if (entries.length > 50) performance.clearResourceTimings();
      return { ...h, latencyMs };
    },
    refetchInterval: 5000,
  });
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
  const [centerTab, setCenterTab] = useState<"flow" | "ripple" | "evidence">("flow");
  const [bottomTab, setBottomTab] = useState<BottomTab>("why");
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
      setSelectedCustomer(null);
      setBottomTab("why");
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

  const selectCustomer = (id: string) => {
    setSelectedCustomer(id);
    setSelectedNode(id);
    setBottomTab("why");
  };

  const openCase = (id: string) => {
    setSelectedCase(id);
    setSelectedNode(id);
    setBottomTab("cases");
  };

  const onSelectNode = (n: GNode) => {
    setSelectedNode(n.id);
    if (n.label === "Customer") selectCustomer(n.id);
    if (n.label === "ImpactCase") openCase(n.id);
  };

  const captionStep = running ? lastStep : undefined;
  const checking = updated && running && !evaluated;
  const busy = running || apply.isPending || reset.isPending;

  return (
    <div className="relative flex min-h-dvh flex-col xl:h-dvh xl:min-h-[760px]">
      <Cosmos />
      <TopBar
        health={health.data}
        healthError={health.isError}
        latencyMs={health.data?.latencyMs}
        state={state.data}
        onReset={() => reset.mutate()}
        resetting={reset.isPending}
        resetDisabled={running}
      />

      {(!graphUp && !health.isLoading) && (
        <div role="alert" className="relative z-20 mx-3 mb-2 rounded-xl border border-impact/40 bg-impact/10 px-4 py-2 text-[12.5px] text-red-100 backdrop-blur">
          {health.isError ? "ClauseRipple API unreachable." : "FalkorDB unavailable. Agent reasoning paused."} Start it with{" "}
          <code className="font-mono">docker compose up -d falkordb</code>.
        </div>
      )}
      {reset.data && !reset.data.validation.ok && (
        <div role="alert" className="relative z-20 mx-3 mb-2 rounded-xl border border-change/40 bg-change/10 px-4 py-2 text-[12px] text-amber-100 backdrop-blur">
          Graph validation failed ({reset.data.validation.passed}/{reset.data.validation.total}). Extraction missed critical facts — nothing was patched in.
        </div>
      )}

      <main className="relative z-10 grid min-h-0 flex-1 gap-3 px-3 pb-3 lg:grid-cols-2 xl:grid-cols-[300px_minmax(0,1fr)_320px] xl:grid-rows-[minmax(0,1fr)_clamp(188px,26vh,252px)] 2xl:grid-cols-[340px_minmax(0,1fr)_360px]">
        <aside className="flex min-h-0 flex-col gap-2" aria-label="What changed">
          <ChangeStory
            pending={pending.data?.[0]}
            updated={updated}
            applied={appliedView}
            impact={impact.data}
            cases={cases.data ?? []}
            run={run}
            onApply={() => apply.mutate()}
            applying={apply.isPending}
            disabled={!graphUp || busy}
            watching={state.data?.stats?.documents}
            onShowAgent={() => setBottomTab("agent")}
          />
          {apply.error && (
            <p role="alert" className="rounded-xl border border-impact/40 bg-impact/10 p-2 text-[11.5px] text-red-200">
              {String(apply.error.message)}
            </p>
          )}
        </aside>

        <section
          className={cn(
            "stage flex min-h-[560px] flex-col overflow-hidden lg:order-3 lg:col-span-2 xl:order-none xl:col-span-1 xl:min-h-0",
            running && "orbit-border",
          )}
          style={running ? ({ "--orbit-color": "#f59e0b" } as React.CSSProperties) : undefined}
          aria-label="How the change spreads"
        >
          <div className="relative z-10 flex flex-wrap items-center gap-x-4 gap-y-2 px-4 pt-3">
            <h2 className="eyebrow !text-[11px] !text-sky-200/80">How the change spreads</h2>
            <div role="tablist" className="flex items-center gap-1 rounded-full border border-white/10 bg-black/30 p-1 backdrop-blur-md">
              {(
                [
                  ["flow", "Map", <Waypoints key="f" className="h-3.5 w-3.5" />],
                  ["ripple", "3D view", <Boxes key="r" className="h-3.5 w-3.5" />],
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
                    "flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[13px] transition-all duration-300",
                    centerTab === key
                      ? "bg-gradient-to-b from-sky-400/30 to-sky-500/10 font-semibold text-snow shadow-[0_0_20px_-6px_rgba(56,189,248,0.9)] ring-1 ring-sky-300/40"
                      : "text-mist hover:bg-white/5 hover:text-snow",
                  )}
                >
                  {icon}
                  {label}
                </button>
              ))}
            </div>
            <div className="ml-auto flex items-center gap-3 text-[11.5px] text-mist">
              <Legend color="bg-amber-400 text-amber-400" label="changed" />
              <Legend color="bg-orange-400 text-orange-400" label="checking" />
              <Legend color="bg-red-500 text-red-500" label="broken" />
              <Legend color="bg-emerald-400 text-emerald-400" label="fine" />
            </div>
          </div>
          <div className={cn("relative min-h-0 flex-1", centerTab === "evidence" && "grid-backdrop")}>
            {centerTab === "flow" && (
              <ImpactFlow
                impact={impact.data}
                graph={graph.data}
                statuses={statuses}
                updated={updated}
                showVerdicts={!running || evaluated}
                reducedMotion={reducedMotion}
                onSelectCustomer={selectCustomer}
              />
            )}
            {centerTab === "ripple" &&
              (graph.data ? (
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
                  fallback={<WholeGraph2D graph={graph.data} statuses={statuses} />}
                />
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-fog">Loading the company graph from FalkorDB…</div>
              ))}
            {centerTab === "evidence" && (
              <EvidenceGraph bundle={evidence.data} verdict={verdict} vendorName={impact.data?.vendor_name ?? "ModelCloud"} />
            )}

            {captionStep && (
              <div className="pointer-events-none absolute inset-x-0 bottom-4 z-20 flex justify-center px-4">
                <div
                  key={captionStep.step}
                  className="caption-in flex max-w-[640px] items-center gap-3 rounded-2xl border border-amber-300/30 bg-[#0a1022]/85 px-4 py-2.5 shadow-[0_0_44px_-12px_rgba(245,158,11,0.75)] backdrop-blur-md"
                >
                  <span className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-400/15 ring-1 ring-amber-300/50">
                    <span className="ping-soft absolute inset-0 rounded-full bg-amber-400/30" />
                    <Sparkles className="relative h-4 w-4 text-amber-200" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-300/90">
                      Agent · step {captionStep.step}
                    </span>
                    <span className="block truncate text-[13.5px] text-snow">
                      {TOOL_PLAIN[captionStep.tool] ?? captionStep.tool}
                      {captionStep.summary ? <span className="text-mist"> — {captionStep.summary}</span> : null}
                    </span>
                  </span>
                </div>
              </div>
            )}
          </div>
        </section>

        <aside className="flex min-h-[420px] flex-col xl:min-h-0" aria-label="Who is affected">
          <ImpactResult
            impact={impact.data}
            graph={graph.data}
            cases={cases.data ?? []}
            updated={updated}
            checking={checking}
            selectedCustomer={activeCustomer}
            onSelectCustomer={selectCustomer}
            onOpenCase={openCase}
          />
        </aside>

        <div className="min-h-[320px] lg:order-4 lg:col-span-2 xl:order-none xl:col-span-3 xl:min-h-0">
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
            vendorName={impact.data?.vendor_name ?? "ModelCloud"}
            onViewGraph={(customerId) => {
              setSelectedCustomer(customerId);
              setCenterTab("evidence");
            }}
            onOpenEvidence={(customerId) => {
              setSelectedCustomer(customerId);
              setBottomTab("why");
            }}
            agentPanel={
              <AgentTrace
                run={run}
                history={runs.data ?? []}
                onReplay={(id) => {
                  setCompletedAt(null);
                  setRunId(id);
                }}
                onFocusEntities={(ids) =>
                  setSelectedNode(ids.find((i) => i.startsWith("customer:") || i.startsWith("system:") || i.startsWith("case:")) ?? ids[0] ?? null)
                }
              />
            }
          />
        </div>
      </main>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={cn("h-2 w-2 rounded-full shadow-[0_0_8px_currentColor]", color)} />
      {label}
    </span>
  );
}

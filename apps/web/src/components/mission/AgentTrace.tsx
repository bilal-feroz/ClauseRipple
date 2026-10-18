"use client";

import { AlertTriangle, Bot, CheckCircle2, ChevronDown, CircleSlash, Cpu, Loader2, PlayCircle } from "lucide-react";
import { useState } from "react";
import { Badge, Quote, SectionTitle } from "@/components/ui";
import type { AgentRunState } from "@/hooks/useAgentRun";
import type { AgentRunSummary, ToolCompletedEvent } from "@/lib/types";
import { cn, fmtMs, shortId } from "@/lib/utils";

export function AgentTrace({
  run,
  history,
  onReplay,
  onFocusEntities,
}: {
  run: AgentRunState;
  history: AgentRunSummary[];
  onReplay: (runId: string) => void;
  onFocusEntities: (ids: string[]) => void;
}) {
  const planner = run.planner ?? history[0]?.planner ?? null;
  const isLlm = planner?.startsWith("llm:");
  return (
    <section className="flex h-full min-h-0 flex-1 flex-col" aria-labelledby="agent-title" aria-live="polite">
      <SectionTitle
        right={
          <div className="flex items-center gap-1">
            {run.phase === "running" && (
              <Badge tone="change">
                <Loader2 className="h-3 w-3 animate-spin" /> running
              </Badge>
            )}
            {run.phase === "completed" && <Badge tone="safe">completed</Badge>}
            {run.phase === "failed" && <Badge tone="impact">failed</Badge>}
          </div>
        }
      >
        <span id="agent-title" className="flex items-center gap-1.5">
          <Bot className="h-3.5 w-3.5" /> Change impact agent
        </span>
      </SectionTitle>

      {planner && (
        <div className="mb-2 flex flex-wrap gap-1">
          <Badge tone={isLlm ? "signal" : "neutral"} className="normal-case tracking-normal">
            <Cpu className="h-3 w-3" />
            {isLlm ? `LLM planner · ${planner.slice(4)}` : "Deterministic playbook planner (no LLM)"}
          </Badge>
          <Badge tone="memory" className="normal-case tracking-normal">
            tools via MCP → FalkorDB
          </Badge>
        </div>
      )}

      {run.notices.map((n) => (
        <div key={n} className="mb-2 flex gap-1.5 rounded-md border border-change/40 bg-change/5 p-2 text-[11px] text-amber-100">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          {n}
        </div>
      ))}

      {run.phase === "idle" ? (
        <IdleState history={history} onReplay={onReplay} />
      ) : (
        <ol className="-mr-1 grid min-h-0 flex-1 auto-rows-min content-start gap-1.5 overflow-y-auto pr-1 md:grid-cols-2 2xl:grid-cols-3">
          {run.steps.map((s) => (
            <Step key={s.step} s={s} onFocusEntities={onFocusEntities} />
          ))}
          {run.pendingTool && (
            <li className="orbit-border flex items-center gap-2 rounded-xl border border-amber-300/20 bg-amber-500/[0.05] px-2.5 py-2 text-[11.5px] text-amber-100">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-change" />
              <span className="font-mono">{run.pendingTool.tool}()</span>
            </li>
          )}
          {run.error && (
            <li className="rounded-xl border border-impact/50 bg-impact/10 p-2 text-[11.5px] text-red-200 md:col-span-2 2xl:col-span-3">{run.error}</li>
          )}
          {run.completed && <RunSummary run={run} />}
        </ol>
      )}
    </section>
  );
}

function Step({ s, onFocusEntities }: { s: ToolCompletedEvent; onFocusEntities: (ids: string[]) => void }) {
  const [open, setOpen] = useState(false);
  const ok = s.status === "ok";
  const writes = (s.metrics?.graph_writes ?? 0) > 0;
  return (
    <li className="step-in rounded-xl border border-white/10 bg-white/[0.03] transition hover:border-white/20">
      <button
        type="button"
        onClick={() => {
          setOpen((v) => !v);
          if (s.touched?.length) onFocusEntities(s.touched);
        }}
        aria-expanded={open}
        className="flex w-full items-start gap-2 px-2 py-1.5 text-left"
      >
        {ok ? (
          <CheckCircle2 className={cn("mt-0.5 h-3.5 w-3.5 shrink-0", writes ? "text-red-400" : "text-safe")} />
        ) : s.status === "refused" ? (
          <CircleSlash className="mt-0.5 h-3.5 w-3.5 shrink-0 text-change" />
        ) : (
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-impact" />
        )}
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className="font-mono text-[11.5px] font-semibold text-snow">{s.tool}()</span>
            {writes && <Badge tone="impact" className="!py-0 !text-[9px]">writes</Badge>}
          </span>
          <span className={cn("block text-[11.5px] leading-snug", ok ? "text-mist" : "text-amber-200")}>{s.summary}</span>
        </span>
        <span className="shrink-0 text-right font-mono text-[10px] leading-tight text-fog">
          {fmtMs(s.duration_ms)}
          <br />
          r{s.metrics?.graph_reads ?? 0}/w{s.metrics?.graph_writes ?? 0}
        </span>
        <ChevronDown className={cn("mt-0.5 h-3.5 w-3.5 shrink-0 text-fog transition", open && "rotate-180")} />
      </button>
      {open && (
        <div className="space-y-2 border-t border-line px-2 py-2 text-[11px]">
          <div>
            <div className="eyebrow mb-0.5">Tool input</div>
            <pre className="overflow-x-auto rounded bg-ink-950 p-1.5 font-mono text-[10.5px] text-mist">{JSON.stringify(s.input, null, 1)}</pre>
          </div>
          {s.evidence?.filter((e) => e.quote).length ? (
            <div className="space-y-1">
              <div className="eyebrow">Evidence used</div>
              {s.evidence
                .filter((e) => e.quote)
                .slice(0, 4)
                .map((e, i) => (
                  <Quote key={i} text={e.quote} source={e.src} line={e.line} />
                ))}
            </div>
          ) : null}
          {s.touched?.length ? (
            <div>
              <div className="eyebrow mb-1">Graph entities touched</div>
              <div className="flex flex-wrap gap-1">
                {s.touched.slice(0, 14).map((t) => (
                  <span key={t} className="rounded border border-line bg-ink-800 px-1 font-mono text-[10px] text-mist">
                    {shortId(t)}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
          <div className="grid grid-cols-4 gap-1 font-mono text-[10px] text-fog">
            <span>reads {s.metrics?.graph_reads ?? 0}</span>
            <span>writes {s.metrics?.graph_writes ?? 0}</span>
            <span>db {fmtMs(s.metrics?.db_time_ms)}</span>
            <span>{s.via ?? "mcp"}</span>
          </div>
          {s.metrics?.queries?.length ? (
            <div className="font-mono text-[10px] text-fog">cypher: {s.metrics.queries.join(", ")}</div>
          ) : null}
        </div>
      )}
    </li>
  );
}

function RunSummary({ run }: { run: AgentRunState }) {
  const c = run.completed!;
  const stats: [string, string | number][] = [
    ["tools", c.tool_count],
    ["graph reads", c.graph_reads],
    ["graph writes", c.graph_writes],
    ["FalkorDB time", fmtMs(c.db_time_ms)],
    ["tool time", fmtMs(c.tool_time_ms)],
    ["wall clock", fmtMs(c.duration_ms)],
  ];
  return (
    <li className="step-in rounded-xl border border-emerald-300/25 bg-emerald-400/[0.06] p-2.5 md:col-span-2 2xl:col-span-3">
      <div className="eyebrow mb-1 !text-green-300/90">Run {c.ref ?? ""} · {c.status.toLowerCase()}</div>
      <p className="mb-2 text-[11.5px] leading-snug text-snow">{c.summary}</p>
      {c.llm_summary && <p className="mb-2 text-[11px] italic leading-snug text-mist">Planner: {c.llm_summary}</p>}
      <div className="grid grid-cols-3 gap-1.5 lg:grid-cols-6">
        {stats.map(([k, v]) => (
          <div key={k} className="rounded-lg border border-white/10 bg-black/25 px-2 py-1">
            <div className="font-mono text-[12px] font-semibold text-snow tabular-nums">{v}</div>
            <div className="text-[9.5px] text-fog">{k}</div>
          </div>
        ))}
      </div>
      {c.pacing_ms ? (
        <p className="mt-1.5 text-[10px] text-fog">
          Wall clock includes a {c.pacing_ms} ms readable pause between steps; tool and FalkorDB times are measured.
        </p>
      ) : null}
    </li>
  );
}

function IdleState({ history, onReplay }: { history: AgentRunSummary[]; onReplay: (id: string) => void }) {
  return (
    <div className="flex flex-1 flex-col gap-2 text-[12px] text-fog">
      <p>
        Idle. The agent wakes up when a source change lands in the graph. Apply the ModelCloud DPA v2 to trigger it.
      </p>
      {history.length > 0 && (
        <div>
          <div className="eyebrow mb-1">Persisted runs (FalkorDB)</div>
          <ul className="space-y-1">
            {history.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => onReplay(r.id)}
                  className="flex w-full items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-left transition hover:border-sky-300/40"
                >
                  <PlayCircle className="h-3.5 w-3.5 text-signal" />
                  <span className="font-mono text-[11px] text-snow">{r.ref}</span>
                  <span className="min-w-0 flex-1 truncate text-[11px]">{r.created_cases.join(", ") || r.status}</span>
                  <span className="text-[10px]">{r.tool_count ?? 0} tools</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

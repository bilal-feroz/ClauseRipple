"use client";

import { ArrowRight, Check, CheckCircle2, Cloud, Loader2, Zap } from "lucide-react";
import type { ReactNode } from "react";
import type { AgentRunState } from "@/hooks/useAgentRun";
import type { DiffLine, ImpactCase, ImpactAnalysis, PendingChange } from "@/lib/types";
import { cn } from "@/lib/utils";
import { listRegions, regionsInDiff } from "./plain";

export type AppliedChange = {
  ref: string;
  diff?: DiffLine[];
  addedFacts: { subject: string; rel: string; object: string; quote?: string }[];
  incrementalMs?: number;
  retained?: number;
};

export function ChangeStory({
  pending,
  updated,
  applied,
  impact,
  cases,
  run,
  onApply,
  applying,
  disabled,
  watching,
  onShowAgent,
}: {
  pending: PendingChange | undefined;
  updated: boolean;
  applied: AppliedChange | null;
  impact: ImpactAnalysis | undefined;
  cases: ImpactCase[];
  run: AgentRunState;
  onApply: () => void;
  applying: boolean;
  disabled: boolean;
  watching?: number;
  onShowAgent: () => void;
}) {
  const diff = pending?.diff?.some((l) => l.kind === "add" || l.kind === "del") ? pending.diff : applied?.diff ?? [];
  const { before, after } = regionsInDiff(diff);
  const added = after.filter((c) => !before.includes(c));
  const running = run.phase === "running";
  const evaluated = !running || run.steps.some((s) => s.tool === "evaluate_residency" && s.status === "ok");
  const impacted = (impact?.verdicts ?? []).filter((v) => v.affected);
  const assigned = cases.filter((c) => c.assignee);
  const ownersDone = assigned.length > 0 || (!running && !!run.completed);

  const milestones = [true, true, evaluated, ownersDone];
  const progress = milestones.filter(Boolean).length / milestones.length;

  return (
    <section className="panel flex h-full min-h-0 flex-col p-4" aria-labelledby="change-title">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 id="change-title" className="whitespace-nowrap text-[17px] font-semibold tracking-tight text-snow">
          {updated ? "What changed" : "What's about to change"}
        </h2>
        <span
          className={cn(
            "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11.5px] font-medium",
            updated ? "border-amber-400/50 bg-amber-500/10 text-amber-200" : "border-sky-400/40 bg-sky-500/10 text-sky-200",
          )}
        >
          <span className="relative flex h-1.5 w-1.5">
            <span className={cn("ping-soft absolute inset-0 rounded-full", updated ? "bg-amber-400" : "bg-sky-400")} />
            <span className={cn("relative h-1.5 w-1.5 rounded-full", updated ? "bg-amber-400" : "bg-sky-400")} />
          </span>
          {updated ? "Contract updated · v2" : "Today · v1"}
        </span>
      </div>

      {!updated ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
            <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-3.5">
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-sky-400/30 to-indigo-500/10 ring-1 ring-sky-300/30">
                  <Cloud className="h-5 w-5 text-sky-200" />
                </span>
                <div className="min-w-0 leading-tight">
                  <div className="text-[15px] font-semibold text-snow">ModelCloud is changing its contract</div>
                  <div className="mt-0.5 text-[12.5px] text-mist">Its data processing terms (DPA) go from v1 to v2.</div>
                </div>
              </div>
              <div className="mt-3 flex items-center gap-2 font-mono text-[11.5px]">
                <span className="rounded-md border border-slate-500/40 bg-ink-800/80 px-1.5 py-0.5 text-mist">DPA v1</span>
                <span className="relative h-[2px] flex-1 overflow-hidden rounded-full bg-white/10">
                  <span className="connector absolute inset-0 text-amber-300/80" />
                </span>
                <span className="rounded-md border border-amber-400/60 bg-amber-500/15 px-1.5 py-0.5 font-semibold text-amber-200 shadow-[0_0_14px_-4px_rgba(245,158,11,0.8)]">
                  DPA v2
                </span>
              </div>
            </div>

            <div>
              <div className="eyebrow mb-2">Where it may process customer data</div>
              <div className="space-y-2 text-[13px]">
                <RegionRow label="Today">
                  {before.map((c) => (
                    <Chip key={c}>{c}</Chip>
                  ))}
                </RegionRow>
                <RegionRow label="New version">
                  {after.map((c) => (
                    <Chip key={c} tone={added.includes(c) ? "change" : undefined}>
                      {c}
                      {added.includes(c) ? " · new" : ""}
                    </Chip>
                  ))}
                </RegionRow>
              </div>
            </div>

            <details className="group text-[13px] text-mist">
              <summary className="cursor-pointer list-none hover:text-snow">
                <span className="mr-1 inline-block transition-transform group-open:rotate-90">▸</span>
                Show the exact sentence that changed
              </summary>
              <div className="mt-2 space-y-1 rounded-xl border border-white/[0.08] bg-black/40 p-2.5 font-mono text-[11px] leading-snug">
                {diff
                  .filter((l) => l.kind === "add" || l.kind === "del")
                  .map((l, i) => (
                    <div key={i} className={l.kind === "del" ? "text-red-200/80 line-through" : "text-green-100"}>
                      {l.kind === "del" ? "− " : "+ "}
                      {l.text}
                    </div>
                  ))}
              </div>
            </details>
          </div>
          <div className="mt-3">
            <div className="mb-3 flex items-center gap-3 rounded-2xl border border-sky-300/15 bg-sky-400/[0.05] px-3 py-2.5 [@media(max-height:820px)]:hidden">
              <span className="relative flex h-8 w-8 shrink-0 items-center justify-center" aria-hidden>
                <span className="ping-soft absolute inset-1 rounded-full border border-sky-300/60" />
                <span className="ping-soft absolute inset-1 rounded-full border border-sky-300/40" style={{ animationDelay: "1s" }} />
                <span className="h-2.5 w-2.5 rounded-full bg-sky-300 shadow-[0_0_12px_rgba(125,211,252,0.95)]" />
              </span>
              <span className="min-w-0 leading-tight">
                <span className="block text-[13px] font-semibold text-snow">Agent on standby</span>
                <span className="block text-[11.5px] text-mist">
                  Watching {watching ?? "the"} source documents in FalkorDB for changes
                </span>
              </span>
            </div>
            <button
              type="button"
              onClick={onApply}
              disabled={applying || disabled}
              className={cn(
                "sheen flex w-full items-center justify-center gap-2.5 rounded-2xl border border-amber-300/80 bg-gradient-to-b from-amber-400 to-orange-600 px-4 py-3.5 text-[15.5px] font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50",
                !applying && !disabled && "cta-glow",
              )}
            >
              {applying ? <Loader2 className="h-5 w-5 animate-spin" /> : <Zap className="h-5 w-5 fill-amber-100 text-amber-100" />}
              {applying ? "Applying…" : "Apply the new contract"}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-white/[0.07]" aria-hidden>
            <div
              className={cn(
                "h-full rounded-full transition-[width] duration-700 ease-out",
                running ? "progress-live" : "bg-gradient-to-r from-sky-400 via-cyan-300 to-emerald-400",
              )}
              style={{ width: `${Math.max(8, progress * 100)}%` }}
            />
          </div>
          <ol className="min-h-0 flex-1 overflow-y-auto pr-1">
            <Milestone done line>
              <div className="text-[14.5px] font-semibold text-snow">ModelCloud&apos;s contract changed</div>
              <div className="mt-0.5 text-[12.5px] text-mist">Data processing terms updated from v1 to v2{applied ? ` (${applied.ref})` : ""}.</div>
            </Milestone>
            <Milestone done line>
              <div className="text-[14.5px] font-semibold text-snow">New place data can go</div>
              <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[12.5px] text-mist">
                Added:
                {added.length ? <Chip tone="change">{listRegions(added.map((c) => (c === "US" ? "United States" : c)))}</Chip> : "—"}
              </div>
            </Milestone>
            <Milestone done={evaluated} active={running && !evaluated} tone={impacted.length ? "impact" : "safe"} line>
              {running && !evaluated ? (
                <div className="text-[14.5px] font-semibold text-snow">Checking every customer…</div>
              ) : (
                <>
                  <div className="text-[14.5px] font-semibold text-snow">
                    {impacted.length} customer{impacted.length === 1 ? "" : "s"} now in breach
                  </div>
                  <div className="mt-0.5 text-[12.5px] text-mist">{impacted.map((v) => v.customer_name).join(" and ") || "Nobody is affected"}</div>
                </>
              )}
            </Milestone>
            <Milestone done={ownersDone} active={running && evaluated && !ownersDone}>
              {assigned.length ? (
                <>
                  <div className="text-[14.5px] font-semibold text-snow">Owners notified</div>
                  <div className="mt-0.5 text-[12.5px] text-mist">{assigned.map((c) => `${c.ref} → ${c.assignee}`).join(" · ")}</div>
                </>
              ) : (
                <div className="text-[14.5px] font-semibold text-fog">{running ? "Finding who needs to act…" : "Waiting for the agent"}</div>
              )}
            </Milestone>
          </ol>

          <button
            type="button"
            onClick={onShowAgent}
            className={cn(
              "mt-3 flex items-center gap-2.5 rounded-2xl border px-3.5 py-3 text-left text-[13px] transition",
              running
                ? "orbit-border border-amber-300/30 bg-amber-500/[0.07] text-amber-50"
                : "border-emerald-300/25 bg-emerald-400/[0.06] text-mist hover:border-emerald-300/50 hover:text-snow",
            )}
          >
            {running ? (
              <Loader2 className="h-4 w-4 shrink-0 animate-spin text-amber-300" />
            ) : (
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
            )}
            <span className="min-w-0 flex-1 truncate">
              {running
                ? `Agent working · ${run.steps.length} step${run.steps.length === 1 ? "" : "s"} done`
                : run.completed
                  ? `Agent finished in ${run.completed.tool_count} steps`
                  : "See what the agent did"}
            </span>
            <ArrowRight className="h-4 w-4 shrink-0" />
          </button>
        </div>
      )}
    </section>
  );
}

function RegionRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-2 text-mist">
      <span className="w-[86px] shrink-0 text-[12px]">{label}</span>
      <span className="flex flex-wrap gap-1.5">{children}</span>
    </div>
  );
}

/** One step of the mission timeline; `line` draws the connector down to the next step. */
function Milestone({
  done,
  active,
  tone,
  line,
  children,
}: {
  done?: boolean;
  active?: boolean;
  tone?: "impact" | "safe";
  line?: boolean;
  children: ReactNode;
}) {
  return (
    <li className="relative flex gap-3 pb-4">
      {line && (
        <span aria-hidden className="absolute bottom-0 left-[13px] top-8 w-[2px] -translate-x-1/2 overflow-hidden rounded-full bg-white/[0.08]">
          <span className={cn("block w-full rounded-full bg-gradient-to-b from-sky-300 to-sky-500/40 transition-[height] duration-700", done ? "h-full" : "h-0")} />
        </span>
      )}
      <span
        className={cn(
          "relative mt-0.5 flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full border transition-all duration-500",
          done
            ? tone === "impact"
              ? "pop-in border-rose-300 bg-gradient-to-br from-rose-400 to-red-600 text-white shadow-[0_0_16px_-2px_rgba(244,63,94,0.9)]"
              : "pop-in border-sky-200 bg-gradient-to-br from-sky-300 to-cyan-500 text-ink-950 shadow-[0_0_16px_-2px_rgba(56,189,248,0.9)]"
            : active
              ? "border-amber-300/70 bg-amber-500/10 text-amber-200"
              : "border-white/15 bg-white/[0.03] text-fog",
        )}
      >
        {done ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : active ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      </span>
      <div className="min-w-0 leading-snug">{children}</div>
    </li>
  );
}

function Chip({ children, tone }: { children: ReactNode; tone?: "change" }) {
  return (
    <span
      className={cn(
        "rounded-lg border px-2 py-0.5 text-[12.5px] font-bold",
        tone === "change"
          ? "alarm-amber border-amber-300/80 bg-amber-500/15 text-amber-200 shadow-[0_0_16px_-4px_rgba(245,158,11,0.9)]"
          : "border-white/15 bg-white/[0.05] text-snow",
      )}
    >
      {children}
    </span>
  );
}

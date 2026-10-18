"use client";

import { ArrowRight, CheckCircle2, FileText, Globe2, Loader2, UserCheck, Users, Zap } from "lucide-react";
import type { ReactNode } from "react";
import type { AgentRunState } from "@/hooks/useAgentRun";
import type { DiffLine, ImpactCase, ImpactAnalysis, PendingChange } from "@/lib/types";
import { cn } from "@/lib/utils";
import { TOOL_PLAIN, listRegions, regionsInDiff } from "./plain";

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
  onShowAgent: () => void;
}) {
  const diff = pending?.diff?.some((l) => l.kind === "add" || l.kind === "del") ? pending.diff : applied?.diff ?? [];
  const { before, after } = regionsInDiff(diff);
  const added = after.filter((c) => !before.includes(c));
  const running = run.phase === "running";
  const evaluated = !running || run.steps.some((s) => s.tool === "evaluate_residency" && s.status === "ok");
  const impacted = (impact?.verdicts ?? []).filter((v) => v.affected);
  const assigned = cases.filter((c) => c.assignee);

  return (
    <section className="panel flex h-full min-h-0 flex-col p-5" aria-labelledby="change-title">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
        <h2 id="change-title" className="whitespace-nowrap text-[19px] font-semibold tracking-tight text-snow">
          {updated ? "What changed" : "What's about to change"}
        </h2>
        <span
          className={cn(
            "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] font-medium",
            updated ? "border-amber-400/60 bg-amber-500/10 text-amber-200" : "border-sky-400/50 bg-sky-500/10 text-sky-200",
          )}
        >
          <span className={cn("h-2 w-2 rounded-full", updated ? "bg-amber-400" : "bg-sky-400")} />
          {updated ? "Contract updated · v2" : "Today · v1"}
        </span>
      </div>

      {!updated ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto">
            <Row icon={<FileText className="h-6 w-6 text-sky-300" />} n={1} line>
              <div className="text-[15.5px] font-semibold text-snow">ModelCloud is changing its contract</div>
              <div className="mt-0.5 text-[14px] text-mist">Its data processing terms (DPA) go from v1 to v2.</div>
            </Row>
            <Row icon={<Globe2 className="h-6 w-6 text-sky-300" />} n={2} line>
              <div className="text-[15.5px] font-semibold text-snow">Where it may process customer data</div>
              <div className="mt-2.5 space-y-2 text-[14px]">
                <div className="flex flex-wrap items-center gap-2 text-mist">
                  <span className="mr-0.5">Today:</span>
                  {before.map((c) => (
                    <Chip key={c}>{c}</Chip>
                  ))}
                </div>
                <div className="flex flex-wrap items-center gap-2 text-mist">
                  <span className="mr-0.5">New version:</span>
                  {after.map((c) => (
                    <Chip key={c} tone={added.includes(c) ? "change" : undefined}>
                      {c}
                      {added.includes(c) ? " · new" : ""}
                    </Chip>
                  ))}
                </div>
              </div>
            </Row>
            <details className="mb-4 ml-[52px] text-[14px] text-mist">
              <summary className="cursor-pointer hover:text-snow">Show the exact sentence that changed</summary>
              <div className="mt-2 space-y-1 rounded-lg border border-line bg-ink-950/80 p-2.5 font-mono text-[11.5px] leading-snug">
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
            <button
              type="button"
              onClick={onApply}
              disabled={applying || disabled}
              className="flex w-full items-center justify-center gap-2.5 rounded-xl border border-amber-400 bg-gradient-to-b from-amber-500/75 to-amber-700/60 px-4 py-3.5 text-[16px] font-semibold text-white shadow-[0_0_32px_-6px_rgba(245,158,11,0.75),inset_0_1px_0_rgba(255,255,255,0.25)] transition hover:from-amber-400/85 hover:to-amber-600/70 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {applying ? <Loader2 className="h-5 w-5 animate-spin" /> : <Zap className="h-5 w-5 text-amber-100" />}
              {applying ? "Applying…" : "Apply the new contract"}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto">
            <Row icon={<FileText className="h-6 w-6 text-amber-300" />} n={1} done line>
              <div className="text-[15.5px] font-semibold text-snow">ModelCloud&apos;s contract changed</div>
              <div className="mt-0.5 text-[14px] text-mist">Data processing terms updated from v1 to v2{applied ? ` (${applied.ref})` : ""}.</div>
            </Row>
            <Row icon={<Globe2 className="h-6 w-6 text-amber-300" />} n={2} done line>
              <div className="text-[15.5px] font-semibold text-snow">New place data can go</div>
              <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[14px] text-mist">
                Added:
                {added.length ? (
                  <Chip tone="change">{listRegions(added.map((c) => (c === "US" ? "United States" : c)))}</Chip>
                ) : (
                  "—"
                )}
              </div>
            </Row>
            <Row
              icon={running && !evaluated ? <Loader2 className="h-6 w-6 animate-spin text-amber-300" /> : <Users className="h-6 w-6 text-red-300" />}
              n={3}
              done={evaluated}
              line
            >
              {running && !evaluated ? (
                <div className="text-[15.5px] font-semibold text-snow">Checking every customer…</div>
              ) : (
                <>
                  <div className="text-[15.5px] font-semibold text-snow">
                    {impacted.length} customer{impacted.length === 1 ? "" : "s"} now in breach
                  </div>
                  <div className="mt-0.5 text-[14px] text-mist">{impacted.map((v) => v.customer_name).join(" and ") || "Nobody is affected"}</div>
                </>
              )}
            </Row>
            <Row icon={<UserCheck className="h-6 w-6 text-sky-300" />} n={4} done={assigned.length > 0}>
              {assigned.length ? (
                <>
                  <div className="text-[15.5px] font-semibold text-snow">Owners notified</div>
                  <div className="mt-0.5 text-[14px] text-mist">{assigned.map((c) => `${c.ref} → ${c.assignee}`).join(" · ")}</div>
                </>
              ) : (
                <div className="text-[15.5px] font-semibold text-fog">{running ? "Finding who needs to act…" : "Waiting for the agent"}</div>
              )}
            </Row>
          </div>

          <button
            type="button"
            onClick={onShowAgent}
            className="mt-3 flex items-center gap-2.5 rounded-xl border border-line-strong bg-ink-900/70 px-3.5 py-3 text-left text-[13.5px] text-mist transition hover:border-sky-400/50 hover:text-snow"
          >
            {running ? (
              <Loader2 className="h-4 w-4 shrink-0 animate-spin text-change" />
            ) : (
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
            )}
            <span className="min-w-0 flex-1 truncate">
              {running
                ? `Agent: ${TOOL_PLAIN[run.pendingTool?.tool ?? run.steps[run.steps.length - 1]?.tool ?? ""] ?? "starting"}…`
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

/** One numbered step of the story; `line` draws the timeline down to the next step. */
function Row({ icon, n, done, line, children }: { icon: ReactNode; n: number; done?: boolean; line?: boolean; children: ReactNode }) {
  return (
    <div className="relative flex gap-3 pb-5">
      {line && <span aria-hidden className="absolute bottom-0 left-4 top-10 w-px -translate-x-1/2 bg-gradient-to-b from-sky-400/40 to-line-strong" />}
      <span
        className={cn(
          "relative mt-1.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-[14px] font-bold",
          done
            ? "border-sky-300 bg-sky-400 text-ink-950 shadow-[0_0_14px_-2px_rgba(56,189,248,0.8)]"
            : "border-line-strong bg-ink-850 text-snow",
        )}
      >
        {n}
      </span>
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-line-strong bg-ink-900/80 shadow-[inset_0_0_12px_-6px_rgba(56,189,248,0.5)]">
        {icon}
      </span>
      <div className="min-w-0 pt-0.5 leading-snug">{children}</div>
    </div>
  );
}

function Chip({ children, tone }: { children: ReactNode; tone?: "change" }) {
  return (
    <span
      className={cn(
        "rounded-lg border px-2.5 py-1 text-[13px] font-bold",
        tone === "change"
          ? "border-amber-400/80 bg-amber-500/15 text-amber-300 shadow-[0_0_14px_-4px_rgba(245,158,11,0.7)]"
          : "border-slate-500/50 bg-ink-800/80 text-snow",
      )}
    >
      {children}
    </span>
  );
}

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
    <section className="panel flex h-full min-h-0 flex-col p-4" aria-labelledby="change-title">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 id="change-title" className="text-[17px] font-semibold tracking-tight text-snow">
          {updated ? "What changed" : "What's about to change"}
        </h2>
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11.5px] font-medium",
            updated ? "border-change/50 bg-change/10 text-amber-200" : "border-signal/40 bg-signal/10 text-sky-200",
          )}
        >
          <span className={cn("h-1.5 w-1.5 rounded-full", updated ? "bg-change" : "bg-signal")} />
          {updated ? "Contract updated · v2" : "Today · v1"}
        </span>
      </div>

      {!updated ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <Row icon={<FileText className="h-5 w-5 text-sky-300" />} n={1}>
            <div className="font-semibold text-snow">ModelCloud is changing its contract</div>
            <div className="text-[12.5px] text-mist">Its data processing terms (DPA) go from v1 to v2.</div>
          </Row>
          <Row icon={<Globe2 className="h-5 w-5 text-sky-300" />} n={2}>
            <div className="font-semibold text-snow">Where it may process customer data</div>
            <div className="mt-1.5 space-y-1.5 text-[12.5px]">
              <div className="flex flex-wrap items-center gap-1.5 text-mist">
                Today:
                {before.map((c) => (
                  <Chip key={c}>{c}</Chip>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-1.5 text-mist">
                New version:
                {after.map((c) => (
                  <Chip key={c} tone={added.includes(c) ? "change" : undefined}>
                    {c}
                    {added.includes(c) ? " · new" : ""}
                  </Chip>
                ))}
              </div>
            </div>
          </Row>
          <details className="mb-3 ml-11 text-[12px] text-fog">
            <summary className="cursor-pointer hover:text-mist">Show the exact sentence that changed</summary>
            <div className="mt-2 space-y-1 rounded-md border border-line bg-ink-950/80 p-2 font-mono text-[11px] leading-snug">
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
          <div className="mt-auto">
            <button
              type="button"
              onClick={onApply}
              disabled={applying || disabled}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-change/70 bg-gradient-to-b from-change/30 to-change/15 px-4 py-3 text-[14px] font-semibold text-amber-50 shadow-[0_0_30px_-8px_rgba(245,158,11,0.6)] transition hover:from-change/40 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {applying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
              {applying ? "Applying…" : "Apply the new contract"}
            </button>
            <p className="mt-2 text-center text-[11.5px] text-fog">Then watch ClauseRipple find who it breaks.</p>
          </div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          <Row icon={<FileText className="h-5 w-5 text-amber-300" />} n={1} done>
            <div className="font-semibold text-snow">ModelCloud&apos;s contract changed</div>
            <div className="text-[12.5px] text-mist">Data processing terms updated from v1 to v2{applied ? ` (${applied.ref})` : ""}.</div>
          </Row>
          <Row icon={<Globe2 className="h-5 w-5 text-amber-300" />} n={2} done>
            <div className="font-semibold text-snow">New place data can go</div>
            <div className="text-[12.5px] text-mist">
              Added: <span className="font-semibold text-amber-200">{added.length ? listRegions(added.map((c) => (c === "US" ? "United States" : c))) : "—"}</span>
            </div>
          </Row>
          <Row icon={running && !evaluated ? <Loader2 className="h-5 w-5 animate-spin text-amber-300" /> : <Users className="h-5 w-5 text-red-300" />} n={3} done={evaluated}>
            {running && !evaluated ? (
              <div className="font-semibold text-snow">Checking every customer…</div>
            ) : (
              <>
                <div className="font-semibold text-snow">
                  {impacted.length} customer{impacted.length === 1 ? "" : "s"} now in breach
                </div>
                <div className="text-[12.5px] text-mist">{impacted.map((v) => v.customer_name).join(" and ") || "Nobody is affected"}</div>
              </>
            )}
          </Row>
          <Row icon={<UserCheck className="h-5 w-5 text-sky-300" />} n={4} done={assigned.length > 0}>
            {assigned.length ? (
              <>
                <div className="font-semibold text-snow">Owners notified</div>
                <div className="text-[12.5px] text-mist">
                  {assigned.map((c) => `${c.ref} → ${c.assignee}`).join(" · ")}
                </div>
              </>
            ) : (
              <div className="font-semibold text-fog">{running ? "Finding who needs to act…" : "Waiting for the agent"}</div>
            )}
          </Row>

          <button
            type="button"
            onClick={onShowAgent}
            className="mt-auto flex items-center gap-2 rounded-lg border border-line bg-ink-900/70 px-3 py-2 text-left text-[12px] text-mist transition hover:border-line-strong hover:text-snow"
          >
            {running ? (
              <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-change" />
            ) : (
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-safe" />
            )}
            <span className="min-w-0 flex-1 truncate">
              {running
                ? `Agent: ${TOOL_PLAIN[run.pendingTool?.tool ?? run.steps[run.steps.length - 1]?.tool ?? ""] ?? "starting"}…`
                : run.completed
                  ? `Agent finished in ${run.completed.tool_count} steps`
                  : "See what the agent did"}
            </span>
            <ArrowRight className="h-3.5 w-3.5 shrink-0" />
          </button>
        </div>
      )}
    </section>
  );
}

function Row({ icon, n, done, children }: { icon: ReactNode; n: number; done?: boolean; children: ReactNode }) {
  return (
    <div className="mb-4 flex gap-3">
      <span
        className={cn(
          "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[12.5px] font-bold",
          done ? "bg-signal text-ink-950" : "bg-ink-700 text-mist",
        )}
      >
        {n}
      </span>
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-line bg-ink-900/70">{icon}</span>
      <div className="min-w-0 text-[13.5px] leading-snug">{children}</div>
    </div>
  );
}

function Chip({ children, tone }: { children: ReactNode; tone?: "change" }) {
  return (
    <span
      className={cn(
        "rounded-md border px-1.5 py-0.5 text-[11.5px] font-semibold",
        tone === "change" ? "border-change/60 bg-change/15 text-amber-100" : "border-line-strong bg-ink-800 text-mist",
      )}
    >
      {children}
    </span>
  );
}

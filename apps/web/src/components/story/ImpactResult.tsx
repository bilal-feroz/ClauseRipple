"use client";

import { Building2, ChevronRight, Info, Landmark, Loader2, ShieldCheck, Store, type LucideIcon } from "lucide-react";
import type { GraphSnapshot, ImpactAnalysis, ImpactCase } from "@/lib/types";
import { cn, fmtUsd } from "@/lib/utils";
import { listRegions, plainVerdict } from "./plain";

const SEGMENT_ICON: Record<string, LucideIcon> = {
  Banking: Landmark,
  Insurance: ShieldCheck,
  Retail: Store,
  Government: Building2,
};

const BADGE = {
  impact: "border-red-400/80 bg-red-500/20 text-red-200 shadow-[0_0_14px_-4px_rgba(239,68,68,0.8)]",
  safe: "border-emerald-400/70 bg-emerald-500/10 text-emerald-300",
  neutral: "border-slate-500/60 bg-ink-800 text-mist",
  pending: "border-amber-400/60 bg-amber-500/10 text-amber-200",
};

const CARD = {
  impact: "border-red-500/55 bg-gradient-to-br from-red-500/[0.18] via-red-500/[0.07] to-transparent",
  safe: "border-emerald-400/25 bg-gradient-to-br from-emerald-400/[0.13] via-teal-500/[0.06] to-cyan-500/[0.03]",
  neutral: "border-line-strong bg-ink-900/50",
  pending: "border-amber-400/35 bg-gradient-to-br from-amber-500/[0.1] to-transparent",
};

const ICON = { impact: "text-red-400", safe: "text-emerald-300", neutral: "text-sky-300", pending: "text-amber-300" };

function initials(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2);
}

export function ImpactResult({
  impact,
  graph,
  cases,
  updated,
  checking,
  selectedCustomer,
  onSelectCustomer,
  onOpenCase,
}: {
  impact: ImpactAnalysis | undefined;
  graph: GraphSnapshot | undefined;
  cases: ImpactCase[];
  updated: boolean;
  checking: boolean;
  selectedCustomer: string | null;
  onSelectCustomer: (id: string) => void;
  onOpenCase: (id: string) => void;
}) {
  const verdicts = impact?.verdicts ?? [];
  const added = (impact?.vendor_region_evidence ?? []).filter((r) => r.change_id).map((r) => r.code);
  const impacted = verdicts.filter((v) => v.affected);
  const segment = new Map((graph?.nodes ?? []).map((n) => [n.id, n.segment ?? ""]));

  return (
    <section className="panel flex h-full min-h-0 flex-col p-5" aria-labelledby="result-title">
      <h2 id="result-title" className="mb-4 text-[20px] font-semibold tracking-tight text-snow">
        Who is affected
      </h2>
      <div className="-mr-2 min-h-0 flex-1 overflow-y-auto pr-2">
        <ul className="space-y-2.5" aria-label="Customer verdicts">
          {verdicts.map((v) => {
            const plain = checking ? { label: "Checking", tone: "pending" as const, reason: "Reading the contract…" } : plainVerdict(v, updated, added, impact?.vendor_name);
            const Icon = SEGMENT_ICON[segment.get(v.customer_id) ?? ""] ?? Building2;
            const c = cases.find((x) => x.customer_id === v.customer_id);
            return (
              <li key={v.customer_id}>
                <button
                  type="button"
                  onClick={() => onSelectCustomer(v.customer_id)}
                  aria-pressed={selectedCustomer === v.customer_id}
                  className={cn(
                    "flex min-h-[76px] w-full items-center gap-3.5 rounded-2xl border px-4 py-3 text-left transition-[border-color,box-shadow,filter] hover:brightness-125",
                    CARD[plain.tone],
                    selectedCustomer === v.customer_id &&
                      (plain.tone === "impact"
                        ? "border-red-400 shadow-[0_0_24px_-6px_rgba(239,68,68,0.75)]"
                        : "border-sky-400/90 shadow-[0_0_24px_-6px_rgba(56,189,248,0.7)]"),
                  )}
                >
                  <Icon className={cn("h-8 w-8 shrink-0", ICON[plain.tone])} strokeWidth={1.75} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate text-[16.5px] font-semibold text-snow">{v.customer_name}</span>
                      <span className={cn("shrink-0 rounded-lg border px-2.5 py-1 text-[12px] font-bold uppercase tracking-wide", BADGE[plain.tone])}>
                        {plain.tone === "pending" ? <Loader2 className="inline h-3.5 w-3.5 animate-spin" /> : plain.label}
                      </span>
                    </span>
                    <span className="mt-1 flex items-end justify-between gap-2">
                      <span className="text-[13px] leading-snug text-mist">{plain.reason}</span>
                      {c && <span className="shrink-0 font-mono text-[11.5px] text-red-200">{c.ref}</span>}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>

        {updated && !checking && (
          <div className="mt-4 flex gap-2.5 rounded-xl border border-sky-400/20 bg-sky-500/[0.06] p-3 text-[13px] leading-snug text-mist">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-sky-300" />
            <p>
              {impacted.length
                ? `${impact?.vendor_name} may now use ${listRegions(added)}, but ${impacted.map((v) => v.customer_name).join(" and ")} only allow ${listRegions(impacted[0].allowed_regions)}. ${fmtUsd(impact?.summary.acv_at_risk_usd)} of yearly contracts at risk.`
                : "Nobody's contract is broken by this change."}
            </p>
          </div>
        )}

        {cases.length > 0 && (
          <div className="mt-4">
            <h3 className="mb-2 text-[12.5px] font-semibold uppercase tracking-[0.14em] text-sky-300">Who needs to act</h3>
            <ul className="space-y-2">
              {cases.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => onOpenCase(c.id)}
                    className="flex w-full items-center gap-3 rounded-xl border border-line-strong bg-ink-900/60 px-3 py-2.5 text-left transition hover:border-sky-400/60"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-sky-400/50 bg-sky-500/20 text-[12.5px] font-bold text-sky-200">
                      {initials(c.assignee ?? c.suggested_owner)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[14px] font-semibold text-snow">{c.assignee ?? c.suggested_owner}</span>
                      <span className="block truncate text-[12px] text-mist">
                        {c.team ?? c.suggested_team} · case {c.ref} for {c.customer ?? c.customer_name}
                      </span>
                    </span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-fog" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}

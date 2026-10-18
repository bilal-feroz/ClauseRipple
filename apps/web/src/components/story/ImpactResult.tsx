"use client";

import { Building2, Landmark, Loader2, ShieldCheck, Store, type LucideIcon } from "lucide-react";
import { useCountUp } from "@/hooks/useCountUp";
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
  impact: "border-rose-300/80 bg-rose-500/25 text-rose-100 shadow-[0_0_14px_-3px_rgba(244,63,94,0.9)]",
  safe: "border-emerald-300/50 bg-emerald-400/10 text-emerald-200",
  neutral: "border-white/15 bg-white/5 text-mist",
  pending: "border-amber-300/60 bg-amber-500/10 text-amber-200",
};

const CARD = {
  impact: "alarm border-rose-400/70 bg-gradient-to-br from-rose-500/[0.2] via-red-500/[0.07] to-transparent",
  safe: "border-emerald-300/20 bg-gradient-to-br from-emerald-400/[0.09] via-teal-500/[0.03] to-transparent",
  neutral: "border-white/10 bg-white/[0.03]",
  pending: "border-amber-300/40 bg-gradient-to-br from-amber-500/[0.1] to-transparent",
};

const TILE = {
  impact: "bg-gradient-to-br from-rose-500/45 to-red-700/20 ring-1 ring-rose-300/50 text-rose-100",
  safe: "bg-gradient-to-br from-emerald-400/25 to-teal-600/5 ring-1 ring-emerald-300/30 text-emerald-200",
  neutral: "bg-gradient-to-br from-sky-400/25 to-indigo-500/5 ring-1 ring-sky-300/25 text-sky-200",
  pending: "bg-gradient-to-br from-amber-400/30 to-orange-600/5 ring-1 ring-amber-300/40 text-amber-200",
};

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
  const atRisk = useCountUp(updated && !checking ? impact?.summary.acv_at_risk_usd ?? 0 : 0, 1400);

  const status = checking
    ? { text: "Checking…", cls: "border-amber-300/50 bg-amber-500/10 text-amber-200" }
    : impacted.length
      ? { text: `${impacted.length} in breach`, cls: "border-rose-300/60 bg-rose-500/15 text-rose-100" }
      : { text: "All compliant", cls: "border-emerald-300/40 bg-emerald-400/10 text-emerald-200" };

  return (
    <section className="panel flex h-full min-h-0 flex-col p-4" aria-labelledby="result-title">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 id="result-title" className="text-[17px] font-semibold tracking-tight text-snow">
          Who is affected
        </h2>
        <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11.5px] font-semibold", status.cls)}>
          {checking && <Loader2 className="h-3 w-3 animate-spin" />}
          {status.text}
        </span>
      </div>
      <div className="-mr-2 min-h-0 flex-1 overflow-y-auto pr-2">
        {updated && !checking && impacted.length > 0 && (
          <div className="step-in mb-3 rounded-2xl border border-rose-300/25 bg-gradient-to-br from-rose-500/[0.14] via-fuchsia-500/[0.05] to-transparent p-3">
            <div className="flex items-baseline gap-2">
              <span className="bg-gradient-to-r from-rose-200 to-orange-200 bg-clip-text text-[30px] font-bold leading-none tracking-tight text-transparent tabular-nums">
                {fmtUsd(Math.round(atRisk ?? 0)) === "—" ? "$0" : fmtUsd(Math.round(atRisk ?? 0))}
              </span>
              <span className="text-[12px] leading-tight text-rose-100/80">of yearly contracts at risk</span>
            </div>
            <p className="mt-1.5 text-[12px] leading-snug text-mist">
              {impact?.vendor_name} may now use {listRegions(added)}; {impacted.map((v) => v.customer_name).join(" and ")} only allow{" "}
              {listRegions(impacted[0].allowed_regions)}.
            </p>
          </div>
        )}

        <ul className="space-y-2" aria-label="Customer verdicts">
          {verdicts.map((v) => {
            const plain = checking ? { label: "Checking", tone: "pending" as const, reason: "Reading the contract…" } : plainVerdict(v, updated, added, impact?.vendor_name);
            const Icon = SEGMENT_ICON[segment.get(v.customer_id) ?? ""] ?? Building2;
            const c = cases.find((x) => x.customer_id === v.customer_id);
            const selected = selectedCustomer === v.customer_id;
            return (
              <li key={v.customer_id}>
                <button
                  type="button"
                  onClick={() => onSelectCustomer(v.customer_id)}
                  aria-pressed={selected}
                  className={cn(
                    "relative flex min-h-[66px] w-full items-center gap-3 rounded-2xl border px-3 py-2.5 text-left transition-[border-color,filter,transform] duration-300 hover:-translate-y-px hover:brightness-125",
                    CARD[plain.tone],
                    selected && (plain.tone === "impact" ? "border-rose-300" : "border-sky-300/80 shadow-[0_0_24px_-8px_rgba(56,189,248,0.8)]"),
                  )}
                >
                  {plain.tone === "pending" && <span aria-hidden className="scan-beam" />}
                  <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-colors duration-500", TILE[plain.tone])}>
                    <Icon className="h-5 w-5" strokeWidth={1.9} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate text-[15px] font-semibold text-snow">{v.customer_name}</span>
                      <span className={cn("shrink-0 rounded-lg border px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide", BADGE[plain.tone])}>
                        {plain.tone === "pending" ? <Loader2 className="inline h-3 w-3 animate-spin" /> : plain.label}
                      </span>
                    </span>
                    <span className="mt-0.5 flex items-end justify-between gap-2">
                      <span className="text-[12px] leading-snug text-mist">{plain.reason}</span>
                      {c && <span className="shrink-0 font-mono text-[11px] font-semibold text-rose-200">{c.ref}</span>}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>

        {cases.length > 0 && (
          <div className="step-in mt-3">
            <h3 className="eyebrow mb-2 !text-sky-200/80">Who needs to act</h3>
            <ul className="flex flex-wrap gap-1.5">
              {cases.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => onOpenCase(c.id)}
                    title={`${c.team ?? c.suggested_team} · ${c.ref} for ${c.customer ?? c.customer_name}`}
                    className="group flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] py-1 pl-1 pr-3 text-left transition hover:border-sky-300/40 hover:bg-sky-400/[0.08]"
                  >
                    <span className="relative flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-sky-400 to-indigo-600 text-[10.5px] font-bold text-white shadow-[0_0_14px_-4px_rgba(56,189,248,0.9)]">
                      {initials(c.assignee ?? c.suggested_owner)}
                      <span className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full border-2 border-ink-900 bg-emerald-400" />
                    </span>
                    <span className="text-[12.5px] font-semibold text-snow">{c.assignee ?? c.suggested_owner}</span>
                    <span className="font-mono text-[11px] text-rose-200">{c.ref}</span>
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

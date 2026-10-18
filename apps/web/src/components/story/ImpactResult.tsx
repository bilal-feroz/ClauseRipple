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
  impact: "border-red-500/70 bg-red-500/15 text-red-200",
  safe: "border-emerald-500/60 bg-emerald-500/10 text-emerald-200",
  neutral: "border-slate-600 bg-ink-800 text-mist",
  pending: "border-amber-500/50 bg-amber-500/10 text-amber-200",
};

const CARD = {
  impact: "border-red-500/50 bg-gradient-to-r from-red-500/12 to-transparent",
  safe: "border-emerald-500/35 bg-gradient-to-r from-emerald-500/8 to-transparent",
  neutral: "border-line bg-ink-900/50",
  pending: "border-amber-500/30 bg-ink-900/50",
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

  return (
    <section className="panel flex h-full min-h-0 flex-col p-4" aria-labelledby="result-title">
      <h2 id="result-title" className="mb-3 text-[17px] font-semibold tracking-tight text-snow">
        Who is affected
      </h2>
      <ul className="space-y-2" aria-label="Customer verdicts">
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
                  "flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition hover:brightness-125",
                  CARD[plain.tone],
                  selectedCustomer === v.customer_id && "ring-1 ring-signal/70",
                )}
              >
                <Icon className={cn("h-6 w-6 shrink-0", plain.tone === "impact" ? "text-red-400" : plain.tone === "safe" ? "text-emerald-400" : "text-sky-300")} />
                <span className="min-w-0 flex-1">
                  <span className="block text-[14px] font-semibold text-snow">{v.customer_name}</span>
                  <span className="block text-[11.5px] leading-snug text-mist">{plain.reason}</span>
                </span>
                <span className="flex shrink-0 flex-col items-end gap-1">
                  <span className={cn("rounded-md border px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide", BADGE[plain.tone])}>
                    {plain.tone === "pending" ? <Loader2 className="inline h-3 w-3 animate-spin" /> : plain.label}
                  </span>
                  {c && <span className="font-mono text-[10.5px] text-red-200">{c.ref}</span>}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {updated && !checking && (
        <div className="mt-3 flex gap-2 border-t border-line pt-3 text-[12px] leading-snug text-mist">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-sky-300" />
          <p>
            {impacted.length
              ? `${impact?.vendor_name} may now use ${listRegions(added)}, but ${impacted.map((v) => v.customer_name).join(" and ")} only allow ${listRegions(impacted[0].allowed_regions)}. ${fmtUsd(impact?.summary.acv_at_risk_usd)} of yearly contracts at risk.`
              : "Nobody's contract is broken by this change."}
          </p>
        </div>
      )}

      {cases.length > 0 && (
        <div className="mt-3 min-h-0 border-t border-line pt-3">
          <h3 className="mb-2 text-[12px] font-semibold uppercase tracking-[0.12em] text-fog">Who needs to act</h3>
          <ul className="space-y-1.5">
            {cases.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => onOpenCase(c.id)}
                  className="flex w-full items-center gap-2.5 rounded-lg border border-line bg-ink-900/60 px-2.5 py-2 text-left transition hover:border-sky-500/50"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sky-500/20 text-[12px] font-bold text-sky-200">
                    {initials(c.assignee ?? c.suggested_owner)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-semibold text-snow">{c.assignee ?? c.suggested_owner}</span>
                    <span className="block truncate text-[11px] text-mist">
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
    </section>
  );
}

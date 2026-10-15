"use client";

import { ShieldAlert, ShieldCheck, Unlink } from "lucide-react";
import { Badge, SectionTitle } from "@/components/ui";
import type { ImpactAnalysis, ImpactCase, Verdict } from "@/lib/types";
import { cn, fmtUsd } from "@/lib/utils";

export function BlastRadius({
  impact,
  cases,
  decisionsRecalled,
  updated,
  selectedCustomer,
  onSelectCustomer,
  revealedCustomers,
}: {
  impact: ImpactAnalysis | undefined;
  cases: ImpactCase[];
  decisionsRecalled: number;
  updated: boolean;
  selectedCustomer: string | null;
  onSelectCustomer: (id: string) => void;
  revealedCustomers: Set<string> | null;
}) {
  const verdicts = impact?.verdicts ?? [];
  const added = (impact?.vendor_region_evidence ?? []).filter((r) => r.change_id).map((r) => r.code);
  const impacted = verdicts.filter((v) => v.affected);
  const teams = new Set(cases.map((c) => c.team).filter(Boolean));
  const metrics: [string, string | number][] = [
    ["Customers impacted", updated ? impacted.length : 0],
    ["Products involved", updated ? impact?.summary.products_involved.length ?? 0 : 0],
    ["Systems involved", updated ? impact?.summary.systems_involved.length ?? 0 : 0],
    ["Teams notified", teams.size],
    ["Prior decisions recalled", decisionsRecalled],
    ["Contract value at risk", updated ? fmtUsd(impact?.summary.acv_at_risk_usd) : "—"],
  ];
  return (
    <section className="panel p-3" aria-labelledby="blast-title">
      <SectionTitle right={updated ? <Badge tone={impacted.length ? "impact" : "safe"}>{impacted.length} impacted</Badge> : <Badge tone="safe">0 impacts</Badge>}>
        <span id="blast-title">Blast radius</span>
      </SectionTitle>
      <div className="mb-3 grid grid-cols-3 gap-1.5">
        {metrics.map(([label, value]) => (
          <div key={label} className="rounded-md border border-line bg-ink-900/60 px-2 py-1.5">
            <div className={cn("font-mono text-[15px] font-semibold tabular-nums", label === "Customers impacted" && Number(value) > 0 ? "text-red-300" : "text-snow")}>
              {value}
            </div>
            <div className="text-[9.5px] leading-tight text-fog">{label}</div>
          </div>
        ))}
      </div>
      <ul className="space-y-1.5" aria-label="Customer verdicts">
        {verdicts.map((v) => (
          <VerdictRow
            key={v.customer_id}
            v={v}
            updated={updated}
            added={added}
            hidden={revealedCustomers ? !revealedCustomers.has(v.customer_id) : false}
            caseRef={cases.find((c) => c.customer_id === v.customer_id)?.ref}
            selected={selectedCustomer === v.customer_id}
            onClick={() => onSelectCustomer(v.customer_id)}
          />
        ))}
        {!verdicts.length && <li className="text-[12px] text-fog">Loading verdicts from FalkorDB…</li>}
      </ul>
    </section>
  );
}

function VerdictRow({
  v,
  updated,
  added,
  hidden,
  caseRef,
  selected,
  onClick,
}: {
  v: Verdict;
  updated: boolean;
  added: string[];
  hidden: boolean;
  caseRef?: string;
  selected: boolean;
  onClick: () => void;
}) {
  const impacted = v.affected;
  const pending = hidden;
  const icon = pending ? null : impacted ? (
    <ShieldAlert className="h-4 w-4 text-impact" />
  ) : v.status === "NO_DEPENDENCY" ? (
    <Unlink className="h-4 w-4 text-safe" />
  ) : (
    <ShieldCheck className="h-4 w-4 text-safe" />
  );
  const detail = pending
    ? "Evaluating…"
    : impacted
      ? `${v.violating_regions.join(", ")} violates residency requirement`
      : v.status === "NO_DEPENDENCY"
        ? `No dependency on the changed vendor`
        : updated
          ? `${added.join(", ") || "Every vendor region"} permitted by contract`
          : `Compliant · allows ${v.allowed_regions.join(", ")}`;
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        aria-pressed={selected}
        className={cn(
          "group flex w-full items-start gap-2 rounded-md border px-2 py-1.5 text-left transition",
          selected ? "border-signal/60 bg-signal/5" : "border-line bg-ink-900/50 hover:border-line-strong",
          impacted && !pending && "pulse-impact",
        )}
      >
        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center">{icon}</span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className="text-[12.5px] font-semibold text-snow">{v.customer_name}</span>
            {v.regulated && <span className="text-[9px] uppercase tracking-wide text-fog">regulated</span>}
          </span>
          <span className={cn("block text-[11px] leading-snug", impacted && !pending ? "text-red-200/90" : "text-fog")}>{detail}</span>
        </span>
        <span className="mt-0.5 flex shrink-0 flex-col items-end gap-0.5">
          {pending ? <Badge>…</Badge> : impacted ? <Badge tone="impact">{v.severity}</Badge> : <Badge tone="safe">No impact</Badge>}
          {caseRef && <span className="font-mono text-[10.5px] font-semibold text-red-200">{caseRef}</span>}
        </span>
      </button>
    </li>
  );
}

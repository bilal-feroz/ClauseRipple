"use client";

import { ArrowRight, CheckCircle2, Cog, FileSignature, FileText, MapPin, Unlink, Users, XCircle, type LucideIcon } from "lucide-react";
import { useState } from "react";
import type { EvidenceBundle, Verdict } from "@/lib/types";
import { cn } from "@/lib/utils";
import { listRegions } from "./plain";

type Step = { icon: LucideIcon; text: React.ReactNode; quote?: string | null; src?: string | null; line?: number | null; tone?: "change" };

/** The reasoning chain as numbered plain-language steps, each backed by a verbatim source quote. */
export function WhySteps({
  verdict,
  evidence,
  vendorName,
  openDoc,
}: {
  verdict: Verdict;
  evidence: EvidenceBundle;
  vendorName: string;
  openDoc: (id: string, highlight?: string | null) => void;
}) {
  const [open, setOpen] = useState<number | null>(null);
  const steps: Step[] = [];
  const b = (s: string) => <b className="font-semibold text-snow">{s}</b>;
  const dep = evidence.dependency_paths[0];

  if (dep) {
    dep.edges.forEach((e, i) => {
      const from = dep.nodes[i].name;
      const to = dep.nodes[i + 1].name;
      if (e.type === "USES") steps.push({ icon: Users, text: <>{b(from)} uses {b(to)}</>, ...e });
      else if (e.type === "POWERED_BY") steps.push({ icon: FileText, text: <>{b(from)} runs on {b(to)}</>, ...e });
      else if (e.type === "DEPENDS_ON") steps.push({ icon: Cog, text: <>{b(from)} sends customer data to {b(to)}</>, ...e });
    });
    const fresh = evidence.vendor_regions.filter((r) => r.change_id);
    if (fresh.length) {
      steps.push({
        icon: MapPin,
        text: <>{b(vendorName)} may now process data in {b(listRegions(fresh.map((r) => (r.code === "US" ? "the United States" : r.name))))}</>,
        quote: fresh[0].quote,
        src: fresh[0].src,
        line: fresh[0].line,
        tone: "change",
      });
    }
  } else {
    steps.push({
      icon: Unlink,
      text: <>None of {b(verdict.customer_name)}&apos;s products connect to {b(vendorName)}</>,
      quote: evidence.no_path_proof,
    });
  }
  const contract = evidence.contract_paths[0];
  const clauseEdge = contract?.edges[contract.edges.length - 1];
  steps.push({
    icon: FileSignature,
    text: (
      <>
        {b(`${verdict.customer_name}'s contract`)} allows data only in {b(listRegions(verdict.allowed_regions))}
      </>
    ),
    quote: clauseEdge?.quote,
    src: clauseEdge?.src,
    line: clauseEdge?.line,
  });

  const impacted = verdict.affected;
  const changed = evidence.vendor_regions.some((r) => r.change_id);
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1">
        <h3 className="text-[20px] font-semibold tracking-tight text-snow">
          Why {verdict.customer_name} is {impacted ? "impacted" : "not affected"}
        </h3>
        <span
          className={cn(
            "rounded-lg border px-2.5 py-1 text-[12.5px] font-bold uppercase tracking-wide",
            impacted ? "border-red-400/80 bg-red-500/20 text-red-200" : "border-emerald-400/70 bg-emerald-500/10 text-emerald-300",
          )}
        >
          {impacted ? verdict.severity : "No impact"}
        </span>
        <span className="text-[14px] text-mist">Click a step to see the exact sentence it comes from.</span>
      </div>

      <ol className="flex flex-wrap items-stretch gap-2 xl:flex-nowrap">
        {steps.map((s, i) => (
          <li key={i} className="flex min-w-[200px] flex-1 items-stretch gap-2">
            <button
              type="button"
              onClick={() => setOpen(open === i ? null : i)}
              aria-expanded={open === i}
              className={cn(
                "flex min-h-[100px] flex-1 items-start gap-3 rounded-2xl border bg-ink-900/60 p-3.5 text-left transition hover:border-sky-400/60",
                s.tone === "change" ? "border-amber-400/60 bg-amber-500/[0.06]" : "border-line-strong",
                open === i && "border-sky-400/80 shadow-[0_0_22px_-8px_rgba(56,189,248,0.8)]",
              )}
            >
              <span
                className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[14px] font-bold text-ink-950",
                  s.tone === "change" ? "bg-amber-400 shadow-[0_0_14px_-2px_rgba(245,158,11,0.8)]" : "bg-sky-400 shadow-[0_0_14px_-2px_rgba(56,189,248,0.8)]",
                )}
              >
                {i + 1}
              </span>
              <span className="min-w-0">
                <s.icon className={cn("mb-1.5 h-5 w-5", s.tone === "change" ? "text-amber-300" : "text-sky-300")} />
                <span className="block text-[14.5px] leading-snug text-mist">{s.text}</span>
              </span>
            </button>
            <ArrowRight className="h-5 w-5 shrink-0 self-center text-sky-400/80" aria-hidden />
          </li>
        ))}
        <li
          className={cn(
            "flex min-w-[240px] flex-[1.15] items-center gap-3.5 rounded-2xl border-[1.5px] p-4",
            impacted
              ? "border-red-400/80 bg-gradient-to-br from-red-500/[0.2] to-red-500/[0.05] shadow-[0_0_28px_-10px_rgba(239,68,68,0.8)]"
              : "border-emerald-400/70 bg-gradient-to-br from-emerald-500/[0.18] to-emerald-500/[0.04] shadow-[0_0_28px_-10px_rgba(52,211,153,0.8)]",
          )}
        >
          {impacted ? <XCircle className="h-9 w-9 shrink-0 text-red-400" /> : <CheckCircle2 className="h-9 w-9 shrink-0 text-emerald-400" />}
          <span className="text-[16.5px] font-semibold leading-snug text-snow">
            {impacted
              ? `${listRegions(verdict.violating_regions)} is not allowed → contract broken`
              : verdict.status === "NO_DEPENDENCY"
                ? `No link to ${vendorName} → not affected`
                : changed
                  ? "The new region is allowed → no problem"
                  : `${vendorName} stays inside these regions today → contract respected`}
          </span>
        </li>
      </ol>

      {open !== null && steps[open]?.quote && (
        <figure className="mt-3 max-w-3xl rounded-xl border-l-2 border-sky-400/70 bg-ink-900/80 px-4 py-2.5">
          <blockquote className="text-[14px] leading-relaxed text-snow">“{steps[open].quote}”</blockquote>
          {steps[open].src && (
            <figcaption className="mt-1 flex items-center gap-2 text-[12px] text-fog">
              <span className="font-mono">
                {steps[open].src}
                {steps[open].line ? ` · line ${steps[open].line}` : ""}
              </span>
              <button type="button" onClick={() => openDoc(steps[open].src!, steps[open].quote)} className="text-sky-300 hover:underline">
                Open document
              </button>
            </figcaption>
          )}
        </figure>
      )}
    </div>
  );
}

"use client";

import { CheckCircle2, Cog, FileSignature, FileText, MapPin, Unlink, Users, XCircle, type LucideIcon } from "lucide-react";
import { useState } from "react";
import type { EvidenceBundle, Verdict } from "@/lib/types";
import { cn } from "@/lib/utils";
import { listRegions } from "./plain";

type Step = { icon: LucideIcon; text: React.ReactNode; quote?: string | null; src?: string | null; line?: number | null; tone?: "change" };

/** The reasoning chain as a compact row of plain-language steps, each backed by a verbatim source quote. */
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
      <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1">
        <h3 className="text-[16px] font-semibold tracking-tight text-snow">
          Why {verdict.customer_name} is {impacted ? "impacted" : "not affected"}
        </h3>
        <span
          className={cn(
            "rounded-lg border px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide",
            impacted ? "border-rose-300/80 bg-rose-500/20 text-rose-100" : "border-emerald-300/60 bg-emerald-400/10 text-emerald-200",
          )}
        >
          {impacted ? verdict.severity : "No impact"}
        </span>
        <span className="text-[12px] text-fog">Tap a step to see the sentence it comes from.</span>
      </div>

      <ol className="flex items-stretch overflow-x-auto pb-1">
        {steps.map((s, i) => (
          <li key={i} className="step-in flex min-w-[178px] flex-1 items-center" style={{ animationDelay: `${i * 70}ms` }}>
            <button
              type="button"
              onClick={() => setOpen(open === i ? null : i)}
              aria-expanded={open === i}
              className={cn(
                "flex h-full min-h-[72px] flex-1 items-start gap-2.5 rounded-xl border p-2.5 text-left transition hover:-translate-y-px hover:border-sky-300/50",
                s.tone === "change" ? "border-amber-300/50 bg-amber-500/[0.07]" : "border-white/10 bg-white/[0.03]",
                open === i && "border-sky-300/80 bg-sky-400/[0.07] shadow-[0_0_22px_-8px_rgba(56,189,248,0.9)]",
              )}
            >
              <span
                className={cn(
                  "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11.5px] font-bold text-ink-950",
                  s.tone === "change" ? "bg-amber-300 shadow-[0_0_12px_-2px_rgba(245,158,11,0.9)]" : "bg-sky-300 shadow-[0_0_12px_-2px_rgba(56,189,248,0.9)]",
                )}
              >
                {i + 1}
              </span>
              <span className="min-w-0">
                <s.icon className={cn("mb-1 h-4 w-4", s.tone === "change" ? "text-amber-300" : "text-sky-300")} />
                <span className="block text-[12.5px] leading-snug text-mist">{s.text}</span>
              </span>
            </button>
            <span aria-hidden className={cn("connector mx-1.5 w-5 shrink-0", s.tone === "change" ? "text-amber-300/70" : "text-sky-300/60")} />
          </li>
        ))}
        <li
          className={cn(
            "step-in flex min-w-[220px] flex-[1.15] items-center gap-3 rounded-xl border-[1.5px] p-3",
            impacted
              ? "alarm border-rose-300/80 bg-gradient-to-br from-rose-500/[0.22] to-red-500/[0.05]"
              : "border-emerald-300/60 bg-gradient-to-br from-emerald-400/[0.16] to-emerald-500/[0.03] shadow-[0_0_28px_-12px_rgba(52,211,153,0.9)]",
          )}
          style={{ animationDelay: `${steps.length * 70}ms` }}
        >
          {impacted ? <XCircle className="h-8 w-8 shrink-0 text-rose-300" /> : <CheckCircle2 className="h-8 w-8 shrink-0 text-emerald-300" />}
          <span className="text-[14.5px] font-semibold leading-snug text-snow">
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
        <figure className="step-in mt-3 max-w-3xl rounded-xl border-l-2 border-sky-300/80 bg-black/30 px-4 py-2.5">
          <blockquote className="text-[13.5px] leading-relaxed text-snow">“{steps[open].quote}”</blockquote>
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

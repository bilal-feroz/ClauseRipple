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
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h3 className="text-[16px] font-semibold text-snow">
          Why {verdict.customer_name} is {impacted ? "impacted" : "not affected"}
        </h3>
        <span
          className={cn(
            "rounded-md border px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide",
            impacted ? "border-red-500/70 bg-red-500/15 text-red-200" : "border-emerald-500/60 bg-emerald-500/10 text-emerald-200",
          )}
        >
          {impacted ? verdict.severity : "No impact"}
        </span>
        <span className="text-[12px] text-fog">Click a step to see the exact sentence it comes from.</span>
      </div>

      <ol className="flex flex-wrap items-stretch gap-2">
        {steps.map((s, i) => (
          <li key={i} className="flex items-stretch gap-2">
            <button
              type="button"
              onClick={() => setOpen(open === i ? null : i)}
              aria-expanded={open === i}
              className={cn(
                "flex w-[230px] items-start gap-2.5 rounded-xl border bg-ink-900/70 p-3 text-left transition hover:border-sky-500/50",
                s.tone === "change" ? "border-amber-500/50" : "border-line",
                open === i && "border-sky-500/70",
              )}
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-signal text-[12px] font-bold text-ink-950">{i + 1}</span>
              <span className="min-w-0">
                <s.icon className={cn("mb-1 h-4 w-4", s.tone === "change" ? "text-amber-300" : "text-sky-300")} />
                <span className="block text-[12.5px] leading-snug text-mist">{s.text}</span>
              </span>
            </button>
            <ArrowRight className="h-4 w-4 self-center text-sky-500/70" aria-hidden />
          </li>
        ))}
        <li
          className={cn(
            "flex w-[230px] items-center gap-2.5 rounded-xl border-2 p-3",
            impacted ? "border-red-500/70 bg-red-500/10" : "border-emerald-500/60 bg-emerald-500/10",
          )}
        >
          {impacted ? <XCircle className="h-7 w-7 shrink-0 text-red-400" /> : <CheckCircle2 className="h-7 w-7 shrink-0 text-emerald-400" />}
          <span className="text-[13px] font-semibold leading-snug text-snow">
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
        <figure className="mt-3 max-w-3xl rounded-lg border-l-2 border-sky-400/60 bg-ink-900/80 px-3 py-2">
          <blockquote className="text-[13px] leading-relaxed text-snow">“{steps[open].quote}”</blockquote>
          {steps[open].src && (
            <figcaption className="mt-1 flex items-center gap-2 text-[11px] text-fog">
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

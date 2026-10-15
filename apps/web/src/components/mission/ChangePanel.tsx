"use client";

import { CheckCircle2, FileDiff, Loader2, Zap } from "lucide-react";
import { Badge, Button, SectionTitle } from "@/components/ui";
import type { DemoState, DiffLine, PendingChange } from "@/lib/types";
import { cn, fmtMs } from "@/lib/utils";

export type AppliedChange = {
  ref: string;
  diff?: DiffLine[];
  addedFacts: { subject: string; rel: string; object: string; quote?: string }[];
  incrementalMs?: number;
  retained?: number;
};

export function ChangePanel({
  pending,
  state,
  applied,
  onApply,
  applying,
  disabled,
}: {
  pending: PendingChange | undefined;
  state: DemoState | undefined;
  applied: AppliedChange | null;
  onApply: () => void;
  applying: boolean;
  disabled: boolean;
}) {
  const isApplied = state?.state === "UPDATED" || pending?.applied;
  return (
    <section className="panel p-3" aria-labelledby="change-title">
      <SectionTitle right={<Badge tone={isApplied ? "change" : "neutral"}>v{pending?.current_version ?? 1} → v{pending?.new_version ?? 2}</Badge>}>
        <span id="change-title">Change event</span>
      </SectionTitle>
      <div className="mb-2 flex items-start gap-2">
        <FileDiff className="mt-0.5 h-4 w-4 shrink-0 text-change" />
        <div>
          <div className="text-[13px] font-semibold text-snow">ModelCloud DPA</div>
          <div className="text-[11px] text-fog">{pending?.title ?? "Data Processing Addendum — ModelCloud"} · §4.1 Permitted regions</div>
        </div>
      </div>

      <DiffView lines={pending?.diff?.some((l) => l.kind === "add" || l.kind === "del") ? pending.diff : applied?.diff ?? []} />

      {isApplied && applied && (
        <div className="mt-2.5 rounded-md border border-change/30 bg-change/5 p-2.5 step-in">
          <div className="eyebrow mb-1.5 !text-amber-300/90">Detected change · {applied.ref}</div>
          {applied.addedFacts.map((f) => (
            <dl key={`${f.subject}-${f.object}`} className="grid grid-cols-[64px_1fr] gap-y-0.5 text-[11.5px]">
              <dt className="text-fog">Vendor</dt>
              <dd className="text-snow">{f.subject}</dd>
              <dt className="text-fog">Fact</dt>
              <dd className="font-mono text-[11px] text-snow">{f.rel}</dd>
              <dt className="text-fog">Added</dt>
              <dd className="font-semibold text-amber-200">{f.object}</dd>
            </dl>
          ))}
          {applied.incrementalMs !== undefined && (
            <p className="mt-1.5 text-[10.5px] text-fog">
              Incremental graph update: +{applied.addedFacts.length} fact, {applied.retained ?? 0} retained · {fmtMs(applied.incrementalMs)}
            </p>
          )}
        </div>
      )}

      <Button
        variant={isApplied ? "ghost" : "change"}
        className="mt-3 w-full py-2 text-[12.5px] font-semibold tracking-wide"
        onClick={onApply}
        disabled={isApplied || applying || disabled}
        aria-describedby="change-title"
      >
        {applying ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : isApplied ? (
          <CheckCircle2 className="h-4 w-4 text-change" />
        ) : (
          <Zap className="h-4 w-4" />
        )}
        {isApplied ? "Change applied" : applying ? "Applying to FalkorDB…" : "Apply ModelCloud DPA v2"}
      </Button>
    </section>
  );
}

function DiffView({ lines }: { lines: DiffLine[] }) {
  const shown = lines.filter((l) => l.kind === "add" || l.kind === "del");
  if (!shown.length) return <div className="rounded-md border border-line bg-ink-900/70 p-2 text-[11px] text-fog">No pending text diff.</div>;
  return (
    <div className="space-y-1 rounded-md border border-line bg-ink-950/80 p-2 font-mono text-[11px] leading-snug" aria-label="Text diff between DPA versions">
      {shown.map((l, i) => (
        <div
          key={i}
          className={cn(
            "rounded px-1.5 py-1",
            l.kind === "del" ? "bg-impact/10 text-red-200/90 line-through decoration-red-400/50" : "bg-safe/10 text-green-100",
          )}
        >
          <span className="mr-1 select-none font-semibold">{l.kind === "del" ? "−" : "+"}</span>
          <Highlight text={l.text} />
        </div>
      ))}
    </div>
  );
}

function Highlight({ text }: { text: string }) {
  const parts = text.split(/(the United States \(US\))/);
  return (
    <>
      {parts.map((p, i) =>
        p === "the United States (US)" ? (
          <mark key={i} className="rounded bg-change/30 px-0.5 text-amber-100">
            {p}
          </mark>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}

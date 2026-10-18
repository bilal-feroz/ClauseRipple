"use client";

import { useMutation } from "@tanstack/react-query";
import { ArrowRight, Loader2, Search, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Badge, Quote } from "@/components/ui";
import { api } from "@/lib/api";

const EXAMPLES = [
  "What breaks if ModelCloud changes regions?",
  "Why is Falcon Bank impacted?",
  "Why is GulfGov not affected?",
  "Which customers permit US processing?",
  "Who owns Document Processing API?",
  "What did we decide about Falcon Bank after the ModelCloud policy change?",
  "Who should handle CR-104?",
];

export function AskBar() {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const ask = useMutation({ mutationFn: (question: string) => api.ask(question), onSuccess: () => setOpen(true) });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        input.current?.focus();
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const submit = (question: string) => {
    if (question.trim().length < 3) return;
    setQ(question);
    ask.mutate(question);
  };

  const r = ask.data;
  return (
    <div className="relative min-w-[260px] flex-1 lg:max-w-[620px]">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit(q);
        }}
        className="flex items-center gap-2.5 rounded-2xl border border-white/10 bg-white/[0.04] px-3.5 py-2.5 backdrop-blur transition focus-within:border-sky-300/50 focus-within:bg-sky-400/[0.06] focus-within:shadow-[0_0_28px_-10px_rgba(56,189,248,0.9)]"
        role="search"
      >
        <Search className="h-4 w-4 shrink-0 text-mist" />
        <input
          ref={input}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 150)}
          placeholder="Ask ClauseRipple — e.g. Why is Falcon Bank impacted?"
          aria-label="Ask ClauseRipple a question about the company graph"
          className="min-w-0 flex-1 bg-transparent text-[14px] text-snow placeholder:text-mist/80 focus:outline-none"
        />
        {ask.isPending ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-signal" />
        ) : (
          <kbd className="hidden rounded-md border border-line-strong px-1.5 py-0.5 font-mono text-[11px] text-fog sm:inline">Ctrl K</kbd>
        )}
      </form>

      {focused && !q && !open && (
        <div className="step-in absolute left-0 right-0 top-full z-40 mt-1.5 rounded-2xl border border-white/10 bg-[#0a1124]/95 p-1.5 shadow-2xl backdrop-blur-xl">
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => submit(ex)}
              className="flex w-full items-center gap-2 rounded-xl px-2.5 py-1.5 text-left text-[12.5px] text-mist transition hover:bg-sky-400/10 hover:text-snow"
            >
              <ArrowRight className="h-3 w-3 text-fog" />
              {ex}
            </button>
          ))}
        </div>
      )}

      {open && (r || ask.error) && (
        <div
          role="dialog"
          aria-label="Answer from the company graph"
          className="step-in absolute left-0 top-full z-40 mt-1.5 max-h-[70vh] w-[min(720px,92vw)] overflow-y-auto rounded-2xl border border-white/10 bg-[#0a1124]/95 p-4 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.9)] backdrop-blur-xl"
        >
          <div className="mb-2 flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <div className="text-[12px] text-fog">{r?.question ?? q}</div>
              {r && (
                <div className="mt-1 flex flex-wrap gap-1">
                  <Badge tone="signal" className="normal-case tracking-normal">
                    {r.intent.replaceAll("_", " ")}
                  </Badge>
                  <Badge className="normal-case tracking-normal">{r.mode}</Badge>
                  <Badge className="normal-case tracking-normal">
                    {r.graph_reads} graph reads · {r.db_time_ms.toFixed(2)} ms FalkorDB
                  </Badge>
                </div>
              )}
            </div>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close answer" className="rounded p-1 text-fog hover:text-snow">
              <X className="h-4 w-4" />
            </button>
          </div>
          {ask.error && <p className="text-[12px] text-red-300">{String(ask.error.message)}</p>}
          {r && (
            <div className="space-y-2.5">
              <p className="text-[13px] leading-relaxed text-snow">{r.answer}</p>
              {r.path.length > 0 && (
                <div>
                  <div className="eyebrow mb-1">Graph path</div>
                  <div className="flex flex-wrap items-center gap-1">
                    {r.path.map((p, i) => (
                      <span key={`${p}-${i}`} className="flex items-center gap-1">
                        {i > 0 && <ArrowRight className="h-3 w-3 text-fog" />}
                        <span className="rounded-lg border border-white/10 bg-white/[0.04] px-1.5 py-0.5 text-[11px] text-mist">{p}</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {r.sources.length > 0 && (
                <div className="space-y-1">
                  <div className="eyebrow">Sources (verbatim, stored on graph relationships)</div>
                  {r.sources.map((s, i) => (
                    <Quote key={i} text={s.quote} source={s.src} line={s.line} />
                  ))}
                </div>
              )}
              {r.passages.length > 0 && (
                <details>
                  <summary className="cursor-pointer text-[11px] text-fog">
                    Related passages ({r.retrieval === "vector" ? "FalkorDB vector index" : "FalkorDB full-text index"})
                  </summary>
                  <div className="mt-1 space-y-1">
                    {r.passages.map((p) => (
                      <Quote key={`${p.doc_id}-${p.line}`} text={p.text} source={p.doc_id} line={p.line} />
                    ))}
                  </div>
                </details>
              )}
              <div className="font-mono text-[10px] text-fog">cypher: {r.cypher.join(", ")}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

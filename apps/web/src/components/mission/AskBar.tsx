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
    <div className="relative min-w-[260px] flex-1 lg:max-w-[520px]">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit(q);
        }}
        className="flex items-center gap-2 rounded-lg border border-line-strong bg-ink-850 px-2.5 py-1.5 focus-within:border-signal/60"
        role="search"
      >
        <Search className="h-3.5 w-3.5 shrink-0 text-fog" />
        <input
          ref={input}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 150)}
          placeholder="Ask ClauseRipple — e.g. Why is Falcon Bank impacted?"
          aria-label="Ask ClauseRipple a question about the company graph"
          className="min-w-0 flex-1 bg-transparent text-[12.5px] text-snow placeholder:text-fog focus:outline-none"
        />
        {ask.isPending ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-signal" />
        ) : (
          <kbd className="hidden rounded border border-line px-1 font-mono text-[10px] text-fog sm:inline">Ctrl K</kbd>
        )}
      </form>

      {focused && !q && !open && (
        <div className="absolute left-0 right-0 top-full z-40 mt-1 rounded-lg border border-line-strong bg-ink-850 p-1.5 shadow-2xl">
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => submit(ex)}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12px] text-mist hover:bg-ink-700 hover:text-snow"
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
          className="absolute left-0 top-full z-40 mt-1 max-h-[70vh] w-[min(720px,92vw)] overflow-y-auto rounded-lg border border-line-strong bg-ink-850 p-3 shadow-2xl"
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
                        <span className="rounded border border-line bg-ink-900 px-1.5 py-0.5 text-[11px] text-mist">{p}</span>
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

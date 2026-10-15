"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

type Tone = "neutral" | "change" | "impact" | "safe" | "signal" | "memory";

const TONES: Record<Tone, string> = {
  neutral: "border-line-strong bg-ink-700/60 text-mist",
  change: "border-change/50 bg-change/10 text-amber-200",
  impact: "border-impact/50 bg-impact/10 text-red-200",
  safe: "border-safe/45 bg-safe/10 text-green-200",
  signal: "border-signal/45 bg-signal/10 text-sky-200",
  memory: "border-memory/45 bg-memory/10 text-purple-200",
};

export function Badge({ tone = "neutral", className, children }: { tone?: Tone; className?: string; children: ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-1.5 py-[1px] text-[10.5px] font-semibold uppercase tracking-wide",
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Dot({ tone }: { tone: Tone }) {
  const color = {
    neutral: "bg-slate-500",
    change: "bg-change",
    impact: "bg-impact",
    safe: "bg-safe",
    signal: "bg-signal",
    memory: "bg-memory",
  }[tone];
  return <span aria-hidden className={cn("inline-block h-1.5 w-1.5 rounded-full", color)} />;
}

export function Button({
  variant = "ghost",
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "danger" | "change" }) {
  const styles = {
    primary: "border-signal/60 bg-signal/15 text-sky-100 hover:bg-signal/25",
    change: "border-change/70 bg-change/15 text-amber-100 hover:bg-change/25",
    danger: "border-impact/60 bg-impact/15 text-red-100 hover:bg-impact/25",
    ghost: "border-line-strong bg-ink-800 text-mist hover:border-ink-500 hover:text-snow",
  }[variant];
  return (
    <button
      type="button"
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[12px] font-medium transition disabled:cursor-not-allowed disabled:opacity-45",
        styles,
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-2 flex items-center justify-between gap-2">
      <h2 className="eyebrow">{children}</h2>
      {right}
    </div>
  );
}

export function Quote({ text, source, line }: { text?: string | null; source?: string | null; line?: number | null }) {
  if (!text) return null;
  return (
    <figure className="rounded-md border-l-2 border-signal/40 bg-ink-900/70 px-2.5 py-1.5">
      <blockquote className="text-[11.5px] leading-snug text-mist">“{text}”</blockquote>
      {source && (
        <figcaption className="mt-0.5 font-mono text-[10px] text-fog">
          {source}
          {line ? `.md:L${line}` : ""}
        </figcaption>
      )}
    </figure>
  );
}

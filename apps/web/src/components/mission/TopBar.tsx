"use client";

import { Loader2, RotateCcw } from "lucide-react";
import { Logo } from "@/components/Logo";
import { useCountUp } from "@/hooks/useCountUp";
import type { DemoState, Health } from "@/lib/types";
import { cn } from "@/lib/utils";
import { AskBar } from "./AskBar";

export function TopBar({
  health,
  healthError,
  latencyMs,
  state,
  onReset,
  resetting,
  resetDisabled,
}: {
  health: Health | undefined;
  healthError: boolean;
  latencyMs: number | undefined;
  state: DemoState | undefined;
  onReset: () => void;
  resetting: boolean;
  resetDisabled: boolean;
}) {
  const connected = !healthError && health?.falkordb === "connected";
  const planner = health?.planner ?? "";
  const llm = planner.startsWith("llm:");
  const stats = state?.stats;
  return (
    <header className="relative z-30 flex flex-wrap items-center gap-x-5 gap-y-2 px-5 pb-2 pt-3">
      <div className="flex items-center gap-3">
        <Logo size={36} animated />
        <div className="leading-tight">
          <div className="text-[19px] font-semibold tracking-tight text-snow">
            Clause<span className="bg-gradient-to-r from-sky-300 to-cyan-200 bg-clip-text text-transparent">Ripple</span>
          </div>
          <div className="text-[12px] text-fog">One clause changes. See what breaks.</div>
        </div>
      </div>

      <span
        className={cn(
          "flex items-center gap-2.5 rounded-full border px-3.5 py-1.5 text-[12.5px] backdrop-blur",
          connected ? "border-emerald-400/25 bg-emerald-400/[0.07] text-emerald-50" : "border-red-400/40 bg-red-500/10 text-red-100",
        )}
        title={`FalkorDB ${health?.falkordb_version ?? ""} · planner: ${planner || "…"} · tools via MCP`}
        aria-live="polite"
      >
        <span className="relative flex h-2 w-2" aria-hidden>
          {connected && <span className="ping-soft absolute inset-0 rounded-full bg-emerald-400" />}
          <span className={cn("relative h-2 w-2 rounded-full", connected ? "bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.9)]" : "bg-red-500")} />
        </span>
        {connected ? (llm ? `Live · AI agent (${planner.slice(4)})` : "Live on FalkorDB · agent ready") : "FalkorDB offline"}
        {connected && latencyMs !== undefined && (
          <span className="font-mono text-[11px] tabular-nums text-emerald-300/70" title="API round trip, refreshed every 5 s">
            {Math.max(1, Math.round(latencyMs))} ms
          </span>
        )}
      </span>

      <AskBar />

      <div className="ml-auto flex items-center gap-3">
        <div className="flex items-center rounded-2xl border border-white/[0.07] bg-white/[0.03] px-1.5 py-1 backdrop-blur" aria-label="Live graph size">
          <Stat label="docs" value={stats?.documents} />
          <Stat label="nodes" value={stats?.nodes} />
          <Stat label="links" value={stats?.relationships} />
          <Stat label="cases" value={stats?.cases} hot={(stats?.cases ?? 0) > 0} />
        </div>
        <button
          type="button"
          onClick={onReset}
          disabled={resetting || resetDisabled || !connected}
          title="Clear only the ClauseRipple graph and re-ingest the v1 corpus"
          className="group flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-[13.5px] font-semibold text-snow backdrop-blur transition hover:border-sky-300/40 hover:bg-sky-400/10 disabled:cursor-not-allowed disabled:opacity-45"
        >
          {resetting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RotateCcw className="h-4 w-4 transition-transform duration-500 group-hover:-rotate-180" />
          )}
          Reset demo
        </button>
      </div>
    </header>
  );
}

function Stat({ label, value, hot }: { label: string; value: number | undefined; hot?: boolean }) {
  const shown = useCountUp(value);
  const ticking = shown !== undefined && value !== undefined && Math.round(shown) !== value;
  return (
    <div className="flex min-w-[58px] flex-col items-center px-2 leading-none">
      <span
        className={cn(
          "text-[16px] font-semibold tabular-nums transition-colors duration-300",
          ticking ? "text-amber-300" : hot ? "text-red-300" : "text-snow",
        )}
      >
        {shown === undefined ? "—" : Math.round(shown)}
      </span>
      <span className="mt-1 text-[9.5px] font-medium uppercase tracking-[0.14em] text-fog">{label}</span>
    </div>
  );
}

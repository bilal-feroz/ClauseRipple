"use client";

import { Loader2, RotateCcw } from "lucide-react";
import { Logo } from "@/components/Logo";
import { Button, Dot } from "@/components/ui";
import { AskBar } from "./AskBar";
import type { DemoState, Health } from "@/lib/types";

export function TopBar({
  health,
  healthError,
  state,
  onReset,
  resetting,
  resetDisabled,
}: {
  health: Health | undefined;
  healthError: boolean;
  state: DemoState | undefined;
  onReset: () => void;
  resetting: boolean;
  resetDisabled: boolean;
}) {
  const connected = !healthError && health?.falkordb === "connected";
  const planner = health?.planner ?? "";
  const llm = planner.startsWith("llm:");
  const stats = state?.stats;
  const metric = (label: string, value: number | undefined) => (
    <div className="flex flex-col items-center leading-none">
      <span className="text-[20px] font-semibold text-snow tabular-nums">{value ?? "—"}</span>
      <span className="mt-1 text-[10.5px] uppercase tracking-wider text-mist">{label}</span>
    </div>
  );
  return (
    <header className="relative z-30 flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-line bg-ink-950/70 px-5 py-3 backdrop-blur">
      <div className="flex items-center gap-3">
        <Logo size={38} />
        <div className="leading-tight">
          <div className="text-[21px] font-semibold tracking-tight text-snow">ClauseRipple</div>
          <div className="text-[13px] text-mist">One clause changes. See what breaks.</div>
        </div>
      </div>

      <span
        className="flex items-center gap-2 rounded-full border border-line-strong bg-ink-850/80 px-3.5 py-1.5 text-[13px] text-mist"
        title={`FalkorDB ${health?.falkordb_version ?? ""} · planner: ${planner || "…"} · tools via MCP`}
        aria-live="polite"
      >
        <Dot tone={connected ? "safe" : "impact"} />
        {connected ? (llm ? `Live · AI agent (${planner.slice(4)})` : "Live on FalkorDB · agent ready") : "FalkorDB offline"}
      </span>

      <AskBar />

      <div className="ml-auto flex items-center gap-6">
        {metric("documents", stats?.documents)}
        {metric("nodes", stats?.nodes)}
        {metric("relationships", stats?.relationships)}
        {metric("cases", stats?.cases)}
        <Button
          onClick={onReset}
          disabled={resetting || resetDisabled || !connected}
          title="Clear only the ClauseRipple graph and re-ingest the v1 corpus"
          className="rounded-xl px-4 py-2.5 text-[14px] font-semibold text-snow"
        >
          {resetting ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
          Reset demo
        </Button>
      </div>
    </header>
  );
}

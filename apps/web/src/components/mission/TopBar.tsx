"use client";

import { Loader2, RotateCcw } from "lucide-react";
import { Logo } from "@/components/Logo";
import { Badge, Button, Dot } from "@/components/ui";
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
    <div className="flex flex-col items-end leading-none">
      <span className="font-mono text-[13px] font-semibold text-snow tabular-nums">{value ?? "—"}</span>
      <span className="mt-0.5 text-[9.5px] uppercase tracking-wider text-fog">{label}</span>
    </div>
  );
  return (
    <header className="relative z-30 flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-line bg-ink-900/90 px-4 py-2 backdrop-blur">
      <div className="flex items-center gap-2.5">
        <Logo />
        <div className="leading-tight">
          <div className="text-[15px] font-semibold tracking-tight text-snow">ClauseRipple</div>
          <div className="text-[10.5px] text-fog">One clause changes. See what breaks.</div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2" aria-live="polite">
        {state?.state === "UPDATED" ? (
          <Badge tone="change">Updated · DPA v{state.dpa_version}</Badge>
        ) : state?.state === "BASELINE" ? (
          <Badge tone="signal">Baseline · DPA v1</Badge>
        ) : (
          <Badge>{state?.state ?? "…"}</Badge>
        )}
        <Badge tone={connected ? "safe" : "impact"}>
          <Dot tone={connected ? "safe" : "impact"} />
          FalkorDB {connected ? `connected${health?.falkordb_version ? ` v${health.falkordb_version}` : ""}` : "unavailable"}
        </Badge>
        <Badge tone={connected ? "signal" : "neutral"} className="normal-case tracking-normal">
          <Dot tone={connected ? "signal" : "neutral"} />
          Agent {connected ? "ready" : "paused"} · {llm ? planner.slice(4) : planner ? "playbook" : "…"} · MCP
        </Badge>
      </div>

      <AskBar />

      <div className="ml-auto flex items-center gap-4">
        {metric("documents", stats?.documents)}
        {metric("nodes", stats?.nodes)}
        {metric("relationships", stats?.relationships)}
        {metric("cases", stats?.cases)}
        {metric("decisions", stats?.decisions)}
        <Button onClick={onReset} disabled={resetting || resetDisabled || !connected} title="Clear only the ClauseRipple graph and re-ingest the v1 corpus">
          {resetting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
          Reset demo
        </Button>
      </div>
    </header>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import type { AgentEvent, RunCompletedEvent, ToolCompletedEvent } from "@/lib/types";

const EVENT_TYPES = [
  "run_started",
  "tools_listed",
  "tool_started",
  "tool_completed",
  "planner_unavailable",
  "completeness_check",
  "run_completed",
  "run_failed",
] as const;

export type RunPhase = "idle" | "running" | "completed" | "failed";

export type AgentRunState = {
  runId: string | null;
  phase: RunPhase;
  events: AgentEvent[];
  steps: ToolCompletedEvent[];
  pendingTool: { step: number; tool: string } | null;
  completed: RunCompletedEvent | null;
  planner: string | null;
  notices: string[];
  error: string | null;
};

/** Subscribes to the agent's SSE stream. Every event is a real, completed backend step. */
export function useAgentRun(runId: string | null): AgentRunState {
  const [stream, setStream] = useState<{ runId: string | null; events: AgentEvent[]; error: string | null }>({
    runId: null,
    events: [],
    error: null,
  });

  useEffect(() => {
    if (!runId) return;
    const source = new EventSource(api.runEventsUrl(runId));
    let closed = false;
    const push = (e: MessageEvent) => {
      try {
        const event = JSON.parse(e.data) as AgentEvent;
        setStream((prev) =>
          prev.runId === runId
            ? { ...prev, events: [...prev.events, event] }
            : { runId, events: [event], error: null },
        );
        if (event.type === "run_completed" || event.type === "run_failed") {
          closed = true;
          source.close();
        }
      } catch {
        /* ignore malformed frames */
      }
    };
    for (const t of EVENT_TYPES) source.addEventListener(t, push as EventListener);
    source.onerror = () => {
      if (!closed) {
        setStream((prev) => ({ ...prev, runId, error: "Agent stream interrupted" }));
        source.close();
      }
    };
    return () => source.close();
  }, [runId]);

  return useMemo(() => {
    const events = stream.runId === runId ? stream.events : [];
    const steps = events.filter((e): e is ToolCompletedEvent => e.type === "tool_completed");
    const completed = (events.find((e) => e.type === "run_completed") as RunCompletedEvent | undefined) ?? null;
    const failed = events.find((e) => e.type === "run_failed") as Extract<AgentEvent, { type: "run_failed" }> | undefined;
    const started = events.find((e) => e.type === "run_started") as
      | Extract<AgentEvent, { type: "run_started" }>
      | undefined;
    const lastStarted = [...events].reverse().find((e) => e.type === "tool_started") as
      | Extract<AgentEvent, { type: "tool_started" }>
      | undefined;
    const pendingTool =
      lastStarted && !steps.some((s) => s.step === lastStarted.step)
        ? { step: lastStarted.step, tool: lastStarted.tool }
        : null;
    const notices = events
      .filter((e) => e.type === "planner_unavailable" || e.type === "completeness_check")
      .map((e) => (e as { message: string }).message);
    let phase: RunPhase = "idle";
    if (runId) phase = failed ? "failed" : completed ? "completed" : "running";
    return {
      runId,
      phase,
      events,
      steps,
      pendingTool,
      completed,
      planner: started?.planner ?? null,
      notices,
      error: failed?.error ?? (stream.runId === runId ? stream.error : null),
    };
  }, [runId, stream]);
}

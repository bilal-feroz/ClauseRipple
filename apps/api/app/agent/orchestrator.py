"""Change Impact Agent orchestrator.

    ChangeEvent -> planner picks a tool -> MCP call_tool -> FalkorDB -> observe -> next tool ...
                -> create_impact_case / assign_impact_case (graph writes) -> run summary

Every tool call goes through the ClauseRipple MCP server (in-process ``mcp.Client``), is streamed
to the UI as it completes, and is persisted as (:AgentRun)-[:EXECUTED]->(:ToolCall)-[:TOUCHED]->(entity).
No chain-of-thought is stored: only tool, input, result summary, entities touched and metrics.
"""

from __future__ import annotations

import asyncio
import json
import logging
import time
import traceback
from datetime import UTC, datetime
from typing import Any

from mcp import Client

from app.agent.events import RunChannel, get_channel, open_channel
from app.agent.llm import llm_config
from app.agent.planners import PlaybookPlanner, build_planner
from app.config import get_settings
from app.graph.client import get_graph
from app.graph.cypher import cypher
from app.graph.ontology import make_id
from app.mcp_server import mcp_server

log = logging.getLogger("clauseripple.agent")
_tasks: dict[str, asyncio.Task[None]] = {}
_active: set[str] = set()


def _now() -> str:
    return datetime.now(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def active_run() -> str | None:
    return next(iter(_active), None)


def _trim(value: Any, limit: int = 4000) -> str:
    text = json.dumps(value, default=str)
    return text if len(text) <= limit else text[:limit] + "…"


class RunContext:
    def __init__(self, run_id: str, ref: str, change_id: str, channel: RunChannel, mcp: Client) -> None:
        self.run_id = run_id
        self.ref = ref
        self.change_id = change_id
        self.channel = channel
        self.mcp = mcp
        self.seq = 0
        self.tool_time_ms = 0.0
        self.reads = 0
        self.writes = 0
        self.db_time_ms = 0.0
        self.cases: list[dict[str, Any]] = []
        self.decisions: set[str] = set()
        self.verdicts: list[dict[str, Any]] = []
        self.vendor_id: str | None = None
        self.errors = 0
        self._last_event = 0.0
        self.pacing_s = get_settings().agent_event_pacing_ms / 1000

    async def call(self, name: str, args: dict[str, Any], *, planner: str) -> dict[str, Any]:
        # Readable pacing between steps for the live UI. Tool execution itself is never delayed
        # or altered; measured durations are reported separately from wall-clock time.
        wait = self.pacing_s - (time.perf_counter() - self._last_event)
        if wait > 0:
            await asyncio.sleep(wait)
        self.seq += 1
        seq = self.seq
        await self.channel.publish(
            {
                "type": "tool_started",
                "run_id": self.run_id,
                "step": seq,
                "tool": name,
                "input": args,
                "planner": planner,
                "at": _now(),
            }
        )
        started = time.perf_counter()
        status = "ok"
        error: str | None = None
        result: dict[str, Any] = {}
        try:
            res = await self.mcp.call_tool(name, args)
            if res.is_error:
                status = (
                    "refused" if any("Refused" in getattr(c, "text", "") for c in res.content) else "error"
                )
                error = " ".join(getattr(c, "text", "") for c in res.content).replace(
                    f"Error executing tool {name}: ", ""
                )
            else:
                result = res.structured_content or {}
        except Exception as exc:  # transport-level failure
            status, error = "error", f"{type(exc).__name__}: {exc}"
        duration_ms = round((time.perf_counter() - started) * 1000, 1)
        self.tool_time_ms += duration_ms
        metrics = result.get("metrics", {})
        self.reads += int(metrics.get("graph_reads", 0))
        self.writes += int(metrics.get("graph_writes", 0))
        self.db_time_ms += float(metrics.get("db_time_ms", 0.0))
        if status != "ok":
            self.errors += 1

        if status == "ok":
            data = result.get("data", {})
            if name == "create_impact_case" and data.get("case_id"):
                self.cases.append(data)
            if name == "recall_related_decisions" and data.get("best_match"):
                self.decisions.add(data["best_match"]["decision_id"])
            if name == "create_impact_case":
                for ref in data.get("related_decisions", []):
                    self.decisions.add(make_id("Decision", ref))
            if name == "evaluate_residency":
                self.verdicts = data.get("verdicts", [])
                self.vendor_id = data.get("vendor_id")

        event = {
            "type": "tool_completed",
            "run_id": self.run_id,
            "step": seq,
            "tool": name,
            "input": args,
            "planner": planner,
            "status": status,
            "error": error,
            "summary": result.get("summary") if status == "ok" else error,
            "data": result.get("data"),
            "touched": result.get("touched", []),
            "ripple": result.get("ripple", []),
            "evidence": result.get("evidence", []),
            "metrics": metrics,
            "duration_ms": duration_ms,
            "via": "mcp",
            "at": _now(),
        }
        await asyncio.to_thread(self._persist_tool_call, event)
        await self.channel.publish(event)
        self._last_event = time.perf_counter()
        return {"summary": event["summary"], "data": event["data"], "error": error}

    def _persist_tool_call(self, event: dict[str, Any]) -> None:
        g = get_graph()
        tc_id = make_id("ToolCall", f"{self.ref}-{event['step']:02d}")
        props = {
            "id": tc_id,
            "name": f"{event['tool']} #{event['step']}",
            "seq": event["step"],
            "tool": event["tool"],
            "planner": event["planner"],
            "status": event["status"],
            "input_json": _trim(event["input"], 2000),
            "summary": (event["summary"] or "")[:600],
            "result_json": _trim(
                {"data": event["data"], "ripple": event["ripple"], "evidence": event["evidence"]}, 12000
            ),
            "touched": [t for t in event["touched"] if t],
            "graph_reads": int(event["metrics"].get("graph_reads", 0)),
            "graph_writes": int(event["metrics"].get("graph_writes", 0)),
            "db_time_ms": float(event["metrics"].get("db_time_ms", 0.0)),
            "duration_ms": event["duration_ms"],
            "via": event["via"],
            "at": event["at"],
        }
        g.write(
            cypher()["record_tool_call"],
            {"run_id": self.run_id, "seq": event["step"], "props": props},
            name="record_tool_call",
        )
        if props["touched"]:
            g.write(
                cypher()["link_tool_touched"],
                {"toolcall_id": tc_id, "ids": props["touched"]},
                name="link_tool_touched",
            )


def _create_run_node(change_id: str, planner_label: str) -> tuple[str, str]:
    g = get_graph()
    seq = int(g.read(cypher().render("next_sequence", label="AgentRun"), name="next_sequence")[0]["next"])
    ref = f"AR-{seq:03d}"
    run_id = make_id("AgentRun", ref)
    props = {
        "id": run_id,
        "ref": ref,
        "seq": seq,
        "name": f"{ref} · Change Impact Agent",
        "agent": "change-impact-agent",
        "trigger": change_id,
        "planner": planner_label,
        "status": "RUNNING",
        "started_at": _now(),
    }
    g.write(cypher()["create_agent_run"], {"props": props, "change_id": change_id}, name="create_agent_run")
    return run_id, ref


async def start_run(change_id: str) -> str:
    if _active:
        raise ValueError("An agent run is already in progress")
    planner = build_planner(llm_config())
    run_id, ref = await asyncio.to_thread(_create_run_node, change_id, planner.label)
    channel = open_channel(run_id)
    _active.add(run_id)
    task = asyncio.create_task(_execute(run_id, ref, change_id, planner, channel))
    _tasks[run_id] = task
    task.add_done_callback(lambda _t: (_tasks.pop(run_id, None), _active.discard(run_id)))
    return run_id


async def _execute(run_id: str, ref: str, change_id: str, planner: Any, channel: RunChannel) -> None:
    started = time.perf_counter()
    await channel.publish(
        {
            "type": "run_started",
            "run_id": run_id,
            "ref": ref,
            "change_id": change_id,
            "planner": planner.label,
            "at": _now(),
        }
    )
    final_text = None
    status = "COMPLETED"
    try:
        async with Client(mcp_server) as mcp:
            ctx = RunContext(run_id, ref, change_id, channel, mcp)
            tools_listed = (await mcp.list_tools()).tools
            tools = [
                {"name": t.name, "description": t.description or "", "input_schema": t.input_schema}
                for t in tools_listed
            ]
            await channel.publish(
                {"type": "tools_listed", "run_id": run_id, "via": "mcp", "tools": [t["name"] for t in tools]}
            )
            if isinstance(planner, PlaybookPlanner):
                outcome = await planner.run(ctx.call, change_id)
            else:
                try:
                    outcome = await planner.run(ctx.call, change_id, tools)
                except Exception as exc:  # LLM provider failure: say so, keep the graph work honest
                    log.warning("LLM planner failed: %s", exc)
                    await channel.publish(
                        {
                            "type": "planner_unavailable",
                            "run_id": run_id,
                            "message": f"Agent planner unavailable ({type(exc).__name__}). Continuing with the deterministic playbook.",
                            "at": _now(),
                        }
                    )
                    outcome = {"final_text": None, "ok": False}
                final_text = outcome.get("final_text")
                await _complete_missing_cases(ctx, planner.label)
            if ctx.errors and not ctx.cases:
                status = "COMPLETED_WITH_ERRORS"
            summary = _summarize(ctx)
            duration_ms = round((time.perf_counter() - started) * 1000, 1)
            completion = {
                "status": status,
                "completed_at": _now(),
                "tool_count": ctx.seq,
                "graph_reads": ctx.reads,
                "graph_writes": ctx.writes,
                "db_time_ms": round(ctx.db_time_ms, 3),
                "tool_time_ms": round(ctx.tool_time_ms, 1),
                "duration_ms": duration_ms,
                "pacing_ms": get_settings().agent_event_pacing_ms,
                "cases_created": [c["ref"] for c in ctx.cases if c.get("created", True)],
                "impacted_entities": sum(1 for v in ctx.verdicts if v.get("affected")),
                "summary": summary,
            }
            if final_text:
                completion["llm_summary"] = final_text[:1500]
            await asyncio.to_thread(_finish_run_node, run_id, completion, ctx)
            await channel.publish(
                {"type": "run_completed", "run_id": run_id, "ref": ref, **completion, "at": _now()}
            )
    except Exception as exc:
        log.error("Agent run %s failed: %s", run_id, traceback.format_exc())
        await asyncio.to_thread(
            _finish_run_node,
            run_id,
            {"status": "FAILED", "completed_at": _now(), "summary": f"Run failed: {type(exc).__name__}"},
            None,
        )
        await channel.publish(
            {"type": "run_failed", "run_id": run_id, "error": f"{type(exc).__name__}: {exc}", "at": _now()}
        )


async def _complete_missing_cases(ctx: RunContext, planner_label: str) -> None:
    """Completeness check after an LLM run: every graph-verified violation must have a case.
    Missing work is finished by the playbook and labelled as such in the trace."""
    handled = {c.get("customer") for c in ctx.cases}
    missing = [v for v in ctx.verdicts if v.get("affected") and v["customer_name"] not in handled]
    if not ctx.verdicts:
        missing = []
    if not missing:
        return
    await ctx.channel.publish(
        {
            "type": "completeness_check",
            "run_id": ctx.run_id,
            "message": f"{planner_label} finished without a case for {', '.join(v['customer_name'] for v in missing)}; "
            "the deterministic playbook completes the remaining steps.",
            "at": _now(),
        }
    )
    playbook = PlaybookPlanner()
    if not ctx.vendor_id:
        return
    for v in missing:
        await playbook.handle_customer(ctx.call, v, ctx.vendor_id, ctx.change_id)


def _summarize(ctx: RunContext) -> str:
    impacted = [v for v in ctx.verdicts if v.get("affected")]
    safe = [v for v in ctx.verdicts if not v.get("affected")]
    parts = []
    if ctx.verdicts:
        parts.append(
            f"{len(impacted)} customer(s) impacted"
            + (f" ({', '.join(v['customer_name'] for v in impacted)})" if impacted else "")
        )
        if safe:
            parts.append(
                "; ".join(f"{v['customer_name']}: {v['status'].lower().replace('_', ' ')}" for v in safe)
            )
    if ctx.cases:
        parts.append(
            "cases: "
            + ", ".join(f"{c['ref']} → {c.get('suggested_owner', {}).get('person', '?')}" for c in ctx.cases)
        )
    if ctx.decisions:
        parts.append("memory used: " + ", ".join(sorted(d.split(":")[1].upper() for d in ctx.decisions)))
    return ". ".join(parts) + "." if parts else "No impact found."


def _finish_run_node(run_id: str, props: dict[str, Any], ctx: RunContext | None) -> None:
    g = get_graph()
    g.write(cypher()["complete_agent_run"], {"run_id": run_id, "props": props}, name="complete_agent_run")
    if ctx is None:
        return
    for c in ctx.cases:
        g.write(
            cypher()["link_run_created"], {"run_id": run_id, "case_id": c["case_id"]}, name="link_run_created"
        )
    for d in ctx.decisions:
        g.write(
            cypher()["link_run_referenced"], {"run_id": run_id, "decision_id": d}, name="link_run_referenced"
        )


def run_detail(run_id: str) -> dict[str, Any] | None:
    rows = get_graph().read(cypher()["agent_run_detail"], {"run_id": run_id}, name="agent_run_detail")
    if not rows or not rows[0].get("run"):
        return None
    run = rows[0]["run"]
    calls = []
    for tc in rows[0]["tool_calls"]:
        if not tc:
            continue
        item = dict(tc)
        for key in ("input_json", "result_json"):
            try:
                item[key.replace("_json", "")] = json.loads(item.pop(key, "null"))
            except (TypeError, json.JSONDecodeError):
                item[key.replace("_json", "")] = None
        calls.append(item)
    return {"run": run, "tool_calls": calls}


def channel_for(run_id: str) -> RunChannel | None:
    return get_channel(run_id)

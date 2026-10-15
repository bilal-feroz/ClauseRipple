from __future__ import annotations

import asyncio
import json
from collections.abc import AsyncIterator
from typing import Any

from fastapi import APIRouter, HTTPException, Path
from pydantic import BaseModel, Field
from sse_starlette.sse import EventSourceResponse

from app.agent import orchestrator
from app.api.deps import guarded
from app.graph.client import get_graph
from app.graph.cypher import cypher

router = APIRouter(prefix="/api/agent", tags=["agent"])

RUN_ID = r"^run:ar-[0-9]{3,6}$"


class RunRequest(BaseModel):
    change_id: str = Field(pattern=r"^change:[a-z0-9.\-]{1,64}$")


@router.post("/run")
async def run(req: RunRequest) -> dict[str, Any]:
    """Launch the Change Impact Agent for an existing ChangeEvent."""
    try:
        run_id = await orchestrator.start_run(req.change_id)
    except ValueError as exc:
        raise HTTPException(409, str(exc)) from exc
    return {"run_id": run_id}


@router.get("/runs")
def runs() -> list[dict[str, Any]]:
    rows = guarded(get_graph().read, cypher()["agent_runs_list"], name="agent_runs_list")
    return [
        {
            **r["run"],
            "created_cases": r["created_cases"],
            "referenced_decisions": r["referenced_decisions"],
            "change_ref": r["change_ref"],
        }
        for r in rows
    ]


@router.get("/runs/{run_id}")
def run_detail(run_id: str = Path(pattern=RUN_ID)) -> dict[str, Any]:
    detail = guarded(orchestrator.run_detail, run_id)
    if detail is None:
        raise HTTPException(404, "Run not found")
    return detail


@router.get("/runs/{run_id}/events")
async def run_events(run_id: str = Path(pattern=RUN_ID)) -> EventSourceResponse:
    """Server-sent events: live tool events while running; replayed from FalkorDB afterwards."""
    channel = orchestrator.channel_for(run_id)

    async def live() -> AsyncIterator[dict[str, str]]:
        assert channel is not None
        async for event in channel.subscribe():
            yield {"event": event["type"], "data": json.dumps(event, default=str)}

    async def replay() -> AsyncIterator[dict[str, str]]:
        detail = await asyncio.to_thread(orchestrator.run_detail, run_id)
        if detail is None:
            yield {
                "event": "run_failed",
                "data": json.dumps({"type": "run_failed", "error": "Run not found"}),
            }
            return
        run = detail["run"]
        yield {
            "event": "run_started",
            "data": json.dumps(
                {
                    "type": "run_started",
                    "run_id": run_id,
                    "ref": run.get("ref"),
                    "planner": run.get("planner"),
                    "replay": True,
                }
            ),
        }
        for tc in detail["tool_calls"]:
            result = tc.get("result") or {}
            event = {
                "type": "tool_completed",
                "run_id": run_id,
                "step": tc["seq"],
                "tool": tc["tool"],
                "input": tc.get("input"),
                "planner": tc.get("planner"),
                "status": tc.get("status"),
                "summary": tc.get("summary"),
                "data": result.get("data"),
                "ripple": result.get("ripple", []),
                "evidence": result.get("evidence", []),
                "touched": tc.get("touched", []),
                "metrics": {
                    "graph_reads": tc.get("graph_reads"),
                    "graph_writes": tc.get("graph_writes"),
                    "db_time_ms": tc.get("db_time_ms"),
                },
                "duration_ms": tc.get("duration_ms"),
                "via": tc.get("via"),
                "replay": True,
            }
            yield {"event": "tool_completed", "data": json.dumps(event, default=str)}
        done = "run_failed" if run.get("status") == "FAILED" else "run_completed"
        yield {
            "event": done,
            "data": json.dumps({"type": done, **run, "run_id": run_id, "replay": True}, default=str),
        }

    return EventSourceResponse(live() if channel else replay(), ping=10)

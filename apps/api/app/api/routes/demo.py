from __future__ import annotations

from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.api.deps import guarded
from app.services import demo

router = APIRouter(prefix="/api/demo", tags=["demo"])


class ApplyChangeRequest(BaseModel):
    doc_id: str = Field(default="modelcloud_dpa", pattern=r"^[a-z0-9_]{1,64}$")
    run_agent: bool = False


@router.post("/reset")
def reset() -> dict[str, Any]:
    """Clear only the ClauseRipple graph, ingest the v1 corpus, validate critical facts."""
    return guarded(demo.reset_demo)


@router.get("/state")
def state() -> dict[str, Any]:
    return guarded(lambda: {**demo.demo_state(), "stats": demo.graph_stats()})


@router.get("/pending")
def pending() -> list[dict[str, Any]]:
    """Document versions waiting in data/demo/v2, with the real text diff against the graph."""
    return guarded(demo.pending_changes)


@router.post("/apply-change")
async def apply_change(req: ApplyChangeRequest) -> dict[str, Any]:
    """Incrementally apply a new document version; optionally launch the impact agent."""
    change = guarded(demo.apply_change, req.doc_id)
    run_id = None
    if req.run_agent:
        from app.agent.orchestrator import start_run

        run_id = await start_run(change_id=change["change_id"])
    return {"change": change, "run_id": run_id}

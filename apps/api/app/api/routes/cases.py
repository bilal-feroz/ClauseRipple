from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException, Path, Query
from pydantic import BaseModel, Field

from app.api.deps import guarded
from app.graph.client import get_graph
from app.graph.cypher import cypher
from app.services import cases, evidence

router = APIRouter(prefix="/api", tags=["cases", "memory"])

CASE_ID = r"^case:cr-[0-9]{3,6}$"
ID = r"^[a-z]+:[a-z0-9.\-]{1,96}$"


@router.get("/cases")
def list_cases() -> list[dict[str, Any]]:
    return guarded(cases.list_cases)


@router.get("/cases/{case_id}")
def case(case_id: str = Path(pattern=CASE_ID)) -> dict[str, Any]:
    detail = guarded(cases.case_detail, case_id)
    if detail is None:
        raise HTTPException(404, "Impact case not found")
    return detail


class CaseRequest(BaseModel):
    customer_id: str = Field(pattern=r"^customer:[a-z0-9.\-]{1,96}$")
    vendor_id: str = Field(default="vendor:modelcloud", pattern=r"^vendor:[a-z0-9.\-]{1,96}$")


@router.post("/cases")
async def request_case(req: CaseRequest) -> dict[str, Any]:
    """Ask the agent's create_impact_case tool (over MCP) to open a case. The tool re-checks the
    residency rule against the live graph and refuses when there is no violation."""
    from mcp import Client

    from app.mcp_server import mcp_server
    from app.services import demo

    change_id = guarded(demo.demo_state).get("latest_change_id")
    if not change_id:
        raise HTTPException(409, "No change event yet — apply the DPA change first")
    async with Client(mcp_server) as client:
        res = await client.call_tool(
            "create_impact_case",
            {"customer_id": req.customer_id, "vendor_id": req.vendor_id, "change_id": change_id},
        )
    if res.is_error:
        text = " ".join(getattr(c, "text", "") for c in res.content).replace(
            "Error executing tool create_impact_case: ", ""
        )
        return {"created": False, "refused": "Refused" in text, "message": text, "via": "mcp"}
    data = (res.structured_content or {}).get("data", {})
    return {"created": bool(data.get("created")), "refused": False, "case": data, "via": "mcp"}


@router.post("/cases/{case_id}/approve")
def approve(case_id: str = Path(pattern=CASE_ID)) -> dict[str, Any]:
    """Human-in-the-loop: approve the remediation. Records a new Decision in company memory."""
    try:
        return guarded(cases.approve_remediation, case_id)
    except cases.GuardrailRefusal as exc:  # pragma: no cover - mapped by guarded() as ValueError
        raise HTTPException(409, str(exc)) from exc


@router.post("/cases/{case_id}/review")
def review(case_id: str = Path(pattern=CASE_ID)) -> dict[str, Any]:
    return guarded(cases.update_status, case_id, "REVIEWED", "Marked reviewed in ClauseRipple")


@router.post("/cases/{case_id}/resolve")
def resolve(case_id: str = Path(pattern=CASE_ID)) -> dict[str, Any]:
    return guarded(cases.update_status, case_id, "RESOLVED", "Resolved in ClauseRipple")


@router.get("/evidence")
def evidence_for(
    customer_id: str = Query(pattern=r"^customer:[a-z0-9.\-]{1,96}$"),
    vendor_id: str = Query("vendor:modelcloud", pattern=r"^vendor:[a-z0-9.\-]{1,96}$"),
) -> dict[str, Any]:
    """Source-backed WHY: dependency path + contract path + vendor regions, each edge with its quote."""
    return guarded(evidence.evidence_bundle, customer_id, vendor_id)


@router.get("/memory/decisions")
def decisions() -> list[dict[str, Any]]:
    g = get_graph()
    if not guarded(g.graph_exists):
        return []
    return guarded(g.read, cypher()["decision_memory"], name="decision_memory")


@router.get("/memory/changes")
def changes() -> list[dict[str, Any]]:
    rows = guarded(get_graph().read, cypher()["change_events_list"], name="change_events_list")
    return [{**r["change"], "runs": r["runs"]} for r in rows]


@router.get("/memory/touched-by")
def touched_by(id: str = Query(pattern=ID)) -> list[dict[str, Any]]:
    """Which agent runs (and tools) touched an entity — graph-native agent observability."""
    return guarded(
        get_graph().read, cypher()["runs_touching_entity"], {"id": id}, name="runs_touching_entity"
    )

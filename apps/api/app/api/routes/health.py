from __future__ import annotations

from typing import Any

from fastapi import APIRouter

from app.agent.llm import llm_status
from app.config import get_settings
from app.graph.client import GraphUnavailableError, get_graph
from app.ingest import embeddings

router = APIRouter(tags=["health"])


@router.get("/health")
def health() -> dict[str, Any]:
    """Actual component state only."""
    settings = get_settings()
    g = get_graph()
    connected = g.ping()
    info: dict[str, Any] = {}
    graph_present = False
    if connected:
        try:
            info = g.server_info()
            graph_present = g.graph_exists()
        except GraphUnavailableError:
            connected = False
    llm = llm_status()
    return {
        "api": "ok",
        "falkordb": "connected" if connected else "unavailable",
        "falkordb_version": info.get("falkordb_version"),
        "graph": settings.falkordb_graph_name,
        "graph_present": graph_present,
        "agent": "ready" if connected and graph_present else "paused",
        "planner": llm["planner"],
        "llm": "configured" if llm["configured"] else "not_configured",
        "llm_provider": llm["provider"],
        "llm_model": llm["model"],
        "embeddings": embeddings.status()["enabled"],
        "demo_mode": settings.demo_mode,
    }

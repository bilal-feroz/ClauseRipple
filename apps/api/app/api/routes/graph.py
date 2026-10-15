from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException, Path, Query

from app.api.deps import guarded
from app.graph.client import get_graph
from app.graph.cypher import cypher
from app.services import demo, graph_view, impact

router = APIRouter(prefix="/api", tags=["graph"])

ID_PATTERN = r"^[a-z]+:[a-z0-9.\-]{1,96}$"


@router.get("/graph")
def graph() -> dict[str, Any]:
    """Live company graph (visible labels) straight from FalkorDB."""
    return guarded(graph_view.snapshot)


@router.get("/graph/stats")
def stats() -> dict[str, Any]:
    return guarded(demo.graph_stats)


@router.get("/graph/node/{node_id}")
def node(node_id: str = Path(pattern=ID_PATTERN)) -> dict[str, Any]:
    result = guarded(graph_view.node_detail, node_id)
    if result is None:
        raise HTTPException(404, "Node not found")
    return result


@router.get("/impact")
def impact_analysis(vendor_id: str = Query("vendor:modelcloud", pattern=ID_PATTERN)) -> dict[str, Any]:
    """Deterministic residency classification of every customer against the vendor's current regions."""
    added = guarded(demo.latest_added_regions)
    result = guarded(impact.evaluate_residency, vendor_id, added_regions=added)
    result["ripple_depths"] = guarded(impact.ripple_depths, vendor_id)
    return result


@router.get("/documents")
def documents() -> list[dict[str, Any]]:
    return guarded(get_graph().read, cypher()["documents_list"], name="documents_list")


@router.get("/documents/{doc_id}")
def document(doc_id: str = Path(pattern=r"^[a-z0-9_]{1,64}$")) -> dict[str, Any]:
    rows = guarded(get_graph().read, cypher()["document_by_id"], {"doc_id": doc_id}, name="document_by_id")
    if not rows:
        raise HTTPException(404, "Document not found")
    return rows[0]

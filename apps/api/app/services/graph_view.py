"""Graph snapshot for the UI (RippleSpace 3D + Evidence Graph 2D). Real nodes/edges only."""

from __future__ import annotations

from typing import Any

from app.graph.client import GraphClient, get_graph
from app.graph.cypher import cypher
from app.graph.ontology import VISIBLE_LABELS, VISIBLE_REL_TYPES


def snapshot(g: GraphClient | None = None) -> dict[str, Any]:
    g = g or get_graph()
    if not g.graph_exists():
        return {"nodes": [], "edges": []}
    labels = list(VISIBLE_LABELS)
    nodes = g.read(cypher()["snapshot_nodes"], {"labels": labels}, name="snapshot_nodes")
    edges = g.read(
        cypher()["snapshot_edges"],
        {"labels": labels, "types": list(VISIBLE_REL_TYPES)},
        name="snapshot_edges",
    )
    clean_nodes = [{k: v for k, v in n.items() if v is not None} for n in nodes]
    clean_edges = []
    for e in edges:
        item = {k: v for k, v in e.items() if v is not None}
        item["id"] = f"{e['source']}|{e['type']}|{e['target']}"
        clean_edges.append(item)
    return {"nodes": clean_nodes, "edges": clean_edges}


def node_detail(node_id: str, g: GraphClient | None = None) -> dict[str, Any] | None:
    g = g or get_graph()
    rows = g.read(cypher()["node_detail"], {"id": node_id}, name="node_detail")
    if not rows:
        return None
    row = rows[0]
    props = dict(row["props"] or {})
    props.pop("embedding", None)
    neighbours = [n for n in row["neighbours"] if n.get("id")]
    return {"id": node_id, "label": row["label"], "props": props, "neighbours": neighbours}

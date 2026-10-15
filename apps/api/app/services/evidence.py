"""Source-backed evidence bundles: every edge on the reasoning path with its document quote."""

from __future__ import annotations

from typing import Any

from app.graph.client import GraphClient, get_graph
from app.graph.cypher import cypher
from app.services import impact


def _dedupe_paths(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    seen: set[tuple[str, ...]] = set()
    out = []
    for r in rows:
        key = tuple(n["id"] for n in r["nodes"])
        if key not in seen:
            seen.add(key)
            out.append({"nodes": r["nodes"], "edges": r["edges"]})
    return out


def evidence_bundle(customer_id: str, vendor_id: str, g: GraphClient | None = None) -> dict[str, Any]:
    g = g or get_graph()
    dep = _dedupe_paths(
        g.read(
            cypher()["evidence_dependency_paths"],
            {"customer_id": customer_id, "vendor_id": vendor_id},
            name="evidence_dependency_paths",
        )
    )
    con = _dedupe_paths(
        g.read(
            cypher()["evidence_contract_paths"], {"customer_id": customer_id}, name="evidence_contract_paths"
        )
    )
    regions = impact.vendor_regions(vendor_id, g)
    no_path_proof = None
    if not dep:
        no_path_proof = (
            "dependency_path_exists returned null: no USES/POWERED_BY/DEPENDS_ON path within 6 hops"
            if impact.dependency_path(customer_id, vendor_id, g) is None
            else None
        )

    edges: dict[tuple[str, str, str], dict[str, Any]] = {}
    for path in dep + con:
        for i, e in enumerate(path["edges"]):
            a, b = path["nodes"][i], path["nodes"][i + 1]
            edges[(a["id"], e["type"], b["id"])] = {
                **e,
                "from": a,
                "to": b,
            }
    vendor_node = {"id": vendor_id, "name": impact.vendor_name(vendor_id, g), "label": "Vendor"}
    for r in regions:
        edges[(vendor_id, "PROCESSES_IN", r["region_id"])] = {
            "type": "PROCESSES_IN",
            "src": r["src"],
            "src_ver": r["src_ver"],
            "quote": r["quote"],
            "loc": r["loc"],
            "line": r["line"],
            "change_id": r.get("change_id"),
            "from": vendor_node,
            "to": {"id": r["region_id"], "name": r["name"], "label": "DataRegion", "code": r["code"]},
        }
    docs = sorted({e["src"] for e in edges.values() if e.get("src")})
    return {
        "customer_id": customer_id,
        "vendor_id": vendor_id,
        "dependency_paths": dep,
        "contract_paths": con,
        "vendor_regions": regions,
        "edges": list(edges.values()),
        "documents": docs,
        "edge_count": len(edges),
        "doc_count": len(docs),
        "no_path_proof": no_path_proof,
    }

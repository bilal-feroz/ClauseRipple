"""Post-ingestion validation of critical demo facts against the live graph."""

from __future__ import annotations

from typing import Any

import yaml

from app.config import get_settings
from app.graph.client import GraphClient, get_graph
from app.graph.cypher import cypher
from app.graph.ontology import label_of
from app.services import impact


def load_expectations() -> dict[str, Any]:
    path = get_settings().demo_dir / "expectations.yaml"
    return yaml.safe_load(path.read_text(encoding="utf-8"))


def validate_baseline(g: GraphClient | None = None) -> dict[str, Any]:
    g = g or get_graph()
    exp = load_expectations()["baseline"]
    checks: list[dict[str, Any]] = []

    for src, rel, dst in exp.get("edges", []):
        q = cypher().render("edge_exists", src_label=label_of(src), rel_type=rel, dst_label=label_of(dst))
        row = g.read(q, {"src": src, "dst": dst}, name="edge_exists")[0]
        checks.append(
            {
                "check": f"{src} -[{rel}]-> {dst}",
                "ok": row["n"] > 0,
                "detail": f"source: {row['src']}"
                if row["n"]
                else "missing — extraction did not produce this fact",
            }
        )

    for customer_id, expected in exp.get("allowed_regions", {}).items():
        rows = g.read(
            cypher()["customer_residency_obligations"],
            {"customer_id": customer_id},
            name="customer_residency_obligations",
        )
        actual = sorted({r for row in rows for r in row["allowed_regions"] if r})
        checks.append(
            {
                "check": f"{customer_id} allowed regions == {sorted(expected)}",
                "ok": actual == sorted(expected),
                "detail": f"graph says {actual}",
            }
        )

    for vendor_id, expected in exp.get("vendor_regions", {}).items():
        actual = sorted(r["code"] for r in impact.vendor_regions(vendor_id, g))
        checks.append(
            {
                "check": f"{vendor_id} processing regions == {sorted(expected)}",
                "ok": actual == sorted(expected),
                "detail": f"graph says {actual}",
            }
        )

    for customer_id, vendor_id in exp.get("no_dependency_path", []):
        path = impact.dependency_path(customer_id, vendor_id, g)
        checks.append(
            {
                "check": f"no dependency path {customer_id} -> {vendor_id}",
                "ok": path is None,
                "detail": "bounded shortestPath returned null" if path is None else "unexpected path found",
            }
        )

    passed = sum(1 for c in checks if c["ok"])
    return {"ok": passed == len(checks), "passed": passed, "total": len(checks), "checks": checks}

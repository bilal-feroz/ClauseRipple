"""Graph-backed impact analysis: FalkorDB traverses, deterministic rules classify."""

from __future__ import annotations

from typing import Any

from app.graph.client import GraphClient, get_graph
from app.graph.cypher import cypher
from app.graph.ontology import label_of
from app.services.rules import ResidencyVerdict, classify_residency


def vendor_dependents(vendor_id: str, g: GraphClient | None = None) -> list[dict[str, Any]]:
    g = g or get_graph()
    return g.read(cypher()["vendor_dependents"], {"vendor_id": vendor_id}, name="vendor_dependents")


def vendor_regions(vendor_id: str, g: GraphClient | None = None) -> list[dict[str, Any]]:
    g = g or get_graph()
    return g.read(cypher()["vendor_regions"], {"vendor_id": vendor_id}, name="vendor_regions")


def blast_radius(vendor_id: str, g: GraphClient | None = None) -> list[dict[str, Any]]:
    g = g or get_graph()
    return g.read(cypher()["customer_blast_radius"], {"vendor_id": vendor_id}, name="customer_blast_radius")


def dependency_path(customer_id: str, vendor_id: str, g: GraphClient | None = None) -> dict[str, Any] | None:
    g = g or get_graph()
    rows = g.read(
        cypher()["dependency_path_exists"],
        {"customer_id": customer_id, "vendor_id": vendor_id},
        name="dependency_path_exists",
    )
    if not rows:
        return None
    return rows[0].get("path")


def entity(node_id: str, g: GraphClient | None = None) -> dict[str, Any] | None:
    g = g or get_graph()
    rows = g.read(
        cypher().render("entity_by_id", label=label_of(node_id)), {"id": node_id}, name="entity_by_id"
    )
    return rows[0] if rows else None


def vendor_name(vendor_id: str, g: GraphClient | None = None) -> str:
    row = entity(vendor_id, g)
    if row is None or label_of(vendor_id) != "Vendor":
        raise LookupError(f"Unknown vendor {vendor_id}")
    return str(row["name"])


def evaluate_residency(
    vendor_id: str,
    *,
    added_regions: list[str] | None = None,
    g: GraphClient | None = None,
) -> dict[str, Any]:
    """Classify every customer against the vendor's current processing regions.

    Facts come from FalkorDB (blast radius paths, contract obligations, vendor regions).
    Customers with no route get a bounded shortestPath proof of absence before being cleared.
    """
    g = g or get_graph()
    vname = vendor_name(vendor_id, g)
    regions = vendor_regions(vendor_id, g)
    region_codes = [r["code"] for r in regions]
    paths = blast_radius(vendor_id, g)
    customers = g.read(cypher()["all_customer_residency"], name="all_customer_residency")

    routes_by_customer: dict[str, list[dict[str, Any]]] = {}
    for p in paths:
        routes_by_customer.setdefault(p["customer_id"], []).append(
            {
                "product_id": p["product_id"],
                "product": p["product_name"],
                "system_id": p["system_id"],
                "system": p["system_name"],
                "hops": p["hops"],
                "path_nodes": p["path_nodes"],
            }
        )

    verdicts: list[ResidencyVerdict] = []
    proofs: dict[str, str] = {}
    for c in customers:
        routes = routes_by_customer.get(c["customer_id"], [])
        exists = bool(routes)
        if not exists:
            # Bounded proof of absence (never infer "safe" from a missing row alone).
            path = dependency_path(c["customer_id"], vendor_id, g)
            exists = path is not None
            proofs[c["customer_id"]] = "path found" if exists else "no path within 6 hops"
        verdicts.append(
            classify_residency(
                customer_id=c["customer_id"],
                customer_name=c["customer_name"],
                vendor_name=vname,
                dependency_path_exists=exists,
                vendor_regions=region_codes,
                allowed_regions=[r for r in c["allowed_regions"] if r],
                regulated=bool(c.get("regulated")),
                clause_refs=[r for r in c.get("clause_refs", []) if r],
                added_regions=added_regions,
                routes=routes,
            )
        )

    impacted = [v for v in verdicts if v.affected]
    return {
        "vendor_id": vendor_id,
        "vendor_name": vname,
        "vendor_regions": region_codes,
        "vendor_region_evidence": regions,
        "verdicts": [v.as_dict() for v in verdicts],
        "absence_proofs": proofs,
        "summary": {
            "customers_evaluated": len(verdicts),
            "customers_with_dependency": sum(1 for v in verdicts if v.dependency_path_exists),
            "customers_impacted": len(impacted),
            "products_involved": sorted({r["product"] for v in impacted for r in v.routes}),
            "systems_involved": sorted({r["system"] for v in impacted for r in v.routes}),
        },
    }


def ripple_depths(vendor_id: str, g: GraphClient | None = None) -> dict[str, int]:
    """Distance (in hops) of every node on a blast-radius path from the vendor.

    RippleSpace sequences its shockwave by these depths, so the animation order is the
    traversal order FalkorDB returned — not a scripted timeline.
    """
    depths: dict[str, int] = {vendor_id: 0}
    for p in blast_radius(vendor_id, g):
        nodes = p["path_nodes"]
        last = len(nodes) - 1
        for i, n in enumerate(nodes):
            d = last - i
            depths[n["id"]] = min(depths.get(n["id"], d), d)
    return depths

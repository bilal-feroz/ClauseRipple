"""Graph-native agent tools.

Every tool is a thin, typed wrapper over the FalkorDB service layer. The same functions are
served over MCP (app/mcp_server.py) and called by the agent through an MCP client, so REST,
MCP and the agent share one implementation.

Each tool returns:
  summary   one line for the agent trace
  data      compact structured result (what the planner sees)
  touched   graph node ids read/written (persisted as ToolCall -[:TOUCHED]-> node)
  ripple    [{id, depth, status}] hints that drive the RippleSpace propagation
  evidence  source quotes backing the result
  metrics   real graph reads/writes and FalkorDB execution time for this call
"""

from __future__ import annotations

from typing import Annotated, Any

from pydantic import Field

from app.graph.client import get_graph, meter
from app.graph.cypher import cypher
from app.services import cases, demo, evidence, impact

_ID = r"[a-z0-9.\-]{1,96}"
VendorId = Annotated[
    str, Field(description="Vendor node id, e.g. 'vendor:modelcloud'", pattern=rf"^vendor:{_ID}$")
]
CustomerId = Annotated[
    str, Field(description="Customer node id, e.g. 'customer:falcon-bank'", pattern=rf"^customer:{_ID}$")
]
SystemId = Annotated[
    str,
    Field(description="System node id, e.g. 'system:document-processing-api'", pattern=rf"^system:{_ID}$"),
]
ChangeId = Annotated[
    str, Field(description="ChangeEvent node id, e.g. 'change:chg-2026-001'", pattern=rf"^change:{_ID}$")
]
CaseId = Annotated[str, Field(description="ImpactCase node id, e.g. 'case:cr-104'", pattern=rf"^case:{_ID}$")]
PersonId = Annotated[
    str, Field(description="Person node id, e.g. 'person:sarah-malik'", pattern=rf"^person:{_ID}$")
]
TeamId = Annotated[
    str, Field(description="Team node id, e.g. 'team:platform-engineering'", pattern=rf"^team:{_ID}$")
]
DecisionIds = Annotated[
    list[Annotated[str, Field(pattern=rf"^decision:{_ID}$")]],
    Field(description="Decision node ids recalled from memory that support this case", max_length=5),
]


def _result(summary: str, data: dict[str, Any], m: Any, **extra: Any) -> dict[str, Any]:
    return {
        "summary": summary,
        "data": data,
        "touched": sorted(set(extra.get("touched", []))),
        "ripple": extra.get("ripple", []),
        "evidence": extra.get("evidence", [])[:12],
        "metrics": m.as_dict(),
    }


def _ev(e: dict[str, Any], label: str | None = None) -> dict[str, Any]:
    return {
        "type": e.get("type", label),
        "src": e.get("src"),
        "quote": e.get("quote"),
        "line": e.get("line"),
        "loc": e.get("loc"),
    }


# ── 1 ───────────────────────────────────────────────────────────────────────────
def inspect_change(change_id: ChangeId) -> dict[str, Any]:
    """Inspect a detected source change (ChangeEvent): which document changed, which entity's facts
    changed, and exactly which graph facts were introduced or retracted. Start here."""
    with meter() as m:
        detail = demo.change_detail(change_id)
        if detail is None:
            raise LookupError(f"Unknown change event {change_id}")
        ch = detail["change"]
        added = [
            {"subject": i["subject"], "rel": i["rel"], "object_id": i["object_id"], "object": i["object_name"],
             "code": i.get("object_code"), "quote": i.get("quote")}
            for i in detail["introduced"]
        ]  # fmt: skip
        retracted = [
            {"subject": r["subject"], "rel": r["rel"], "object": r["object_name"]}
            for r in detail["retracted"]
        ]
        subjects = detail["subjects"]
    subject_names = {s["id"]: s["name"] for s in subjects}
    facts = "; ".join(
        f"{subject_names.get(a['subject'], a['subject'])} {a['rel']} {a['object']}" for a in added
    )
    return _result(
        f"{ch['ref']}: {ch['doc_id']} v{ch['old_version']} → v{ch['new_version']} · added {facts or 'no facts'}",
        {
            "change_id": change_id,
            "ref": ch["ref"],
            "type": ch["type"],
            "document": ch["doc_id"],
            "old_version": ch["old_version"],
            "new_version": ch["new_version"],
            "changed_entities": subjects,
            "added_facts": added,
            "retracted_facts": retracted,
        },
        m,
        touched=[s["id"] for s in subjects] + [a["object_id"] for a in added],
        ripple=[{"id": s["id"], "depth": 0, "status": "changed"} for s in subjects]
        + [{"id": a["object_id"], "depth": 0, "status": "new"} for a in added],
        evidence=[{"type": a["rel"], "src": ch["doc_id"], "quote": a["quote"]} for a in added],
    )


# ── 2 ───────────────────────────────────────────────────────────────────────────
def trace_vendor_dependents(vendor_id: VendorId) -> dict[str, Any]:
    """Multi-hop traversal: every internal System that depends on the vendor, directly or through
    other systems (DEPENDS_ON*1..4). Returns hop counts and source-backed dependency evidence."""
    with meter() as m:
        rows = impact.vendor_dependents(vendor_id)
    systems = {}
    for r in rows:
        systems.setdefault(
            r["system_id"],
            {"system_id": r["system_id"], "system": r["system_name"], "tier": r["tier"], "hops": r["hops"]},
        )
    names = ", ".join(s["system"] for s in systems.values())
    return _result(
        f"{len(systems)} system(s) depend on {vendor_id.split(':')[1]}: {names or 'none'}",
        {"vendor_id": vendor_id, "systems": list(systems.values())},
        m,
        touched=[vendor_id, *systems],
        ripple=[{"id": s["system_id"], "depth": s["hops"], "status": "traversed"} for s in systems.values()],
        evidence=[_ev(e) for r in rows for e in r["evidence"]],
    )


# ── 3 ───────────────────────────────────────────────────────────────────────────
def find_impacted_customers(vendor_id: VendorId) -> dict[str, Any]:
    """Multi-hop traversal Customer -USES-> Product -POWERED_BY-> System -DEPENDS_ON*-> Vendor.
    Returns every DOWNSTREAM customer (candidates only — exposure is decided by evaluate_residency)."""
    with meter() as m:
        rows = impact.blast_radius(vendor_id)
    customers: dict[str, dict[str, Any]] = {}
    ripple: dict[str, dict[str, Any]] = {}
    for r in rows:
        c = customers.setdefault(
            r["customer_id"], {"customer_id": r["customer_id"], "customer": r["customer_name"], "routes": []}
        )
        c["routes"].append(
            {
                "product_id": r["product_id"],
                "product": r["product_name"],
                "system_id": r["system_id"],
                "system": r["system_name"],
                "hops": r["hops"],
            }
        )
        last = len(r["path_nodes"]) - 1
        for i, n in enumerate(r["path_nodes"]):
            if n["label"] in {"Product", "Customer"}:
                ripple[n["id"]] = {"id": n["id"], "depth": last - i, "status": "downstream"}
    products = sorted({rt["product"] for c in customers.values() for rt in c["routes"]})
    return _result(
        f"{len(customers)} downstream customer(s) via {len(products)} product(s): "
        + ", ".join(c["customer"] for c in customers.values()),
        {"vendor_id": vendor_id, "customers": list(customers.values()), "products": products},
        m,
        touched=[*customers, *(rt["product_id"] for c in customers.values() for rt in c["routes"])],
        ripple=sorted(ripple.values(), key=lambda x: x["depth"]),
        evidence=[_ev(e) for r in rows for e in r["path_edges"] if e["type"] in {"USES", "POWERED_BY"}],
    )


# ── 4 ───────────────────────────────────────────────────────────────────────────
def get_customer_obligations(customer_id: CustomerId) -> dict[str, Any]:
    """Contract obligations for one customer: data-residency clauses (allowed regions) and
    change-notification clauses (notice period), with exact clause quotes."""
    g = get_graph()
    with meter() as m:
        res = g.read(
            cypher()["customer_residency_obligations"],
            {"customer_id": customer_id},
            name="customer_residency_obligations",
        )
        notes = g.read(
            cypher()["customer_notification_obligations"],
            {"customer_id": customer_id},
            name="customer_notification_obligations",
        )
    residency = [
        {"obligation_id": r["obligation_id"], "contract": r["contract_name"], "clause": r["clause_ref"],
         "title": r["clause_title"], "allowed_regions": sorted(x for x in r["allowed_regions"] if x)}
        for r in res
    ]  # fmt: skip
    notice = [
        {"obligation_id": n["obligation_id"], "clause": n["clause_ref"], "notice_days": n["notice_days"]}
        for n in notes
    ]
    allowed = sorted({x for r in residency for x in r["allowed_regions"]})
    clause_refs = ", ".join("§" + str(r["clause"]) for r in residency)
    return _result(
        f"{customer_id.split(':')[1]}: residency {clause_refs or 'none'} allows {', '.join(allowed) or '—'}",
        {"customer_id": customer_id, "residency": residency, "notification": notice},
        m,
        touched=[
            customer_id,
            *(r["obligation_id"] for r in residency),
            *(n["obligation_id"] for n in notice),
        ],
        ripple=[{"id": r["obligation_id"], "depth": 4, "status": "checked"} for r in residency],
        evidence=[{"type": "ALLOWS", "src": r["src"], "quote": r["quote"], "line": r["line"]} for r in res],
    )


# ── 5 ───────────────────────────────────────────────────────────────────────────
def evaluate_residency(vendor_id: VendorId, change_id: ChangeId | None = None) -> dict[str, Any]:
    """Deterministic compliance check for EVERY customer: vendor processing regions (graph) minus
    the customer's allowed regions (contract graph) = violating regions. A customer is impacted only
    if a dependency path exists AND a violating region exists. The LLM never decides this."""
    g = get_graph()
    with meter() as m:
        added = cases.added_regions_for_change(change_id, g)
        ev = impact.evaluate_residency(vendor_id, added_regions=added, g=g)
        obligations = {
            r["customer_id"]: r["obligation_ids"]
            for r in g.read(cypher()["all_customer_residency"], name="all_customer_residency")
        }
    verdicts = [
        {k: v[k] for k in ("customer_id", "customer_name", "status", "affected", "severity", "violating_regions",
                           "allowed_regions", "vendor_regions", "introduced_by_change", "reason", "acv_usd")}
        | {"routes": [{"product": r["product"], "system": r["system"], "system_id": r["system_id"]} for r in v["routes"]]}
        for v in ev["verdicts"]
    ]  # fmt: skip
    impacted = [v for v in verdicts if v["affected"]]
    ripple = []
    for v in verdicts:
        status = "impacted" if v["affected"] else "safe"
        ripple.append({"id": v["customer_id"], "depth": 3, "status": status})
        for ob in obligations.get(v["customer_id"], []):
            if ob:
                ripple.append({"id": ob, "depth": 4, "status": "violated" if v["affected"] else "satisfied"})
    return _result(
        f"{len(impacted)} conflict(s): "
        + (
            ", ".join(f"{v['customer_name']} ({', '.join(v['violating_regions'])})" for v in impacted)
            or "none"
        )
        + " · "
        + ", ".join(
            f"{v['customer_name']} {v['status'].lower().replace('_', ' ')}"
            for v in verdicts
            if not v["affected"]
        ),
        {
            "vendor_id": vendor_id,
            "vendor_regions": ev["vendor_regions"],
            "verdicts": verdicts,
            "summary": ev["summary"],
        },
        m,
        touched=[v["customer_id"] for v in verdicts] + [o for obs in obligations.values() for o in obs if o],
        ripple=ripple,
        evidence=[_ev(r, "PROCESSES_IN") | {"type": "PROCESSES_IN"} for r in ev["vendor_region_evidence"]],
    )


# ── 6 ───────────────────────────────────────────────────────────────────────────
def recall_related_decisions(
    customer_id: CustomerId,
    vendor_id: VendorId,
    topic: Annotated[
        str, Field(description="Topic to match, e.g. 'data residency'", max_length=60)
    ] = "data residency",
) -> dict[str, Any]:
    """Decision memory: prior decisions in the graph that APPLY_TO this customer and/or INVOLVE this
    vendor, ranked by shared anchors. Use them as precedent for the remediation."""
    g = get_graph()
    with meter() as m:
        rows = g.read(
            cypher()["related_decisions"],
            {"customer_id": customer_id, "vendor_id": vendor_id, "topic": topic},
            name="related_decisions",
        )
    decisions = [
        {"decision_id": r["decision_id"], "ref": r["ref"], "title": r["title"], "date": r["date"],
         "decision": r["decision"], "owner": r["owner"], "approved_by": r["approved_by"], "tickets": r["tickets"],
         "matches_customer": r["matches_customer"], "matches_vendor": r["matches_vendor"], "score": r["score"],
         "origin": r.get("origin") or "decision_record"}
        for r in rows
    ]  # fmt: skip
    strong = [d for d in decisions if d["matches_customer"] and d["matches_vendor"]]
    head = strong[0] if strong else None
    return _result(
        f"{head['ref']} found — {head['title']}"
        if head
        else f"No prior decision for this customer + vendor ({len(decisions)} weaker match(es))",
        {"customer_id": customer_id, "vendor_id": vendor_id, "decisions": decisions[:5], "best_match": head},
        m,
        touched=[d["decision_id"] for d in decisions[:3]],
        ripple=[{"id": d["decision_id"], "depth": 5, "status": "recalled"} for d in strong],
        evidence=[{"type": "DECISION", "src": r.get("src"), "quote": r["decision"]} for r in rows[:2]],
    )


# ── 7 ───────────────────────────────────────────────────────────────────────────
def find_owner(system_id: SystemId) -> dict[str, Any]:
    """Ownership routing: System -OWNED_BY-> Team <-LEADS- Person. Returns the accountable team lead."""
    g = get_graph()
    with meter() as m:
        owner = cases.system_owner(system_id, g)
    if owner is None:
        raise LookupError(f"No owner recorded for {system_id}")
    return _result(
        f"{owner['lead_name']} / {owner['team_name']} own {owner['system_name']}",
        {
            "system_id": system_id,
            "team_id": owner["team_id"],
            "team": owner["team_name"],
            "person_id": owner["lead_id"],
            "person": owner["lead_name"],
            "role": owner["lead_role"],
            "members": owner["members"],
        },
        m,
        touched=[system_id, owner["team_id"], owner["lead_id"]],
        ripple=[
            {"id": owner["team_id"], "depth": 5, "status": "owner"},
            {"id": owner["lead_id"], "depth": 6, "status": "owner"},
        ],
        evidence=[
            {
                "type": "OWNED_BY",
                "src": owner["ownership_src"],
                "quote": owner["ownership_quote"],
                "line": owner["ownership_line"],
            },
            {
                "type": "LEADS",
                "src": owner["lead_src"],
                "quote": owner["lead_quote"],
                "line": owner["lead_line"],
            },
        ],
    )


# ── 8 ───────────────────────────────────────────────────────────────────────────
def get_source_evidence(customer_id: CustomerId, vendor_id: VendorId) -> dict[str, Any]:
    """Provenance: the dependency path and the contract path behind a verdict, every relationship
    with its source document, version, line and exact quote."""
    with meter() as m:
        bundle = evidence.evidence_bundle(customer_id, vendor_id)
    return _result(
        f"{bundle['edge_count']} graph relationships · {bundle['doc_count']} source documents",
        {
            "customer_id": customer_id,
            "vendor_id": vendor_id,
            "documents": bundle["documents"],
            "edge_count": bundle["edge_count"],
            "dependency_path": [n["name"] for n in bundle["dependency_paths"][0]["nodes"]]
            if bundle["dependency_paths"]
            else [],
            "contract_path": [n["name"] for n in bundle["contract_paths"][0]["nodes"]]
            if bundle["contract_paths"]
            else [],
            "no_path_proof": bundle["no_path_proof"],
        },
        m,
        touched=[customer_id, vendor_id],
        evidence=[_ev(e) for e in bundle["edges"]],
    )


# ── 9 ───────────────────────────────────────────────────────────────────────────
def create_impact_case(
    customer_id: CustomerId,
    vendor_id: VendorId,
    change_id: ChangeId,
    related_decision_ids: DecisionIds | None = None,
    agent_note: Annotated[
        str | None,
        Field(description="Optional one-paragraph explanation for the case owner", max_length=1200),
    ] = None,
) -> dict[str, Any]:
    """ACTION (writes to FalkorDB): create an ImpactCase with remediation actions whose owners are
    resolved from the graph. Guardrail: refused unless the live graph shows a residency violation."""
    with meter() as m:
        res = cases.create_impact_case(
            customer_id=customer_id,
            vendor_id=vendor_id,
            change_id=change_id,
            related_decision_ids=related_decision_ids or [],
            agent_note=agent_note,
            planner="agent",
        )
    verdict = res.pop("verdict")
    return _result(
        f"{res['ref']} {'created' if res['created'] else 'already exists'} · {verdict['severity']} · {verdict['customer_name']}",
        res,
        m,
        touched=[res["case_id"], customer_id, vendor_id, *(a.get("id", "") for a in res.get("actions", []))],
        ripple=[{"id": res["case_id"], "depth": 7, "status": "case"}],
    )


# ── 10 ──────────────────────────────────────────────────────────────────────────
def assign_impact_case(case_id: CaseId, person_id: PersonId, team_id: TeamId) -> dict[str, Any]:
    """ACTION (writes to FalkorDB): assign an ImpactCase. Guardrail: the person must lead/belong to a
    team that OWNS a system involved in the case (graph ownership, never a guess)."""
    with meter() as m:
        res = cases.assign_impact_case(case_id, person_id, team_id)
    return _result(
        f"{res['ref']} assigned to {res['person']} / {res['team']}",
        res,
        m,
        touched=[case_id, person_id, team_id],
        ripple=[{"id": person_id, "depth": 7, "status": "assigned"}],
    )


TOOLS: list[tuple[str, Any, bool]] = [
    ("inspect_change", inspect_change, False),
    ("trace_vendor_dependents", trace_vendor_dependents, False),
    ("find_impacted_customers", find_impacted_customers, False),
    ("get_customer_obligations", get_customer_obligations, False),
    ("evaluate_residency", evaluate_residency, False),
    ("recall_related_decisions", recall_related_decisions, False),
    ("find_owner", find_owner, False),
    ("get_source_evidence", get_source_evidence, False),
    ("create_impact_case", create_impact_case, True),
    ("assign_impact_case", assign_impact_case, True),
]
WRITE_TOOLS = {name for name, _, writes in TOOLS if writes}

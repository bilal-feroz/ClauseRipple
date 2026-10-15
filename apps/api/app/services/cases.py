"""ImpactCase lifecycle: creation (by the agent, guarded by the graph), assignment, human approval."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any

from app.graph.client import GraphClient, get_graph
from app.graph.cypher import cypher
from app.graph.ontology import make_id
from app.services import demo, evidence, impact


class GuardrailRefusal(ValueError):
    """The graph does not support the requested action; nothing was written."""


def _now() -> str:
    return datetime.now(UTC).isoformat(timespec="seconds").replace("+00:00", "Z")


def next_change_record(g: GraphClient) -> tuple[int, str]:
    seq = int(g.read(cypher()["next_change_record_seq"], name="next_change_record_seq")[0]["next"])
    return seq, f"CR-{seq:03d}"


def added_regions_for_change(change_id: str | None, g: GraphClient) -> list[str]:
    if not change_id:
        return []
    detail = demo.change_detail(change_id, g)
    if not detail:
        raise LookupError(f"Unknown change event {change_id}")
    return sorted(
        {
            i["object_code"]
            for i in detail["introduced"]
            if i.get("rel") == "PROCESSES_IN" and i.get("object_code")
        }
    )


def system_owner(system_id: str, g: GraphClient) -> dict[str, Any] | None:
    rows = g.read(cypher()["system_owner"], {"system_id": system_id}, name="system_owner")
    return rows[0] if rows else None


def create_impact_case(
    *,
    customer_id: str,
    vendor_id: str,
    change_id: str | None,
    related_decision_ids: list[str] | None = None,
    agent_note: str | None = None,
    planner: str = "playbook",
    g: GraphClient | None = None,
) -> dict[str, Any]:
    """Create an ImpactCase ONLY if the live graph shows a residency violation.

    The agent (LLM or playbook) cannot create a case the graph does not justify: the verdict is
    re-computed here from FalkorDB with the deterministic rules before anything is written.
    """
    g = g or get_graph()
    added = added_regions_for_change(change_id, g)
    ev = impact.evaluate_residency(vendor_id, added_regions=added, g=g)
    verdict = next((v for v in ev["verdicts"] if v["customer_id"] == customer_id), None)
    if verdict is None:
        raise LookupError(f"Unknown customer {customer_id}")
    if not verdict["affected"]:
        raise GuardrailRefusal(
            f"Refused: the graph shows {verdict['customer_name']} is {verdict['status']} — {verdict['reason']}"
        )

    if change_id:
        existing = g.read(
            cypher()["open_case_for"],
            {"customer_id": customer_id, "vendor_id": vendor_id, "change_id": change_id},
            name="open_case_for",
        )
        if existing:
            return {
                "case_id": existing[0]["id"],
                "ref": existing[0]["ref"],
                "created": False,
                "verdict": verdict,
            }

    route = sorted(verdict["routes"], key=lambda r: (r["hops"], r["system"]))[0]
    obligations = g.read(
        cypher()["customer_residency_obligations"],
        {"customer_id": customer_id},
        name="customer_residency_obligations",
    )
    obligation = obligations[0]
    owner = system_owner(route["system_id"], g)
    if owner is None or not owner.get("lead_id"):
        raise GuardrailRefusal(f"Refused: no owning team/lead found in the graph for {route['system']}")

    controls = g.read(
        cypher()["obligation_control_owners"],
        {"obligation_id": obligation["obligation_id"]},
        name="obligation_control_owners",
    )
    review_control = next((c for c in controls if not c.get("implemented_in_id")), None)
    enforcement_control = next(
        (c for c in controls if c.get("implemented_in_id") == route["system_id"]), None
    )
    account = g.read(cypher()["account_manager"], {"customer_id": customer_id}, name="account_manager")
    notices = g.read(
        cypher()["customer_notification_obligations"],
        {"customer_id": customer_id},
        name="customer_notification_obligations",
    )

    decisions = []
    if related_decision_ids:
        recalled = g.read(
            cypher()["related_decisions"],
            {"customer_id": customer_id, "vendor_id": vendor_id, "topic": "data residency"},
            name="related_decisions",
        )
        by_id = {d["decision_id"]: d for d in recalled}
        decisions = [by_id[d] for d in related_decision_ids if d in by_id]

    vendor = ev["vendor_name"]
    customer = verdict["customer_name"]
    allowed = "/".join(verdict["allowed_regions"])
    if decisions:
        d = decisions[0]
        recommended = (
            f"Apply {d['ref']}: keep {customer} workloads pinned to {allowed}-only processing in "
            f"{route['system']} until the {vendor} DPA change is reviewed."
        )
    else:
        reviewer = review_control["team_name"] if review_control else "Compliance"
        recommended = (
            f"Restrict {customer} workloads in {route['system']} to {allowed}-only processing and escalate the "
            f"{vendor} DPA change to {reviewer} for review."
        )

    seq, ref = next_change_record(g)
    case_id = make_id("ImpactCase", ref)
    bundle = evidence.evidence_bundle(customer_id, vendor_id, g)
    created_at = _now()
    props = {
        "id": case_id,
        "ref": ref,
        "seq": seq,
        "name": f"{ref} · {vendor} regional processing change · {customer}",
        "title": f"{vendor} regional processing change",
        "severity": verdict["severity"],
        "status": "OPEN",
        "customer_name": customer,
        "vendor_name": vendor,
        "product": route["product"],
        "system": route["system"],
        "violating_regions": verdict["violating_regions"],
        "allowed_regions": verdict["allowed_regions"],
        "reason": verdict["reason"],
        "recommended_action": recommended,
        "suggested_owner": owner["lead_name"],
        "suggested_team": owner["team_name"],
        "change_id": change_id or "",
        "evidence_edges": bundle["edge_count"],
        "evidence_docs": bundle["doc_count"],
        "created_at": created_at,
        "created_by": planner,
    }
    if agent_note:
        props["agent_note"] = agent_note[:1200]
        props["agent_note_source"] = planner
    g.write(
        cypher()["create_impact_case"],
        {
            "props": props,
            "customer_id": customer_id,
            "vendor_id": vendor_id,
            "product_id": route["product_id"],
            "system_id": route["system_id"],
            "obligation_id": obligation["obligation_id"],
            "change_id": change_id or "",
        },
        name="create_impact_case",
    )
    for d in decisions:
        g.write(
            cypher()["link_case_decision"],
            {"case_id": case_id, "decision_id": d["decision_id"]},
            name="link_case_decision",
        )
    g.write(
        cypher()["link_case_documents"],
        {"case_id": case_id, "doc_ids": bundle["documents"]},
        name="link_case_documents",
    )

    # Remediation actions — every owner is resolved from graph relationships.
    actions = []
    pin_basis = ", ".join(
        x
        for x in [
            decisions[0]["ref"] if decisions else "",
            enforcement_control["control_ref"] if enforcement_control else "",
        ]
        if x
    )
    actions.append(
        {
            "kind": "REMEDIATE",
            "title": f"Pin {customer} workloads to {allowed}-only processing in {route['system']}",
            "owner_id": owner["lead_id"],
            "owner": owner["lead_name"],
            "requires_approval": True,
            "basis": pin_basis or f"{customer} §{obligation['clause_ref']}",
        }
    )
    if review_control and review_control.get("lead_id"):
        actions.append(
            {
                "kind": "REVIEW",
                "title": f"Review the {vendor} DPA change against {customer} §{obligation['clause_ref']}",
                "owner_id": review_control["lead_id"],
                "owner": review_control["lead_name"],
                "requires_approval": False,
                "basis": f"{review_control['control_ref']} {review_control['control_name']}",
            }
        )
    if account and notices:
        notice = notices[0]
        due = (datetime.now(UTC) + timedelta(days=int(notice["notice_days"]))).date().isoformat()
        actions.append(
            {
                "kind": "NOTIFY",
                "title": f"Prepare written notice to {customer} ({notice['notice_days']}-day notice, §{notice['clause_ref']})",
                "owner_id": account[0]["person_id"],
                "owner": account[0]["person_name"],
                "requires_approval": True,
                "due_date": due,
                "basis": f"{customer} §{notice['clause_ref']} change notification",
            }
        )
    for i, a in enumerate(actions, start=1):
        a_props = {
            "id": make_id("Action", f"{ref}-{i}"),
            "name": a["title"],
            "title": a["title"],
            "kind": a["kind"],
            "status": "PENDING_APPROVAL" if a["requires_approval"] else "OPEN",
            "requires_approval": a["requires_approval"],
            "basis": a["basis"],
            "created_at": created_at,
        }
        if a.get("due_date"):
            a_props["due_date"] = a["due_date"]
        g.write(
            cypher()["create_case_action"],
            {"case_id": case_id, "props": a_props, "owner_id": a["owner_id"]},
            name="create_case_action",
        )
        a["id"] = a_props["id"]

    return {
        "case_id": case_id,
        "ref": ref,
        "created": True,
        "severity": verdict["severity"],
        "customer": customer,
        "product": route["product"],
        "system": route["system"],
        "system_id": route["system_id"],
        "suggested_owner": {
            "person_id": owner["lead_id"],
            "person": owner["lead_name"],
            "team_id": owner["team_id"],
            "team": owner["team_name"],
        },
        "recommended_action": recommended,
        "related_decisions": [d["ref"] for d in decisions],
        "actions": actions,
        "evidence": {"edges": bundle["edge_count"], "documents": bundle["documents"]},
        "verdict": verdict,
    }


def assign_impact_case(
    case_id: str, person_id: str, team_id: str, g: GraphClient | None = None
) -> dict[str, Any]:
    """Assign only to a person who leads/belongs to a team that owns a system involved in the case."""
    g = g or get_graph()
    detail = case_detail(case_id, g)
    if detail is None:
        raise LookupError(f"Unknown impact case {case_id}")
    rows = g.read(
        cypher()["person_team_membership"],
        {"person_id": person_id, "team_id": team_id},
        name="person_team_membership",
    )
    if not rows:
        raise GuardrailRefusal("Refused: person or team not found in the graph")
    membership = rows[0]
    if not (membership["leads"] or membership["member"]):
        raise GuardrailRefusal(
            f"Refused: {membership['person_name']} is not a member of {membership['team_name']}"
        )
    involved_systems = [i["id"] for i in detail["involves"] if i.get("label") == "System"]
    owning = [s for s in involved_systems if (o := system_owner(s, g)) and o["team_id"] == team_id]
    if not owning:
        raise GuardrailRefusal(
            f"Refused: {membership['team_name']} does not own any system involved in {detail['case']['ref']}"
        )
    res = g.write(
        cypher()["assign_case"],
        {
            "case_id": case_id,
            "person_id": person_id,
            "team_id": team_id,
            "assigned_at": _now(),
            "reason": f"{membership['team_name']} owns {', '.join(owning)} (OWNED_BY); {membership['person_name']} "
            + ("leads the team" if membership["leads"] else "is a team member"),
        },
        name="assign_case",
    )
    row = res.rows[0]
    return {
        "case_id": case_id,
        "ref": detail["case"]["ref"],
        "person": row["person"],
        "team": row["team"],
        "status": "NEEDS_REVIEW",
    }


def list_cases(g: GraphClient | None = None) -> list[dict[str, Any]]:
    g = g or get_graph()
    if not g.graph_exists():
        return []
    rows = g.read(cypher()["cases_list"], name="cases_list")
    return [
        {
            **r["case"],
            "customer_id": r["customer_id"],
            "customer": r["customer"],
            "vendor": r["vendor"],
            "assignee": r["assignee"],
            "team": r["team"],
        }
        for r in rows
    ]


def case_detail(case_id: str, g: GraphClient | None = None) -> dict[str, Any] | None:
    g = g or get_graph()
    rows = g.read(cypher()["case_detail"], {"case_id": case_id}, name="case_detail")
    if not rows or not rows[0].get("case"):
        return None
    r = rows[0]
    return {
        **r,
        "involves": [i for i in r["involves"] if i.get("id")],
        "related_decisions": [d for d in r["related_decisions"] if d.get("id")],
        "documents": [d for d in r["documents"] if d.get("doc_id")],
        "actions": sorted([a for a in r["actions"] if a.get("id")], key=lambda a: a["id"]),
        "resolved_by": [x for x in r["resolved_by"] if x],
    }


def update_status(case_id: str, status: str, note: str, g: GraphClient | None = None) -> dict[str, Any]:
    g = g or get_graph()
    if case_detail(case_id, g) is None:
        raise LookupError(f"Unknown impact case {case_id}")
    res = g.write(
        cypher()["update_case_status"],
        {"case_id": case_id, "status": status, "at": _now(), "note": note},
        name="update_case_status",
    )
    return res.rows[0]


def approve_remediation(case_id: str, g: GraphClient | None = None) -> dict[str, Any]:
    """Human-in-the-loop approval. Approving writes a NEW Decision into company memory that
    future agent runs recall (Decision -[:RESOLVES]-> ImpactCase, -[:APPLIES_TO]-> Customer)."""
    g = g or get_graph()
    detail = case_detail(case_id, g)
    if detail is None:
        raise LookupError(f"Unknown impact case {case_id}")
    case = detail["case"]
    if detail["resolved_by"]:
        return {
            "case_id": case_id,
            "status": case["status"],
            "decision_ref": detail["resolved_by"][0],
            "created": False,
        }
    if not detail.get("assignee_id"):
        raise GuardrailRefusal("Assign the case to a graph-resolved owner before approving remediation")
    approved = g.write(
        cypher()["approve_case_actions"], {"case_id": case_id, "at": _now()}, name="approve_case_actions"
    ).rows[0]["approved"]
    seq, ref = next_change_record(g)
    reviewer_team = next(
        (
            c["team_id"]
            for c in g.read(
                cypher()["obligation_control_owners"],
                {"obligation_id": detail["obligation_id"]},
                name="obligation_control_owners",
            )
            if not c.get("implemented_in_id")
        ),
        detail["team_id"],
    )
    props = {
        "id": make_id("Decision", ref),
        "ref": ref,
        "seq": seq,
        "name": f"{ref} — Remediation approved for {case['ref']} ({detail['customer']})",
        "date": _now()[:10],
        "status": "Approved",
        "decision": f"{case['recommended_action']} Approved remediation for {case['ref']}.",
        "topics": ["data residency", "vendor processing location"],
        "origin": "human_approval",
        "created_at": _now(),
    }
    g.write(
        cypher()["record_resolution_decision"],
        {
            "props": props,
            "case_id": case_id,
            "customer_id": detail["customer_id"],
            "vendor_id": detail["vendor_id"],
            "person_id": detail["assignee_id"],
            "team_id": reviewer_team,
        },
        name="record_resolution_decision",
    )
    update_status(case_id, "REMEDIATION_APPROVED", f"Approved via ClauseRipple; recorded as {ref}", g)
    return {
        "case_id": case_id,
        "status": "REMEDIATION_APPROVED",
        "decision_ref": ref,
        "actions_approved": approved,
        "created": True,
    }

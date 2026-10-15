"""End-to-end against a real FalkorDB (separate `clause_ripple_test` graph)."""

from __future__ import annotations

import asyncio

import pytest

from app.agent import orchestrator
from app.graph.client import GraphClient
from app.graph.cypher import cypher
from app.services import cases, demo, evidence, impact

pytestmark = pytest.mark.integration

VENDOR = "vendor:modelcloud"


def statuses(ev):
    return {v["customer_name"]: v["status"] for v in ev["verdicts"]}


async def _run_agent(change_id: str) -> dict:
    run_id = await orchestrator.start_run(change_id)
    channel = orchestrator.channel_for(run_id)
    events = [e async for e in channel.subscribe()]
    return {"run_id": run_id, "events": events}


def test_full_change_impact_flow(graph: GraphClient):
    # Reset + validation
    reset = demo.reset_demo(graph)
    assert reset["validation"]["ok"], reset["validation"]
    assert demo.demo_state(graph)["state"] == "BASELINE"

    # Baseline: nobody impacted; GulfGov has no dependency path (bounded proof)
    base = impact.evaluate_residency(VENDOR, g=graph)
    assert statuses(base) == {
        "Falcon Bank": "ALLOWED",
        "Acme Insurance": "ALLOWED",
        "Nova Retail": "ALLOWED",
        "GulfGov": "NO_DEPENDENCY",
    }
    assert base["absence_proofs"]["customer:gulfgov"] == "no path within 6 hops"

    # Incremental update: exactly one new fact
    change = demo.apply_change("modelcloud_dpa", graph)
    assert [(f["src"], f["type"], f["dst"]) for f in change["added_facts"]] == [
        (VENDOR, "PROCESSES_IN", "region:us")
    ]
    assert change["removed_facts"] == [] and change["applied"]["retained"] == 2
    with pytest.raises(ValueError):
        demo.apply_change("modelcloud_dpa", graph)  # idempotent: v2 already applied

    after = impact.evaluate_residency(VENDOR, added_regions=["US"], g=graph)
    assert statuses(after) == {
        "Falcon Bank": "IMPACTED",
        "Acme Insurance": "IMPACTED",
        "Nova Retail": "ALLOWED",
        "GulfGov": "NO_DEPENDENCY",
    }
    assert [v["customer_name"] for v in after["verdicts"][:2]] == ["Falcon Bank", "Acme Insurance"]

    # Guardrail: the agent cannot open a case the graph does not justify
    with pytest.raises(cases.GuardrailRefusal):
        cases.create_impact_case(
            customer_id="customer:nova-retail", vendor_id=VENDOR, change_id=change["change_id"], g=graph
        )

    # Agent run (deterministic playbook planner, tools via MCP)
    result = asyncio.run(_run_agent(change["change_id"]))
    done = result["events"][-1]
    assert done["type"] == "run_completed", done
    tools = [e["tool"] for e in result["events"] if e["type"] == "tool_completed"]
    assert tools[:4] == [
        "inspect_change",
        "trace_vendor_dependents",
        "find_impacted_customers",
        "evaluate_residency",
    ]
    assert all(e["via"] == "mcp" for e in result["events"] if e["type"] == "tool_completed")
    assert done["cases_created"] == ["CR-104", "CR-105"]

    # Persisted in FalkorDB (not in memory): read back through a brand-new client = "second session"
    fresh = GraphClient()
    listed = {c["customer"]: c for c in cases.list_cases(fresh)}
    assert listed["Falcon Bank"]["ref"] == "CR-104"
    assert listed["Falcon Bank"]["assignee"] == "Sarah Malik"
    assert listed["Falcon Bank"]["team"] == "Platform Engineering"
    assert listed["Acme Insurance"]["assignee"] == "Omar Haddad"
    detail = cases.case_detail(listed["Falcon Bank"]["id"], fresh)
    assert [d["ref"] for d in detail["related_decisions"]] == ["CR-087"]
    owners = {a["kind"]: a["owner"] for a in detail["actions"]}
    assert owners == {"REMEDIATE": "Sarah Malik", "REVIEW": "Daniel Okafor", "NOTIFY": "Rami Aziz"}
    run = orchestrator.run_detail(result["run_id"])
    assert run["run"]["status"] == "COMPLETED" and len(run["tool_calls"]) == run["run"]["tool_count"]

    # Ownership guardrail: Omar Haddad's team does not own Falcon Bank's system
    with pytest.raises(cases.GuardrailRefusal):
        cases.assign_impact_case(
            listed["Falcon Bank"]["id"], "person:omar-haddad", "team:claims-engineering", fresh
        )

    # Evidence is source-backed
    bundle = evidence.evidence_bundle("customer:falcon-bank", VENDOR, fresh)
    assert {"falcon_bank_msa", "document_processing_architecture", "modelcloud_dpa"} <= set(
        bundle["documents"]
    )
    assert all(e["quote"] for e in bundle["edges"])

    # Human approval closes the memory loop: a new Decision that future runs recall
    approval = cases.approve_remediation(listed["Falcon Bank"]["id"], fresh)
    assert approval["decision_ref"] == "CR-106" and approval["created"]
    recalled = fresh.read(
        cypher()["related_decisions"],
        {"customer_id": "customer:falcon-bank", "vendor_id": VENDOR, "topic": "data residency"},
        name="related_decisions",
    )
    assert {"CR-087", "CR-106"} <= {r["ref"] for r in recalled}

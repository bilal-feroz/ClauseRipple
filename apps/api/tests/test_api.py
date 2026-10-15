"""HTTP-level checks: every endpoint the UI uses answers 2xx on real FalkorDB data."""

from __future__ import annotations

import json

import pytest
from fastapi.testclient import TestClient

from app.main import create_app

pytestmark = pytest.mark.integration


@pytest.fixture(scope="module")
def client(graph):
    with TestClient(create_app(), base_url="http://localhost:8000") as c:
        yield c


def test_endpoints_after_agent_run(client: TestClient):
    assert client.get("/health").json()["falkordb"] == "connected"
    reset = client.post("/api/demo/reset").json()
    assert reset["validation"]["ok"]
    assert client.get("/api/demo/state").json()["state"] == "BASELINE"
    pending = client.get("/api/demo/pending").json()
    assert pending[0]["doc_id"] == "modelcloud_dpa" and not pending[0]["applied"]
    assert any(d["kind"] == "add" and "United States" in d["text"] for d in pending[0]["diff"])

    res = client.post("/api/demo/apply-change", json={"doc_id": "modelcloud_dpa"}).json()
    run_id = res["run_id"]
    assert res["change"]["ref"].startswith("CHG-")
    with client.stream("GET", f"/api/agent/runs/{run_id}/events") as stream:
        events = [json.loads(line[5:]) for line in stream.iter_lines() if line.startswith("data:")]
    assert events[-1]["type"] == "run_completed", events[-1]

    for path in [
        "/api/graph",
        "/api/graph/stats",
        "/api/impact",
        "/api/cases",
        "/api/memory/decisions",
        "/api/memory/changes",
        "/api/agent/runs",
        f"/api/agent/runs/{run_id}",
        "/api/documents",
        "/api/documents/modelcloud_dpa",
        "/api/evidence?customer_id=customer:falcon-bank",
        "/api/evidence?customer_id=customer:gulfgov",
        "/api/graph/node/customer:falcon-bank",
        "/api/memory/touched-by?id=customer:falcon-bank",
    ]:
        r = client.get(path)
        assert r.status_code == 200, (path, r.status_code, r.text[:200])

    cases = client.get("/api/cases").json()
    falcon = next(c for c in cases if c["customer"] == "Falcon Bank")
    assert client.get(f"/api/cases/{falcon['id']}").json()["related_decisions"][0]["ref"] == "CR-087"
    runs = client.get("/api/agent/runs").json()
    assert set(runs[0]["created_cases"]) == {"CR-104", "CR-105"}


def test_input_validation(client: TestClient):
    assert client.get("/api/graph/node/DROP GRAPH").status_code == 422
    assert client.get("/api/evidence?customer_id=1;MATCH (n) DELETE n").status_code == 422
    assert client.post("/api/demo/apply-change", json={"doc_id": "../../etc/passwd"}).status_code == 422
    assert client.get("/api/cases/case:nope").status_code == 422


def test_mcp_endpoint_lists_tools(client: TestClient):
    r = client.post(
        "/mcp",
        headers={"Accept": "application/json, text/event-stream", "Content-Type": "application/json"},
        json={"jsonrpc": "2.0", "id": 1, "method": "tools/list", "params": {}},
    )
    assert r.status_code == 200, r.text[:300]
    names = {t["name"] for t in r.json()["result"]["tools"]}
    assert {"trace_vendor_dependents", "evaluate_residency", "create_impact_case"} <= names

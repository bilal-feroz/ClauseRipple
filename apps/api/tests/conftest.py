"""Test configuration.

Integration tests run against a real FalkorDB (docker compose up -d falkordb) in a SEPARATE graph
(`clause_ripple_test`) so the demo graph is never touched. They are skipped when FalkorDB is down.
"""

from __future__ import annotations

import os

os.environ.setdefault("FALKORDB_GRAPH_NAME", "clause_ripple_test")
os.environ.setdefault("AUTO_SEED", "false")
os.environ.setdefault("LLM_PROVIDER", "")
os.environ.setdefault("AGENT_EVENT_PACING_MS", "0")
os.environ.setdefault("DISABLE_EMBEDDINGS", "true")

import pytest

from app.graph.client import get_graph


def falkordb_up() -> bool:
    try:
        return get_graph().ping()
    except Exception:
        return False


@pytest.fixture(scope="session")
def graph():
    if not falkordb_up():
        pytest.skip("FalkorDB not reachable (docker compose up -d falkordb)")
    g = get_graph()
    assert g.graph_name == "clause_ripple_test"
    yield g
    g.delete_graph()

"""ClauseRipple MCP server — the graph tools, served over the Model Context Protocol.

* In-process: the agent orchestrator connects with ``mcp.Client(mcp_server)`` and selects tools
  from ``list_tools()``; every agent tool call is a real MCP ``call_tool``.
* Streamable HTTP: mounted by the API at ``/mcp`` for external MCP clients (Claude Desktop,
  Claude Code, MCP Inspector).
* stdio: ``uv run python -m app.mcp_server``.

REST endpoints, MCP and the agent all call the same service layer (no duplicated logic).
"""

from __future__ import annotations

import functools
from collections.abc import Callable
from typing import Any

from mcp.server import MCPServer
from mcp.server.mcpserver.exceptions import ToolError
from mcp.types import ToolAnnotations

from app.agent.tools import TOOLS
from app.graph.client import GraphUnavailableError
from app.services.cases import GuardrailRefusal

INSTRUCTIONS = (
    "ClauseRipple exposes a FalkorDB company graph (customers, contracts, clauses, obligations, vendors, "
    "systems, products, teams, people, decisions, impact cases). Graph tools return facts with source "
    "quotes; compliance verdicts come from deterministic rules, not from the model. Write tools "
    "(create_impact_case, assign_impact_case) are guarded: they refuse actions the graph does not justify."
)


def _anticipated(fn: Callable[..., Any]) -> Callable[..., Any]:
    """Surface expected failures (guardrail refusals, unknown ids, FalkorDB down) to the caller as
    ToolError text; anything else stays a crash whose details remain server-side."""

    @functools.wraps(fn)
    def wrapper(*args: Any, **kwargs: Any) -> Any:
        try:
            return fn(*args, **kwargs)
        except GuardrailRefusal as exc:
            raise ToolError(str(exc)) from exc
        except GraphUnavailableError as exc:
            raise ToolError("FalkorDB unavailable. Agent reasoning paused.") from exc
        except (LookupError, ValueError) as exc:
            raise ToolError(str(exc)) from exc

    return wrapper


def build_mcp_server() -> MCPServer:
    server = MCPServer(
        name="clauseripple",
        title="ClauseRipple graph tools",
        instructions=INSTRUCTIONS,
        version="0.1.0",
    )
    for name, fn, writes in TOOLS:
        server.add_tool(
            _anticipated(fn),
            name=name,
            annotations=ToolAnnotations(
                readOnlyHint=not writes,
                destructiveHint=False,
                idempotentHint=True,
                openWorldHint=False,
            ),
            structured_output=True,
        )
    return server


mcp_server = build_mcp_server()


if __name__ == "__main__":  # stdio transport for local MCP clients
    mcp_server.run()

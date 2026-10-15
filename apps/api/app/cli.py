"""ClauseRipple CLI.

uv run python -m app.cli reset            # clear the demo graph, ingest v1, validate
uv run python -m app.cli update           # apply ModelCloud DPA v2 and run the agent (prints the trace)
uv run python -m app.cli ask "Why is Falcon Bank impacted?"
uv run python -m app.cli mcp-tools        # list the MCP tools
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys


def _print(obj: object) -> None:
    sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[attr-defined]
    print(json.dumps(obj, indent=2, ensure_ascii=False, default=str))


def cmd_reset() -> int:
    from app.services import demo

    r = demo.reset_demo()
    v = r["validation"]
    print(f"Reset to {r['state']}: {r['documents']} documents, {r['facts']['nodes']} nodes, "
          f"{r['facts']['relationships']} relationships, validation {v['passed']}/{v['total']} ({r['duration_ms']} ms)")  # fmt: skip
    for c in v["checks"]:
        if not c["ok"]:
            print("  FAILED:", c["check"], "-", c["detail"])
    return 0 if v["ok"] else 1


def cmd_update() -> int:
    from app.agent import orchestrator
    from app.services import demo

    sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[attr-defined]
    change = demo.apply_change("modelcloud_dpa")
    print(f"{change['ref']}: +{len(change['added_facts'])} fact(s) "
          f"{[(f['src'], f['type'], f['dst']) for f in change['added_facts']]} in {change['incremental_update_ms']} ms")  # fmt: skip

    async def run() -> int:
        run_id = await orchestrator.start_run(change["change_id"])
        async for e in orchestrator.channel_for(run_id).subscribe():  # type: ignore[union-attr]
            if e["type"] == "tool_completed":
                m = e["metrics"]
                print(f"  {e['step']:>2}. {e['tool']:<26} {e['status']:<7} r{m.get('graph_reads', 0)}/w{m.get('graph_writes', 0)} "
                      f"{e['duration_ms']:>7.1f} ms  {e['summary']}")  # fmt: skip
            elif e["type"] in {"completeness_check", "planner_unavailable"}:
                print("  !", e["message"])
            elif e["type"] == "run_completed":
                print(f"Run {e['ref']} {e['status']} · planner {e.get('planner', '')} · {e['summary']}")
                return 0
            elif e["type"] == "run_failed":
                print("Run failed:", e["error"])
                return 1
        return 1

    return asyncio.run(run())


def cmd_ask(question: str) -> int:
    from app.services.ask import answer

    _print(answer(question))
    return 0


def cmd_mcp_tools() -> int:
    from mcp import Client

    from app.mcp_server import mcp_server

    async def run() -> None:
        async with Client(mcp_server) as c:
            for t in (await c.list_tools()).tools:
                print(f"- {t.name}: {(t.description or '').splitlines()[0]}")

    asyncio.run(run())
    return 0


def main() -> int:
    p = argparse.ArgumentParser(prog="clauseripple")
    sub = p.add_subparsers(dest="cmd", required=True)
    sub.add_parser("reset")
    sub.add_parser("update")
    a = sub.add_parser("ask")
    a.add_argument("question")
    sub.add_parser("mcp-tools")
    args = p.parse_args()
    if args.cmd == "reset":
        return cmd_reset()
    if args.cmd == "update":
        return cmd_update()
    if args.cmd == "ask":
        return cmd_ask(args.question)
    return cmd_mcp_tools()


if __name__ == "__main__":
    raise SystemExit(main())

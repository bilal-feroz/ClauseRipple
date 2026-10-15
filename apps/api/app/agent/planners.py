"""Planners choose WHICH graph tool to call next. They never decide facts or compliance.

* PlaybookPlanner  — deterministic, clearly labelled; used when no LLM is configured.
* AnthropicPlanner — Claude tool use (manual loop: tool calls go through our MCP client).
* OpenAIChatPlanner — any OpenAI-compatible endpoint (OpenAI, Gemini, Groq, OpenRouter).
* OllamaPlanner    — local models via Ollama's native /api/chat (sets num_ctx, disables "thinking").
"""

from __future__ import annotations

import asyncio
import json
from typing import Any, Protocol

from app.agent.llm import LLMConfig
from app.config import get_settings

SYSTEM_PROMPT = """You are ClauseRipple's Change Impact Agent for AtlasAI.
A company source document changed and was ingested into the FalkorDB company graph as a ChangeEvent.
Your job: find which customers are actually impacted, then act by opening and assigning impact cases.

Rules:
- Use only the provided graph tools. Every fact must come from a tool result; never invent ids or facts.
- Compliance is decided by the deterministic `evaluate_residency` tool, never by you.
- Create an impact case ONLY for customers whose verdict has affected=true (the tool refuses otherwise).
- Assign each case to the owner returned by `find_owner` for the system in that customer's route.

Expected workflow:
1. inspect_change(change_id)
2. trace_vendor_dependents(vendor_id) and find_impacted_customers(vendor_id) for the changed vendor
3. evaluate_residency(vendor_id, change_id)
4. For EACH affected customer: recall_related_decisions -> find_owner -> get_source_evidence ->
   create_impact_case (pass related_decision_ids for decisions that match both customer and vendor)
   -> assign_impact_case
5. Finish with a 2-3 sentence plain-text summary for the compliance lead (no markdown tables)."""


class ToolCaller(Protocol):
    async def __call__(self, name: str, args: dict[str, Any], *, planner: str) -> dict[str, Any]: ...


def _tool_result_text(result: dict[str, Any]) -> str:
    """What the planner sees: summary + compact data (no UI hints / metrics)."""
    if result.get("error"):
        return json.dumps({"error": result["error"]})
    text = json.dumps({"summary": result.get("summary"), "data": result.get("data")}, default=str)
    return text if len(text) <= 8000 else text[:8000] + "…(truncated)"


class PlaybookPlanner:
    label = "playbook"

    async def run(self, call: ToolCaller, change_id: str) -> dict[str, Any]:
        change = await call("inspect_change", {"change_id": change_id}, planner=self.label)
        if change.get("error"):
            return {"final_text": None, "ok": False}
        vendors = [s["id"] for s in change["data"]["changed_entities"] if s.get("label") == "Vendor"]
        for vendor_id in vendors:
            await call("trace_vendor_dependents", {"vendor_id": vendor_id}, planner=self.label)
            await call("find_impacted_customers", {"vendor_id": vendor_id}, planner=self.label)
            ev = await call(
                "evaluate_residency", {"vendor_id": vendor_id, "change_id": change_id}, planner=self.label
            )
            if ev.get("error"):
                continue
            for verdict in ev["data"]["verdicts"]:
                if verdict["affected"]:
                    await self.handle_customer(call, verdict, vendor_id, change_id)
        return {"final_text": None, "ok": True}

    async def handle_customer(
        self, call: ToolCaller, verdict: dict[str, Any], vendor_id: str, change_id: str
    ) -> None:
        customer_id = verdict["customer_id"]
        mem = await call(
            "recall_related_decisions",
            {"customer_id": customer_id, "vendor_id": vendor_id, "topic": "data residency"},
            planner=self.label,
        )
        best = (mem.get("data") or {}).get("best_match")
        system_id = verdict["routes"][0]["system_id"]
        owner = await call("find_owner", {"system_id": system_id}, planner=self.label)
        await call(
            "get_source_evidence", {"customer_id": customer_id, "vendor_id": vendor_id}, planner=self.label
        )
        case = await call(
            "create_impact_case",
            {
                "customer_id": customer_id,
                "vendor_id": vendor_id,
                "change_id": change_id,
                "related_decision_ids": [best["decision_id"]] if best else [],
            },
            planner=self.label,
        )
        if case.get("error") or owner.get("error"):
            return
        await call(
            "assign_impact_case",
            {
                "case_id": case["data"]["case_id"],
                "person_id": owner["data"]["person_id"],
                "team_id": owner["data"]["team_id"],
            },
            planner=self.label,
        )


class AnthropicPlanner:
    """Claude chooses tools. Manual loop because tool calls run through our MCP client with
    per-step persistence/streaming. History is append-only (full response.content is kept)."""

    # Models that accept the server-side refusal fallback ("default" routing).
    _FALLBACK_MODELS = frozenset(
        {"claude-opus-5-5", "claude-opus-5", "claude-fable-5-1", "claude-sonnet-5-5"}
    )

    def __init__(self, cfg: LLMConfig) -> None:
        import anthropic

        self.cfg = cfg
        self.label = f"llm:{cfg.label}"
        self.client = anthropic.AsyncAnthropic(
            api_key=cfg.api_key, base_url=cfg.base_url or None, timeout=get_settings().llm_timeout_s
        )

    async def run(self, call: ToolCaller, change_id: str, tools: list[dict[str, Any]]) -> dict[str, Any]:
        tool_defs = [
            {"name": t["name"], "description": t["description"], "input_schema": t["input_schema"]}
            for t in tools
        ]
        messages: list[dict[str, Any]] = [
            {
                "role": "user",
                "content": f"ChangeEvent detected: change_id={change_id}. Analyse its impact and act.",
            }
        ]
        kwargs: dict[str, Any] = {}
        if self.cfg.model in self._FALLBACK_MODELS:
            kwargs = {"betas": ["server-side-fallback-2026-07-01"], "fallbacks": "default"}
        final_text = None
        for _ in range(get_settings().llm_max_steps):
            response = await self.client.beta.messages.create(
                model=self.cfg.model,
                max_tokens=16000,
                system=SYSTEM_PROMPT,
                tools=tool_defs,
                messages=messages,
                output_config={"effort": "low"},
                **kwargs,
            )
            if response.stop_reason == "refusal":
                return {"final_text": "Planner declined the request (refusal).", "ok": False}
            messages.append({"role": "assistant", "content": response.content})
            tool_uses = [b for b in response.content if b.type == "tool_use"]
            if response.stop_reason != "tool_use" or not tool_uses:
                final_text = " ".join(b.text for b in response.content if b.type == "text").strip() or None
                break
            results = []
            for block in tool_uses:
                result = await call(block.name, dict(block.input), planner=self.label)
                entry = {"type": "tool_result", "tool_use_id": block.id, "content": _tool_result_text(result)}
                if result.get("error"):
                    entry["is_error"] = True
                results.append(entry)
            messages.append({"role": "user", "content": results})
        return {"final_text": final_text, "ok": final_text is not None}


class OpenAIChatPlanner:
    """OpenAI-compatible chat completions with function calling (OpenAI, Ollama, Gemini, Groq...)."""

    def __init__(self, cfg: LLMConfig) -> None:
        import openai

        self.cfg = cfg
        self.label = f"llm:{cfg.label}"
        self.client = openai.AsyncOpenAI(
            api_key=cfg.api_key or "none", base_url=cfg.base_url, timeout=get_settings().llm_timeout_s
        )

    async def run(self, call: ToolCaller, change_id: str, tools: list[dict[str, Any]]) -> dict[str, Any]:
        tool_defs = [
            {
                "type": "function",
                "function": {
                    "name": t["name"],
                    "description": t["description"],
                    "parameters": t["input_schema"],
                },
            }
            for t in tools
        ]
        messages: list[dict[str, Any]] = [
            {"role": "system", "content": SYSTEM_PROMPT},
            {
                "role": "user",
                "content": f"ChangeEvent detected: change_id={change_id}. Analyse its impact and act.",
            },
        ]
        final_text = None
        valid = {t["name"] for t in tools}
        for _ in range(get_settings().llm_max_steps):
            response = await self.client.chat.completions.create(
                model=self.cfg.model, messages=messages, tools=tool_defs
            )
            msg = response.choices[0].message
            calls = [(c.id, c.function.name, c.function.arguments or "{}") for c in (msg.tool_calls or [])]
            recovered = False
            if not calls and msg.content:
                # Small local models sometimes write the call as JSON text instead of a tool call.
                calls = [
                    (f"recovered-{i}", n, a)
                    for i, (n, a) in enumerate(recover_text_tool_calls(msg.content, valid))
                ]
                recovered = bool(calls)
            assistant: dict[str, Any] = {
                "role": "assistant",
                "content": "" if recovered else msg.content or "",
            }
            if calls:
                assistant["tool_calls"] = [
                    {"id": cid, "type": "function", "function": {"name": name, "arguments": args}}
                    for cid, name, args in calls
                ]
            messages.append(assistant)
            if not calls:
                final_text = (msg.content or "").strip() or None
                break
            label = f"{self.label} (recovered from text)" if recovered else self.label
            for cid, name, raw in calls:
                try:
                    args = json.loads(raw)
                except json.JSONDecodeError:
                    result = {"error": "Arguments were not valid JSON"}
                else:
                    result = await call(name, args if isinstance(args, dict) else {}, planner=label)
                messages.append({"role": "tool", "tool_call_id": cid, "content": _tool_result_text(result)})
            await asyncio.sleep(0)
        return {"final_text": final_text, "ok": final_text is not None}


class OllamaPlanner:
    """Free local planner through Ollama's native API.

    The OpenAI-compatible endpoint cannot raise Ollama's default 4k context, which the tool
    schemas alone nearly fill; the native API lets us set num_ctx and turn off qwen3 "thinking"."""

    def __init__(self, cfg: LLMConfig) -> None:
        import httpx

        self.cfg = cfg
        self.label = f"llm:{cfg.label}"
        base = (cfg.base_url or "http://localhost:11434").rstrip("/")
        self.base = base[:-3] if base.endswith("/v1") else base
        self.http = httpx.AsyncClient(timeout=get_settings().llm_timeout_s)

    async def run(self, call: ToolCaller, change_id: str, tools: list[dict[str, Any]]) -> dict[str, Any]:
        tool_defs = [
            {
                "type": "function",
                "function": {
                    "name": t["name"],
                    "description": t["description"],
                    "parameters": t["input_schema"],
                },
            }
            for t in tools
        ]
        valid = {t["name"] for t in tools}
        messages: list[dict[str, Any]] = [
            {"role": "system", "content": SYSTEM_PROMPT},
            {
                "role": "user",
                "content": f"ChangeEvent detected: change_id={change_id}. Analyse its impact and act.",
            },
        ]
        final_text = None
        try:
            for _ in range(get_settings().llm_max_steps):
                res = await self.http.post(
                    f"{self.base}/api/chat",
                    json={
                        "model": self.cfg.model,
                        "messages": messages,
                        "tools": tool_defs,
                        "stream": False,
                        "think": False,
                        "options": {"num_ctx": get_settings().ollama_num_ctx, "temperature": 0},
                    },
                )
                res.raise_for_status()
                msg = res.json().get("message", {})
                content = msg.get("content") or ""
                calls = [
                    (c["function"]["name"], c["function"].get("arguments") or {})
                    for c in msg.get("tool_calls") or []
                    if c.get("function", {}).get("name")
                ]
                recovered = False
                if not calls and content:
                    calls = [(n, json.loads(a)) for n, a in recover_text_tool_calls(content, valid)]
                    recovered = bool(calls)
                assistant: dict[str, Any] = {"role": "assistant", "content": "" if recovered else content}
                if calls:
                    assistant["tool_calls"] = [{"function": {"name": n, "arguments": a}} for n, a in calls]
                messages.append(assistant)
                if not calls:
                    final_text = content.strip() or None
                    break
                label = f"{self.label} (recovered from text)" if recovered else self.label
                for name, args in calls:
                    if isinstance(args, str):
                        try:
                            args = json.loads(args)
                        except json.JSONDecodeError:
                            args = {}
                    result = await call(name, args if isinstance(args, dict) else {}, planner=label)
                    messages.append({"role": "tool", "tool_name": name, "content": _tool_result_text(result)})
        finally:
            await self.http.aclose()
        return {"final_text": final_text, "ok": final_text is not None}


def recover_text_tool_calls(text: str, valid_names: set[str]) -> list[tuple[str, str]]:
    """Extract {"name": ..., "parameters"|"arguments": {...}} objects a model wrote as plain text.
    Only names that exist in the MCP tool list are accepted; arguments still go through MCP
    schema validation, so nothing unvalidated reaches the graph."""
    decoder = json.JSONDecoder()
    found: list[tuple[str, str]] = []
    i = 0
    while (i := text.find("{", i)) != -1:
        try:
            obj, end = decoder.raw_decode(text, i)
        except json.JSONDecodeError:
            i += 1
            continue
        if isinstance(obj, dict) and obj.get("name") in valid_names:
            args = obj.get("parameters", obj.get("arguments", {}))
            if isinstance(args, str):
                found.append((obj["name"], args))
            elif isinstance(args, dict):
                found.append((obj["name"], json.dumps(args)))
        i = end
    return found


def build_planner(
    cfg: LLMConfig | None,
) -> PlaybookPlanner | AnthropicPlanner | OpenAIChatPlanner | OllamaPlanner:
    if cfg is None:
        return PlaybookPlanner()
    if cfg.kind == "anthropic":
        return AnthropicPlanner(cfg)
    if cfg.provider == "ollama":
        return OllamaPlanner(cfg)
    return OpenAIChatPlanner(cfg)

"""In-memory event channel per agent run (live SSE stream + replay). The durable record of every
run lives in FalkorDB (AgentRun / ToolCall nodes); this channel only fans events out live."""

from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator
from dataclasses import dataclass, field
from typing import Any


@dataclass
class RunChannel:
    run_id: str
    history: list[dict[str, Any]] = field(default_factory=list)
    done: bool = False
    _cond: asyncio.Condition = field(default_factory=asyncio.Condition)

    async def publish(self, event: dict[str, Any]) -> None:
        async with self._cond:
            event = {"seq": len(self.history), **event}
            self.history.append(event)
            if event.get("type") in {"run_completed", "run_failed"}:
                self.done = True
            self._cond.notify_all()

    async def subscribe(self) -> AsyncIterator[dict[str, Any]]:
        index = 0
        while True:
            async with self._cond:
                while index >= len(self.history) and not self.done:
                    await self._cond.wait()
                pending = self.history[index:]
                index = len(self.history)
                finished = self.done
            for event in pending:
                yield event
            if finished and index >= len(self.history):
                return


_channels: dict[str, RunChannel] = {}


def open_channel(run_id: str) -> RunChannel:
    ch = RunChannel(run_id)
    _channels[run_id] = ch
    # keep memory bounded: only the most recent runs stay replayable from memory
    for old in list(_channels)[:-20]:
        _channels.pop(old, None)
    return ch


def get_channel(run_id: str) -> RunChannel | None:
    return _channels.get(run_id)

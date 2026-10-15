"""FalkorDB access layer.

All graph access in ClauseRipple goes through :class:`GraphClient`:

* ``read()``  -> ``GRAPH.RO_QUERY`` (read-only; FalkorDB rejects writes)
* ``write()`` -> ``GRAPH.QUERY``

Every call is metered (count, FalkorDB internal execution time, query names). Agent tool
executions open a :func:`meter` scope so each tool step reports its real graph reads/writes.
"""

from __future__ import annotations

import contextlib
import contextvars
import threading
from collections.abc import Iterator
from dataclasses import dataclass, field
from typing import Any

from falkordb import FalkorDB
from falkordb.edge import Edge
from falkordb.node import Node
from falkordb.path import Path

from app.config import Settings, get_settings


class GraphUnavailableError(RuntimeError):
    """FalkorDB cannot be reached. Agent reasoning pauses; nothing is faked."""


@dataclass
class QueryMeter:
    reads: int = 0
    writes: int = 0
    db_time_ms: float = 0.0
    queries: list[str] = field(default_factory=list)
    nodes_created: int = 0
    relationships_created: int = 0
    properties_set: int = 0

    def as_dict(self) -> dict[str, Any]:
        return {
            "graph_reads": self.reads,
            "graph_writes": self.writes,
            "db_time_ms": round(self.db_time_ms, 3),
            "queries": list(dict.fromkeys(self.queries)),
            "nodes_created": self.nodes_created,
            "relationships_created": self.relationships_created,
            "properties_set": self.properties_set,
        }


_meters: contextvars.ContextVar[tuple[QueryMeter, ...]] = contextvars.ContextVar("graph_meters", default=())


@contextlib.contextmanager
def meter() -> Iterator[QueryMeter]:
    """Collect graph metrics for everything executed inside the block (nested scopes all count)."""
    m = QueryMeter()
    token = _meters.set((*_meters.get(), m))
    try:
        yield m
    finally:
        _meters.reset(token)


def _to_python(value: Any) -> Any:
    if isinstance(value, Node):
        return {"_kind": "node", "labels": list(value.labels or []), **dict(value.properties)}
    if isinstance(value, Edge):
        return {"_kind": "edge", "type": value.relation, **dict(value.properties)}
    if isinstance(value, Path):
        return {
            "_kind": "path",
            "nodes": [_to_python(n) for n in value.nodes()],
            "edges": [_to_python(e) for e in value.edges()],
        }
    if isinstance(value, list):
        return [_to_python(v) for v in value]
    if isinstance(value, dict):
        return {k: _to_python(v) for k, v in value.items()}
    return value


@dataclass
class WriteResult:
    nodes_created: int
    nodes_deleted: int
    relationships_created: int
    relationships_deleted: int
    properties_set: int
    run_time_ms: float
    rows: list[dict[str, Any]]


class GraphClient:
    def __init__(self, settings: Settings | None = None) -> None:
        self.settings = settings or get_settings()
        s = self.settings
        self._db = FalkorDB(
            host=s.falkordb_host,
            port=s.falkordb_port,
            username=s.falkordb_username,
            password=s.falkordb_password.get_secret_value() if s.falkordb_password else None,
            ssl=s.falkordb_ssl,
            socket_timeout=15,
            socket_connect_timeout=3,
        )
        self.graph_name = s.falkordb_graph_name
        self.graph = self._db.select_graph(self.graph_name)
        self._write_lock = threading.Lock()

    # ── connectivity ──────────────────────────────────────────────────────────
    def ping(self) -> bool:
        try:
            return bool(self._db.connection.ping())
        except Exception:
            return False

    def server_info(self) -> dict[str, Any]:
        try:
            modules = self._db.connection.execute_command("MODULE", "LIST")
        except Exception as exc:  # pragma: no cover - only when the server is down
            raise GraphUnavailableError(str(exc)) from exc
        info: dict[str, Any] = {}
        for mod in modules:
            entry = {}
            for i in range(0, len(mod) - 1, 2):
                k = mod[i].decode() if isinstance(mod[i], bytes) else mod[i]
                v = mod[i + 1]
                entry[k] = v.decode() if isinstance(v, bytes) else v
            if entry.get("name") == "graph":
                ver = int(entry.get("ver", 0))
                info["falkordb_version"] = f"{ver // 10000}.{(ver // 100) % 100}.{ver % 100}"
        return info

    def graph_exists(self) -> bool:
        try:
            return self.graph_name in self._db.list_graphs()
        except Exception as exc:
            raise GraphUnavailableError(str(exc)) from exc

    def delete_graph(self) -> None:
        """Drop only the ClauseRipple graph (never FLUSHALL)."""
        with self._write_lock:
            if self.graph_exists():
                self.graph.delete()
            # falkordb-py caches label/property-key ids per Graph object; a recreated graph
            # must not reuse that cache, so select a fresh handle.
            self.graph = self._db.select_graph(self.graph_name)

    # ── queries ───────────────────────────────────────────────────────────────
    def read(
        self, query: str, params: dict[str, Any] | None = None, *, name: str = "adhoc"
    ) -> list[dict[str, Any]]:
        try:
            res = self.graph.ro_query(query, params=params or {})
        except (ConnectionError, OSError) as exc:
            raise GraphUnavailableError(str(exc)) from exc
        except Exception as exc:
            if "Connection" in type(exc).__name__ or "Timeout" in type(exc).__name__:
                raise GraphUnavailableError(str(exc)) from exc
            raise
        rows = self._rows(res)
        self._record(read=True, name=name, run_time_ms=float(res.run_time_ms or 0.0), res=res)
        return rows

    def write(self, query: str, params: dict[str, Any] | None = None, *, name: str = "adhoc") -> WriteResult:
        with self._write_lock:
            try:
                res = self.graph.query(query, params=params or {})
            except (ConnectionError, OSError) as exc:
                raise GraphUnavailableError(str(exc)) from exc
            except Exception as exc:
                if "Connection" in type(exc).__name__ or "Timeout" in type(exc).__name__:
                    raise GraphUnavailableError(str(exc)) from exc
                raise
        self._record(read=False, name=name, run_time_ms=float(res.run_time_ms or 0.0), res=res)
        return WriteResult(
            nodes_created=int(res.nodes_created or 0),
            nodes_deleted=int(res.nodes_deleted or 0),
            relationships_created=int(res.relationships_created or 0),
            relationships_deleted=int(res.relationships_deleted or 0),
            properties_set=int(res.properties_set or 0),
            run_time_ms=float(res.run_time_ms or 0.0),
            rows=self._rows(res),
        )

    @staticmethod
    def _rows(res: Any) -> list[dict[str, Any]]:
        if not res.header:
            return []
        cols = [h[1] if isinstance(h, list | tuple) else h for h in res.header]
        cols = [c.decode() if isinstance(c, bytes) else c for c in cols]
        return [dict(zip(cols, (_to_python(v) for v in row), strict=False)) for row in res.result_set]

    @staticmethod
    def _record(*, read: bool, name: str, run_time_ms: float, res: Any) -> None:
        for m in _meters.get():
            if read:
                m.reads += 1
            else:
                m.writes += 1
                m.nodes_created += int(res.nodes_created or 0)
                m.relationships_created += int(res.relationships_created or 0)
                m.properties_set += int(res.properties_set or 0)
            m.db_time_ms += run_time_ms
            m.queries.append(name)


_client: GraphClient | None = None
_client_lock = threading.Lock()


def get_graph() -> GraphClient:
    global _client
    with _client_lock:
        if _client is None:
            _client = GraphClient()
        return _client

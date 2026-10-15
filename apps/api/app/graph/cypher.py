"""Loads the documented Cypher queries from ``docs/cypher/*.cypher``.

The query files are the single source of truth: the API executes exactly the text in
those files, so the submission's documented Cypher is the Cypher that runs.

File format::

    // @query vendor_dependents
    // Purpose: ...
    // Params: $vendor_id
    MATCH ...

A file may hold several ``// @query`` blocks. ``//`` comment lines are stripped before
the query is sent to FalkorDB.
"""

from __future__ import annotations

import re
import threading
from dataclasses import dataclass
from pathlib import Path

from app.config import get_settings
from app.graph.ontology import assert_label, assert_rel_type

_HEADER = re.compile(r"^//\s*@query\s+([a-z0-9_]+)\s*$")


@dataclass(frozen=True)
class CypherQuery:
    name: str
    file: str
    text: str
    doc: str


class CypherLibrary:
    def __init__(self, directory: Path) -> None:
        self.directory = directory
        self._queries: dict[str, CypherQuery] = {}
        self.used: set[str] = set()
        self._lock = threading.Lock()
        self._load()

    def _load(self) -> None:
        if not self.directory.is_dir():
            raise FileNotFoundError(f"Cypher directory not found: {self.directory}")
        for path in sorted(self.directory.glob("*.cypher")):
            blocks: list[tuple[str, list[str], list[str]]] = []
            for raw in path.read_text(encoding="utf-8").splitlines():
                stripped = raw.strip()
                m = _HEADER.match(stripped)
                if m:
                    blocks.append((m.group(1), [], []))
                elif not blocks:
                    continue
                elif stripped.startswith("//"):
                    blocks[-1][2].append(stripped.lstrip("/ ").rstrip())
                else:
                    blocks[-1][1].append(raw.rstrip())
            for name, body, docs in blocks:
                text = "\n".join(body).strip()
                if not text:
                    raise ValueError(f"Empty query {name} in {path.name}")
                if name in self._queries:
                    raise ValueError(f"Duplicate query name {name} in {path.name}")
                self._queries[name] = CypherQuery(name, path.name, text, "\n".join(docs).strip())

    def __getitem__(self, name: str) -> str:
        with self._lock:
            self.used.add(name)
        return self._queries[name].text

    def render(self, name: str, **slots: str) -> str:
        """Fill ``{{label}}`` / ``{{rel_type}}`` slots. Labels and relationship types cannot be
        Cypher parameters, so every slot value is checked against the ontology whitelist."""
        text = self[name]
        for key, value in slots.items():
            checked = assert_rel_type(value) if key == "rel_type" else assert_label(value)
            text = text.replace("{{" + key + "}}", checked)
        if "{{" in text:
            raise ValueError(f"Unfilled template slot in query {name}")
        return text

    def get(self, name: str) -> CypherQuery:
        return self._queries[name]

    def names(self) -> list[str]:
        return sorted(self._queries)

    def all(self) -> list[CypherQuery]:
        return [self._queries[n] for n in self.names()]


_library: CypherLibrary | None = None


def cypher() -> CypherLibrary:
    global _library
    if _library is None:
        _library = CypherLibrary(get_settings().cypher_dir)
    return _library

"""Writes extracted facts into FalkorDB (full load and per-document incremental delta)."""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass, field
from typing import Any

from app.graph.client import GraphClient
from app.graph.cypher import cypher
from app.graph.ontology import NODE_LABELS, label_of
from app.ingest.extractor import EXTRACTOR_VERSION, EdgeFact, Extraction, NodeFact

BATCH = 200


def _node_row(n: NodeFact) -> dict[str, Any]:
    props = {k: v for k, v in n.props.items() if v is not None}
    props.update({"id": n.id, "src": n.doc, "src_quote": n.quote, "src_line": n.line})
    props.setdefault("name", n.id)
    return {"id": n.id, "props": props}


def _edge_row(e: EdgeFact, change_id: str | None = None) -> dict[str, Any]:
    props: dict[str, Any] = {
        "src": e.doc,
        "src_ver": e.doc_version,
        "quote": e.quote,
        "loc": e.loc,
        "line": e.line,
        "extractor": EXTRACTOR_VERSION,
        **{k: v for k, v in e.props.items() if v is not None},
    }
    if change_id:
        props["change_id"] = change_id
    return {"src": e.src, "dst": e.dst, "props": props}


def ensure_indexes(g: GraphClient) -> list[str]:
    created = []
    for label in NODE_LABELS:
        try:
            g.write(cypher().render("index_node_id", label=label), name="index_node_id")
            created.append(f"{label}.id")
        except Exception as exc:  # index already exists
            if "already" not in str(exc).lower():
                raise
    for name in ("index_fulltext_chunk", "index_fulltext_decision"):
        try:
            g.write(cypher()[name], name=name)
            created.append(name)
        except Exception as exc:
            if "already" not in str(exc).lower():
                raise
    return created


def upsert_nodes(g: GraphClient, nodes: list[NodeFact]) -> int:
    by_label: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for n in nodes:
        by_label[n.label].append(_node_row(n))
    created = 0
    for label, rows in by_label.items():
        q = cypher().render("upsert_nodes", label=label)
        for i in range(0, len(rows), BATCH):
            created += g.write(q, {"rows": rows[i : i + BATCH]}, name="upsert_nodes").nodes_created
    return created


def upsert_edges(g: GraphClient, edges: list[EdgeFact], change_id: str | None = None) -> int:
    groups: dict[tuple[str, str, str], list[dict[str, Any]]] = defaultdict(list)
    for e in edges:
        groups[(label_of(e.src), e.type, label_of(e.dst))].append(_edge_row(e, change_id))
    created = 0
    for (src_label, rel, dst_label), rows in groups.items():
        q = cypher().render("upsert_edges", src_label=src_label, rel_type=rel, dst_label=dst_label)
        for i in range(0, len(rows), BATCH):
            res = g.write(q, {"rows": rows[i : i + BATCH]}, name="upsert_edges")
            created += res.relationships_created
    return created


def write_chunks(g: GraphClient, chunks: list[dict[str, Any]]) -> int:
    rows = [{"id": c["id"], "props": {k: v for k, v in c.items() if k != "doc_node"}} for c in chunks]
    q = cypher().render("upsert_nodes", label="Chunk")
    created = 0
    for i in range(0, len(rows), BATCH):
        created += g.write(q, {"rows": rows[i : i + BATCH]}, name="upsert_nodes").nodes_created
    links = [{"chunk": c["id"], "doc": c["doc_node"]} for c in chunks]
    for i in range(0, len(links), BATCH):
        g.write(cypher()["link_chunks"], {"rows": links[i : i + BATCH]}, name="link_chunks")
    return created


def write_extraction(g: GraphClient, ex: Extraction, chunks: list[dict[str, Any]]) -> dict[str, int]:
    nodes = upsert_nodes(g, list(ex.nodes.values()))
    edges = upsert_edges(g, list(ex.edges.values()))
    chunk_count = write_chunks(g, chunks)
    return {"nodes_created": nodes, "relationships_created": edges, "chunks": chunk_count}


@dataclass
class DocDelta:
    doc_id: str
    added: list[EdgeFact] = field(default_factory=list)
    removed: list[dict[str, Any]] = field(default_factory=list)
    retained: list[EdgeFact] = field(default_factory=list)

    @property
    def is_empty(self) -> bool:
        return not self.added and not self.removed


def compute_delta(g: GraphClient, doc_id: str, new_edges: list[EdgeFact]) -> DocDelta:
    """Diff the relationships currently sourced from ``doc_id`` against a new extraction."""
    current = g.read(cypher()["edges_from_document"], {"doc": doc_id}, name="edges_from_document")
    current_keys = {(r["src"], r["type"], r["dst"]): r for r in current}
    new_by_key = {e.key: e for e in new_edges}
    delta = DocDelta(doc_id)
    for key, e in new_by_key.items():
        (delta.retained if key in current_keys else delta.added).append(e)
    for key, row in current_keys.items():
        if key not in new_by_key:
            delta.removed.append(row)
    return delta


def apply_delta(g: GraphClient, delta: DocDelta, change_id: str) -> dict[str, int]:
    removed = 0
    for row in delta.removed:
        q = cypher().render(
            "delete_edge",
            src_label=label_of(row["src"]),
            rel_type=row["type"],
            dst_label=label_of(row["dst"]),
        )
        removed += g.write(
            q, {"src": row["src"], "dst": row["dst"], "doc": delta.doc_id}, name="delete_edge"
        ).relationships_deleted
    added = upsert_edges(g, delta.added, change_id=change_id)
    upsert_edges(g, delta.retained)  # refresh provenance (src_ver / quote / line) to the new version
    return {"added": added, "removed": removed, "retained": len(delta.retained)}

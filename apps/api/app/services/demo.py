"""Demo lifecycle: reset to the v1 baseline and apply incremental document changes."""

from __future__ import annotations

import difflib
import threading
import time
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from app.config import get_settings
from app.graph.client import GraphClient, get_graph
from app.graph.cypher import cypher
from app.graph.ontology import label_of, make_id
from app.ingest import embeddings
from app.ingest.corpus import CorpusDocument, load_corpus, parse_document
from app.ingest.extractor import chunk_documents, extract
from app.ingest.writer import (
    apply_delta,
    compute_delta,
    ensure_indexes,
    upsert_nodes,
    write_chunks,
    write_extraction,
)
from app.services.validation import validate_baseline

_lock = threading.Lock()

CHANGE_TYPES = {
    "dpa": "VENDOR_DPA_UPDATE",
    "contract": "CUSTOMER_CONTRACT_UPDATE",
    "architecture": "ARCHITECTURE_UPDATE",
}


def now_iso() -> str:
    return datetime.now(UTC).isoformat(timespec="seconds").replace("+00:00", "Z")


def _v1_dir() -> Path:
    return get_settings().demo_dir / "v1"


def _v2_dir() -> Path:
    return get_settings().demo_dir / "v2"


def reset_demo(g: GraphClient | None = None) -> dict[str, Any]:
    """Clear ONLY the ClauseRipple graph, ingest v1, validate critical facts."""
    g = g or get_graph()
    with _lock:
        t0 = time.perf_counter()
        g.delete_graph()
        indexes = ensure_indexes(g)
        docs = load_corpus(_v1_dir())
        ex = extract(docs)
        chunks = chunk_documents(docs)
        stats = write_extraction(g, ex, chunks)
        emb = embeddings.embed_chunks(g, chunks)
        validation = validate_baseline(g)
        duration_ms = round((time.perf_counter() - t0) * 1000, 1)
    return {
        "state": "BASELINE",
        "documents": len(docs),
        "facts": {"nodes": len(ex.nodes), "relationships": len(ex.edges), "chunks": len(chunks)},
        "written": stats,
        "indexes": len(indexes),
        "embeddings": emb,
        "extraction_warnings": ex.warnings,
        "validation": validation,
        "duration_ms": duration_ms,
    }


def _doc_text_in_graph(doc_id: str, g: GraphClient) -> dict[str, Any] | None:
    rows = g.read(cypher()["document_by_id"], {"doc_id": doc_id}, name="document_by_id")
    return rows[0] if rows else None


def _unified_diff(old: str, new: str, doc_id: str, old_v: int, new_v: int) -> list[dict[str, str]]:
    lines = []
    for line in difflib.unified_diff(
        old.strip().splitlines(),
        new.strip().splitlines(),
        f"{doc_id} v{old_v}",
        f"{doc_id} v{new_v}",
        lineterm="",
        n=1,
    ):
        if line.startswith(("---", "+++")):
            continue
        kind = (
            "hunk"
            if line.startswith("@@")
            else "add"
            if line.startswith("+")
            else "del"
            if line.startswith("-")
            else "ctx"
        )
        lines.append({"kind": kind, "text": line[1:] if kind in {"add", "del", "ctx"} else line})
    return lines


def pending_changes(g: GraphClient | None = None) -> list[dict[str, Any]]:
    """Documents in data/demo/v2 that are newer than the version stored in FalkorDB."""
    g = g or get_graph()
    out = []
    for path in sorted(_v2_dir().glob("*.md")):
        new = parse_document(path)
        cur = _doc_text_in_graph(new.doc_id, g)
        if cur is None:
            continue
        cur_v = int(cur["version"] or 0)
        out.append(
            {
                "doc_id": new.doc_id,
                "title": new.title,
                "kind": new.kind,
                "current_version": cur_v,
                "new_version": new.version,
                "applied": new.version <= cur_v,
                "diff": _unified_diff(cur["text"] or "", new.body, new.doc_id, cur_v, new.version),
            }
        )
    return out


def _next_seq(label: str, g: GraphClient) -> int:
    return int(g.read(cypher().render("next_sequence", label=label), name="next_sequence")[0]["next"])


def apply_change(doc_id: str, g: GraphClient | None = None) -> dict[str, Any]:
    """Incrementally apply the v2 version of one document.

    Only relationships whose provenance is this document are touched: added facts are merged,
    retracted facts deleted, retained facts get refreshed provenance. A ChangeEvent node records
    the text diff and the fact delta, and becomes the trigger for the impact agent.
    """
    g = g or get_graph()
    with _lock:
        t0 = time.perf_counter()
        path = _v2_dir() / f"{doc_id}.md"
        if not path.is_file():
            raise FileNotFoundError(f"No pending version for {doc_id}")
        new_doc = parse_document(path)
        cur = _doc_text_in_graph(doc_id, g)
        if cur is None:
            raise LookupError(f"{doc_id} is not in the graph — reset the demo first")
        cur_v = int(cur["version"] or 0)
        if new_doc.version <= cur_v:
            raise ValueError(f"{doc_id} v{new_doc.version} is already applied (graph has v{cur_v})")

        # Re-run extraction over the corpus with the new version substituted so entity
        # linking is identical; then keep only facts sourced from the changed document.
        corpus: list[CorpusDocument] = [d for d in load_corpus(_v1_dir()) if d.doc_id != doc_id] + [new_doc]
        ex = extract(corpus).for_doc(doc_id)
        delta = compute_delta(g, doc_id, list(ex.edges.values()))

        seq = _next_seq("ChangeEvent", g)
        detected = now_iso()
        ref = f"CHG-{detected[:4]}-{seq:03d}"
        change_id = make_id("ChangeEvent", ref)
        diff = _unified_diff(cur["text"] or "", new_doc.body, doc_id, cur_v, new_doc.version)
        added_facts = [f"{e.src} {e.type} {e.dst}" for e in delta.added]
        removed_facts = [f"{r['src']} {r['type']} {r['dst']}" for r in delta.removed]

        applied = apply_delta(g, delta, change_id)
        # Update the document node (version, text, hash) and re-chunk it.
        upsert_nodes(g, [n for n in ex.nodes.values() if n.label == "Document"])
        doc_node = make_id("Document", doc_id)
        g.write(cypher()["delete_document_chunks"], {"doc_node": doc_node}, name="delete_document_chunks")
        chunks = chunk_documents([new_doc])
        write_chunks(g, chunks)
        embeddings.embed_chunks(g, chunks)

        subjects = sorted({e.src for e in delta.added} | {r["src"] for r in delta.removed})
        props = {
            "id": change_id,
            "ref": ref,
            "seq": seq,
            "name": f"{new_doc.title} v{cur_v} → v{new_doc.version}",
            "type": CHANGE_TYPES.get(new_doc.kind, "DOCUMENT_UPDATE"),
            "doc_id": doc_id,
            "old_version": cur_v,
            "new_version": new_doc.version,
            "detected_at": detected,
            "added_facts": added_facts,
            "removed_facts": removed_facts,
            "diff_add": [d["text"] for d in diff if d["kind"] == "add"],
            "diff_del": [d["text"] for d in diff if d["kind"] == "del"],
            "summary": f"{len(added_facts)} fact(s) added, {len(removed_facts)} retracted from {doc_id}",
        }
        g.write(
            cypher()["create_change_event"],
            {"props": props, "doc_node": doc_node},
            name="create_change_event",
        )
        for subject in subjects:
            g.write(
                cypher().render("link_change_subject", label=label_of(subject)),
                {"change_id": change_id, "subject_id": subject},
                name="link_change_subject",
            )
        for e in delta.added:
            g.write(
                cypher().render("link_change_introduced", label=label_of(e.dst)),
                {
                    "change_id": change_id,
                    "object_id": e.dst,
                    "rel": e.type,
                    "subject_id": e.src,
                    "quote": e.quote,
                },
                name="link_change_introduced",
            )
        for r in delta.removed:
            g.write(
                cypher().render("link_change_retracted", label=label_of(r["dst"])),
                {
                    "change_id": change_id,
                    "object_id": r["dst"],
                    "rel": r["type"],
                    "subject_id": r["src"],
                    "quote": r["quote"],
                },
                name="link_change_retracted",
            )
        duration_ms = round((time.perf_counter() - t0) * 1000, 1)

    return {
        "change_id": change_id,
        "ref": ref,
        "type": props["type"],
        "doc_id": doc_id,
        "old_version": cur_v,
        "new_version": new_doc.version,
        "added_facts": [
            {"src": e.src, "type": e.type, "dst": e.dst, "quote": e.quote, "line": e.line}
            for e in delta.added
        ],
        "removed_facts": delta.removed,
        "applied": applied,
        "diff": diff,
        "subjects": subjects,
        "incremental_update_ms": duration_ms,
    }


def demo_state(g: GraphClient | None = None) -> dict[str, Any]:
    g = g or get_graph()
    if not g.graph_exists():
        return {"state": "EMPTY", "dpa_version": None, "latest_change_id": None, "change_events": 0}
    rows = g.read(cypher()["demo_state"], name="demo_state")
    if not rows:
        return {"state": "EMPTY", "dpa_version": None, "latest_change_id": None, "change_events": 0}
    row = rows[0]
    state = "UPDATED" if int(row["change_events"] or 0) > 0 else "BASELINE"
    return {"state": state, **row}


def change_detail(change_id: str, g: GraphClient | None = None) -> dict[str, Any] | None:
    g = g or get_graph()
    rows = g.read(cypher()["change_event_detail"], {"change_id": change_id}, name="change_event_detail")
    if not rows or not rows[0].get("change"):
        return None
    row = rows[0]
    return {
        "change": row["change"],
        "subjects": [s for s in row["subjects"] if s.get("id")],
        "documents": [d for d in row["documents"] if d.get("id")],
        "introduced": [i for i in row["introduced"] if i.get("object_id")],
        "retracted": [r for r in row["retracted"] if r.get("object_id")],
    }


def latest_added_regions(g: GraphClient | None = None) -> list[str]:
    """Region codes introduced by the most recent change event (PROCESSES_IN facts)."""
    g = g or get_graph()
    state = demo_state(g)
    if not state.get("latest_change_id"):
        return []
    detail = change_detail(state["latest_change_id"], g)
    if not detail:
        return []
    return sorted(
        {
            i["object_code"]
            for i in detail["introduced"]
            if i.get("rel") == "PROCESSES_IN" and i.get("object_code")
        }
    )


def graph_stats(g: GraphClient | None = None) -> dict[str, Any]:
    g = g or get_graph()
    if not g.graph_exists():
        return {"nodes": 0, "relationships": 0, "by_label": {}}
    labels = g.read(cypher()["stats_labels"], name="stats_labels")
    rels = g.read(cypher()["stats_relationships"], name="stats_relationships")
    by_label = {r["label"]: r["count"] for r in labels}
    return {
        "nodes": sum(by_label.values()),
        "relationships": rels[0]["count"] if rels else 0,
        "by_label": by_label,
        "documents": by_label.get("Document", 0),
        "cases": by_label.get("ImpactCase", 0),
        "decisions": by_label.get("Decision", 0),
        "agent_runs": by_label.get("AgentRun", 0),
    }

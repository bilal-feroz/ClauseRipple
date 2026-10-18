"""Optional local embeddings (fastembed, ONNX, CPU) stored in a FalkorDB vector index.

Free and local: BAAI/bge-small-en-v1.5 (384-d). If fastembed is not installed the product
still works; vector retrieval is simply reported as unavailable (never faked).
"""

from __future__ import annotations

import os
import threading
from typing import Any

from app.config import REPO_ROOT
from app.graph.client import GraphClient
from app.graph.cypher import cypher

MODEL_NAME = "BAAI/bge-small-en-v1.5"
DIMENSION = 384
_lock = threading.Lock()
_model: Any = None
_unavailable_reason: str | None = None
# Text -> vector memo, so a demo reset re-uses vectors instead of re-running the model
# (keeps memory flat on small hosts such as a 512 MB free instance).
_memo: dict[str, list[float]] = {}


def _load() -> Any:
    global _model, _unavailable_reason
    with _lock:
        if _model is not None or _unavailable_reason is not None:
            return _model
        if os.environ.get("DISABLE_EMBEDDINGS", "").lower() in {"1", "true", "yes"}:
            _unavailable_reason = "disabled by DISABLE_EMBEDDINGS"
            return None
        try:
            from fastembed import TextEmbedding  # type: ignore[import-not-found]
        except ImportError:
            _unavailable_reason = "fastembed not installed (uv sync --group embeddings)"
            return None
        cache = os.environ.get("FASTEMBED_CACHE_PATH") or str(REPO_ROOT / ".cache" / "fastembed")
        try:
            _model = TextEmbedding(model_name=MODEL_NAME, cache_dir=cache, threads=1)
        except Exception as exc:  # download / runtime failure
            _unavailable_reason = f"embedding model unavailable: {type(exc).__name__}"
            return None
        return _model


def status() -> dict[str, Any]:
    model = _load()
    return {
        "enabled": model is not None,
        "model": MODEL_NAME if model else None,
        "reason": _unavailable_reason,
    }


def embed_texts(texts: list[str]) -> list[list[float]] | None:
    model = _load()
    if model is None:
        return None
    missing = list(dict.fromkeys(t for t in texts if t not in _memo))
    if missing:
        for text, v in zip(missing, model.embed(missing, batch_size=16), strict=True):
            _memo[text] = v.tolist()
    return [_memo[t] for t in texts]


def embed_query(text: str) -> list[float] | None:
    vectors = embed_texts([text])
    return vectors[0] if vectors else None


def embed_chunks(g: GraphClient, chunks: list[dict[str, Any]]) -> dict[str, Any]:
    if not chunks:
        return status()
    vectors = embed_texts([c["text"] for c in chunks])
    if vectors is None:
        return status()
    try:
        g.write(cypher()["index_vector_chunk"], name="index_vector_chunk")
    except Exception as exc:
        if "already" not in str(exc).lower():
            raise
    rows = [{"id": c["id"], "embedding": v} for c, v in zip(chunks, vectors, strict=True)]
    for i in range(0, len(rows), 64):
        g.write(cypher()["set_chunk_embeddings"], {"rows": rows[i : i + 64]}, name="set_chunk_embeddings")
    return {**status(), "embedded": len(rows)}

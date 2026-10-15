"""Shared API helpers: graph availability guard and safe error mapping."""

from __future__ import annotations

import logging
from collections.abc import Callable
from typing import Any, TypeVar

from fastapi import HTTPException
from redis.exceptions import ResponseError

from app.graph.client import GraphUnavailableError

T = TypeVar("T")

GRAPH_DOWN_DETAIL = "FalkorDB unavailable. Agent reasoning paused."


def guarded(fn: Callable[..., T], *args: Any, **kwargs: Any) -> T:
    """Run a graph-backed operation, mapping failures to safe HTTP errors (no stack traces)."""
    try:
        return fn(*args, **kwargs)
    except GraphUnavailableError as exc:
        raise HTTPException(status_code=503, detail=GRAPH_DOWN_DETAIL) from exc
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except ResponseError as exc:  # FalkorDB rejected a query: log it, never leak internals
        logging.getLogger("clauseripple").exception("Graph query failed")
        raise HTTPException(status_code=500, detail="Graph query failed") from exc

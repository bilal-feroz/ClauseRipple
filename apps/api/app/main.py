"""ClauseRipple API entrypoint."""

from __future__ import annotations

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import demo, graph, health
from app.config import get_settings
from app.graph.client import get_graph

log = logging.getLogger("clauseripple")


def _auto_seed() -> None:
    """Seed the baseline demo graph on startup if it does not exist yet (never overwrites)."""
    settings = get_settings()
    if not settings.auto_seed:
        return
    g = get_graph()
    try:
        if g.ping() and not g.graph_exists():
            from app.services.demo import reset_demo

            result = reset_demo(g)
            log.info(
                "Seeded demo graph: validation %s/%s",
                result["validation"]["passed"],
                result["validation"]["total"],
            )
    except Exception:  # never block API startup on seeding
        log.exception("Auto-seed failed; POST /api/demo/reset to retry")


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    _auto_seed()
    yield


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title="ClauseRipple API",
        version="0.1.0",
        description="One clause changes. See what breaks. Graph-native change-impact agent on FalkorDB.",
        lifespan=lifespan,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=False,
        allow_methods=["GET", "POST"],
        allow_headers=["Content-Type", "Accept"],
    )
    app.include_router(health.router)
    app.include_router(demo.router)
    app.include_router(graph.router)
    return app


app = create_app()

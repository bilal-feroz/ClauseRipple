# ClauseRipple API (FastAPI + MCP). Build from the repo root:
#   docker build -f apps/api/Dockerfile -t clauseripple-api .
FROM python:3.11-slim

COPY --from=ghcr.io/astral-sh/uv:0.11.32 /uv /usr/local/bin/uv
ENV PYTHONUNBUFFERED=1 \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=never \
    FASTEMBED_CACHE_PATH=/repo/.cache/fastembed

WORKDIR /repo/apps/api
COPY apps/api/pyproject.toml apps/api/uv.lock apps/api/.python-version ./
RUN uv sync --frozen --no-dev --no-install-project

COPY apps/api/app ./app
COPY data /repo/data
COPY docs/cypher /repo/docs/cypher

# Bake the local embedding model into the image (free, ~67 MB) so the container never downloads at runtime.
RUN uv run --no-dev python -c "from fastembed import TextEmbedding; TextEmbedding('BAAI/bge-small-en-v1.5', cache_dir='/repo/.cache/fastembed')"

RUN useradd --create-home --uid 10001 app && chown -R app /repo
USER app
EXPOSE 8000
CMD ["sh", "-c", "uv run --no-dev uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]

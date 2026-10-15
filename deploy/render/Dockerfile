# Single-container deployment: FalkorDB (localhost:6379) + ClauseRipple API on $PORT.
# Designed for free hosts that run one web service (e.g. Render free tier). The demo graph is
# re-seeded on every boot (AUTO_SEED), so ephemeral disks are fine.
# Build from the repo root:  docker build -f deploy/render/Dockerfile -t clauseripple-allinone .
FROM falkordb/falkordb:v4.22.1

COPY --from=ghcr.io/astral-sh/uv:0.11.32 /uv /usr/local/bin/uv
ENV PYTHONUNBUFFERED=1 \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PYTHON_INSTALL_DIR=/opt/python \
    FASTEMBED_CACHE_PATH=/repo/.cache/fastembed \
    BROWSER=0 \
    FALKORDB_HOST=127.0.0.1 \
    FALKORDB_PORT=6379 \
    AUTO_SEED=true

WORKDIR /repo/apps/api
COPY apps/api/pyproject.toml apps/api/uv.lock apps/api/.python-version ./
RUN uv python install 3.11 && uv sync --frozen --no-dev --no-install-project
COPY apps/api/app ./app
COPY data /repo/data
COPY docs/cypher /repo/docs/cypher
RUN uv run --no-dev python -c "from fastembed import TextEmbedding; TextEmbedding('BAAI/bge-small-en-v1.5', cache_dir='/repo/.cache/fastembed')"

COPY deploy/render/start.sh /start.sh
RUN chmod +x /start.sh
EXPOSE 8000
ENTRYPOINT ["/start.sh"]

#!/bin/sh
# Start FalkorDB on localhost only, wait for it, then serve the API on $PORT.
set -e
mkdir -p "${FALKORDB_DATA_PATH:-/var/lib/falkordb/data}"
redis-server --bind 127.0.0.1 --port 6379 --protected-mode yes \
  --dir "${FALKORDB_DATA_PATH:-/var/lib/falkordb/data}" \
  --loadmodule /var/lib/falkordb/bin/falkordb.so MAX_QUEUED_QUERIES 25 TIMEOUT 10000 RESULTSET_SIZE 10000 \
  --daemonize yes
i=0
until redis-cli -h 127.0.0.1 ping >/dev/null 2>&1; do
  i=$((i + 1))
  [ "$i" -gt 50 ] && echo "FalkorDB did not start" && exit 1
  sleep 0.2
done
cd /repo/apps/api
exec uv run --no-dev uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}"

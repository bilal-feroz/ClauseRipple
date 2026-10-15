# ClauseRipple task runner (macOS/Linux; on Windows run the commands in each target directly).
.DEFAULT_GOAL := help
API := apps/api
WEB := apps/web

.PHONY: help setup db db-down api web dev test test-api test-e2e lint typecheck build demo-reset demo-update ask benchmark mcp-tools

help: ## Show targets
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  %-14s %s\n", $$1, $$2}'

setup: ## Install API (uv) and web (pnpm) dependencies
	cd $(API) && uv sync
	cd $(WEB) && pnpm install

db: ## Start FalkorDB (+ FalkorDB Browser on http://localhost:3001)
	docker compose up -d falkordb

db-down: ## Stop FalkorDB
	docker compose stop falkordb

api: ## Run the API on :8000 (seeds the demo graph on first start)
	cd $(API) && uv run uvicorn app.main:app --port 8000

web: ## Run the web app on :3000
	cd $(WEB) && pnpm dev

dev: db ## FalkorDB + API + web (API in background)
	cd $(API) && (uv run uvicorn app.main:app --port 8000 &) && cd ../.. && cd $(WEB) && pnpm dev

test: test-api ## Backend tests (unit + integration on a separate FalkorDB test graph)

test-api:
	cd $(API) && uv run pytest

test-e2e: ## Playwright E2E against the running stack (API :8000 + web :3000)
	cd $(WEB) && pnpm test:e2e

lint: ## Lint backend and frontend
	cd $(API) && uv run ruff check . && uv run ruff format --check .
	cd $(WEB) && pnpm lint

typecheck: ## Type-check the frontend
	cd $(WEB) && pnpm typecheck

build: ## Production build of the web app
	cd $(WEB) && pnpm build

demo-reset: ## Clear ONLY the demo graph, ingest v1, validate critical facts
	cd $(API) && uv run python -m app.cli reset

demo-update: ## Apply ModelCloud DPA v2 and run the Change Impact Agent (prints the trace)
	cd $(API) && uv run python -m app.cli update

ask: ## Ask ClauseRipple: make ask Q="Why is Falcon Bank impacted?"
	cd $(API) && uv run python -m app.cli ask "$(Q)"

benchmark: ## Vector-only RAG vs graph benchmark (writes docs/benchmark.md)
	cd $(API) && uv run python -m app.eval.benchmark

mcp-tools: ## List the MCP tools
	cd $(API) && uv run python -m app.cli mcp-tools

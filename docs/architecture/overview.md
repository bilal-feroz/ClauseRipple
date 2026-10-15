# ClauseRipple — architecture

## Runtime

```
┌──────────────────────────── Browser ────────────────────────────┐
│ Next.js 16 mission control                                       │
│  TopBar · Ask ClauseRipple · Change panel · Blast radius          │
│  RippleSpace (three.js) · Evidence graph (React Flow)             │
│  Agent trace (SSE) · Cases · Why? · Memory · Sources              │
└───────────────┬──────────────────────────────────▲──────────────┘
                │ REST (JSON)                       │ SSE: tool events
┌───────────────▼──────────────────────────────────┴──────────────┐
│ FastAPI (apps/api)                                                │
│  routes: demo · graph · impact · cases · memory · agent · ask     │
│                                                                   │
│  Change Impact Agent ── planner ──► mcp.Client ──► MCP server ────┼──► /mcp (streamable HTTP)
│   (Claude | OpenAI-compatible | Ollama | deterministic playbook)  │    stdio: python -m app.mcp_server
│                                        10 graph tools             │
│  services: ingestion · impact rules · evidence · cases · ask      │
│  GraphClient: ro_query for reads, query for writes, metered       │
│  CypherLibrary: docs/cypher/*.cypher loaded at runtime            │
└───────────────┬───────────────────────────────────────────────────┘
                │ redis protocol (GRAPH.QUERY / GRAPH.RO_QUERY)
┌───────────────▼──────────────┐
│ FalkorDB 4.22.1 (Docker)      │  graph `clause_ripple`
│ + FalkorDB Browser (:3001)    │  range / full-text / vector indexes
└──────────────────────────────┘
```

## Where the LLM sits

The LLM (if configured) is only the **planner**: it receives the tool list from MCP `list_tools()` and chooses the
next tool and arguments. It never writes Cypher, never sees the database, never decides compliance:

| Concern | Decided by |
|---|---|
| Which tool next | planner (LLM or deterministic playbook) |
| Facts (paths, regions, owners, decisions) | FalkorDB queries inside the tools |
| Impacted or not, severity | `app/services/rules.py` (pure functions, unit-tested) |
| Whether a case may be written / assigned | guardrails in `app/services/cases.py` re-checking the live graph |
| Remediation actions and owners | graph relationships (system owner, control owner, account manager) |
| Narrative summary | template from tool results (+ optional LLM summary, labelled as such) |

## Ingestion pipeline

```
data/demo/v1/*.md ──► corpus parser (front matter, sections, tables, sentences)
                  ──► extractor (rules@1)
                        1. reference / catalog / directory / CRM docs define canonical entities (gazetteer)
                        2. relation rules per document kind (architecture, contract, dpa, ownership, controls,
                           decision, ticket) — negated sentences skipped
                        3. post-pass: obligations SATISFIED_BY controls
                        4. every quote verified verbatim against its document
                  ──► writer: UNWIND/MERGE batches per label / relationship type
                  ──► chunks + local embeddings (fastembed) → vector index
                  ──► validation: 20 critical facts checked against the live graph
```

## Incremental change (v1 → v2)

1. Parse the new document version; text-diff it against the version stored on the `Document` node.
2. Re-run extraction with the new version substituted; keep only facts sourced from this document.
3. Diff against relationships whose `src` is this document → *added / retracted / retained*.
4. Delete retracted edges, MERGE added edges (tagged with `change_id`), refresh provenance on retained ones,
   update the `Document` node and re-chunk/re-embed it.
5. Write a `ChangeEvent` (`CHANGED` → document and vendor, `INTRODUCED` → the new region) and trigger the agent.

For ModelCloud DPA v2 this adds exactly one fact: `(ModelCloud)-[:PROCESSES_IN]->(US)`.

## Agent run lifecycle

`POST /api/demo/apply-change` → `AgentRun` node (RUNNING) → background task opens an in-process MCP client →
planner loop → every tool result is persisted as a `ToolCall` (input, summary, metrics, `TOUCHED` entities) and
streamed over SSE → completeness check → run node completed with real metrics, `CREATED` cases and
`REFERENCED` decisions. `GET /api/agent/runs/{id}/events` streams live, or replays from FalkorDB after a restart.

## Security posture

- Parameterised Cypher only; labels / relationship types (which Cypher cannot parameterise) are filled from the
  ontology whitelist. No endpoint accepts arbitrary Cypher. Reads use `GRAPH.RO_QUERY`.
- Pydantic validation on every request (id patterns, sizes); MCP validates tool arguments against JSON schemas.
- Reset drops only the `clause_ripple` graph (never `FLUSHALL`); tests use separate graphs.
- Explicit CORS origins; `/mcp` has DNS-rebinding protection (allowed hosts); no secrets reach the browser;
  graph errors are logged server-side and returned as generic messages.
- Documents capped at 256 KB; no upload endpoint in demo mode.

## Failure modes

| Failure | Behaviour |
|---|---|
| FalkorDB down | `/health` → `falkordb: unavailable`; UI banner “FalkorDB unavailable. Agent reasoning paused.”; API 503s; no fallback store |
| LLM provider error | trace shows “Agent planner unavailable … continuing with the deterministic playbook”; graph work continues |
| LLM stops early | completeness check: playbook finishes missing cases, labelled in the trace |
| Extraction misses a critical fact | reset returns `validation.ok = false` and the UI shows a warning; nothing is patched in |
| WebGL unavailable / context lost | RippleSpace swaps to the 2D whole-graph view with a notice |

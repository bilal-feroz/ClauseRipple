# ClauseRipple build log

Factual log of the hackathon build (Graph Hacks: Context for AI Agents, FalkorDB × WeMakeDevs).
Times are local (GMT+4).

## 2026-10-15

- Repository was empty at hackathon start (no commits). Confirmed `origin` → github.com/bilal-feroz/ClauseRipple.
- Read the current official rules (overview, rules, schedule, resources, FAQ) — summary in
  `docs/submission/hackathon-rules.md`. Deadline: Sun 18 Oct 2026, 11:59 PM IST.
- Researched current FalkorDB APIs (falkordb-py 1.8.0, FalkorDB 4.22.1 / 6.0 Rust engine, Cypher
  limitations, algorithms, vector/full-text indexes), GraphRAG-SDK 1.4.0, MCP Python SDK 2.x,
  free LLM/hosting options, and previous winning projects (`docs/research/winning-patterns.md`).
- Fixed local Docker Desktop startup (stale `dockerInference` socket) and pinned `falkordb/falkordb:v4.22.1`
  (FalkorDB + bundled Browser on :3001).
- Designed the AtlasAI company ontology (18 domain labels) and wrote a 20-document synthetic corpus
  (contracts, DPAs, architecture docs, directory, ownership, controls, decisions, ticket) + DPA v2.
- Implemented a deterministic, provenance-first extractor: every relationship carries the exact
  source sentence/table row; quotes are verified against the document. Negated statements
  ("does not call ModelCloud") produce no edge.
- Implemented ingestion into FalkorDB (UNWIND/MERGE batches), per-document incremental delta updates,
  ChangeEvent nodes, and post-ingestion validation (20/20 critical facts).
- All Cypher lives in `docs/cypher/*.cypher` and is loaded by the API at runtime.
- Verified on live FalkorDB: baseline has 0 impacts; applying ModelCloud DPA v2 adds exactly one fact
  (`ModelCloud PROCESSES_IN US`, ~94 ms incremental update) and the deterministic rules classify
  Falcon Bank + Acme Insurance IMPACTED (CRITICAL), Nova Retail ALLOWED (US permitted),
  GulfGov NO_DEPENDENCY (bounded shortestPath returns null).
- Built the graph-native agent: 10 FalkorDB-backed tools served by an MCP server (MCP Python SDK 2.x);
  the agent calls them through an in-process MCP client; runs/tool calls persisted as AgentRun/ToolCall nodes;
  guarded writes (ImpactCase only on a graph-verified violation; assignment only to the owning team).
- Planners: Claude tool use, OpenAI-compatible, native Ollama, and a labelled deterministic playbook.
- Mission-control UI (Next.js 16): change diff, blast radius, live SSE agent trace, cases with human approval,
  Why? evidence, memory, sources, Ask ClauseRipple (Ctrl/Cmd+K), 2D evidence graph, RippleSpace 3D.
- Benchmark (measured): graph 12/12 exact, evidence recall 0.99 vs vector-only 0.37 (k=5) / 0.62 (k=8);
  blast-radius traversal ~1 ms FalkorDB time. Playwright E2E of the full flow, 0 console errors.
- CI (ruff + pytest on a FalkorDB service; web lint/typecheck/build), Dockerfiles, free deployment config.

## Handoff (end of first build session, 2026-10-15)

State: everything above is on `main`; backend 20/20 tests and the E2E flow passed before handoff.

Local LLM planner findings (this laptop: RTX 3050 4 GB):
- `llama3.2:3b` (Ollama) is fast once warm (~1 s/step) and made 4–5 correct MCP tool calls, then narrated
  instead of calling tools; the completeness check finished the run with the playbook (labelled in the trace).
- `qwen3:4b` spills to CPU here (~8 tok/s, ~200 s per step) — too slow on 4 GB.
- The OpenAI-compatible Ollama endpoint is limited to a 4k context; use `LLM_PROVIDER=ollama` (native API,
  `OLLAMA_NUM_CTX`, default 8192). On a bigger GPU try `LLM_MODEL=qwen3:8b` or `qwen3:14b`, or a free
  Gemini key (`LLM_PROVIDER=gemini`, `LLM_API_KEY`, `LLM_MODEL`).

Suggested next steps:
1. Run the LLM planner end to end on the better GPU and record which model completes all cases unaided.
2. Optional: second change scenario (e.g. a contract amendment) to show the agent is not ModelCloud-specific.
3. Optional polish: RippleSpace bloom / before-after toggle; blog draft (`docs/submission/blog-draft.md`).
4. Before submitting: re-check the official rules page, update `docs/submission/hackathon-rules.md`
   ("Planned" → done), record the demo video (`docs/demo/90-second-script.md`), deploy (`docs/deployment.md`).

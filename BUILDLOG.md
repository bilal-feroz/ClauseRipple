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

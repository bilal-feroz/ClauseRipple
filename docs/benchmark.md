# ClauseRipple benchmark — vector-only RAG vs FalkorDB graph

Generated 2026-10-18T17:01:35+00:00 by `uv run python -m app.eval.benchmark` · FalkorDB 4.22.1 · embeddings BAAI/bge-small-en-v1.5.
All numbers below are measured by that script; see `data/evaluation/results.json` for every row.

## Evidence coverage (does the retrieved context contain every source the answer needs?)

| Question | Graph answer | Graph evidence | Vector@3 | Vector@5 | Vector@8 |
|---|---|---|---|---|---|
| Which customers are affected by ModelCloud adding US processing? | ✅ Falcon Bank, Acme Insurance | 0.88 | 0.25 | 0.25 | 0.38 |
| Why is Falcon Bank affected? | ✅ Falcon Bank | 1.00 | 0.00 | 0.00 | 0.33 |
| Why is Nova Retail not affected? | ✅ ALLOWED | 1.00 | 0.50 | 0.50 | 0.50 |
| Why is GulfGov not affected? | ✅ NO_DEPENDENCY | 1.00 | 0.00 | 0.00 | 0.50 |
| Which systems depend on ModelCloud? | ✅ Claims Pipeline, Document Processing API | 1.00 | 0.50 | 0.50 | 0.50 |
| Which products indirectly depend on ModelCloud? | ✅ ClaimsCopilot, DocSummarizer | 1.00 | 0.50 | 0.50 | 1.00 |
| Which customers allow US processing? | ✅ Nova Retail | 1.00 | 0.75 | 1.00 | 1.00 |
| Who owns Document Processing API? | ✅ Sarah Malik | 1.00 | 0.00 | 0.50 | 0.50 |
| What prior decision applies to Falcon Bank? | ✅ CR-087 | 1.00 | 1.00 | 1.00 | 1.00 |
| What team should handle Falcon Bank remediation? | ✅ Platform Engineering | 1.00 | 0.00 | 0.00 | 0.33 |
| What evidence supports Falcon Bank's residency restriction? | ✅ falcon_bank_msa | 1.00 | 0.00 | 0.00 | 1.00 |
| What would break if ModelCloud were unavailable? | ✅ Acme Insurance, Falcon Bank, Nova Retail | 1.00 | 0.20 | 0.20 | 0.40 |

## Summary

- Graph exact-answer rate: **100%** (12 questions).
- Mean evidence recall — graph **0.99** vs vector @3 0.31, @5 0.37, @8 0.62.
- Questions with complete evidence — graph 11/12, vector @3 1/12, @5 2/12, @8 4/12.
- *Which customers are affected by ModelCloud adding US processing?* — graph answer ['Falcon Bank', 'Acme Insurance'] (precision 1.0, recall 1.0); vector retrieval covers 25% of the needed sources at k=5 and 38% at k=8.

## Latency (local Docker FalkorDB, laptop)

- Core multi-hop blast-radius query: median **0.856 ms** FalkorDB execution, 4.22 ms wall (30 runs).
- Full deterministic residency evaluation of all customers: median 14.57 ms wall (10 runs).
- Incremental DPA v1→v2 update (diff, fact delta, graph writes, ChangeEvent): median 177.6 ms (5 runs).
- Full agent run (playbook planner, tools via MCP): 14 tools, 63 graph reads, 13 writes, 74.65 ms FalkorDB time, 402.6 ms tool time.

## Method & caveats

- Same corpus and chunks for both sides; the vector baseline is in-memory cosine similarity with the same embedding model and never touches FalkorDB. Evidence recall = share of the question's `required_docs` present in the retrieved context.
- Graph answers use the agent's own tools on a separate FalkorDB graph. The corpus is synthetic and small (20 documents), written so the deterministic extractor parses it reliably; results on messy real documents would differ.
- Vector retrieval is not tuned per question; larger k raises coverage but also noise. This is an illustration of the multi-hop gap, not a general claim about RAG.

# Judge prep — explain ClauseRipple in plain language

## 1. What does FalkorDB store?

Everything. The company's knowledge (customers, contracts, clauses, obligations, vendors, systems, products, data
regions, controls, teams, people), the source documents and their chunks (with embeddings), the company's memory
(decisions, tickets), and the agent's own work (change events, impact cases, actions, agent runs, tool calls).
144 nodes / 173 relationships at baseline; ~170 / ~280 after an agent run. There is no other database.

## 2. Why is a graph necessary?

Because the question “who is in breach now?” is answered by a **chain across five documents**, and the answer is
conditional per customer. The DPA says ModelCloud may use the US. The architecture doc says the Document Processing
API sends inference to ModelCloud. The same doc says DocSummarizer runs on that API. Falcon Bank's contract says it
uses DocSummarizer and that its data may only be processed in the UAE and EU. Only the joined chain proves the
breach — and the same join proves Nova Retail is fine (its contract allows the US) and GulfGov is unaffected (no
path to ModelCloud at all). Our benchmark: vector retrieval gets every needed source into context for 2/12
questions at k=5; the graph supports 11/12 and answers 12/12 correctly.

## 3. How does ingestion work?

A deterministic, provenance-first extractor (`apps/api/app/ingest/extractor.py`). Catalog/CRM/directory documents
define the canonical entities; other documents are parsed by section and sentence; small rules recognise relations
(“is powered by”, “routes … through”, “following regions: …”, ownership tables). Negated sentences produce no edge
(“The Local Inference Service does not call ModelCloud”). Each relationship stores `src`, `src_ver`, `line` and the
exact `quote`, which is verified verbatim against the document. After every reset, 20 critical facts are checked
against the live graph. *Why not an LLM extractor?* Reproducibility for a demo you can reset 50 times; the planner
and extraction are separate concerns. We evaluated FalkorDB GraphRAG-SDK 1.4 (it has incremental
`update/apply_changes/finalize`); our per-document fact-delta follows the same idea.

## 4. What does the main Cypher traversal do?

```cypher
MATCH (v:Vendor {id: $vendor_id})
MATCH path = (c:Customer)-[:USES]->(p:Product)-[:POWERED_BY]->(s:System)-[:DEPENDS_ON*1..4]->(v)
RETURN c.name, p.name, s.name, length(path) AS hops, [r IN relationships(path) | r.quote] AS evidence
```
It starts at the changed vendor and walks *backwards* through system dependencies (1–4 hops, so system→system
chains count) to products and the customers that use them, returning the path, its length (RippleSpace uses it as
the ripple depth) and the source quote on every edge. A second query pulls each customer's allowed regions from
`Contract→Clause→Obligation→DataRegion`. A third — `shortestPath((c)-[:USES|POWERED_BY|DEPENDS_ON*1..6]->(v))` —
proves absence for customers with no route.

## 5. How does the agent choose tools?

At start it calls MCP `list_tools()` and hands the 10 tool schemas to the planner. With an LLM configured
(Claude / OpenAI-compatible / Ollama), the model picks each next tool and its arguments; with no LLM the labelled
deterministic playbook calls the same tools in the documented order. Every call goes through MCP `call_tool`, so
arguments are schema-validated (ids are pattern-checked) before any Cypher runs. A completeness check finishes
any case an LLM forgot, and says so in the trace.

## 6. How is compliance calculated?

Not by the LLM. `app/services/rules.py`:
```
violating = vendor_processing_regions − customer_allowed_regions
impacted  = dependency_path_exists AND violating ≠ ∅
severity  = CRITICAL if the customer is regulated (CRM) else HIGH
```
Falcon: {UAE, EU, US} − {UAE, EU} = {US} → impacted, CRITICAL. Nova: {…US} − {UAE, EU, US} = ∅ → allowed.
GulfGov: no path → not impacted, whatever the regions.

## 7. How is the ImpactCase created?

The `create_impact_case` tool (a graph write) first **re-evaluates the rule against the live graph** and refuses
if there is no violation (try it on Nova Retail from the *Why?* tab). Then it resolves, all via relationships:
the route (product, system), the violated obligation, the system owner (`OWNED_BY` + `LEADS`), the control owner
for the review (`SATISFIED_BY` + `OWNED_BY`), the account manager and the contract's notice period. It allocates
the next change-record number from company memory (CR-103 → CR-104), writes `ImpactCase` + `Action` nodes and
links (`AFFECTS`, `CAUSED_BY`, `INVOLVES`, `VIOLATES`, `RELATED_TO`, `SUPPORTED_BY`, `ORIGINATED_FROM`).
`assign_impact_case` refuses anyone not on the team that owns an involved system.

## 8. How are previous decisions remembered?

Decision records are graph nodes linked to customer, vendor, system, owner and approver. Recall is a traversal
ranked by shared anchors, so CR-087 (Falcon + ModelCloud) is found for Falcon Bank but Acme only gets a weak
vendor-only match — and the two cases get different recommendations. When a human approves a remediation, a new
`Decision` is written with `RESOLVES → case`, so the next run recalls it. Agent runs and tool calls are stored too:
“which runs touched Falcon Bank?” is one query. Restart everything and Ask “What did we decide about Falcon Bank
after the ModelCloud policy change?” — the answer is read from FalkorDB.

## 9. How does provenance work?

Provenance is on the relationship itself: `src` (document id), `src_ver` (document version), `line`, `loc`
(section) and `quote`. Evidence bundles return every edge on the dependency path and the contract path with its
quote; the UI links each to the document viewer with the passage highlighted. The new `PROCESSES_IN → US` edge
carries `src_ver = 2` and the `change_id` that introduced it.

## 10. Why is RippleSpace not fake?

It renders `GET /api/graph`, which is two Cypher queries over the live graph — the same nodes and relationships the
agent uses. Positions are a deterministic layered layout (no physics, no randomness). Nothing animates on a timer:
the shockwave starts when the `inspect_change` tool event arrives over SSE, and nodes light up when the tool that
found them completes, staggered by the path length FalkorDB returned. Statuses come from the backend verdicts.

## 11. What would you do next?

LLM/GraphRAG extraction for messy real documents (validated by the same provenance checks); more obligation types
(sub-processor approval, retention); a second vendor change that recalls the first case; FalkorDB 6 (Rust engine).

## 12. Likely tough questions

- **“Isn't this just a join?”** At depth 1, yes. The value is the conditional, multi-document chain — and the bounded
  proof of absence for GulfGov — returned with its evidence in ~1 ms of FalkorDB time.
- **“Why trust the agent?”** It can't decide compliance or invent owners; write tools re-check the graph and refuse.
- **“What if extraction is wrong?”** Reset validates 20 critical facts and reports failures instead of patching.
- **“Is the LLM doing anything?”** It chooses tools. Without an LLM the playbook does, and the UI says so.

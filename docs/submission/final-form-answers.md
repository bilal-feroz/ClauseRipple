# Final submission form answers

Copy and paste into the WeMakeDevs submission form. Deadline: **18 Oct 2026, 11:59 PM IST**.

## Project title

ClauseRipple: One clause changes. See what breaks.

## Description (what problem does it solve, and who is it for?)

When a vendor changes one clause in a contract, nobody can quickly see what it breaks. The facts are spread across contracts, vendor agreements, architecture docs, the team directory and old decisions.

ClauseRipple is a change impact agent built on FalkorDB. It keeps the company as one graph: customers, products, systems, vendors, regions, contracts, clauses, obligations, teams, people, decisions and source documents. When a vendor's DPA adds US processing, the graph updates with one new fact and the agent calls graph tools over MCP. It traces which systems, products and customers depend on the vendor, checks each customer's contract with a deterministic rule, recalls an earlier decision (CR-087), finds the system owner, writes impact cases (CR-104, CR-105) into FalkorDB and assigns them. Every step links to the exact source sentence. It flags Falcon Bank and Acme Insurance, and correctly clears Nova Retail (its contract allows US) and GulfGov (no path to the vendor).

It is for compliance, legal, vendor risk and platform teams who need to know, within seconds of a change, who is affected, why, and who needs to act.

## Tracks

- Track 01: Agents That Act on Connected Data
- Track 03: Company Brain

## Repository

https://github.com/bilal-feroz/ClauseRipple

## Demo video

ADD YOUR YOUTUBE LINK HERE (not recorded yet when this file was written)

## Live demo

https://clause-ripple.vercel.app

(Web on Vercel; API + FalkorDB on a free Render instance at https://clauseripple-api.onrender.com. The free instance sleeps when idle, so the first load can take about a minute. Full local setup is in the README.)

## How did you use FalkorDB?

FalkorDB is the only database in ClauseRipple and the agent's reasoning layer. Without it the product does not work.

- Company graph: 20 node labels and their relationships, built from 20 source documents (144 nodes, 173 relationships at baseline). Every relationship from a document stores its source, version, line and verbatim quote.
- Multi-hop Cypher as agent tools: the blast radius is `(Customer)-[:USES]->(Product)-[:POWERED_BY]->(System)-[:DEPENDS_ON*1..4]->(Vendor)`; contract limits come from `Contract-HAS_CLAUSE->Clause-IMPOSES->Obligation-ALLOWS->Region`; owners from `System-OWNED_BY->Team<-LEADS-Person`.
- Proof of absence: a bounded `shortestPath` that returns null proves GulfGov does not depend on the vendor.
- 10 agent tools served over MCP (in-process client, streamable HTTP at /mcp, stdio). Each tool is Cypher against FalkorDB, run during the agent loop.
- Graph writes: ChangeEvent on each document change (incremental, one new fact for the DPA update), ImpactCase + Action nodes, assignments, human approvals as new Decision nodes, and AgentRun/ToolCall memory.
- Vector index (vecf32, local bge-small embeddings) and full-text indexes for "Ask ClauseRipple"; `algo.betweenness` to find dependency chokepoints.
- The 2D map, the evidence graph and the 3D RippleSpace view all render the live FalkorDB graph; the 3D ripple order uses graph path depth.
- All Cypher is in docs/cypher/*.cypher and is loaded by the API at runtime.
- Measured locally: blast radius query median 0.86 ms FalkorDB time; a full agent run (14 tool calls, 63 reads, 13 writes) about 75 ms FalkorDB time. On a 12-question benchmark the graph had full evidence for 11/12 questions vs 2/12 for vector-only retrieval at k=5.

## Blog link

https://dev.to/bilalferoz/one-vendor-clause-changed-falkordb-found-everything-it-broke-4b68

## What did you like about FalkorDB?

- Cypher made the core reasoning short and readable. The whole blast radius is one variable-length pattern, and the same query returns the evidence (quotes stored on the edges).
- It is fast enough to run inside an agent loop without thinking about it: about 1 ms for the main multi-hop query on a laptop.
- One store for everything: graph, vector index, full-text index and agent memory, so there is no sync problem between databases.
- The Docker image with the bundled FalkorDB Browser made local setup and debugging queries very easy.
- `shortestPath` and `algo.betweenness` were useful as ready-made graph tools for an agent.

## What improvements would you like to see in FalkorDB?

- Clearer, centralised docs on Cypher differences from Neo4j. We hit several only at runtime: variable-length hop bounds must be literals, `shortestPath` only works in WITH/RETURN, and ORDER BY after aggregation must use projected columns.
- Error messages that point to the exact clause and suggest the supported form.
- More end-to-end examples for agent workflows: MCP tool servers on top of FalkorDB, storing provenance on edges, and incremental graph updates from changing documents.
- An easy way to inspect the live schema (labels, relationship types, properties, indexes) in one command or Browser view.

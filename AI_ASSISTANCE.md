# AI assistance disclosure

The hackathon allows AI coding assistants and requires disclosure. ClauseRipple was built with
**Claude Code** (Anthropic) as an AI pair-programmer.

## How Claude Code was used

- **Implementation acceleration:** scaffolding the monorepo, writing much of the FastAPI service layer, the
  extractor, the Cypher query files, the MCP server, the agent orchestrator/planners, the Next.js UI components,
  the RippleSpace scene and the tests.
- **Research:** reading the current hackathon rules and current library documentation (FalkorDB client and Cypher
  limitations, MCP Python SDK 2.x, GraphRAG-SDK, Anthropic/OpenAI SDKs), so APIs were verified rather than guessed.
- **Debugging:** e.g. FalkorDB `ORDER BY` projection errors, a Docker Desktop startup failure, React root-unmount
  warnings from 3D labels, small-model tool-calling failures.
- **Documentation:** drafting this README, architecture notes, judge prep, demo script and build log.
- **QA:** driving the app in a headless browser (Playwright) and reviewing screenshots.

## What the participant (Bilal Feroz) did

- Chose the problem and the product concept (“one clause changes — see what breaks”), the demo world and the
  target tracks, and wrote the product requirements the build followed.
- Defined the graph model's intent and reviewed the ontology, the Cypher traversals and the deterministic
  residency rule.
- Reviewed the architecture: FalkorDB as the only datastore, LLM as planner only, guarded write tools, human
  approval before anything external.
- Tested the system, reviewed the agent trace, verified the Cypher in FalkorDB Browser and the demo flow, and owns
  the submission and its explanation (see `docs/JUDGE_PREP.md`).

## Inside the product

- The running product does **not** need an LLM: without one, a clearly labelled deterministic playbook drives the
  agent's tools. With one configured (Claude, OpenAI-compatible, or a free local Ollama model), the LLM only selects
  tools; facts come from FalkorDB and compliance from deterministic rules.
- No AI-generated data is presented as real: the AtlasAI corpus is synthetic and labelled fictional.

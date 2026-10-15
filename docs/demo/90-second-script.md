# ClauseRipple — 90-second demo script

**Before recording:** `docker compose up -d falkordb`, start the API and web app, click **Reset demo**, wait for
“Baseline · DPA v1”. Browser at 1920×1080 (or 1600×960), zoom 100%. Optional: set an LLM planner in `.env` and
restart the API — the trace badge shows which planner ran.

| Time | On screen | Say |
|---|---|---|
| 0:00–0:10 | Mission control at baseline. RippleSpace calm (blue), blast radius **0 impacts**. | “Companies don't fail because nobody can *search* a clause. They fail because nobody sees everything that clause affects.” |
| 0:10–0:20 | Click **Falcon Bank** in the blast radius → *Why?* tab shows `Falcon Bank → DocSummarizer → Document Processing API → ModelCloud` and §7.2 “UAE and EU only”. All green. | “This is AtlasAI's company graph in FalkorDB — contracts, systems, vendors, owners, decisions. Falcon Bank reaches ModelCloud through two products' worth of infrastructure, and its contract allows only the UAE and the EU.” |
| 0:20–0:30 | Change panel: point at the diff `+ … and the United States (US)`. Click **Apply ModelCloud DPA v2**. | “ModelCloud just added US processing. One clause.” |
| 0:30–0:50 | RippleSpace: shockwave from ModelCloud; systems → products → customers light up in order; Falcon Bank and Acme turn red, Nova and GulfGov green. Agent trace ticks: `inspect_change`, `trace_vendor_dependents`, `find_impacted_customers`, `evaluate_residency`. | “The graph updated incrementally — exactly one new fact — and the agent woke up. It's choosing graph tools over MCP; each step is a real Cypher traversal. Watch the ripple: it follows the dependency paths FalkorDB returns, hop by hop. Falcon and Acme are in breach. Nova allowed the US. GulfGov doesn't touch ModelCloud at all — that's a proof of absence, not a guess.” |
| 0:50–1:05 | Trace: `recall_related_decisions` → **CR-087 found**; `find_owner` → **Sarah Malik / Platform Engineering**; `create_impact_case` → **CR-104**; `assign_impact_case`. Open *Impact cases* → CR-104. | “It remembered we decided this once before — CR-087 — found who owns the system from the ownership graph, wrote impact case CR-104 into FalkorDB and assigned it to Sarah. Every action owner — review, notification deadline — comes from graph relationships.” |
| 1:05–1:20 | *Why? · Falcon Bank* (or **Evidence graph** tab with the `✕ US not allowed` edge). Hover a quote. | “And every step is evidence: the architecture sentence, the contract clause, the new DPA line — verbatim, from the source. Vector search finds the changed clause. **FalkorDB finds the consequences.**” |
| 1:20–1:30 | Back on CR-104, click **Approve remediation** → “Recorded as decision CR-106”. | “And ClauseRipple doesn't stop at finding the consequences. It finds who needs to act — and gives them the evidence to act.” |

## Optional 20-second extensions

- **Guardrail beat:** *Why? · Nova Retail* → **Try create_impact_case** → “Refused by the graph (via MCP): … every
  ModelCloud region is permitted by Nova Retail §6.2.” — “The model can't open a case the graph doesn't justify.”
- **Memory beat:** reload the page, `Ctrl+K` → *“What did we decide about Falcon Bank after the ModelCloud policy
  change?”* → CR-087, CR-104 and the approval, read back from FalkorDB, with the Cypher used.
- **FalkorDB Browser:** http://localhost:3001 → graph `clause_ripple` → `MATCH p=(:Customer {name:'Falcon Bank'})-[*1..4]->(:Vendor) RETURN p`.

## Recording tips

- Keep the mouse still while the ripple plays; the agent pacing (450 ms/step) is tuned for narration.
- If anything goes wrong: **Reset demo** takes < 1 s and the run is fully repeatable.
- Upload as unlisted YouTube, ≤ 3 minutes (WeMakeDevs precedent; check the form).

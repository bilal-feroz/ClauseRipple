"""Ask ClauseRipple — questions answered from the FalkorDB company graph, with sources.

No-LLM "graph router": entity linking against live graph nodes + intent rules pick the same
graph tools the agent uses; the answer is composed from tool results (never invented). Every
answer returns the graph path, verbatim source quotes and the Cypher queries that ran.
"""

from __future__ import annotations

import re
from typing import Any

from app.graph.client import GraphClient, get_graph, meter
from app.graph.cypher import cypher
from app.ingest import embeddings
from app.services import cases, demo, evidence, impact

LINKABLE = [
    "Customer",
    "Product",
    "System",
    "Vendor",
    "Team",
    "Person",
    "DataRegion",
    "Decision",
    "ImpactCase",
]


def _catalog(g: GraphClient) -> list[dict[str, Any]]:
    return g.read(cypher()["entity_catalog"], {"labels": LINKABLE}, name="entity_catalog")


def link_entities(question: str, g: GraphClient) -> dict[str, list[dict[str, Any]]]:
    found: dict[str, list[dict[str, Any]]] = {}
    q_lower = question.lower()
    for e in _catalog(g):
        names = [e["name"]] if e["name"] else []
        if e.get("ref"):
            names.append(e["ref"])
        hit = False
        for n in names:
            if not n:
                continue
            if re.search(rf"(?<![a-z0-9]){re.escape(n.lower())}(?![a-z0-9])", q_lower):
                hit = True
        code = e.get("code")
        if code and re.search(
            rf"(?<![A-Za-z]){re.escape(code)}(?![A-Za-z])", question
        ):  # case-sensitive codes (US != us)
            hit = True
        if hit:
            found.setdefault(e["label"], []).append(e)
    return found


def _src(e: dict[str, Any]) -> dict[str, Any] | None:
    if not e.get("quote"):
        return None
    return {"type": e.get("type"), "src": e.get("src"), "line": e.get("line"), "quote": e["quote"]}


def _passages(question: str, g: GraphClient) -> tuple[list[dict[str, Any]], str]:
    vec = embeddings.embed_query(question)
    if vec is not None:
        try:
            rows = g.read(cypher()["search_chunks_vector"], {"k": 4, "vec": vec}, name="search_chunks_vector")
            return rows, "vector"
        except Exception:  # vector index unavailable -> keyword retrieval
            pass
    terms = [
        t
        for t in re.findall(r"[A-Za-z]{4,}", question)
        if t.lower()
        not in {
            "which",
            "what",
            "does",
            "that",
            "with",
            "from",
            "this",
            "were",
            "have",
            "when",
            "last",
            "time",
        }
    ]
    if not terms:
        return [], "none"
    q = "|".join(terms[:6])
    try:
        return g.read(cypher()["search_chunks_fulltext"], {"q": q}, name="search_chunks_fulltext"), "fulltext"
    except Exception:
        return [], "none"


def answer(question: str) -> dict[str, Any]:
    g = get_graph()
    question = question.strip()[:400]
    with meter() as m:
        ents = link_entities(question, g)
        result = _route(question, ents, g)
        passages, retrieval = _passages(question, g)
    result.update(
        {
            "question": question,
            "mode": "graph-router (no LLM)",
            "entities": {k: [e["name"] or e.get("ref") for e in v] for k, v in ents.items()},
            "passages": [
                {
                    "doc_id": p["doc_id"],
                    "section": p["section"],
                    "line": p["line"],
                    "text": p["text"],
                    "score": p["score"],
                }
                for p in passages[:3]
            ],
            "retrieval": retrieval,
            "cypher": m.as_dict()["queries"],
            "graph_reads": m.reads,
            "db_time_ms": round(m.db_time_ms, 3),
        }
    )
    return result


def _route(question: str, ents: dict[str, list[dict[str, Any]]], g: GraphClient) -> dict[str, Any]:
    q = question.lower()
    customer = (ents.get("Customer") or [None])[0]
    vendor = (ents.get("Vendor") or [None])[0]
    system = (ents.get("System") or [None])[0]
    case = (ents.get("ImpactCase") or [None])[0]
    region = (ents.get("DataRegion") or [None])[0]

    if case and re.search(r"\b(who|handle|owner|assigned|responsible)\b", q):
        return _case_owner(case["id"], g)
    if re.search(r"\b(decide|decided|decision|precedent|last time|remember)\b", q):
        return _decisions(customer, vendor, g)
    if region and re.search(r"\b(permit|permits|allow|allows|allowed)\b", q):
        return _customers_allowing(region, g)
    if customer and re.search(r"\bwhy\b", q):
        return _why(customer, vendor, g)
    if system and re.search(r"\b(own|owns|owner|owned|responsible|who)\b", q):
        return _owner(system, g)
    if vendor and re.search(
        r"\b(break|breaks|impact|affected|blast|unavailable|outage|down|depend|depends|changes?)\b", q
    ):
        return _blast(vendor, outage=bool(re.search(r"\b(unavailable|outage|down)\b", q)), g=g)
    if customer:
        return _why(customer, vendor, g)
    if vendor:
        return _blast(vendor, outage=False, g=g)
    if system:
        return _owner(system, g)
    return {
        "intent": "unknown",
        "answer": "I could not link that question to the company graph. Try a customer, vendor, system or case name — "
        "e.g. 'Why is Falcon Bank impacted?' or 'Who owns Document Processing API?'.",
        "path": [],
        "sources": [],
    }


def _blast(vendor: dict[str, Any], *, outage: bool, g: GraphClient) -> dict[str, Any]:
    deps = impact.vendor_dependents(vendor["id"], g)
    paths = impact.blast_radius(vendor["id"], g)
    systems = sorted({d["system_name"] for d in deps})
    products = sorted({p["product_name"] for p in paths})
    customers = sorted({p["customer_name"] for p in paths})
    sources = [s for d in deps for e in d["evidence"] if (s := _src(e))][:4]
    if outage:
        text = (
            f"If {vendor['name']} were unavailable, {len(systems)} system(s) lose a dependency ({', '.join(systems) or 'none'}), "
            f"affecting {', '.join(products) or 'no products'} and therefore {', '.join(customers) or 'no customers'}."
        )
        return {
            "intent": "vendor_outage",
            "answer": text,
            "path": [vendor["name"], *systems, *products, *customers],
            "sources": sources,
        }
    ev = impact.evaluate_residency(vendor["id"], added_regions=demo.latest_added_regions(g), g=g)
    impacted = [v for v in ev["verdicts"] if v["affected"]]
    lines = [
        f"{vendor['name']} is depended on by {', '.join(systems) or 'no systems'}, which power {', '.join(products) or 'no products'} "
        f"used by {', '.join(customers) or 'no customers'}.",
        f"With its current processing regions ({', '.join(ev['vendor_regions'])}): "
        + (
            "; ".join(
                f"{v['customer_name']} is IMPACTED ({', '.join(v['violating_regions'])} not allowed)"
                for v in impacted
            )
            or "no customer is impacted"
        )
        + ".",
    ]
    safe = [v for v in ev["verdicts"] if not v["affected"]]
    if safe:
        lines.append("Not impacted: " + "; ".join(f"{v['customer_name']} — {v['reason']}" for v in safe))
    return {
        "intent": "blast_radius",
        "answer": " ".join(lines),
        "path": [vendor["name"], *systems, *products, *customers],
        "sources": sources
        + [s for r in ev["vendor_region_evidence"][:1] if (s := _src(r | {"type": "PROCESSES_IN"}))],
    }


def _owner(system: dict[str, Any], g: GraphClient) -> dict[str, Any]:
    o = cases.system_owner(system["id"], g)
    if not o:
        return {
            "intent": "owner",
            "answer": f"No owner is recorded for {system['name']}.",
            "path": [system["name"]],
            "sources": [],
        }
    return {
        "intent": "owner",
        "answer": f"{system['name']} is owned by {o['team_name']}, led by {o['lead_name']} ({o['lead_role']}). "
        f"Team members: {', '.join(o['members'])}.",
        "path": [system["name"], o["team_name"], o["lead_name"]],
        "sources": [
            {
                "type": "OWNED_BY",
                "src": o["ownership_src"],
                "line": o["ownership_line"],
                "quote": o["ownership_quote"],
            },
            {"type": "LEADS", "src": o["lead_src"], "line": o["lead_line"], "quote": o["lead_quote"]},
        ],
    }


def _why(customer: dict[str, Any], vendor: dict[str, Any] | None, g: GraphClient) -> dict[str, Any]:
    vendor_id = vendor["id"] if vendor else "vendor:modelcloud"
    ev = impact.evaluate_residency(vendor_id, added_regions=demo.latest_added_regions(g), g=g)
    v = next(x for x in ev["verdicts"] if x["customer_id"] == customer["id"])
    bundle = evidence.evidence_bundle(customer["id"], vendor_id, g)
    path = (
        [n["name"] for n in bundle["dependency_paths"][0]["nodes"]]
        if bundle["dependency_paths"]
        else [customer["name"]]
    )
    return {
        "intent": "why",
        "answer": f"{v['customer_name']}: {v['status'].replace('_', ' ').lower()}. {v['reason']}",
        "path": path,
        "sources": [s for e in bundle["edges"] if (s := _src(e))][:5],
    }


def _customers_allowing(region: dict[str, Any], g: GraphClient) -> dict[str, Any]:
    rows = g.read(
        cypher()["customers_allowing_region"], {"code": region["code"]}, name="customers_allowing_region"
    )
    names = [f"{r['customer_name']} (§{r['clause_ref']} {r['clause_title']})" for r in rows]
    return {
        "intent": "customers_allowing_region",
        "answer": (
            f"{', '.join(names)} permit{'s' if len(names) == 1 else ''} processing in {region['name']}."
            if names
            else f"No customer contract permits processing in {region['name']}."
        ),
        "path": [region["name"], *[r["customer_name"] for r in rows]],
        "sources": [s for r in rows if (s := _src(r | {"type": "ALLOWS"}))],
    }


def _decisions(
    customer: dict[str, Any] | None, vendor: dict[str, Any] | None, g: GraphClient
) -> dict[str, Any]:
    vendor_id = vendor["id"] if vendor else "vendor:modelcloud"
    customer_id = customer["id"] if customer else ""
    rows = g.read(
        cypher()["related_decisions"],
        {"customer_id": customer_id, "vendor_id": vendor_id, "topic": "data residency"},
        name="related_decisions",
    )
    if customer:
        rows = [r for r in rows if r["matches_customer"]] or rows
    case_rows = (
        g.read(cypher()["cases_for_customer"], {"customer_id": customer_id}, name="cases_for_customer")
        if customer
        else []
    )
    parts = [f"{r['ref']} ({r['date']}): {r['decision']}" for r in rows[:4]]
    if case_rows:
        parts.append(
            "Impact cases: "
            + "; ".join(
                f"{c['ref']} {c['severity']} {c['status'].replace('_', ' ').lower()} → {c['assignee'] or 'unassigned'}"
                + (f" (resolved by {', '.join(c['resolved_by'])})" if c["resolved_by"] else "")
                for c in case_rows
            )
        )
    who = customer["name"] if customer else (vendor["name"] if vendor else "this topic")
    return {
        "intent": "decision_memory",
        "answer": (f"Company memory for {who}: " + " ".join(parts))
        if parts
        else f"No decisions recorded for {who}.",
        "path": [r["ref"] for r in rows[:4]] + [c["ref"] for c in case_rows],
        "sources": [
            {"type": "DECISION", "src": r.get("src") or "ClauseRipple approval", "quote": r["decision"]}
            for r in rows[:3]
        ],
    }


def _case_owner(case_id: str, g: GraphClient) -> dict[str, Any]:
    d = cases.case_detail(case_id, g)
    if not d:
        return {"intent": "case_owner", "answer": "That case is not in the graph.", "path": [], "sources": []}
    c = d["case"]
    return {
        "intent": "case_owner",
        "answer": f"{c['ref']} should be handled by {d['assignee'] or c['suggested_owner']} ({d['team'] or c['suggested_team']}): "
        f"they own {c['system']}, which powers {c['product']} for {d['customer']}. Recommended: {c['recommended_action']}",
        "path": [
            c["ref"],
            d["customer"],
            c["product"],
            c["system"],
            d["team"] or c["suggested_team"],
            d["assignee"] or c["suggested_owner"],
        ],
        "sources": [
            {"type": "ACTION", "src": c["ref"], "quote": a["title"] + f" → {a['owner']}"}
            for a in d["actions"]
        ],
    }

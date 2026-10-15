"""Deterministic, provenance-first fact extraction for the company corpus.

Every extracted relationship carries the exact sentence/table row it came from. The
extractor never invents facts: a relationship is produced only when a rule fires on the
document text, and every quote is verified to occur in the source document.

Pipeline:
1. reference / catalog / crm / directory documents define canonical entities
   (they build the gazetteer used for entity linking);
2. every other document is linked against that gazetteer and relation rules run per
   document kind (architecture, contract, dpa, ownership, controls, decision, ticket);
3. a post-pass derives cross-document links (controls -> obligations they satisfy).

When an LLM is configured the same Fact objects can be produced by an LLM extractor;
they must pass the same provenance checks (see app.services.validation).
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any

from app.graph.ontology import (
    OBLIGATION_CHANGE_NOTIFICATION,
    OBLIGATION_DATA_RESIDENCY,
    make_id,
    slugify,
)
from app.ingest.corpus import CorpusDocument, Sentence

EXTRACTOR_VERSION = "rules@1"

# Documents that define canonical entities are processed first (lower = earlier);
# decisions precede the tickets that implement them.
KIND_ORDER = {"reference": 0, "catalog": 1, "directory": 2, "crm": 3, "decision": 8, "ticket": 9}

_WORD_NUMBERS = {
    "seven": 7, "fourteen": 14, "thirty": 30, "forty-five": 45, "sixty": 60, "ninety": 90,
}  # fmt: skip


@dataclass(frozen=True)
class NodeFact:
    label: str
    id: str
    props: dict[str, Any]
    doc: str
    quote: str
    line: int


@dataclass(frozen=True)
class EdgeFact:
    type: str
    src: str
    dst: str
    doc: str
    doc_version: int
    quote: str
    loc: str
    line: int
    props: dict[str, Any] = field(default_factory=dict)

    @property
    def key(self) -> tuple[str, str, str]:
        return (self.src, self.type, self.dst)


@dataclass
class Extraction:
    nodes: dict[str, NodeFact] = field(default_factory=dict)
    edges: dict[tuple[str, str, str], EdgeFact] = field(default_factory=dict)
    warnings: list[str] = field(default_factory=list)

    def add_node(self, fact: NodeFact) -> None:
        existing = self.nodes.get(fact.id)
        if existing:
            merged = {**existing.props, **fact.props}
            self.nodes[fact.id] = NodeFact(
                existing.label, existing.id, merged, existing.doc, existing.quote, existing.line
            )
        else:
            self.nodes[fact.id] = fact

    def add_edge(self, fact: EdgeFact) -> None:
        self.edges.setdefault(fact.key, fact)

    def for_doc(self, doc_id: str) -> Extraction:
        out = Extraction()
        out.nodes = {k: v for k, v in self.nodes.items() if v.doc == doc_id}
        out.edges = {k: v for k, v in self.edges.items() if v.doc == doc_id}
        return out


class Gazetteer:
    """Case-sensitive, longest-match entity linker over canonical names and aliases."""

    def __init__(self) -> None:
        self._aliases: dict[str, tuple[str, str]] = {}
        self._pattern: re.Pattern[str] | None = None

    def add(self, alias: str, label: str, node_id: str) -> None:
        alias = alias.strip()
        if alias:
            self._aliases[alias] = (label, node_id)
            self._pattern = None

    def lookup(self, name: str, label: str | None = None) -> str | None:
        hit = self._aliases.get(name.strip())
        if hit and (label is None or hit[0] == label):
            return hit[1]
        return None

    def mentions(self, text: str) -> list[tuple[int, int, str, str]]:
        """Return (start, end, label, id) for each non-overlapping mention, longest first."""
        if not self._aliases:
            return []
        if self._pattern is None:
            alts = sorted(self._aliases, key=len, reverse=True)
            self._pattern = re.compile(
                r"(?<![A-Za-z0-9])(" + "|".join(re.escape(a) for a in alts) + r")(?![A-Za-z0-9])"
            )
        out = []
        for m in self._pattern.finditer(text):
            label, node_id = self._aliases[m.group(1)]
            out.append((m.start(), m.end(), label, node_id))
        return out


_NEGATION = re.compile(r"\b(not|never|no longer|without)\b", re.I)
_POWERED_BY = re.compile(r"\b(?:is|are) (?:powered|served) by\b")
_DEPENDS_ON = re.compile(r"\b(depends on|relies on|routes|sends|calls)\b")
_REGIONS_LIST = re.compile(r"following regions:\s*(.+)$")
_NOTICE = re.compile(r"\bat least ([a-z-]+) \((\d+)\) days\b", re.I)
_CLAUSE_HEADING = re.compile(r"^(\d+(?:\.\d+)+)\s+(.+)$")


class Extractor:
    def __init__(self) -> None:
        self.gaz = Gazetteer()
        self.result = Extraction()

    # ── public ────────────────────────────────────────────────────────────────
    def run(self, docs: list[CorpusDocument]) -> Extraction:
        ordered = sorted(docs, key=lambda d: (KIND_ORDER.get(d.kind, 5), d.doc_id))
        for doc in ordered:
            self._document_node(doc)
            handler = getattr(self, f"_kind_{doc.kind}", None)
            if handler is None:
                self.result.warnings.append(f"{doc.doc_id}: no extraction rules for kind {doc.kind!r}")
                continue
            handler(doc)
        self._post_pass(docs)
        self._verify_quotes(docs)
        return self.result

    # ── helpers ───────────────────────────────────────────────────────────────
    def _node(self, doc: CorpusDocument, label: str, key: str, quote: str, line: int, **props: Any) -> str:
        node_id = make_id(label, key)
        props = {k: v for k, v in props.items() if v is not None}
        self.result.add_node(NodeFact(label, node_id, props, doc.doc_id, quote, line))
        return node_id

    def _edge(
        self, doc: CorpusDocument, rel: str, src: str, dst: str, quote: str, line: int, loc: str, **props: Any
    ) -> None:
        self.result.add_edge(EdgeFact(rel, src, dst, doc.doc_id, doc.version, quote, loc, line, props))

    def _require(self, doc: CorpusDocument, name: str, label: str) -> str:
        node_id = self.gaz.lookup(name, label)
        if node_id is None:
            raise ValueError(f"{doc.doc_id}: unknown {label} {name!r} (not defined by any catalog document)")
        return node_id

    def _supporting(
        self, doc: CorpusDocument, node_id: str, fallback: str, prefer: tuple[str, ...] = ()
    ) -> Sentence:
        """Body sentence that mentions the entity (preferring the given sections); gives
        metadata-derived facts a real quote."""
        sentences = list(doc.sentences())
        ranked = [s for s in sentences if s.section in prefer] + [
            s for s in sentences if s.section not in prefer
        ]
        for s in ranked:
            if any(m[3] == node_id for m in self.gaz.mentions(s.text)):
                return s
        return Sentence(fallback, doc.body_offset_lines, "metadata")

    def _document_node(self, doc: CorpusDocument) -> None:
        self._node(
            doc,
            "Document",
            doc.doc_id,
            doc.title,
            1,
            name=doc.title,
            doc_id=doc.doc_id,
            kind=doc.kind,
            version=doc.version,
            effective_date=str(doc.meta.get("effective_date", "")) or None,
            owner=doc.meta.get("owner"),
            path=f"{doc.path.parent.name}/{doc.path.name}",
            sha256=doc.sha256,
            text=doc.body.strip(),
        )

    # ── entity-defining kinds ─────────────────────────────────────────────────
    def _kind_reference(self, doc: CorpusDocument) -> None:
        for rows in doc.tables():
            for r in rows:
                code = r.cells["Code"]
                node_id = self._node(
                    doc, "DataRegion", code, r.raw, r.line, name=r.cells["Region"], code=code
                )
                for alias in [code, r.cells["Region"], *r.cells.get("Aliases", "").split(",")]:
                    self.gaz.add(alias, "DataRegion", node_id)

    def _kind_catalog(self, doc: CorpusDocument) -> None:
        specs = (
            ("Products", "Product", "Product"),
            ("Systems", "System", "System"),
            ("Vendors", "Vendor", "Vendor"),
        )
        for section, label, col in specs:
            for rows in doc.tables(rf"^{section}$"):
                for r in rows:
                    name = r.cells[col]
                    props: dict[str, Any] = {"name": name, "description": r.cells.get("Description")}
                    if label == "System":
                        props["tier"] = r.cells.get("Tier")
                    if label == "Vendor":
                        props["service"] = r.cells.get("Service")
                        props["agreement_doc"] = r.cells.get("Agreement")
                    node_id = self._node(doc, label, name, r.raw, r.line, **props)
                    self.gaz.add(name, label, node_id)

    def _kind_directory(self, doc: CorpusDocument) -> None:
        for rows in doc.tables():
            for r in rows:
                team_name, person_name, role = r.cells["Team"], r.cells["Name"], r.cells["Role"]
                team_id = self._node(doc, "Team", team_name, r.raw, r.line, name=team_name)
                self.gaz.add(team_name, "Team", team_id)
                person_id = self._node(doc, "Person", person_name, r.raw, r.line, name=person_name, role=role)
                self.gaz.add(person_name, "Person", person_id)
                self._edge(doc, "MEMBER_OF", person_id, team_id, r.raw, r.line, "Directory")
                if re.search(r"\b(Lead|Head)\b", role):
                    self._edge(doc, "LEADS", person_id, team_id, r.raw, r.line, "Directory")

    def _kind_crm(self, doc: CorpusDocument) -> None:
        for rows in doc.tables():
            for r in rows:
                name = r.cells["Customer"]
                node_id = self._node(
                    doc,
                    "Customer",
                    name,
                    r.raw,
                    r.line,
                    name=name,
                    segment=r.cells.get("Segment"),
                    regulated=r.cells.get("Regulated", "").lower() == "yes",
                    headquarters=r.cells.get("Headquarters"),
                )
                self.gaz.add(name, "Customer", node_id)
                manager = r.cells.get("Account manager")
                if manager:
                    person_id = self._require(doc, manager, "Person")
                    self._edge(
                        doc, "ACCOUNT_MANAGER_FOR", person_id, node_id, r.raw, r.line, "Customer register"
                    )

    # ── relation kinds ────────────────────────────────────────────────────────
    def _kind_ownership(self, doc: CorpusDocument) -> None:
        for rows in doc.tables():
            for r in rows:
                system_id = self._require(doc, r.cells["System"], "System")
                team_id = self._require(doc, r.cells["Owning team"], "Team")
                self._edge(doc, "OWNED_BY", system_id, team_id, r.raw, r.line, "Ownership register")

    def _kind_controls(self, doc: CorpusDocument) -> None:
        for rows in doc.tables():
            for r in rows:
                ref = r.cells["Control"]
                satisfies = r.cells.get("Satisfies", "")
                obligation_type = (
                    OBLIGATION_DATA_RESIDENCY
                    if "residency" in satisfies.lower()
                    else OBLIGATION_CHANGE_NOTIFICATION
                    if "notification" in satisfies.lower()
                    else None
                )
                control_id = self._node(
                    doc, "Control", ref, r.raw, r.line,
                    name=r.cells["Name"], ref=ref, satisfies_type=obligation_type,
                )  # fmt: skip
                self.gaz.add(ref, "Control", control_id)
                team_id = self._require(doc, r.cells["Owner"], "Team")
                self._edge(doc, "OWNED_BY", control_id, team_id, r.raw, r.line, "Controls register")
                impl = r.cells.get("Implemented in", "").strip()
                if impl and impl not in {"—", "-"}:
                    system_id = self._require(doc, impl, "System")
                    self._edge(
                        doc, "IMPLEMENTED_IN", control_id, system_id, r.raw, r.line, "Controls register"
                    )

    def _kind_architecture(self, doc: CorpusDocument) -> None:
        for s in doc.sentences():
            mentions = self.gaz.mentions(s.text)
            if len(mentions) < 2:
                continue
            if _NEGATION.search(s.text):
                # e.g. "The Local Inference Service does not call ModelCloud" -> no edge.
                continue
            for rule, rel, subj_labels, obj_labels in (
                (_POWERED_BY, "POWERED_BY", {"Product"}, {"System"}),
                (_DEPENDS_ON, "DEPENDS_ON", {"System"}, {"Vendor", "System"}),
            ):
                verb = rule.search(s.text)
                if not verb:
                    continue
                subjects = [m for m in mentions if m[1] <= verb.start() and m[2] in subj_labels]
                objects = [m for m in mentions if m[0] >= verb.end() and m[2] in obj_labels]
                if not subjects or not objects:
                    continue
                subject = subjects[-1]
                for obj in objects:
                    if obj[3] != subject[3]:
                        self._edge(doc, rel, subject[3], obj[3], s.text, s.line, s.section)

    def _kind_contract(self, doc: CorpusDocument) -> None:
        customer_id = self._require(doc, str(doc.meta["customer"]), "Customer")
        contract_ref = str(doc.meta.get("contract_id", doc.doc_id))
        parties = next((s for s in doc.sentences() if "entered into between" in s.text), None)
        if parties is None:
            raise ValueError(f"{doc.doc_id}: no parties sentence")
        contract_id = self._node(
            doc, "Contract", contract_ref, parties.text, parties.line,
            name=doc.title, ref=contract_ref, effective_date=str(doc.meta.get("effective_date", "")),
        )  # fmt: skip
        self._edge(doc, "BOUND_BY", customer_id, contract_id, parties.text, parties.line, "Preamble")
        self._edge(doc, "SOURCE_OF", make_id("Document", doc.doc_id), contract_id, doc.title, 1, "Document")

        for b in doc.bullets(r"Subscribed Services"):
            for _, _, label, node_id in self.gaz.mentions(b.text):
                if label == "Product":
                    self._edge(doc, "USES", customer_id, node_id, b.text, b.line, b.section)

        for sec in doc.sections:
            m = _CLAUSE_HEADING.match(sec.title)
            if not m:
                continue
            ref, title = m.group(1), m.group(2)
            text = re.sub(r"\s+", " ", " ".join(t for _, t in sec.lines if t.strip())).strip()
            clause_id = self._node(
                doc, "Clause", f"{contract_ref}:{ref}", sec.title, sec.line,
                name=f"{doc.meta['customer']} §{ref} {title}", ref=ref, title=title, text=text,
                contract_ref=contract_ref,
            )  # fmt: skip
            self._edge(doc, "HAS_CLAUSE", contract_id, clause_id, sec.title, sec.line, f"§{ref}")
            clause_sentences = [s for s in doc.sentences() if s.section == sec.title]
            for s in clause_sentences:
                regions = _REGIONS_LIST.search(s.text)
                if regions:
                    ob_id = self._node(
                        doc, "Obligation", f"{contract_ref}:{ref}:residency", s.text, s.line,
                        name=f"{doc.meta['customer']} data residency (§{ref})",
                        type=OBLIGATION_DATA_RESIDENCY, clause_ref=ref,
                    )  # fmt: skip
                    self._edge(doc, "IMPOSES", clause_id, ob_id, s.text, s.line, f"§{ref}")
                    for _, _, label, region_id in self.gaz.mentions(regions.group(1)):
                        if label == "DataRegion":
                            self._edge(doc, "ALLOWS", ob_id, region_id, s.text, s.line, f"§{ref}")
                notice = _NOTICE.search(s.text)
                if notice and "notify" in s.text.lower():
                    days = int(notice.group(2))
                    word = notice.group(1).lower()
                    if word in _WORD_NUMBERS and _WORD_NUMBERS[word] != days:
                        self.result.warnings.append(
                            f"{doc.doc_id} §{ref}: notice period words/digits disagree"
                        )
                    ob_id = self._node(
                        doc, "Obligation", f"{contract_ref}:{ref}:notification", s.text, s.line,
                        name=f"{doc.meta['customer']} change notification (§{ref})",
                        type=OBLIGATION_CHANGE_NOTIFICATION, clause_ref=ref, notice_days=days,
                    )  # fmt: skip
                    self._edge(doc, "IMPOSES", clause_id, ob_id, s.text, s.line, f"§{ref}")

    def _kind_dpa(self, doc: CorpusDocument) -> None:
        vendor_id = self._require(doc, str(doc.meta["vendor"]), "Vendor")
        found = False
        for s in doc.sentences():
            regions = _REGIONS_LIST.search(s.text)
            if not regions or _NEGATION.search(s.text):
                continue
            for _, _, label, region_id in self.gaz.mentions(regions.group(1)):
                if label == "DataRegion":
                    found = True
                    self._edge(doc, "PROCESSES_IN", vendor_id, region_id, s.text, s.line, s.section)
        if not found:
            self.result.warnings.append(f"{doc.doc_id}: no processing regions found")

    def _kind_decision(self, doc: CorpusDocument) -> None:
        meta = doc.meta
        ref = str(meta["decision_id"])
        decision = doc.section_text(r"^Decision$")
        if decision is None:
            raise ValueError(f"{doc.doc_id}: decision record has no 'Decision' section")
        text, line, _ = decision
        topics = [str(t) for t in meta.get("topics", [])]
        decision_id = self._node(
            doc, "Decision", ref, text, line,
            name=doc.title, ref=ref, date=str(meta.get("date", "")), status=str(meta.get("status", "")),
            topics=topics, decision=text, seq=int(re.sub(r"\D", "", ref) or 0),
        )  # fmt: skip
        self._edge(doc, "SOURCE_OF", make_id("Document", doc.doc_id), decision_id, doc.title, 1, "Document")
        links = (
            ("customer", "Customer", "APPLIES_TO"),
            ("vendor", "Vendor", "INVOLVES"),
            ("system", "System", "CONCERNS"),
            ("made_by", "Person", "MADE_BY"),
            ("approved_by", "Team", "APPROVED_BY"),
        )
        for key, label, rel in links:
            value = str(meta.get(key, "") or "").strip()
            if not value or value.lower() == "none":
                continue
            target = self._require(doc, value, label)
            s = self._supporting(doc, target, f"{key}: {value}", prefer=("Decision", "Approval"))
            self._edge(doc, rel, decision_id, target, s.text, s.line, s.section)

    def _kind_ticket(self, doc: CorpusDocument) -> None:
        meta = doc.meta
        ref = str(meta["ticket_id"])
        resolution = doc.section_text(r"^Resolution$") or doc.section_text(r"^Description$")
        text, line, _ = resolution if resolution else (doc.title, 1, "")
        ticket_id = self._node(
            doc,
            "Ticket",
            ref,
            text,
            line,
            name=doc.title,
            ref=ref,
            status=str(meta.get("status", "")),
            summary=text,
        )
        self._edge(doc, "SOURCE_OF", make_id("Document", doc.doc_id), ticket_id, doc.title, 1, "Document")
        implements = meta.get("implements")
        if implements:
            decision_id = make_id("Decision", str(implements))
            if decision_id not in self.result.nodes:
                raise ValueError(f"{doc.doc_id}: implements unknown decision {implements}")
            s = next((x for x in doc.sentences() if str(implements) in x.text), None)
            quote = s or Sentence(f"implements: {implements}", 1, "metadata")
            self._edge(doc, "IMPLEMENTS", ticket_id, decision_id, quote.text, quote.line, quote.section)
        for key, label, rel in (("system", "System", "CONCERNS"), ("assignee", "Person", "ASSIGNED_TO")):
            value = str(meta.get(key, "") or "").strip()
            if value:
                target = self._require(doc, value, label)
                s = self._supporting(doc, target, f"{key}: {value}")
                self._edge(doc, rel, ticket_id, target, s.text, s.line, s.section)

    # ── post-pass ─────────────────────────────────────────────────────────────
    def _post_pass(self, docs: list[CorpusDocument]) -> None:
        by_id = {d.doc_id: d for d in docs}
        obligations = [n for n in self.result.nodes.values() if n.label == "Obligation"]
        for control in [n for n in self.result.nodes.values() if n.label == "Control"]:
            ob_type = control.props.get("satisfies_type")
            doc = by_id[control.doc]
            for ob in obligations:
                if ob.props.get("type") == ob_type:
                    self._edge(
                        doc,
                        "SATISFIED_BY",
                        ob.id,
                        control.id,
                        control.quote,
                        control.line,
                        "Controls register",
                    )

    def _verify_quotes(self, docs: list[CorpusDocument]) -> None:
        by_id = {d.doc_id: d for d in docs}
        for e in self.result.edges.values():
            doc = by_id[e.doc]
            if e.loc not in {"Document", "metadata"} and not doc.contains_quote(e.quote):
                raise ValueError(f"Provenance check failed: quote for {e.key} not found in {e.doc}")


def extract(docs: list[CorpusDocument]) -> Extraction:
    return Extractor().run(docs)


def chunk_documents(docs: list[CorpusDocument]) -> list[dict[str, Any]]:
    """Paragraph chunks (retrieval units for vector / full-text search)."""
    chunks: list[dict[str, Any]] = []
    for doc in docs:
        n = 0
        for sec in doc.sections:
            para: list[tuple[int, str]] = []
            for line_no, text in [*sec.lines, (-1, "")]:
                if text.strip():
                    para.append((line_no, text))
                    continue
                if para:
                    body = re.sub(r"\s+", " ", " ".join(t for _, t in para)).strip()
                    if len(body) > 30:
                        n += 1
                        chunks.append(
                            {
                                "id": f"chunk:{slugify(doc.doc_id)}:{n}",
                                "doc_id": doc.doc_id,
                                "doc_node": make_id("Document", doc.doc_id),
                                "seq": n,
                                "section": sec.title,
                                "line": para[0][0],
                                "text": body,
                                "name": f"{doc.title} — {sec.title}",
                            }
                        )
                    para = []
    return chunks

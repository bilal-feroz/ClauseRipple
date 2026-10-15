"""ClauseRipple company-graph ontology.

Kept deliberately small and explainable. Every node has a stable string ``id`` of the
form ``<prefix>:<slug>`` (the prefix identifies the label) plus a display ``name``.
Relationships derived from documents carry provenance properties:
``src`` (document id), ``src_ver`` (document version), ``quote`` (exact excerpt) and ``loc``.
"""

from __future__ import annotations

import re
import unicodedata

# label -> id prefix
NODE_LABELS: dict[str, str] = {
    # company knowledge (extracted from documents)
    "Customer": "customer",
    "Product": "product",
    "System": "system",
    "Vendor": "vendor",
    "DataRegion": "region",
    "Contract": "contract",
    "Clause": "clause",
    "Obligation": "obligation",
    "Control": "control",
    "Team": "team",
    "Person": "person",
    "Decision": "decision",
    "Ticket": "ticket",
    "Document": "doc",
    "Chunk": "chunk",
    # operational memory (written by the agent / workflow)
    "ChangeEvent": "change",
    "ImpactCase": "case",
    "Action": "action",
    "AgentRun": "run",
    "ToolCall": "toolcall",
}
PREFIX_TO_LABEL = {v: k for k, v in NODE_LABELS.items()}

REL_TYPES: frozenset[str] = frozenset(
    {
        # knowledge
        "USES",
        "BOUND_BY",
        "HAS_CLAUSE",
        "IMPOSES",
        "ALLOWS",
        "SATISFIED_BY",
        "POWERED_BY",
        "DEPENDS_ON",
        "PROCESSES_IN",
        "OWNED_BY",
        "MEMBER_OF",
        "LEADS",
        "ACCOUNT_MANAGER_FOR",
        "IMPLEMENTED_IN",
        "APPLIES_TO",
        "INVOLVES",
        "CONCERNS",
        "MADE_BY",
        "APPROVED_BY",
        "IMPLEMENTS",
        "ASSIGNED_TO",
        "SOURCE_OF",
        "PART_OF",
        # change + agent memory
        "CHANGED",
        "INTRODUCED",
        "RETRACTED",
        "TRIGGERED_BY",
        "EXECUTED",
        "TOUCHED",
        "CREATED",
        "REFERENCED",
        "AFFECTS",
        "CAUSED_BY",
        "VIOLATES",
        "RELATED_TO",
        "SUPPORTED_BY",
        "ORIGINATED_FROM",
        "HAS_ACTION",
        "RESOLVES",
    }
)

# Labels shown in the product's graph views (Documents/Chunks/ToolCalls are evidence/memory
# plumbing and are surfaced through the evidence drawer and agent trace instead).
VISIBLE_LABELS: tuple[str, ...] = (
    "Customer",
    "Product",
    "System",
    "Vendor",
    "DataRegion",
    "Contract",
    "Clause",
    "Obligation",
    "Control",
    "Team",
    "Person",
    "Decision",
    "Ticket",
    "ChangeEvent",
    "ImpactCase",
    "Action",
    "AgentRun",
)
VISIBLE_REL_TYPES: tuple[str, ...] = tuple(
    sorted(REL_TYPES - {"SOURCE_OF", "PART_OF", "EXECUTED", "TOUCHED", "SUPPORTED_BY"})
)

OBLIGATION_DATA_RESIDENCY = "DATA_RESIDENCY"
OBLIGATION_CHANGE_NOTIFICATION = "CHANGE_NOTIFICATION"


def slugify(value: str) -> str:
    value = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode("ascii")
    value = re.sub(r"[^A-Za-z0-9.]+", "-", value).strip("-").lower()
    return value


def make_id(label: str, key: str) -> str:
    if label not in NODE_LABELS:
        raise ValueError(f"Unknown label: {label}")
    return f"{NODE_LABELS[label]}:{slugify(key)}"


def label_of(node_id: str) -> str:
    prefix = node_id.split(":", 1)[0]
    try:
        return PREFIX_TO_LABEL[prefix]
    except KeyError as exc:
        raise ValueError(f"Cannot infer label from id {node_id!r}") from exc


def assert_label(label: str) -> str:
    """Labels cannot be Cypher parameters, so every interpolated label is whitelisted here."""
    if label not in NODE_LABELS:
        raise ValueError(f"Label not allowed: {label!r}")
    return label


def assert_rel_type(rel_type: str) -> str:
    if rel_type not in REL_TYPES:
        raise ValueError(f"Relationship type not allowed: {rel_type!r}")
    return rel_type

import re
from pathlib import Path

import pytest

from app.config import get_settings
from app.graph.cypher import cypher
from app.ingest.corpus import load_corpus, parse_document
from app.ingest.extractor import chunk_documents, extract


@pytest.fixture(scope="module")
def corpus():
    return load_corpus(get_settings().demo_dir / "v1")


@pytest.fixture(scope="module")
def extraction(corpus):
    return extract(corpus)


def edges(ex, rel):
    return {(e.src, e.dst) for e in ex.edges.values() if e.type == rel}


def test_extraction_is_clean(extraction):
    assert extraction.warnings == []
    assert len(extraction.nodes) > 50 and len(extraction.edges) > 90


def test_dependency_chain(extraction):
    assert ("customer:falcon-bank", "product:docsummarizer") in edges(extraction, "USES")
    assert ("product:docsummarizer", "system:document-processing-api") in edges(extraction, "POWERED_BY")
    assert ("system:document-processing-api", "vendor:modelcloud") in edges(extraction, "DEPENDS_ON")
    assert ("system:claims-pipeline", "vendor:modelcloud") in edges(extraction, "DEPENDS_ON")


def test_negated_dependency_is_not_extracted(extraction):
    # local_search_architecture.md: "The Local Inference Service does not call ModelCloud ..."
    assert ("system:local-inference-service", "vendor:modelcloud") not in edges(extraction, "DEPENDS_ON")
    assert ("system:local-inference-service", "vendor:oryx-sovereign-cloud") in edges(
        extraction, "DEPENDS_ON"
    )


def test_residency_obligations(extraction):
    allows = edges(extraction, "ALLOWS")
    falcon = {d for s, d in allows if s.startswith("obligation:fb-msa-2025-7.2")}
    nova = {d for s, d in allows if s.startswith("obligation:nova-msa-2026-6.2")}
    gulf = {d for s, d in allows if s.startswith("obligation:gg-gsa-2025-9.1")}
    assert falcon == {"region:uae", "region:eu"}
    assert nova == {"region:uae", "region:eu", "region:us"}
    assert gulf == {"region:uae"}  # "may leave the United Arab Emirates" sentence is not an allowance


def test_notice_period_parsed(extraction):
    notices = {n.id: n.props["notice_days"] for n in extraction.nodes.values() if n.props.get("notice_days")}
    assert notices["obligation:fb-msa-2025-7.4-notification"] == 30
    assert notices["obligation:acme-msa-2025-8.5-notification"] == 45


def test_every_quote_is_verbatim_in_its_source(corpus, extraction):
    by_id = {d.doc_id: d for d in corpus}
    for e in extraction.edges.values():
        if e.loc in {"Document", "metadata"}:
            continue
        assert by_id[e.doc].contains_quote(e.quote), e.key


def test_v2_dpa_adds_exactly_us(corpus):
    v2 = parse_document(get_settings().demo_dir / "v2" / "modelcloud_dpa.md")
    docs = [d for d in corpus if d.doc_id != "modelcloud_dpa"] + [v2]
    ex = extract(docs).for_doc("modelcloud_dpa")
    assert {e.dst for e in ex.edges.values() if e.type == "PROCESSES_IN"} == {
        "region:uae",
        "region:eu",
        "region:us",
    }


def test_chunks(corpus):
    chunks = chunk_documents(corpus)
    assert chunks and all(c["text"] and c["doc_id"] for c in chunks)
    assert len({c["id"] for c in chunks}) == len(chunks)


def test_every_documented_query_is_used_by_the_code():
    """docs/cypher is the executed Cypher: each documented query must be referenced by the API."""
    code = "\n".join(p.read_text(encoding="utf-8") for p in Path("app").rglob("*.py"))
    unused = [name for name in cypher().names() if not re.search(rf"[\"']{name}[\"']", code)]
    assert unused == []

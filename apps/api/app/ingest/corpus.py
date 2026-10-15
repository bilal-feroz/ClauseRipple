"""Loading and structural parsing of the company corpus (Markdown + YAML front matter)."""

from __future__ import annotations

import hashlib
import re
from collections.abc import Iterator
from dataclasses import dataclass, field
from pathlib import Path

import yaml

_FRONT_MATTER = re.compile(r"\A---\r?\n(.*?)\r?\n---\r?\n", re.S)
_HEADING = re.compile(r"^(#{1,6})\s+(.*?)\s*$")
_SENTENCE_END = re.compile(r"(?<=[.;!?])\s+(?=[A-Z\"(])")
MAX_DOC_BYTES = 256 * 1024


@dataclass(frozen=True)
class Sentence:
    text: str  # whitespace-normalised sentence (used as the provenance quote)
    line: int  # 1-based line number in the original file
    section: str  # nearest heading text


@dataclass(frozen=True)
class TableRow:
    cells: dict[str, str]
    raw: str
    line: int
    section: str


@dataclass
class Section:
    title: str
    level: int
    line: int
    lines: list[tuple[int, str]] = field(default_factory=list)


@dataclass
class CorpusDocument:
    doc_id: str
    path: Path
    meta: dict
    raw: str
    body: str
    body_offset_lines: int
    sections: list[Section]

    @property
    def kind(self) -> str:
        return str(self.meta.get("kind", "document"))

    @property
    def title(self) -> str:
        return str(self.meta.get("title", self.doc_id))

    @property
    def version(self) -> int:
        return int(self.meta.get("version", 1))

    @property
    def sha256(self) -> str:
        return hashlib.sha256(self.raw.encode("utf-8")).hexdigest()

    # ── structure helpers ─────────────────────────────────────────────────────
    def sentences(self) -> Iterator[Sentence]:
        for sec in self.sections:
            for para in _paragraphs(sec.lines):
                if para[0][1].lstrip().startswith(("|", "-", "*", "#")):
                    continue
                yield from _split_sentences(para, sec.title)

    def bullets(self, section_pattern: str) -> Iterator[Sentence]:
        pat = re.compile(section_pattern, re.I)
        for sec in self.sections:
            if not pat.search(sec.title):
                continue
            for line_no, text in sec.lines:
                s = text.strip()
                if s.startswith(("- ", "* ")):
                    yield Sentence(_norm(s[2:]), line_no, sec.title)

    def tables(self, section_pattern: str | None = None) -> Iterator[list[TableRow]]:
        pat = re.compile(section_pattern, re.I) if section_pattern else None
        for sec in self.sections:
            if pat and not pat.search(sec.title):
                continue
            block: list[tuple[int, str]] = []
            for line_no, text in [*sec.lines, (-1, "")]:
                if text.strip().startswith("|"):
                    block.append((line_no, text.strip()))
                    continue
                if block:
                    rows = _parse_table(block, sec.title)
                    if rows:
                        yield rows
                    block = []

    def section_text(self, title_pattern: str) -> tuple[str, int, str] | None:
        pat = re.compile(title_pattern, re.I)
        for sec in self.sections:
            if pat.search(sec.title):
                text = _norm(" ".join(t for _, t in sec.lines if t.strip()))
                first = next((n for n, t in sec.lines if t.strip()), sec.line)
                return text, first, sec.title
        return None

    def contains_quote(self, quote: str) -> bool:
        return _norm(quote) in _norm(self.body)


def _norm(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


def _paragraphs(lines: list[tuple[int, str]]) -> Iterator[list[tuple[int, str]]]:
    para: list[tuple[int, str]] = []
    for line_no, text in lines:
        if text.strip():
            para.append((line_no, text))
        elif para:
            yield para
            para = []
    if para:
        yield para


def _split_sentences(para: list[tuple[int, str]], section: str) -> Iterator[Sentence]:
    joined = "\n".join(t for _, t in para)
    start_line = para[0][0]
    pos = 0
    for m in [*_SENTENCE_END.finditer(joined), None]:
        end = m.start() if m else len(joined)
        chunk = joined[pos:end]
        if chunk.strip():
            lead = len(chunk) - len(chunk.lstrip())
            line = start_line + joined[: pos + lead].count("\n")
            yield Sentence(_norm(chunk), line, section)
        if m:
            pos = m.end()


def _parse_table(block: list[tuple[int, str]], section: str) -> list[TableRow]:
    def cells(row: str) -> list[str]:
        return [c.strip() for c in row.strip().strip("|").split("|")]

    if len(block) < 3:
        return []
    header = cells(block[0][1])
    rows: list[TableRow] = []
    for line_no, raw in block[2:]:
        values = cells(raw)
        rows.append(TableRow(dict(zip(header, values, strict=False)), _norm(raw), line_no, section))
    return rows


def parse_document(path: Path) -> CorpusDocument:
    raw = path.read_text(encoding="utf-8")
    if len(raw.encode("utf-8")) > MAX_DOC_BYTES:
        raise ValueError(f"{path.name} exceeds {MAX_DOC_BYTES} bytes")
    m = _FRONT_MATTER.match(raw)
    if not m:
        raise ValueError(f"{path.name}: missing YAML front matter")
    meta = yaml.safe_load(m.group(1)) or {}
    if not isinstance(meta, dict) or "doc_id" not in meta:
        raise ValueError(f"{path.name}: front matter must define doc_id")
    body = raw[m.end() :]
    offset = raw[: m.end()].count("\n")
    sections: list[Section] = [Section(title=str(meta.get("title", "")), level=0, line=offset + 1)]
    for i, line in enumerate(body.splitlines(), start=offset + 1):
        h = _HEADING.match(line)
        if h:
            sections.append(Section(title=h.group(2).strip(), level=len(h.group(1)), line=i))
            continue
        sections[-1].lines.append((i, line))
    return CorpusDocument(
        doc_id=str(meta["doc_id"]),
        path=path,
        meta=meta,
        raw=raw,
        body=body,
        body_offset_lines=offset,
        sections=sections,
    )


def load_corpus(directory: Path) -> list[CorpusDocument]:
    docs = [parse_document(p) for p in sorted(directory.glob("*.md"))]
    ids = [d.doc_id for d in docs]
    dupes = {i for i in ids if ids.count(i) > 1}
    if dupes:
        raise ValueError(f"Duplicate doc_id(s): {sorted(dupes)}")
    return docs

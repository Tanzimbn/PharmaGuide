"""PDF extraction (P1 task #4).

Per-page extraction with pdfplumber:
- native text in reading order (extract_text)
- tables as structured markdown (NOT flattened) — FR-R1
- figures: pixels skipped; any caption is plain page text and is already
  captured by extract_text, so no image processing is needed (OQ-2 / arch §5)

Output is a list of `PageExtract`, each carrying its 1-based `page_number`
so downstream chunks can cite the page (OQ-2 page-level citation).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

import pdfplumber


@dataclass
class Block:
    """A unit of page content. `kind` is 'text' or 'table'."""

    kind: str
    content: str


@dataclass
class PageExtract:
    page_number: int  # 1-based
    blocks: list[Block] = field(default_factory=list)

    @property
    def is_empty(self) -> bool:
        return all(not b.content.strip() for b in self.blocks)


def _table_to_markdown(rows: list[list[str | None]]) -> str:
    """Render a table as GitHub-flavored markdown, preserving cells.

    Empty/None cells become blank; ragged rows are padded to the widest row.
    """
    cleaned = [[("" if c is None else str(c).strip()) for c in row] for row in rows]
    cleaned = [r for r in cleaned if any(cell for cell in r)]
    if not cleaned:
        return ""
    width = max(len(r) for r in cleaned)
    cleaned = [r + [""] * (width - len(r)) for r in cleaned]

    header = cleaned[0]
    body = cleaned[1:]
    lines = [
        "| " + " | ".join(header) + " |",
        "| " + " | ".join("---" for _ in range(width)) + " |",
    ]
    for row in body:
        lines.append("| " + " | ".join(row) + " |")
    return "\n".join(lines)


def extract_pdf(path: str | Path) -> list[PageExtract]:
    """Extract one PDF into per-page text + table blocks."""
    pages: list[PageExtract] = []
    with pdfplumber.open(str(path)) as pdf:
        for i, page in enumerate(pdf.pages, start=1):
            blocks: list[Block] = []

            text = page.extract_text() or ""
            if text.strip():
                blocks.append(Block(kind="text", content=text.strip()))

            for table in page.extract_tables():
                md = _table_to_markdown(table)
                if md:
                    blocks.append(Block(kind="table", content=md))

            pages.append(PageExtract(page_number=i, blocks=blocks))
    return pages


def page_count(path: str | Path) -> int:
    """Page count without full extraction (used by upload guardrails, task #7)."""
    with pdfplumber.open(str(path)) as pdf:
        return len(pdf.pages)

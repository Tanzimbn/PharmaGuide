"""Stateless PDF extraction service for the mobile app (Track B, M1).

The one ingestion step that can't run on-device: table-aware extraction needs
pdfplumber (Python). The mobile app POSTs a PDF here and gets back per-page
text + table-markdown blocks; everything else (chunk, embed, store) happens on
the phone. This service stores nothing — read upload, extract, return, discard.

The extraction logic is PORTED VERBATIM from
`backend/app/ingestion/extract.py` (Block / PageExtract / _table_to_markdown /
extract_pdf). Keep the two in sync until they're factored into a shared package
(mobile.md §11). Deliberately torch-free so this deploys on free-tier hosting.
"""

from __future__ import annotations

import tempfile
from dataclasses import dataclass, field
from pathlib import Path

import pdfplumber
from fastapi import FastAPI, File, HTTPException, UploadFile

app = FastAPI(title="PharmaGuide extraction service", version="0.1.0")


# --- ported from backend/app/ingestion/extract.py -------------------------


@dataclass
class Block:
    """A unit of page content. `kind` is 'text' or 'table'."""

    kind: str
    content: str


@dataclass
class PageExtract:
    page_number: int  # 1-based
    blocks: list[Block] = field(default_factory=list)


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


# --- HTTP boundary --------------------------------------------------------


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/extract")
async def extract(file: UploadFile = File(...)) -> dict:
    """PDF (multipart) -> {page_count, pages:[{page_number, blocks:[{kind,content}]}]}.

    Stores nothing: the upload is written to a temp file, extracted, and removed.
    Page/size guardrails are enforced on-device before the upload (the app owns
    the documents row); this service just extracts.
    """
    if file.content_type not in ("application/pdf", "application/octet-stream"):
        # DocumentPicker sometimes sends octet-stream; reject anything else early.
        raise HTTPException(status_code=415, detail="expected a PDF upload")

    tmp = tempfile.NamedTemporaryFile(suffix=".pdf", delete=False)
    try:
        tmp.write(await file.read())
        tmp.flush()
        tmp.close()
        try:
            pages = extract_pdf(tmp.name)
        except Exception as exc:  # malformed/encrypted PDF, etc.
            raise HTTPException(status_code=422, detail=f"could not extract PDF: {exc}")
    finally:
        Path(tmp.name).unlink(missing_ok=True)

    return {
        "page_count": len(pages),
        "pages": [
            {
                "page_number": p.page_number,
                "blocks": [{"kind": b.kind, "content": b.content} for b in p.blocks],
            }
            for p in pages
        ],
    }

"""Chunk-parity fixture generator (M1 verification).

Runs the WEB chunker (backend/app/ingestion/chunk.py) on a sample PDF and writes:
  - extract.json   the per-page blocks (input for the TS side)
  - py_chunks.json the Python chunk output (page_number, text, token_count)

The TS side (chunk_parity.ts) reads extract.json, runs the ported chunkPages,
and asserts its output matches py_chunks.json. Run this first, then the TS check.

Usage:
  ../../backend/.venv/bin/python chunk_parity.py [sample.pdf]
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

# Make the backend package importable.
ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))

from app.ingestion.chunk import chunk_pages  # noqa: E402
from app.ingestion.extract import PageExtract, Block, extract_pdf  # noqa: E402

OUT = Path(__file__).parent
DEFAULT_PDF = ROOT / "mobile" / "extract-service" / "samples" / "sample.pdf"


def _synthetic_pages() -> list[PageExtract]:
    """Pages that exercise the branches the tiny sample PDF doesn't: multi-chunk
    packing + overlap between text chunks, and an oversized single paragraph that
    must be window-split. Word tokens are intentionally distinct so any drift in
    boundaries/overlap shows up as a text mismatch."""
    many_paras = "\n\n".join(
        " ".join(f"w{p}-{i}" for i in range(80)) for p in range(20)
    )  # 20 paras x 80 words -> spans several 512-token chunks with overlap
    huge_para = " ".join(f"x{i}" for i in range(1300))  # one >512-token paragraph
    return [
        PageExtract(page_number=1, blocks=[Block(kind="text", content=many_paras)]),
        PageExtract(
            page_number=2,
            blocks=[
                Block(kind="text", content=huge_para),
                Block(kind="table", content="| A | B |\n| --- | --- |\n| 1 | 2 |"),
            ],
        ),
    ]


def _dump(name: str, pages: list[PageExtract]) -> int:
    extract = [
        {
            "page_number": p.page_number,
            "blocks": [{"kind": b.kind, "content": b.content} for b in p.blocks],
        }
        for p in pages
    ]
    chunks = [
        {"page_number": c.page_number, "text": c.text, "token_count": c.token_count}
        for c in chunk_pages(pages)
    ]
    (OUT / f"{name}_extract.json").write_text(json.dumps(extract, ensure_ascii=False, indent=2))
    (OUT / f"{name}_chunks.json").write_text(json.dumps(chunks, ensure_ascii=False, indent=2))
    print(f"  {name}: {len(extract)} pages -> {len(chunks)} chunks")
    return len(chunks)


def main() -> int:
    pdf = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_PDF
    print("wrote parity fixtures:")
    _dump("sample", extract_pdf(pdf))
    _dump("synthetic", _synthetic_pages())
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

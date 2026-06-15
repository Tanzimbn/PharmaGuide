"""Page-aware chunking (P1 task #5).

Packs each page's extracted blocks into chunks bounded by
`settings.chunk_max_tokens`, with `settings.chunk_overlap_tokens` of overlap
between consecutive text chunks. Every chunk keeps the page it came from
(OQ-2 page-level citation). Tables are never split: a table block becomes its
own chunk (kept whole for FR-R1), even if it exceeds the size bound.

Token counts here are a whitespace-word approximation — good enough for
sizing. The embedding model (task #6) does the real tokenization.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

from app.config import get_settings
from app.ingestion.extract import PageExtract

_settings = get_settings()
_WORD = re.compile(r"\S+")


@dataclass
class ChunkData:
    page_number: int
    text: str
    token_count: int


def count_tokens(text: str) -> int:
    """Approximate token count (whitespace words)."""
    return len(_WORD.findall(text))


def _words(text: str) -> list[str]:
    return _WORD.findall(text)


def _paragraphs(text: str) -> list[str]:
    """Split a text block into paragraph units (blank-line, else line)."""
    parts = re.split(r"\n\s*\n", text.strip())
    if len(parts) == 1:
        parts = [ln for ln in text.splitlines() if ln.strip()]
    return [p.strip() for p in parts if p.strip()]


def _split_oversized(text: str, max_tok: int, overlap_tok: int) -> list[str]:
    """Split a too-large unit into overlapping word windows."""
    words = _words(text)
    step = max(1, max_tok - overlap_tok)
    windows = []
    for start in range(0, len(words), step):
        windows.append(" ".join(words[start : start + max_tok]))
        if start + max_tok >= len(words):
            break
    return windows


def chunk_pages(
    pages: list[PageExtract],
    max_tokens: int | None = None,
    overlap_tokens: int | None = None,
) -> list[ChunkData]:
    max_tok = max_tokens or _settings.chunk_max_tokens
    overlap_tok = overlap_tokens or _settings.chunk_overlap_tokens
    chunks: list[ChunkData] = []

    for page in pages:
        buf: list[str] = []
        buf_tok = 0

        def flush(page_number: int = page.page_number) -> None:
            nonlocal buf, buf_tok
            if not buf:
                return
            text = "\n\n".join(buf)
            chunks.append(ChunkData(page_number, text, count_tokens(text)))
            # seed next buffer with overlap tail (text continuity only)
            tail = _words(text)[-overlap_tok:] if overlap_tok else []
            buf = [" ".join(tail)] if tail else []
            buf_tok = len(tail)

        for block in page.blocks:
            if block.kind == "table":
                flush()
                buf, buf_tok = [], 0  # no overlap across a table boundary
                chunks.append(
                    ChunkData(
                        page.page_number, block.content, count_tokens(block.content)
                    )
                )
                continue

            for para in _paragraphs(block.content):
                p_tok = count_tokens(para)
                if p_tok > max_tok:
                    flush()
                    buf, buf_tok = [], 0
                    for window in _split_oversized(para, max_tok, overlap_tok):
                        chunks.append(
                            ChunkData(page.page_number, window, count_tokens(window))
                        )
                    continue
                if buf_tok + p_tok > max_tok:
                    flush()
                buf.append(para)
                buf_tok += p_tok

        flush()

    return chunks

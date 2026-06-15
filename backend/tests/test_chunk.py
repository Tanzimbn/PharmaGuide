"""Chunking: page tagging, size bounds, tables kept whole."""

from app.ingestion.chunk import ChunkData, chunk_pages, count_tokens
from app.ingestion.extract import Block, PageExtract


def _long_text(words: int) -> str:
    return " ".join(f"w{i}" for i in range(words))


def test_chunks_carry_page_number_and_split():
    page = PageExtract(page_number=7, blocks=[Block("text", _long_text(300))])
    chunks = chunk_pages([page], max_tokens=50, overlap_tokens=10)
    assert len(chunks) > 1
    assert all(c.page_number == 7 for c in chunks)
    # non-oversized text chunks respect the bound
    assert all(c.token_count <= 50 for c in chunks)


def test_overlap_between_text_chunks():
    page = PageExtract(page_number=1, blocks=[Block("text", _long_text(120))])
    chunks = chunk_pages([page], max_tokens=40, overlap_tokens=10)
    first_tail = chunks[0].text.split()[-10:]
    second_head = chunks[1].text.split()[:10]
    assert first_tail == second_head  # overlap carried forward


def test_table_kept_whole_as_own_chunk():
    table_md = "| A | B |\n| --- | --- |\n| 1 | 2 |"
    page = PageExtract(
        page_number=3,
        blocks=[Block("text", "intro"), Block("table", table_md), Block("text", "outro")],
    )
    chunks = chunk_pages([page], max_tokens=512, overlap_tokens=0)
    table_chunks = [c for c in chunks if c.text == table_md]
    assert len(table_chunks) == 1  # whole, unsplit


def test_count_tokens():
    assert count_tokens("a b c") == 3
    assert count_tokens("") == 0


def test_empty_page_yields_nothing():
    assert chunk_pages([PageExtract(page_number=1, blocks=[])]) == []
    assert isinstance(ChunkData(1, "x", 1), ChunkData)

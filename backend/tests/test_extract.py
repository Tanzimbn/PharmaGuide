"""Extraction: page numbers, text, and structured tables (FR-R1)."""

from app.ingestion.extract import extract_pdf, page_count


def test_extract_pages_and_text(sample_pdf):
    pages = extract_pdf(sample_pdf)
    assert [p.page_number for p in pages] == [1, 2]

    all_text = " ".join(b.content for p in pages for b in p.blocks)
    assert "pump X" in all_text
    assert "gloves and goggles" in all_text


def test_extract_table_is_structured(sample_pdf):
    pages = extract_pdf(sample_pdf)
    tables = [b for b in pages[0].blocks if b.kind == "table"]
    assert tables, "expected a table block on page 1"
    md = tables[0].content
    assert "|" in md  # markdown pipes, not flattened
    assert "Torque" in md and "50 Nm" in md


def test_page_count(sample_pdf):
    assert page_count(sample_pdf) == 2

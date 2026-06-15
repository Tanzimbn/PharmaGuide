"""Upload guardrails (P1 task #7).

Hard rejects (block ingestion, return error at the upload boundary):
- file larger than `settings.max_file_mb`
- more pages than `settings.max_pages_per_file`

Soft alert (never blocks — a valid guideline must always upload):
- total corpus pages over `settings.corpus_soft_alert_pages` -> returns a
  message for the admin; the caller logs/surfaces it but proceeds.

Limits come from config. Hard checks run before any extraction/embedding work.
"""

from __future__ import annotations

from pathlib import Path

from app.config import get_settings

_settings = get_settings()


class GuardrailError(Exception):
    """Raised when an upload violates a hard limit. `reason` is user-facing."""

    def __init__(self, reason: str):
        self.reason = reason
        super().__init__(reason)


def check_file_size(size_bytes: int) -> None:
    limit = _settings.max_file_mb * 1024 * 1024
    if size_bytes > limit:
        mb = size_bytes / (1024 * 1024)
        raise GuardrailError(
            f"File is {mb:.1f} MB; limit is {_settings.max_file_mb} MB."
        )


def check_page_count(num_pages: int) -> None:
    if num_pages > _settings.max_pages_per_file:
        raise GuardrailError(
            f"PDF has {num_pages} pages; limit is "
            f"{_settings.max_pages_per_file} pages per file."
        )


def validate_upload(size_bytes: int, num_pages: int) -> None:
    """Run all hard checks. Raises GuardrailError on the first violation."""
    check_file_size(size_bytes)
    check_page_count(num_pages)


def validate_path(path: str | Path) -> int:
    """Validate an on-disk PDF; returns its page count on success."""
    from app.ingestion.extract import page_count

    size = Path(path).stat().st_size
    check_file_size(size)
    pages = page_count(path)
    check_page_count(pages)
    return pages


def corpus_soft_alert(total_corpus_pages: int) -> str | None:
    """Non-blocking advisory once the corpus crosses the soft threshold."""
    threshold = _settings.corpus_soft_alert_pages
    if total_corpus_pages > threshold:
        return (
            f"Corpus is at {total_corpus_pages} pages (soft alert threshold "
            f"{threshold}). Ingestion still proceeds; consider reviewing corpus size."
        )
    return None

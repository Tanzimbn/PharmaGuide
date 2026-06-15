"""Upload guardrails: hard rejects + non-blocking soft alert."""

import pytest

from app.config import get_settings
from app.ingestion.guardrails import (
    GuardrailError,
    check_file_size,
    check_page_count,
    corpus_soft_alert,
    validate_upload,
)

s = get_settings()


def test_file_size_reject():
    with pytest.raises(GuardrailError):
        check_file_size((s.max_file_mb + 1) * 1024 * 1024)
    check_file_size(1024)  # ok, no raise


def test_page_count_reject():
    with pytest.raises(GuardrailError):
        check_page_count(s.max_pages_per_file + 1)
    check_page_count(10)  # ok


def test_validate_upload_first_violation():
    with pytest.raises(GuardrailError):
        validate_upload(1024, s.max_pages_per_file + 1)


def test_corpus_soft_alert_is_non_blocking():
    assert corpus_soft_alert(s.corpus_soft_alert_pages - 1) is None
    msg = corpus_soft_alert(s.corpus_soft_alert_pages + 1)
    assert msg and "soft alert" in msg.lower()

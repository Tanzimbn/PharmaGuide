"""API request/response schemas."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class DocumentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    filename: str
    category: str
    status: str
    page_count: int
    uploaded_at: datetime
    version: int


class UploadResult(BaseModel):
    document: DocumentOut
    # Non-blocking corpus soft-alert message (guardrails task #7), if any.
    alert: str | None = None


# --- Query / answering (P2) ---


class QueryRequest(BaseModel):
    question: str
    # Document-level scope (FR-Q4). None/empty => all ready documents.
    doc_ids: list[uuid.UUID] | None = None


class Citation(BaseModel):
    """Page-level source reference (OQ-2). Mandatory on every grounded answer."""

    doc_id: uuid.UUID
    filename: str
    page: int


class AnswerOut(BaseModel):
    answer: str
    citations: list[Citation]
    # True when no chunk cleared the score threshold (FR-Q7); citations empty.
    not_covered: bool = False

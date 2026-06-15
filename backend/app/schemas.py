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

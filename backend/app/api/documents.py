"""Document management API (P1 task #10) — FR-A1..A5.

POST   /documents            upload + ingest a new PDF
PUT    /documents/{id}        atomically replace an existing document
DELETE /documents/{id}        delete a document and its chunks
GET    /documents            list all documents with status

Upload guardrails (task #7) are enforced at this boundary; GuardrailError
maps to 413. No auth in the MVP (OQ-4).
"""

from __future__ import annotations

import os
import tempfile
import uuid

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.ingestion.guardrails import GuardrailError, corpus_soft_alert
from app.ingestion.lifecycle import delete_document, replace_document
from app.ingestion.pipeline import ingest_document
from app.models import Document
from app.schemas import DocumentOut, UploadResult

router = APIRouter(prefix="/documents", tags=["documents"])


def _require_pdf(file: UploadFile) -> None:
    name = (file.filename or "").lower()
    if file.content_type not in ("application/pdf", "application/octet-stream") and (
        not name.endswith(".pdf")
    ):
        raise HTTPException(status_code=400, detail="Only PDF uploads are supported.")


async def _spool_to_temp(file: UploadFile) -> str:
    """Write the upload to a temp file, return its path. Caller removes it."""
    fd, path = tempfile.mkstemp(suffix=".pdf")
    try:
        with os.fdopen(fd, "wb") as out:
            while chunk := await file.read(1024 * 1024):
                out.write(chunk)
    except Exception:
        os.unlink(path)
        raise
    return path


def _corpus_alert(db: Session) -> str | None:
    total = db.execute(
        select(func.coalesce(func.sum(Document.page_count), 0)).where(
            Document.status == "ready"
        )
    ).scalar_one()
    return corpus_soft_alert(int(total))


@router.get("", response_model=list[DocumentOut])
def list_documents(db: Session = Depends(get_db)) -> list[Document]:
    return list(db.execute(select(Document).order_by(Document.uploaded_at)).scalars())


@router.post("", response_model=UploadResult, status_code=201)
async def upload_document(
    file: UploadFile = File(...),
    category: str = Form(...),
    db: Session = Depends(get_db),
) -> UploadResult:
    _require_pdf(file)
    path = await _spool_to_temp(file)
    try:
        doc = ingest_document(
            db, file_path=path, filename=file.filename or "upload.pdf", category=category
        )
    except GuardrailError as e:
        raise HTTPException(status_code=413, detail=e.reason) from e
    finally:
        os.unlink(path)
    return UploadResult(document=DocumentOut.model_validate(doc), alert=_corpus_alert(db))


@router.put("/{doc_id}", response_model=UploadResult)
async def replace(
    doc_id: uuid.UUID,
    file: UploadFile = File(...),
    category: str | None = Form(default=None),
    db: Session = Depends(get_db),
) -> UploadResult:
    _require_pdf(file)
    existing = db.get(Document, doc_id)
    if existing is None:
        raise HTTPException(status_code=404, detail="Document not found.")
    path = await _spool_to_temp(file)
    try:
        doc = replace_document(
            db,
            doc_id,
            file_path=path,
            filename=file.filename or existing.filename,
            category=category or existing.category,
        )
    except GuardrailError as e:
        raise HTTPException(status_code=413, detail=e.reason) from e
    finally:
        os.unlink(path)
    return UploadResult(document=DocumentOut.model_validate(doc), alert=_corpus_alert(db))


@router.delete("/{doc_id}", status_code=204)
def delete(doc_id: uuid.UUID, db: Session = Depends(get_db)) -> None:
    if not delete_document(db, doc_id):
        raise HTTPException(status_code=404, detail="Document not found.")

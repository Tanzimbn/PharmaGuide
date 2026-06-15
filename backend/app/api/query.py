"""Query API (P2) — grounded, cited answers over the guideline corpus.

POST /query   ask a question, optionally scoped to selected documents.

No auth in the MVP (OQ-4). Retrieval is constrained to `ready` documents, so
unknown or non-ready ids in `doc_ids` simply contribute nothing; we reject a
selection that resolves to zero valid documents to give the caller clear
feedback rather than a silent "not covered".
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models import Document
from app.query.answer import answer_question
from app.schemas import AnswerOut, QueryRequest

router = APIRouter(tags=["query"])


@router.post("/query", response_model=AnswerOut)
def query(req: QueryRequest, db: Session = Depends(get_db)) -> AnswerOut:
    if not req.question.strip():
        raise HTTPException(status_code=400, detail="Question must not be empty.")

    if req.doc_ids:
        valid = set(
            db.execute(
                select(Document.id).where(
                    Document.id.in_(req.doc_ids), Document.status == "ready"
                )
            ).scalars()
        )
        if not valid:
            raise HTTPException(
                status_code=400,
                detail="None of the selected documents are available.",
            )
        doc_ids = [d for d in req.doc_ids if d in valid]
    else:
        doc_ids = None

    return answer_question(db, req.question, doc_ids=doc_ids)

"""FastAPI entrypoint."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.documents import router as documents_router
from app.api.query import router as query_router
from app.config import get_settings
from app.db.session import check_db

settings = get_settings()

app = FastAPI(title=settings.app_name, version="0.1.0", debug=settings.debug)

# Allow the local React dev server (and any configured origins) to call the API.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(documents_router)
app.include_router(query_router)


@app.get("/health")
def health() -> dict[str, str]:
    """Liveness + DB/pgvector reachability."""
    db_ok = check_db()
    return {
        "status": "ok" if db_ok else "degraded",
        "app": settings.app_name,
        "db": "ok" if db_ok else "unreachable",
    }

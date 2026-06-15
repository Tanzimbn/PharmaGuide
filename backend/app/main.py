"""FastAPI entrypoint."""

from fastapi import FastAPI

from app.api.documents import router as documents_router
from app.config import get_settings
from app.db.session import check_db

settings = get_settings()

app = FastAPI(title=settings.app_name, version="0.1.0", debug=settings.debug)
app.include_router(documents_router)


@app.get("/health")
def health() -> dict[str, str]:
    """Liveness + DB/pgvector reachability."""
    db_ok = check_db()
    return {
        "status": "ok" if db_ok else "degraded",
        "app": settings.app_name,
        "db": "ok" if db_ok else "unreachable",
    }

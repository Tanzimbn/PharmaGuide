"""FastAPI entrypoint. Routers wired in later P1 tasks (#10)."""

from fastapi import FastAPI

from app.config import get_settings

settings = get_settings()

app = FastAPI(title=settings.app_name, version="0.1.0", debug=settings.debug)


@app.get("/health")
def health() -> dict[str, str]:
    """Liveness check. DB-reachability check added in task #2."""
    return {"status": "ok", "app": settings.app_name}

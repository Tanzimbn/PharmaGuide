"""Application configuration — env-driven, no hardcoded secrets."""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )

    # --- Database ---
    database_url: str = "postgresql+psycopg://pharma:pharma@localhost:5432/pharmaguide"

    # --- Embedding model (local, runs on CPU/GPU) ---
    # bge-small-en-v1.5 -> 384 dims. Change model + dim together.
    embedding_model: str = "BAAI/bge-small-en-v1.5"
    embedding_dim: int = 384

    # --- Chunking ---
    chunk_max_tokens: int = 512
    chunk_overlap_tokens: int = 64

    # --- Upload guardrails (P1 task #7) ---
    max_pages_per_file: int = 150
    max_file_mb: int = 50
    corpus_soft_alert_pages: int = 50_000  # soft alert only, never hard-block

    # --- App ---
    app_name: str = "PharmaGuide"
    debug: bool = False


@lru_cache
def get_settings() -> Settings:
    return Settings()

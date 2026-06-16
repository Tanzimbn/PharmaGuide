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

    # --- Retrieval / answering (P2) ---
    retrieve_top_k: int = 20  # pgvector candidates before rerank (arch §6)
    rerank_top_n: int = 5  # chunks kept after cross-encoder rerank
    rerank_model: str = "BAAI/bge-reranker-base"  # local cross-encoder (FR-R2)
    # Min reranker score (sigmoid 0..1) to answer; below ⇒ "not covered" (FR-Q7).
    # Model-specific; tune in P5 eval against a gold set.
    score_threshold: float = 0.3

    # --- LLM adapter (swap point, arch §7) ---
    # Generation runs behind an OpenAI-compatible /chat/completions adapter, so
    # any compatible host works with a config-only change: hosted free-trial
    # endpoints (Groq / OpenRouter / Together / Fireworks) for the MVP, or a
    # local on-device model (Ollama, llama.cpp) for in-VPC residency (NFR-2).
    # Defaults target a free-trial host — NOT a paid OpenAI account. Override
    # LLM_BASE_URL / LLM_MODEL / LLM_API_KEY via env for your provider; see
    # .env.example for ready-to-use settings per host.
    llm_provider: str = "openai_compatible"
    llm_base_url: str = "https://api.groq.com/openai/v1"
    llm_api_key: str = ""  # set via env LLM_API_KEY; empty in tests/CI
    llm_model: str = "llama-3.3-70b-versatile"
    llm_timeout_s: float = 30.0
    llm_max_tokens: int = 1024

    # --- App ---
    app_name: str = "PharmaGuide"
    debug: bool = False
    # Origins allowed to call the API (React dev server). Override via env
    # CORS_ORIGINS as a JSON list, e.g. '["http://localhost:5173"]'.
    cors_origins: list[str] = ["http://localhost:5173", "http://127.0.0.1:5173"]


@lru_cache
def get_settings() -> Settings:
    return Settings()

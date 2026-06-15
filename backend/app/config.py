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
    # OpenAI-compatible chat endpoint: works with hosted free-trial hosts
    # (Groq/OpenRouter/Together/...) and local Ollama. Production swaps base_url
    # to an in-VPC / on-device endpoint — config only (NFR-2).
    llm_provider: str = "openai_compatible"
    llm_base_url: str = "https://api.openai.com/v1"
    llm_api_key: str = ""  # set via env LLM_API_KEY; empty in tests/CI
    llm_model: str = "gpt-4o-mini"
    llm_timeout_s: float = 30.0
    llm_max_tokens: int = 1024

    # --- App ---
    app_name: str = "PharmaGuide"
    debug: bool = False


@lru_cache
def get_settings() -> Settings:
    return Settings()

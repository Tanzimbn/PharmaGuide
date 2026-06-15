"""Local embedding module (P1 task #6).

Wraps a local sentence-transformer (default bge-small-en-v1.5, 384-dim).
Model is loaded lazily once and reused. Embeddings are L2-normalized so the
HNSW `vector_cosine_ops` index (migration 0001) gives correct cosine ranking.
The same `embed_query` is reused by retrieval in P2.
"""

from __future__ import annotations

from functools import lru_cache

from app.config import get_settings

_settings = get_settings()


@lru_cache(maxsize=1)
def _model():
    # Imported lazily so module import (and tests that don't embed) stay cheap.
    from sentence_transformers import SentenceTransformer

    model = SentenceTransformer(_settings.embedding_model)
    dim = model.get_sentence_embedding_dimension()
    if dim != _settings.embedding_dim:
        raise ValueError(
            f"embedding_dim mismatch: model '{_settings.embedding_model}' is {dim}, "
            f"config embedding_dim={_settings.embedding_dim}. Update config + migration."
        )
    return model


def embed_texts(texts: list[str], batch_size: int = 32) -> list[list[float]]:
    """Embed a batch of chunk texts -> normalized vectors."""
    if not texts:
        return []
    vecs = _model().encode(
        texts,
        batch_size=batch_size,
        normalize_embeddings=True,
        convert_to_numpy=True,
        show_progress_bar=False,
    )
    return vecs.tolist()


def embed_query(text: str) -> list[float]:
    """Embed a single query string (reused by P2 retrieval)."""
    return embed_texts([text])[0]

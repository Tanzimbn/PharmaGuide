"""LLM adapter — the single swap point for answer generation (arch §7).

Generation runs behind a `LLMProvider` Protocol so the hosted free-trial
endpoint used in the MVP can be swapped for an in-VPC / on-device model with a
config-only change (NFR-2). The default `OpenAICompatibleProvider` speaks the
OpenAI `/chat/completions` shape, which covers most hosted trial endpoints
(Groq, OpenRouter, Together, ...) and local Ollama.

The grounded system prompt enforces FR-R3 (answer only from provided context),
mandatory page citations (FR-Q6/OQ-2), and the "not covered" escape hatch —
belt-and-suspenders with the retrieval-score guard in answer.py. Generation is
deterministic (temperature 0, FR-R4) for numeric/tabular reliability.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Protocol

import httpx

from app.config import get_settings

if TYPE_CHECKING:
    from app.query.retrieve import RetrievedChunk

_settings = get_settings()

SYSTEM_PROMPT = (
    "You are PharmaGuide, a compliance assistant for pharmaceutical "
    "manufacturing guidelines. Answer ONLY using the numbered context "
    "passages provided below. Do not use any outside or prior knowledge.\n"
    "- Every factual statement must cite its source as (filename, p.N) using "
    "the filename and page shown on the passage it came from.\n"
    "- Preserve numeric values, units, and table figures exactly.\n"
    "- If the context does not contain the answer, reply exactly: "
    '"Not covered in the selected guidelines." and nothing else.'
)


def build_context(chunks: list[RetrievedChunk]) -> str:
    """Render retrieved chunks into a numbered, citation-tagged context block."""
    parts = []
    for i, c in enumerate(chunks, start=1):
        parts.append(f"[{i}] (filename: {c.filename}, p.{c.page_number})\n{c.text}")
    return "\n\n".join(parts)


def build_user_prompt(question: str, chunks: list[RetrievedChunk]) -> str:
    return f"Context passages:\n\n{build_context(chunks)}\n\nQuestion: {question}"


class LLMProvider(Protocol):
    def generate(self, *, system: str, user: str) -> str: ...


class OpenAICompatibleProvider:
    """Calls an OpenAI-compatible `/chat/completions` endpoint (temperature 0)."""

    def __init__(
        self,
        *,
        base_url: str | None = None,
        api_key: str | None = None,
        model: str | None = None,
        timeout_s: float | None = None,
        max_tokens: int | None = None,
    ) -> None:
        self.base_url = (base_url or _settings.llm_base_url).rstrip("/")
        self.api_key = api_key if api_key is not None else _settings.llm_api_key
        self.model = model or _settings.llm_model
        self.timeout_s = timeout_s or _settings.llm_timeout_s
        self.max_tokens = max_tokens or _settings.llm_max_tokens

    def generate(self, *, system: str, user: str) -> str:
        if not self.api_key:
            raise RuntimeError(
                "LLM_API_KEY is not set; cannot reach the generation endpoint."
            )
        resp = httpx.post(
            f"{self.base_url}/chat/completions",
            headers={"Authorization": f"Bearer {self.api_key}"},
            json={
                "model": self.model,
                "messages": [
                    {"role": "system", "content": system},
                    {"role": "user", "content": user},
                ],
                "temperature": 0,  # FR-R4 deterministic generation
                "max_tokens": self.max_tokens,
            },
            timeout=self.timeout_s,
        )
        resp.raise_for_status()
        return resp.json()["choices"][0]["message"]["content"]


def get_provider() -> LLMProvider:
    """Construct the configured provider. Add new branches to swap backends."""
    provider = _settings.llm_provider
    if provider == "openai_compatible":
        return OpenAICompatibleProvider()
    raise ValueError(f"Unknown llm_provider: {provider!r}")

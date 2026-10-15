"""LLM provider configuration (the planner only — graph tools decide facts).

Providers:
  anthropic          native Anthropic SDK (ANTHROPIC_API_KEY)
  openai             OpenAI SDK (OPENAI_API_KEY)
  ollama             local, free; OpenAI-compatible endpoint at http://localhost:11434/v1
  gemini / groq / openrouter / openai_compatible
                     OpenAI-compatible endpoints (LLM_API_KEY, LLM_MODEL, optional LLM_BASE_URL)
Empty LLM_PROVIDER -> clearly-labelled deterministic playbook planner.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from app.config import get_settings

OPENAI_COMPATIBLE_BASE_URLS = {
    "ollama": "http://localhost:11434/v1",
    "gemini": "https://generativelanguage.googleapis.com/v1beta/openai/",
    "groq": "https://api.groq.com/openai/v1",
    "openrouter": "https://openrouter.ai/api/v1",
}
DEFAULT_MODELS = {
    "anthropic": "claude-opus-5-5",
    "ollama": "llama3.2:3b",
}


@dataclass(frozen=True)
class LLMConfig:
    provider: str
    model: str
    api_key: str | None
    base_url: str | None

    @property
    def kind(self) -> str:
        return "anthropic" if self.provider == "anthropic" else "openai_chat"

    @property
    def label(self) -> str:
        return f"{self.provider}/{self.model}"


def llm_config() -> LLMConfig | None:
    s = get_settings()
    provider = (s.llm_provider or "").strip().lower()
    if not provider or provider in {"none", "playbook"}:
        return None
    model = s.llm_model or DEFAULT_MODELS.get(provider, "")
    generic_key = s.llm_api_key.get_secret_value() if s.llm_api_key else None
    if provider == "anthropic":
        key = s.anthropic_api_key.get_secret_value() if s.anthropic_api_key else generic_key
        return LLMConfig("anthropic", model, key, s.llm_base_url or None) if key and model else None
    if provider == "openai":
        key = s.openai_api_key.get_secret_value() if s.openai_api_key else generic_key
        return LLMConfig("openai", model, key, s.llm_base_url or None) if key and model else None
    if provider == "ollama":
        return LLMConfig(
            "ollama", model, generic_key or "ollama", s.llm_base_url or OPENAI_COMPATIBLE_BASE_URLS["ollama"]
        )
    if provider in OPENAI_COMPATIBLE_BASE_URLS or provider == "openai_compatible":
        base = s.llm_base_url or OPENAI_COMPATIBLE_BASE_URLS.get(provider)
        return LLMConfig(provider, model, generic_key, base) if base and model and generic_key else None
    return None


def llm_status() -> dict[str, Any]:
    s = get_settings()
    cfg = llm_config()
    requested = (s.llm_provider or "").strip().lower()
    return {
        "configured": cfg is not None,
        "provider": cfg.provider if cfg else (requested or None),
        "model": cfg.model if cfg else None,
        "planner": f"llm:{cfg.label}" if cfg else "playbook",
        "problem": None
        if cfg or not requested
        else f"LLM_PROVIDER={requested} is set but its model/API key is missing; using the deterministic playbook.",
    }

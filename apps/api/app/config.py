"""Runtime configuration (environment variables / .env)."""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic import SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict

API_DIR = Path(__file__).resolve().parents[1]
REPO_ROOT = API_DIR.parents[1]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(REPO_ROOT / ".env", API_DIR / ".env"),
        env_ignore_empty=True,
        extra="ignore",
    )

    falkordb_host: str = "localhost"
    falkordb_port: int = 6379
    falkordb_username: str | None = None
    falkordb_password: SecretStr | None = None
    falkordb_ssl: bool = False
    falkordb_graph_name: str = "clause_ripple"

    llm_provider: str = ""
    llm_model: str = ""
    llm_base_url: str = ""
    llm_api_key: SecretStr | None = None
    anthropic_api_key: SecretStr | None = None
    openai_api_key: SecretStr | None = None
    llm_timeout_s: float = 60.0
    llm_max_steps: int = 24

    cors_origins: str = "http://localhost:3000,http://127.0.0.1:3000"
    demo_mode: bool = True
    auto_seed: bool = True
    # Minimum delay between streamed agent events so humans can follow the trace.
    # Measured tool durations are reported separately and never altered.
    agent_event_pacing_ms: int = 450

    data_dir: Path = REPO_ROOT / "data"
    cypher_dir: Path = REPO_ROOT / "docs" / "cypher"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def demo_dir(self) -> Path:
        return self.data_dir / "demo"


@lru_cache
def get_settings() -> Settings:
    return Settings()

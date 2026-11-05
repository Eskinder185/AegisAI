"""Central configuration. Brand tokens live here so the product can be renamed in one place."""
from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BRAND = {
    "name": "AegisAI",
    "tagline": "Safely test your defenses. Understand every finding. Verify every improvement.",
    "provisional": True,
}

API_ROOT = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="AEGIS_", env_file=".env", extra="ignore")

    database_url: str = f"sqlite:///{(API_ROOT / 'data' / 'aegis.db').as_posix()}"
    artifact_dir: str = str(API_ROOT / "data" / "artifacts")
    # Signing key for run manifests (HMAC-SHA256). Dev default is generated on first start if empty.
    manifest_key: str = ""
    session_ttl_minutes: int = 480
    login_max_attempts: int = 5
    login_window_seconds: int = 300
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"
    cookie_secure: bool = False  # set true behind TLS
    environment: str = "development"
    # Seeded dev users are only created when seed is invoked explicitly (scripts/seed).
    dev_seed_password: str = "aegis-demo-2026!"  # noqa: S105 - dev-only seed default
    # Optional model provider (disabled by default). none | ollama | openai_compatible
    model_provider: str = "none"
    ollama_url: str = "http://127.0.0.1:11434"
    ollama_model: str = "llama3.2"
    openai_base_url: str = ""
    openai_api_key: str = ""  # env only; never displayed after configuration
    openai_model: str = ""
    max_job_seconds: int = 60
    retention_days: int = 90


@lru_cache
def get_settings() -> Settings:
    return Settings()

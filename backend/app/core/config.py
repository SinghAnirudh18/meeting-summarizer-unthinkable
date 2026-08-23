from __future__ import annotations

from functools import lru_cache
from typing import List

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(".env", "../.env"),
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ── Application ─────────────────────────────────────────────────────────
    environment: str = "development"
    log_level: str = "INFO"
    app_name: str = "Meeting Platform API"
    app_version: str = "1.0.0"

    # ── Database ─────────────────────────────────────────────────────────────
    database_url: str

    @field_validator("database_url", mode="before")
    @classmethod
    def format_database_url(cls, v: str) -> str:
        if isinstance(v, str):
            if v.startswith("postgres://"):
                v = v.replace("postgres://", "postgresql+asyncpg://", 1)
            elif v.startswith("postgresql://") and not v.startswith("postgresql+"):
                v = v.replace("postgresql://", "postgresql+asyncpg://", 1)
            if "sslmode=" in v:
                v = v.replace("sslmode=", "ssl=")
        return v

    # ── Redis ─────────────────────────────────────────────────────────────────
    redis_url: str = "redis://localhost:6379/0"

    # ── Security / JWT ────────────────────────────────────────────────────────
    secret_key: str
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 30
    refresh_token_expire_days: int = 7

    # ── LiveKit ──────────────────────────────────────────────────────────────
    livekit_api_key: str
    livekit_api_secret: str
    livekit_url: str  # e.g. wss://your-project.livekit.cloud

    # ── Groq API (Phase 2) ───────────────────────────────────────────────────
    groq_api_key: str | None = None

    # ── CORS ─────────────────────────────────────────────────────────────────
    # Stored as a plain string (comma-separated) so pydantic-settings doesn't
    # attempt JSON decoding from the environment variable.
    cors_origins_str: str = "http://localhost:3000"

    @property
    def cors_origins(self) -> List[str]:
        return [o.strip() for o in self.cors_origins_str.split(",") if o.strip()]

    @property
    def is_development(self) -> bool:
        return self.environment.lower() == "development"


@lru_cache
def get_settings() -> Settings:
    return Settings()

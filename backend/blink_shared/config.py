"""Shared configuration settings for the application."""
from pathlib import Path
from typing import Optional

from pydantic import Field, PostgresDsn
from pydantic_settings import BaseSettings, SettingsConfigDict

# Resolve .env at project root (Blink/.env) regardless of cwd, so settings load
# whether you're running from backend/, backend/api/, or anywhere else.
_PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent


class SharedSettings(BaseSettings):
    """Shared settings for all services."""

    model_config = SettingsConfigDict(
        env_file=str(_PROJECT_ROOT / ".env"),
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # Application
    environment: str = Field(default="development", env="ENVIRONMENT")
    debug: bool = Field(default=False, env="DEBUG")
    frontend_url: Optional[str] = Field(default=None, env="FRONTEND_URL")

    # Database (required — no defaults, must be set via .env or environment)
    database_url: PostgresDsn = Field(..., env="DATABASE_URL")

    # SSL mode for Postgres connections.
    #   - "prefer"  (default) — try SSL, fall back to plain. Works for local docker Postgres
    #     (which has no SSL) and for managed Postgres (which serves SSL).
    #   - "require" — Azure Database for PostgreSQL flexible server.
    #   - "disable" — force plain.
    db_sslmode: str = Field(default="prefer", env="DB_SSLMODE")

    # Database Pool Settings
    db_pool_size: int = Field(default=5, env="DB_POOL_SIZE")
    db_max_overflow: int = Field(default=10, env="DB_MAX_OVERFLOW")
    db_pool_timeout: int = Field(default=30, env="DB_POOL_TIMEOUT")
    db_pool_recycle: int = Field(default=3600, env="DB_POOL_RECYCLE")
    db_pool_pre_ping: bool = Field(default=True, env="DB_POOL_PRE_PING")


# Global settings instance
settings = SharedSettings()

from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path
from typing import Any, Dict, List

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parent.parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=[str(BASE_DIR / ".env"), str(BASE_DIR.parent / ".env")],
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Application
    APP_NAME: str = "SUMIND-IQ"
    APP_ENV: str = "development"
    APP_DEBUG: bool = False
    API_V1_PREFIX: str = "/api/v1"
    SECRET_KEY: str = Field(
        default="sumind-iq-dev-only-secret-key-change-in-production-9f8e7d6c5b4a3210"
    )
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    PASSWORD_RESET_EXPIRE_MINUTES: int = 30

    # CORS & URLs
    ALLOWED_ORIGINS: str = "http://localhost:5173,http://127.0.0.1:5173,http://localhost:4173,http://localhost:3000"
    FRONTEND_BASE_URL: str = "http://localhost:5173"

    # Authoritative Database (PostgreSQL + pgvector, with documented dev fallback)
    DATABASE_URL: str = "postgresql+psycopg2://sumindiq:sumindiq_dev_password@localhost:5432/sumindiq"
    DEV_FALLBACK_SQLITE_URL: str = f"sqlite:///{BASE_DIR / 'data' / 'sumindiq_dev.db'}"
    ALLOW_DEV_DB_FALLBACK: bool = True

    # Document Structure & Ingestion Metadata Store (MongoDB)
    MONGODB_URI: str = "mongodb://localhost:27017"
    MONGODB_DB_NAME: str = "sumindiq_docs"
    ALLOW_DEV_MONGO_FALLBACK: bool = True
    DEV_MONGO_FALLBACK_DIR: str = str(BASE_DIR / "data" / "mongo_fallback")

    # Queue, Cache & Rate Limiting (Redis / Celery)
    REDIS_URL: str = "redis://localhost:6379/0"
    CELERY_BROKER_URL: str = "redis://localhost:6379/1"
    CELERY_RESULT_BACKEND: str = "redis://localhost:6379/2"
    ALLOW_IN_PROCESS_WORKER_FALLBACK: bool = True

    # Storage & Ingestion
    STORAGE_DIR: str = str(BASE_DIR / "storage" / "documents")
    MAX_UPLOAD_SIZE_MB: int = 25
    CHUNK_SIZE_CHARS: int = 1000
    CHUNK_OVERLAP_CHARS: int = 200
    SIGNED_DOWNLOAD_TTL_SECONDS: int = 300
    OCR_ENABLED: bool = True
    TESSERACT_CMD: str = "tesseract"

    # AI & RAG
    LLM_PROVIDER: str = "gemini"
    LLM_API_KEY: str = Field(default_factory=lambda: os.environ.get("GEMINI_API_KEY", ""))
    LLM_MODEL: str = "gemini-2.5-flash"
    LLM_BASE_URL: str = "https://generativelanguage.googleapis.com/v1beta"
    LLM_TIMEOUT_SECONDS: int = 45
    LLM_MAX_RETRIES: int = 2
    ALLOW_EXTRACTIVE_GROUNDED_FALLBACK: bool = True

    EMBEDDING_PROVIDER: str = "local_deterministic"
    EMBEDDING_API_KEY: str = Field(default_factory=lambda: os.environ.get("GEMINI_API_KEY", ""))
    EMBEDDING_MODEL: str = "text-embedding-004"
    EMBEDDING_DIMENSION: int = 384
    RAG_TOP_K: int = 6
    RAG_MIN_SIMILARITY_SCORE: float = 0.15

    # Email Provider
    EMAIL_PROVIDER: str = "console_dev"
    SMTP_HOST: str = "smtp.example.com"
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_FROM_EMAIL: str = "no-reply@sumind-iq.internal"

    # Security & Rate Limits
    AUTH_RATE_LIMIT_PER_MINUTE: int = 25
    API_RATE_LIMIT_PER_MINUTE: int = 240
    CONVERSATION_RETENTION_DAYS: int = 365

    @property
    def cors_origins(self) -> List[str]:
        return [origin.strip() for origin in self.ALLOWED_ORIGINS.split(",") if origin.strip()]


# Runtime non-secret configuration overrides manageable by Org Admins
_RUNTIME_SYSTEM_CONFIG: Dict[str, Any] = {}


@lru_cache
def get_settings() -> Settings:
    return Settings()


def get_runtime_config() -> Dict[str, Any]:
    s = get_settings()
    defaults = {
        "max_upload_size_mb": s.MAX_UPLOAD_SIZE_MB,
        "chunk_size_chars": s.CHUNK_SIZE_CHARS,
        "chunk_overlap_chars": s.CHUNK_OVERLAP_CHARS,
        "rag_top_k": s.RAG_TOP_K,
        "rag_min_similarity_score": s.RAG_MIN_SIMILARITY_SCORE,
        "ocr_enabled": s.OCR_ENABLED,
        "conversation_retention_days": s.CONVERSATION_RETENTION_DAYS,
        "allow_extractive_grounded_fallback": s.ALLOW_EXTRACTIVE_GROUNDED_FALLBACK,
        "auth_rate_limit_per_minute": s.AUTH_RATE_LIMIT_PER_MINUTE,
        "api_rate_limit_per_minute": s.API_RATE_LIMIT_PER_MINUTE,
    }
    defaults.update(_RUNTIME_SYSTEM_CONFIG)
    return defaults


def update_runtime_config(updates: Dict[str, Any]) -> Dict[str, Any]:
    allowed_keys = {
        "max_upload_size_mb",
        "chunk_size_chars",
        "chunk_overlap_chars",
        "rag_top_k",
        "rag_min_similarity_score",
        "ocr_enabled",
        "conversation_retention_days",
        "allow_extractive_grounded_fallback",
        "auth_rate_limit_per_minute",
        "api_rate_limit_per_minute",
    }
    for key, value in updates.items():
        if key in allowed_keys and value is not None:
            _RUNTIME_SYSTEM_CONFIG[key] = value
    return get_runtime_config()


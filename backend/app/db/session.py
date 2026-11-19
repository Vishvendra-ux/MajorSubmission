from __future__ import annotations

from pathlib import Path
from typing import Dict, Generator, Optional

from sqlalchemy import create_engine, event, text
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import get_settings
from app.core.logging import get_logger

logger = get_logger(__name__)

_engine: Optional[Engine] = None
_SessionLocal: Optional[sessionmaker] = None
_db_status: Dict[str, object] = {
    "configured_url_scheme": "postgresql",
    "active_backend": "uninitialized",
    "using_dev_fallback": False,
    "pgvector_enabled": False,
    "status_message": "Not initialized",
}


def _configure_sqlite_pragmas(dbapi_connection, connection_record) -> None:
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.execute("PRAGMA journal_mode=WAL")
    cursor.close()


def init_engine(force_url: Optional[str] = None) -> Engine:
    global _engine, _SessionLocal, _db_status
    settings = get_settings()
    target_url = force_url or settings.DATABASE_URL

    if target_url.startswith("postgresql"):
        try:
            pg_engine = create_engine(
                target_url,
                pool_pre_ping=True,
                connect_args={"connect_timeout": 2},
            )
            with pg_engine.connect() as conn:
                conn.execute(text("SELECT 1"))
                pgvector_ok = False
                try:
                    conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
                    conn.commit()
                    pgvector_ok = True
                except Exception as ext_exc:
                    logger.warning("pgvector extension check note: %s", ext_exc)
            _engine = pg_engine
            _SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=_engine)
            _db_status = {
                "configured_url_scheme": "postgresql",
                "active_backend": "postgresql",
                "using_dev_fallback": False,
                "pgvector_enabled": pgvector_ok,
                "status_message": "Connected to PostgreSQL primary database.",
            }
            logger.info("Connected to PostgreSQL database successfully (pgvector=%s).", pgvector_ok)
            return _engine
        except Exception as exc:
            if not settings.ALLOW_DEV_DB_FALLBACK and not force_url:
                logger.error("PostgreSQL connection failed and ALLOW_DEV_DB_FALLBACK is false: %s", exc)
                raise
            logger.warning(
                "PostgreSQL service at DATABASE_URL is unreachable (%s). "
                "Activating documented local development SQLite fallback (%s).",
                exc,
                settings.DEV_FALLBACK_SQLITE_URL,
            )
            target_url = settings.DEV_FALLBACK_SQLITE_URL
            _db_status = {
                "configured_url_scheme": "postgresql",
                "active_backend": "sqlite_dev_fallback",
                "using_dev_fallback": True,
                "pgvector_enabled": False,
                "status_message": (
                    "PostgreSQL service is offline on host; running on documented local development "
                    "SQLite fallback with application-level cosine vector search."
                ),
            }
    else:
        _db_status = {
            "configured_url_scheme": target_url.split(":")[0],
            "active_backend": target_url.split(":")[0],
            "using_dev_fallback": target_url.startswith("sqlite"),
            "pgvector_enabled": False,
            "status_message": f"Connected to {target_url.split(':')[0]} database.",
        }

    if target_url.startswith("sqlite:///") and ":memory:" not in target_url:
        db_file = target_url.replace("sqlite:///", "", 1)
        Path(db_file).parent.mkdir(parents=True, exist_ok=True)

    connect_args = {"check_same_thread": False} if target_url.startswith("sqlite") else {}
    _engine = create_engine(target_url, connect_args=connect_args, pool_pre_ping=True)
    if target_url.startswith("sqlite"):
        event.listen(_engine, "connect", _configure_sqlite_pragmas)

    _SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=_engine)
    return _engine


def get_engine() -> Engine:
    global _engine
    if _engine is None:
        return init_engine()
    return _engine


def get_session_factory() -> sessionmaker:
    global _SessionLocal
    if _SessionLocal is None:
        init_engine()
    assert _SessionLocal is not None
    return _SessionLocal


def get_db() -> Generator[Session, None, None]:
    session_factory = get_session_factory()
    db = session_factory()
    try:
        yield db
    finally:
        db.close()


def get_db_status() -> Dict[str, object]:
    if _engine is None:
        init_engine()
    return dict(_db_status)


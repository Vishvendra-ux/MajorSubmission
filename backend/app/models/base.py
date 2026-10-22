from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, List, Optional

from sqlalchemy import JSON
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy.types import TypeDecorator


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def new_uuid() -> str:
    return str(uuid.uuid4())


class EmbeddingVector(TypeDecorator):
    """
    Cross-database vector column type:
    - Uses pgvector VECTOR(dim) on PostgreSQL when pgvector extension is enabled.
    - Uses JSON array of floats on SQLite / fallback databases so tests and local
      development work seamlessly.
    """

    impl = JSON
    cache_ok = True

    def __init__(self, dim: int = 384, *args: Any, **kwargs: Any) -> None:
        super().__init__(*args, **kwargs)
        self.dim = dim

    def load_dialect_impl(self, dialect: Any) -> Any:
        if dialect.name == "postgresql":
            try:
                from pgvector.sqlalchemy import Vector

                return dialect.type_descriptor(Vector(self.dim))
            except Exception:
                return dialect.type_descriptor(JSON())
        return dialect.type_descriptor(JSON())

    def process_bind_param(self, value: Optional[List[float]], dialect: Any) -> Any:
        if value is None:
            return None
        return [float(x) for x in value]

    def process_result_value(self, value: Any, dialect: Any) -> Optional[List[float]]:
        if value is None:
            return None
        if isinstance(value, list):
            return [float(x) for x in value]
        try:
            return [float(x) for x in list(value)]
        except Exception:
            return None


class Base(DeclarativeBase):
    pass


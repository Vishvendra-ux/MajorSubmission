from __future__ import annotations

import os
import tempfile
from pathlib import Path
from typing import Generator

import pytest
from fastapi.testclient import TestClient

# Point tests to isolated temporary directories before importing app modules
_TEST_TMP_DIR = tempfile.mkdtemp(prefix="sumindiq_test_")
os.environ["DATABASE_URL"] = f"sqlite:///{Path(_TEST_TMP_DIR) / 'test_sumindiq.db'}"
os.environ["DEV_FALLBACK_SQLITE_URL"] = f"sqlite:///{Path(_TEST_TMP_DIR) / 'test_sumindiq.db'}"
os.environ["DEV_MONGO_FALLBACK_DIR"] = str(Path(_TEST_TMP_DIR) / "mongo_test")
os.environ["STORAGE_DIR"] = str(Path(_TEST_TMP_DIR) / "storage_test")
os.environ["APP_ENV"] = "testing"
os.environ["LLM_PROVIDER"] = "extractive_grounded"
os.environ["EMBEDDING_PROVIDER"] = "local_deterministic"
os.environ["AUTH_RATE_LIMIT_PER_MINUTE"] = "200"
os.environ["API_RATE_LIMIT_PER_MINUTE"] = "1000"

from app.core.config import get_settings  # noqa: E402
from app.core.rate_limit import rate_limiter  # noqa: E402
from app.db.seed import ensure_system_roles_and_permissions, seed_demo_data  # noqa: E402
from app.db.session import get_session_factory, init_engine  # noqa: E402
from app.main import create_app  # noqa: E402
from app.models.base import Base  # noqa: E402


@pytest.fixture(scope="session", autouse=True)
def setup_test_database() -> Generator[None, None, None]:
    get_settings.cache_clear()
    engine = init_engine(os.environ["DATABASE_URL"])
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    session_factory = get_session_factory()
    with session_factory() as db:
        ensure_system_roles_and_permissions(db)
        seed_demo_data(db)
    yield


@pytest.fixture(autouse=True)
def reset_rate_limiter() -> None:
    rate_limiter.reset()


@pytest.fixture()
def client() -> Generator[TestClient, None, None]:
    app = create_app()
    with TestClient(app) as c:
        yield c


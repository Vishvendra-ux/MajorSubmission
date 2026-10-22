from __future__ import annotations

from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1 import admin, auth, chat, documents, search, users
from app.core.config import get_settings
from app.core.exceptions import register_exception_handlers
from app.core.logging import configure_logging, get_logger
from app.core.middleware import SecurityHeadersMiddleware
from app.db.seed import ensure_system_roles_and_permissions, seed_demo_data
from app.db.session import get_engine, get_session_factory
from app.models.base import Base

settings = get_settings()
configure_logging(debug=settings.APP_DEBUG)
logger = get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    engine = get_engine()
    Base.metadata.create_all(bind=engine)
    session_factory = get_session_factory()
    with session_factory() as db:
        ensure_system_roles_and_permissions(db)
        if settings.APP_ENV == "development":
            seed_demo_data(db)
    logger.info("%s backend started (env=%s)", settings.APP_NAME, settings.APP_ENV)
    yield


def create_app() -> FastAPI:
    app = FastAPI(
        title="SUMIND-IQ — Enterprise AI Knowledge Management Platform API",
        description=(
            "Secure, role-aware organisational knowledge management and grounded RAG platform "
            "with verifiable source citations, semantic search, and multi-tenant isolation."
        ),
        version="1.0.0",
        docs_url="/api/docs",
        redoc_url="/api/redoc",
        openapi_url="/api/openapi.json",
        lifespan=lifespan,
    )

    app.add_middleware(SecurityHeadersMiddleware)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type", "X-Request-ID"],
    )

    register_exception_handlers(app)

    prefix = settings.API_V1_PREFIX
    app.include_router(auth.router, prefix=prefix)
    app.include_router(documents.router, prefix=prefix)
    app.include_router(search.router, prefix=prefix)
    app.include_router(chat.router, prefix=prefix)
    app.include_router(users.router, prefix=prefix)
    app.include_router(admin.router, prefix=prefix)

    @app.get("/")
    def root_info():
        return {
            "name": settings.APP_NAME,
            "version": "1.0.0",
            "api_v1": settings.API_V1_PREFIX,
            "docs": "/api/docs",
        }

    return app


app = create_app()


from __future__ import annotations

from typing import Optional

from fastapi import BackgroundTasks

from app.core.config import get_settings
from app.core.logging import get_logger
from app.ingestion.pipeline import run_document_ingestion_pipeline
from app.workers.celery_app import celery_app, is_redis_broker_available

logger = get_logger(__name__)


@celery_app.task(
    bind=True,
    name="sumind_iq.ingest_document",
    max_retries=2,
    default_retry_delay=5,
)
def ingest_document_celery_task(self, document_id: str, job_id: str) -> bool:
    return run_document_ingestion_pipeline(document_id=document_id, job_id=job_id)


def dispatch_ingestion_job(
    *,
    document_id: str,
    job_id: str,
    background_tasks: Optional[BackgroundTasks] = None,
    run_synchronously: bool = False,
) -> str:
    """
    Dispatches an ingestion job to Celery/Redis when reachable, or falls back to FastAPI
    BackgroundTasks / immediate execution in local dev/test when ALLOW_IN_PROCESS_WORKER_FALLBACK=true.
    Returns the worker mode used.
    """
    settings = get_settings()
    if not run_synchronously and is_redis_broker_available():
        try:
            ingest_document_celery_task.delay(document_id, job_id)
            return "celery_redis"
        except Exception as exc:
            logger.warning("Celery dispatch failed (%s); falling back to in-process worker.", exc)

    if not settings.ALLOW_IN_PROCESS_WORKER_FALLBACK and not run_synchronously:
        raise RuntimeError("Background job queue (Redis/Celery) is unavailable.")

    if background_tasks is not None and not run_synchronously:
        background_tasks.add_task(run_document_ingestion_pipeline, document_id, job_id, None)
        return "in_process_background"

    run_document_ingestion_pipeline(document_id=document_id, job_id=job_id)
    return "in_process_sync"


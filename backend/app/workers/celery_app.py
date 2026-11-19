from __future__ import annotations

from typing import Dict

from celery import Celery

from app.core.config import get_settings

settings = get_settings()

celery_app = Celery(
    "sumind_iq_worker",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_RESULT_BACKEND,
    include=["app.workers.tasks"],
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    task_acks_late=True,
    worker_prefetch_multiplier=1,
    task_default_retry_delay=5,
)


def is_redis_broker_available() -> bool:
    try:
        import redis

        client = redis.Redis.from_url(
            settings.CELERY_BROKER_URL,
            socket_connect_timeout=0.5,
            socket_timeout=0.5,
        )
        client.ping()
        return True
    except Exception:
        return False


def get_worker_status() -> Dict[str, object]:
    redis_ok = is_redis_broker_available()
    return {
        "broker_configured": "redis",
        "redis_connected": redis_ok,
        "active_mode": "celery_redis" if redis_ok else "in_process_background_worker",
        "using_dev_fallback": not redis_ok,
        "status_message": (
            "Connected to Redis broker for Celery background workers."
            if redis_ok
            else "Redis broker unreachable on host; using documented in-process asynchronous worker fallback."
        ),
    }


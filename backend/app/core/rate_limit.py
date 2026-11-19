from __future__ import annotations

import threading
import time
from collections import defaultdict, deque
from typing import Deque, Dict, Optional

from fastapi import HTTPException, Request, status

from app.core.config import get_runtime_config, get_settings
from app.core.logging import get_logger

logger = get_logger(__name__)


class RateLimiter:
    """Sliding-window rate limiter backed by Redis with automatic in-memory fallback."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._buckets: Dict[str, Deque[float]] = defaultdict(deque)
        self._redis_client: Optional[object] = None
        self._redis_checked = False

    def _get_redis(self):
        if self._redis_checked:
            return self._redis_client
        self._redis_checked = True
        settings = get_settings()
        try:
            import redis

            client = redis.Redis.from_url(
                settings.REDIS_URL,
                socket_connect_timeout=0.5,
                socket_timeout=0.5,
                decode_responses=True,
            )
            client.ping()
            self._redis_client = client
        except Exception:
            self._redis_client = None
        return self._redis_client

    def reset(self) -> None:
        with self._lock:
            self._buckets.clear()

    def check(self, key: str, limit: int, window_seconds: int = 60) -> None:
        now = time.time()
        redis_client = self._get_redis()
        if redis_client is not None:
            try:
                redis_key = f"sumindiq:rl:{key}:{int(now // window_seconds)}"
                current = redis_client.incr(redis_key)
                if current == 1:
                    redis_client.expire(redis_key, window_seconds)
                if int(current) > limit:
                    raise HTTPException(
                        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                        detail="Rate limit exceeded. Please wait before retrying.",
                    )
                return
            except HTTPException:
                raise
            except Exception:
                self._redis_client = None

        with self._lock:
            dq = self._buckets[key]
            cutoff = now - window_seconds
            while dq and dq[0] < cutoff:
                dq.popleft()
            if len(dq) >= limit:
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail="Rate limit exceeded. Please wait before retrying.",
                )
            dq.append(now)


rate_limiter = RateLimiter()


def enforce_auth_rate_limit(request: Request) -> None:
    client_ip = request.client.host if request.client else "unknown"
    cfg = get_runtime_config()
    limit = int(cfg.get("auth_rate_limit_per_minute", 25))
    rate_limiter.check(f"auth:{client_ip}", limit=limit, window_seconds=60)


def enforce_api_rate_limit(request: Request) -> None:
    client_ip = request.client.host if request.client else "unknown"
    cfg = get_runtime_config()
    limit = int(cfg.get("api_rate_limit_per_minute", 240))
    rate_limiter.check(f"api:{client_ip}", limit=limit, window_seconds=60)


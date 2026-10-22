from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional, Tuple

import jwt
from fastapi import HTTPException, status

from app.core.config import get_settings

ALGORITHM = "HS256"


def create_access_token(
    *,
    user_id: str,
    organisation_id: str,
    role: str,
    email: str,
    expires_delta: Optional[timedelta] = None,
) -> Tuple[str, int]:
    settings = get_settings()
    expire_minutes = settings.ACCESS_TOKEN_EXPIRE_MINUTES
    delta = expires_delta or timedelta(minutes=expire_minutes)
    now = datetime.now(timezone.utc)
    expire = now + delta
    payload: Dict[str, Any] = {
        "sub": user_id,
        "org": organisation_id,
        "role": role,
        "email": email,
        "type": "access",
        "jti": str(uuid.uuid4()),
        "iat": int(now.timestamp()),
        "exp": int(expire.timestamp()),
    }
    encoded = jwt.encode(payload, settings.SECRET_KEY, algorithm=ALGORITHM)
    return encoded, int(delta.total_seconds())


def create_refresh_token(
    *,
    user_id: str,
    organisation_id: str,
    expires_delta: Optional[timedelta] = None,
) -> Tuple[str, str, datetime]:
    settings = get_settings()
    delta = expires_delta or timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    now = datetime.now(timezone.utc)
    expire = now + delta
    jti = str(uuid.uuid4())
    payload: Dict[str, Any] = {
        "sub": user_id,
        "org": organisation_id,
        "type": "refresh",
        "jti": jti,
        "iat": int(now.timestamp()),
        "exp": int(expire.timestamp()),
    }
    encoded = jwt.encode(payload, settings.SECRET_KEY, algorithm=ALGORITHM)
    return encoded, jti, expire


def create_signed_download_token(
    *,
    user_id: str,
    organisation_id: str,
    document_id: str,
    ttl_seconds: Optional[int] = None,
) -> str:
    settings = get_settings()
    ttl = ttl_seconds or settings.SIGNED_DOWNLOAD_TTL_SECONDS
    now = datetime.now(timezone.utc)
    expire = now + timedelta(seconds=ttl)
    payload: Dict[str, Any] = {
        "sub": user_id,
        "org": organisation_id,
        "doc": document_id,
        "type": "download",
        "iat": int(now.timestamp()),
        "exp": int(expire.timestamp()),
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=ALGORITHM)


def decode_token(token: str, expected_type: str = "access") -> Dict[str, Any]:
    settings = get_settings()
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[ALGORITHM])
    except jwt.ExpiredSignatureError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session token has expired. Please sign in again.",
        ) from exc
    except jwt.InvalidTokenError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication token.",
        ) from exc

    if payload.get("type") != expected_type:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid token type (expected {expected_type}).",
        )
    return payload


from __future__ import annotations

import hashlib
import re
import secrets
from typing import Tuple

from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError

_ph = PasswordHasher(time_cost=2, memory_cost=32768, parallelism=2)


def validate_password_strength(password: str) -> Tuple[bool, str]:
    if len(password) < 8:
        return False, "Password must be at least 8 characters long."
    if len(password) > 128:
        return False, "Password must not exceed 128 characters."
    if not re.search(r"[A-Z]", password):
        return False, "Password must include at least one uppercase letter."
    if not re.search(r"[a-z]", password):
        return False, "Password must include at least one lowercase letter."
    if not re.search(r"[0-9!@#$%^&*()_+\-=\[\]{};':\"\\|,.<>/?]", password):
        return False, "Password must include at least one number or special character."
    return True, ""


def hash_password(password: str) -> str:
    return _ph.hash(password)


def verify_password(plain_password: str, password_hash: str) -> bool:
    if not plain_password or not password_hash:
        return False
    try:
        if password_hash.startswith("$argon2"):
            return _ph.verify(password_hash, plain_password)
        if password_hash.startswith("$2"):
            import bcrypt

            return bcrypt.checkpw(
                plain_password.encode("utf-8"), password_hash.encode("utf-8")
            )
    except (VerifyMismatchError, Exception):
        return False
    return False


def generate_secure_token(nbytes: int = 32) -> str:
    return secrets.token_urlsafe(nbytes)


def hash_token(raw_token: str) -> str:
    return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()


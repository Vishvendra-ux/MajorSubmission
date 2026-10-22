from __future__ import annotations

import logging
import re
import sys

SENSITIVE_PATTERNS = [
    re.compile(r"(password|passwd|secret|token|api_key|apikey|authorization)\s*[:=]\s*['\"]?([^'\"\s,&]+)", re.I),
    re.compile(r"Bearer\s+[A-Za-z0-9\-._~+/]+=*", re.I),
]


class RedactingFilter(logging.Filter):
    """Filter that redacts credentials, tokens, and secrets from log records."""

    def filter(self, record: logging.LogRecord) -> bool:
        msg = record.getMessage()
        redacted = msg
        for pattern in SENSITIVE_PATTERNS:
            redacted = pattern.sub(lambda m: f"{m.group(1)}=[REDACTED]" if m.lastindex and m.lastindex >= 1 else "Bearer [REDACTED]", redacted)
        if redacted != msg:
            record.msg = redacted
            record.args = ()
        return True


def configure_logging(debug: bool = False) -> None:
    level = logging.DEBUG if debug else logging.INFO
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(
        logging.Formatter(
            fmt="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
            datefmt="%Y-%m-%dT%H:%M:%S%z",
        )
    )
    handler.addFilter(RedactingFilter())

    root_logger = logging.getLogger()
    root_logger.setLevel(level)
    root_logger.handlers = [handler]


def get_logger(name: str) -> logging.Logger:
    logger = logging.getLogger(name)
    if not any(isinstance(f, RedactingFilter) for f in logger.filters):
        logger.addFilter(RedactingFilter())
    return logger

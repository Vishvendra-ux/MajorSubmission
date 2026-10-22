from __future__ import annotations

import os
import re
from pathlib import Path

PROMPT_INJECTION_PATTERNS = [
    re.compile(r"ignore\s+(all\s+)?(previous|prior|above)\s+instructions", re.IGNORECASE),
    re.compile(r"system\s*prompt\s*override", re.IGNORECASE),
    re.compile(r"you\s+are\s+now\s+in\s+developer\s+mode", re.IGNORECASE),
    re.compile(r"disregard\s+access\s+controls", re.IGNORECASE),
]


def sanitize_filename(filename: str) -> str:
    """Prevents path traversal and strips unsafe characters from uploaded filenames."""
    base = os.path.basename(filename or "document.txt")
    base = re.sub(r"[\x00-\x1f\x7f]", "", base)
    base = re.sub(r"[^a-zA-Z0-9._\- ()]", "_", base).strip(" .")
    if not base:
        base = "document.txt"
    return base[:200]


def ensure_safe_storage_path(base_dir: Path, target_path: Path) -> Path:
    """Verifies that `target_path` resolves strictly inside `base_dir` (prevents path traversal)."""
    resolved_base = base_dir.resolve()
    resolved_target = target_path.resolve()
    if resolved_base not in resolved_target.parents and resolved_target != resolved_base:
        raise ValueError("Unsafe storage path detected outside configured storage directory.")
    return resolved_target


def sanitize_user_text(text: str, max_length: int = 4000) -> str:
    cleaned = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f]", "", text or "")
    cleaned = re.sub(r"<script\b[^>]*>.*?</script>", "", cleaned, flags=re.IGNORECASE | re.DOTALL)
    return cleaned.strip()[:max_length]


def neutralize_untrusted_document_text(content: str) -> str:
    """
    Wraps and neutralizes potential prompt-injection directives inside untrusted document chunks
    so that text inside uploaded files can never override system instructions or RBAC policies.
    """
    sanitized = content
    for pat in PROMPT_INJECTION_PATTERNS:
        sanitized = pat.sub("[UNTRUSTED_DOCUMENT_DIRECTIVE_NEUTRALIZED]", sanitized)
    return sanitized


from __future__ import annotations

import uuid
from pathlib import Path
from typing import Tuple

from app.core.config import get_settings
from app.security.sanitization import ensure_safe_storage_path, sanitize_filename


def get_storage_root() -> Path:
    settings = get_settings()
    root = Path(settings.STORAGE_DIR).resolve()
    root.mkdir(parents=True, exist_ok=True)
    return root


def save_uploaded_file(
    organisation_id: str,
    original_filename: str,
    file_ext: str,
    content: bytes,
) -> Tuple[str, str]:
    """
    Stores uploaded file bytes outside publicly served directories under an organisation-scoped path.
    Returns (storage_filename, absolute_storage_path).
    """
    root = get_storage_root()
    org_dir = ensure_safe_storage_path(root, root / sanitize_filename(organisation_id))
    org_dir.mkdir(parents=True, exist_ok=True)

    internal_id = uuid.uuid4().hex
    safe_ext = file_ext.lower().lstrip(".")
    storage_filename = f"{internal_id}.{safe_ext}"
    target_path = ensure_safe_storage_path(root, org_dir / storage_filename)
    target_path.write_bytes(content)
    return storage_filename, str(target_path)


def delete_stored_file(storage_path: str) -> None:
    if not storage_path:
        return
    try:
        root = get_storage_root()
        target = ensure_safe_storage_path(root, Path(storage_path))
        if target.exists() and target.is_file():
            target.unlink()
    except Exception:
        pass


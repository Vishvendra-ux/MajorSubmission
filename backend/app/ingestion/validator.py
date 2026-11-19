from __future__ import annotations

import io
import zipfile
from pathlib import Path
from typing import Tuple

from fastapi import HTTPException, status

from app.core.config import get_runtime_config

SUPPORTED_EXTENSIONS = {"pdf", "docx", "pptx", "xlsx", "txt"}

ALLOWED_MIMES = {
    "pdf": {
        "application/pdf",
        "application/x-pdf",
        "application/octet-stream",
    },
    "docx": {
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/zip",
        "application/octet-stream",
    },
    "pptx": {
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "application/zip",
        "application/octet-stream",
    },
    "xlsx": {
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "application/zip",
        "application/octet-stream",
    },
    "txt": {
        "text/plain",
        "text/markdown",
        "text/csv",
        "application/octet-stream",
    },
}

OFFICE_ZIP_MARKERS = {
    "docx": "word/document.xml",
    "pptx": "ppt/presentation.xml",
    "xlsx": "xl/workbook.xml",
}


def validate_uploaded_file(
    filename: str,
    content_type: str,
    content: bytes,
) -> Tuple[str, str]:
    """
    Validates file extension, MIME type, size limit, and actual binary/container structure.
    Returns (normalized_extension, normalized_mime_type).
    """
    if not filename or "." not in filename:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded file must have a valid file extension (.pdf, .docx, .pptx, .xlsx, .txt).",
        )

    ext = Path(filename).suffix.lower().lstrip(".")
    if ext not in SUPPORTED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported file extension '.{ext}'. Supported formats: PDF, DOCX, PPTX, XLSX, TXT.",
        )

    if len(content) == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded file is empty (0 bytes).",
        )

    cfg = get_runtime_config()
    max_mb = int(cfg.get("max_upload_size_mb", 25))
    max_bytes = max_mb * 1024 * 1024
    if len(content) > max_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"Uploaded file size exceeds the maximum allowed limit of {max_mb} MB.",
        )

    clean_mime = (content_type or "application/octet-stream").split(";")[0].strip().lower()
    if clean_mime not in ALLOWED_MIMES[ext]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"MIME type '{clean_mime}' does not match extension '.{ext}'.",
        )

    # Validate actual file structure (magic bytes / container verification)
    if ext == "pdf":
        if not content[:1024].lstrip().startswith(b"%PDF-"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid PDF file structure: missing %PDF- header signature.",
            )
    elif ext in OFFICE_ZIP_MARKERS:
        if not content.startswith(b"PK\x03\x04"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid .{ext.upper()} file structure: not a valid OpenXML archive.",
            )
        try:
            with zipfile.ZipFile(io.BytesIO(content)) as zf:
                names = set(zf.namelist())
                required_entry = OFFICE_ZIP_MARKERS[ext]
                if required_entry not in names:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Invalid .{ext.upper()} container: missing '{required_entry}'.",
                    )
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Corrupted .{ext.upper()} OpenXML container.",
            ) from exc
    elif ext == "txt":
        if content.startswith((b"MZ", b"\x7fELF", b"\xca\xfe\xba\xbe", b"%PDF-")):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Binary file content is not allowed for .txt uploads.",
            )
        if b"\x00" in content[:4096]:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid plain-text file: binary null bytes detected.",
            )

    canonical_mimes = {
        "pdf": "application/pdf",
        "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "txt": "text/plain",
    }
    return ext, canonical_mimes[ext]


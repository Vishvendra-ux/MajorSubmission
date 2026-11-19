from __future__ import annotations

import io
import shutil
from typing import Tuple

from app.core.config import get_runtime_config, get_settings
from app.core.logging import get_logger

logger = get_logger(__name__)


def is_tesseract_available() -> bool:
    settings = get_settings()
    return shutil.which(settings.TESSERACT_CMD) is not None


def run_ocr_on_image_bytes(image_bytes: bytes) -> Tuple[str, bool]:
    """
    Runs Tesseract OCR on rendered page image bytes when enabled and installed.
    Returns (extracted_text, ocr_executed).
    """
    cfg = get_runtime_config()
    if not cfg.get("ocr_enabled", True):
        return "", False

    if not is_tesseract_available():
        logger.debug("Tesseract binary not found on PATH; skipping OCR pass.")
        return "", False

    try:
        import pytesseract
        from PIL import Image

        settings = get_settings()
        pytesseract.pytesseract.tesseract_cmd = settings.TESSERACT_CMD
        img = Image.open(io.BytesIO(image_bytes))
        text = pytesseract.image_to_string(img)
        return (text or "").strip(), bool((text or "").strip())
    except Exception as exc:
        logger.warning("OCR extraction warning: %s", exc)
        return "", False


from __future__ import annotations

import re


def clean_extracted_text(raw_text: str) -> str:
    """
    Normalizes whitespace, strips control characters, and preserves paragraph structure.
    """
    if not raw_text:
        return ""
    text = raw_text.replace("\r\n", "\n").replace("\r", "\n")
    text = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]", "", text)
    # Collapse horizontal whitespace while keeping newlines
    text = re.sub(r"[ \t]+", " ", text)
    # Normalize 3+ consecutive newlines to 2
    text = re.sub(r"\n{3,}", "\n\n", text)
    lines = [line.strip() for line in text.split("\n")]
    return "\n".join(lines).strip()


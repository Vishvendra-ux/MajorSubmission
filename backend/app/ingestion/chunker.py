from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

from app.ingestion.extractors import ExtractedSection


@dataclass
class ChunkPayload:
    chunk_index: int
    content: str
    token_count: int
    page_number: Optional[int]
    slide_number: Optional[int]
    sheet_name: Optional[str]
    section_title: Optional[str]
    location_label: str
    char_start: int
    char_end: int
    metadata: Dict[str, Any] = field(default_factory=dict)


def estimate_tokens(text: str) -> int:
    words = text.split()
    return max(1, int(len(words) * 1.3))


def split_sections_into_chunks(
    sections: List[ExtractedSection],
    chunk_size_chars: int = 1000,
    chunk_overlap_chars: int = 200,
) -> List[ChunkPayload]:
    """
    Splits extracted document sections into overlapping chunks while preserving
    exact page, slide, sheet, and section location labels.
    """
    safe_size = max(200, chunk_size_chars)
    safe_overlap = max(0, min(safe_size // 2, chunk_overlap_chars))
    chunks: List[ChunkPayload] = []
    chunk_idx = 0
    global_char_offset = 0

    for sec in sections:
        text = sec.text.strip()
        if not text:
            continue

        if len(text) <= safe_size:
            start = global_char_offset
            end = start + len(text)
            chunks.append(
                ChunkPayload(
                    chunk_index=chunk_idx,
                    content=text,
                    token_count=estimate_tokens(text),
                    page_number=sec.page_number,
                    slide_number=sec.slide_number,
                    sheet_name=sec.sheet_name,
                    section_title=sec.section_title,
                    location_label=sec.location_label,
                    char_start=start,
                    char_end=end,
                    metadata={**sec.metadata, "part": 1},
                )
            )
            chunk_idx += 1
            global_char_offset = end + 1
            continue

        pos = 0
        part = 1
        while pos < len(text):
            end_pos = min(len(text), pos + safe_size)
            if end_pos < len(text):
                # Prefer breaking at a paragraph or sentence boundary
                para_break = text.rfind("\n\n", pos + (safe_size // 2), end_pos)
                sent_break = text.rfind(". ", pos + (safe_size // 2), end_pos)
                line_break = text.rfind("\n", pos + (safe_size // 2), end_pos)
                if para_break != -1:
                    end_pos = para_break
                elif sent_break != -1:
                    end_pos = sent_break + 1
                elif line_break != -1:
                    end_pos = line_break

            piece = text[pos:end_pos].strip()
            if piece:
                c_start = global_char_offset + pos
                c_end = global_char_offset + end_pos
                loc_label = (
                    sec.location_label
                    if part == 1 and end_pos >= len(text)
                    else f"{sec.location_label} (Part {part})"
                )
                chunks.append(
                    ChunkPayload(
                        chunk_index=chunk_idx,
                        content=piece,
                        token_count=estimate_tokens(piece),
                        page_number=sec.page_number,
                        slide_number=sec.slide_number,
                        sheet_name=sec.sheet_name,
                        section_title=sec.section_title,
                        location_label=loc_label,
                        char_start=c_start,
                        char_end=c_end,
                        metadata={**sec.metadata, "part": part},
                    )
                )
                chunk_idx += 1
                part += 1

            if end_pos >= len(text):
                break
            pos = max(pos + 1, end_pos - safe_overlap)

        global_char_offset += len(text) + 1

    return chunks


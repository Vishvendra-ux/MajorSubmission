from __future__ import annotations

import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from app.ingestion.cleaner import clean_extracted_text
from app.ingestion.ocr import run_ocr_on_image_bytes


@dataclass
class ExtractedSection:
    text: str
    location_label: str
    page_number: Optional[int] = None
    slide_number: Optional[int] = None
    sheet_name: Optional[str] = None
    section_title: Optional[str] = None
    metadata: Dict[str, Any] = field(default_factory=dict)


def extract_document_sections(
    file_path: str,
    file_type: str,
) -> Tuple[List[ExtractedSection], int, bool]:
    """
    Extracts structured sections from PDF, DOCX, PPTX, XLSX, or TXT while preserving
    exact page, slide, sheet, or section metadata.
    Returns (sections, unit_count, ocr_used).
    """
    ext = file_type.lower().lstrip(".")
    if ext == "pdf":
        return _extract_pdf(file_path)
    if ext == "docx":
        return _extract_docx(file_path)
    if ext == "pptx":
        return _extract_pptx(file_path)
    if ext == "xlsx":
        return _extract_xlsx(file_path)
    if ext == "txt":
        return _extract_txt(file_path)
    raise ValueError(f"Unsupported file format for extraction: {file_type}")


def _extract_pdf(file_path: str) -> Tuple[List[ExtractedSection], int, bool]:
    import fitz  # PyMuPDF

    sections: List[ExtractedSection] = []
    ocr_used_any = False

    with fitz.open(file_path) as pdf_doc:
        page_count = len(pdf_doc)
        for idx in range(page_count):
            page = pdf_doc[idx]
            page_num = idx + 1
            raw_text = page.get_text("text") or ""
            cleaned = clean_extracted_text(raw_text)
            page_ocr = False

            if len(cleaned) < 25:
                try:
                    pix = page.get_pixmap(dpi=150)
                    ocr_text, used = run_ocr_on_image_bytes(pix.tobytes("png"))
                    if used and ocr_text:
                        cleaned = clean_extracted_text(f"{cleaned}\n{ocr_text}")
                        page_ocr = True
                        ocr_used_any = True
                except Exception:
                    pass

            if cleaned:
                first_line = cleaned.split("\n")[0][:120].strip()
                sections.append(
                    ExtractedSection(
                        text=cleaned,
                        location_label=f"Page {page_num}",
                        page_number=page_num,
                        section_title=first_line if len(first_line) > 3 else f"Page {page_num}",
                        metadata={"ocr_applied": page_ocr},
                    )
                )

    return sections, page_count, ocr_used_any


def _extract_docx(file_path: str) -> Tuple[List[ExtractedSection], int, bool]:
    import docx

    doc = docx.Document(file_path)
    sections: List[ExtractedSection] = []
    current_heading = "Document Overview"
    current_lines: List[str] = []
    section_index = 1

    def flush_section() -> None:
        nonlocal section_index, current_lines
        body = clean_extracted_text("\n".join(current_lines))
        if body:
            sections.append(
                ExtractedSection(
                    text=body,
                    location_label=f"Section {section_index} ({current_heading})",
                    page_number=section_index,
                    section_title=current_heading,
                    metadata={"section_index": section_index},
                )
            )
            section_index += 1
        current_lines = []

    for para in doc.paragraphs:
        txt = (para.text or "").strip()
        if not txt:
            continue
        style_name = (para.style.name if para.style else "").lower()
        if style_name.startswith("heading"):
            flush_section()
            current_heading = txt[:140]
            current_lines.append(f"## {txt}")
        else:
            current_lines.append(txt)

    for t_idx, table in enumerate(doc.tables, start=1):
        table_rows: List[str] = []
        for row in table.rows:
            cells = [clean_extracted_text(cell.text) for cell in row.cells]
            if any(cells):
                table_rows.append(" | ".join(cells))
        if table_rows:
            current_lines.append(f"\n[Table {t_idx}]\n" + "\n".join(table_rows))

    flush_section()
    return sections, max(1, len(sections)), False


def _extract_pptx(file_path: str) -> Tuple[List[ExtractedSection], int, bool]:
    from pptx import Presentation

    prs = Presentation(file_path)
    sections: List[ExtractedSection] = []
    slide_count = len(prs.slides)

    for idx, slide in enumerate(prs.slides, start=1):
        slide_title = f"Slide {idx}"
        if slide.shapes.title and slide.shapes.title.text:
            slide_title = slide.shapes.title.text.strip()[:140]

        lines: List[str] = []
        for shape in slide.shapes:
            if getattr(shape, "has_text_frame", False) and shape.text_frame:
                txt = (shape.text_frame.text or "").strip()
                if txt:
                    lines.append(txt)
            if getattr(shape, "has_table", False) and shape.table:
                for row in shape.table.rows:
                    cells = [clean_extracted_text(c.text) for c in row.cells]
                    if any(cells):
                        lines.append(" | ".join(cells))

        if slide.has_notes_slide and slide.notes_slide.notes_text_frame:
            notes = (slide.notes_slide.notes_text_frame.text or "").strip()
            if notes:
                lines.append(f"[Speaker Notes]: {notes}")

        cleaned = clean_extracted_text("\n".join(lines))
        if cleaned:
            sections.append(
                ExtractedSection(
                    text=cleaned,
                    location_label=f"Slide {idx}: {slide_title}",
                    slide_number=idx,
                    page_number=idx,
                    section_title=slide_title,
                    metadata={"slide_number": idx},
                )
            )

    return sections, slide_count, False


def _extract_xlsx(file_path: str) -> Tuple[List[ExtractedSection], int, bool]:
    import openpyxl

    wb = openpyxl.load_workbook(file_path, data_only=True, read_only=True)
    sections: List[ExtractedSection] = []
    sheet_names = wb.sheetnames

    for s_idx, sheet_name in enumerate(sheet_names, start=1):
        ws = wb[sheet_name]
        rows_text: List[str] = []
        row_counter = 0
        for row in ws.iter_rows(values_only=True):
            row_counter += 1
            vals = [str(cell).strip() if cell is not None else "" for cell in row]
            if any(vals):
                non_empty = [v for v in vals if v]
                rows_text.append(f"Row {row_counter}: " + " | ".join(non_empty))

        cleaned = clean_extracted_text("\n".join(rows_text))
        if cleaned:
            sections.append(
                ExtractedSection(
                    text=cleaned,
                    location_label=f"Sheet '{sheet_name}'",
                    sheet_name=sheet_name,
                    page_number=s_idx,
                    section_title=f"Worksheet: {sheet_name}",
                    metadata={"sheet_name": sheet_name, "row_count": len(rows_text)},
                )
            )

    wb.close()
    return sections, len(sheet_names), False


def _extract_txt(file_path: str) -> Tuple[List[ExtractedSection], int, bool]:
    raw_bytes = Path(file_path).read_bytes()
    try:
        raw_text = raw_bytes.decode("utf-8")
    except UnicodeDecodeError:
        raw_text = raw_bytes.decode("latin-1", errors="replace")

    cleaned_full = clean_extracted_text(raw_text)
    if not cleaned_full:
        return [], 0, False

    # Split by markdown or numbered headings if present, otherwise by logical blocks
    blocks = re.split(r"\n(?=#{1,3}\s+|\d+\.\s+[A-Z])", cleaned_full)
    sections: List[ExtractedSection] = []

    for idx, block in enumerate(blocks, start=1):
        block_clean = clean_extracted_text(block)
        if not block_clean:
            continue
        first_line = block_clean.split("\n")[0].lstrip("# ").strip()[:120]
        section_title = first_line if len(first_line) <= 90 else f"Section {idx}"
        sections.append(
            ExtractedSection(
                text=block_clean,
                location_label=f"Section {idx} ({section_title})",
                page_number=idx,
                section_title=section_title,
                metadata={"section_index": idx},
            )
        )

    return sections, len(sections), False


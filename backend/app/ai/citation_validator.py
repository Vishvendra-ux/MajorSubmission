from __future__ import annotations

from typing import Dict, List

from app.ai.interfaces import CitationReference
from app.repositories.vector_repo import RankedChunkResult


def validate_and_map_citations(
    ranked_chunks: List[RankedChunkResult],
    referenced_indices: List[int],
) -> List[CitationReference]:
    """
    Strictly validates citation indices against the actual retrieved chunks.
    Never trusts LLM-generated document titles, page numbers, or excerpts;
    always populates citation metadata from authoritative database records.
    """
    by_index: Dict[int, RankedChunkResult] = {
        idx: item for idx, item in enumerate(ranked_chunks, start=1)
    }

    verified: List[CitationReference] = []
    seen_chunk_ids = set()

    indices_to_use = referenced_indices if referenced_indices else list(by_index.keys())

    for idx in indices_to_use:
        item = by_index.get(idx)
        if item is None:
            continue
        if item.chunk.id in seen_chunk_ids:
            continue
        seen_chunk_ids.add(item.chunk.id)

        excerpt = item.chunk.content.strip()
        if len(excerpt) > 360:
            excerpt = excerpt[:357].rstrip() + "..."

        verified.append(
            CitationReference(
                citation_index=idx,
                chunk_id=item.chunk.id,
                document_id=item.document.id,
                document_title=item.document.title,
                file_type=item.document.file_type,
                location_label=item.chunk.location_label,
                page_number=item.chunk.page_number,
                slide_number=item.chunk.slide_number,
                sheet_name=item.chunk.sheet_name,
                section_title=item.chunk.section_title,
                excerpt=excerpt,
                similarity_score=item.combined_score,
            )
        )

    return verified


from __future__ import annotations

import math
import re
from dataclasses import dataclass
from typing import List, Optional, Sequence

from sqlalchemy.orm import Session

from app.models.entities import Document, DocumentChunk

STOPWORDS = {
    "a", "an", "and", "are", "as", "at", "be", "by", "for", "from", "how", "in",
    "is", "it", "of", "on", "or", "that", "the", "this", "to", "was", "what",
    "when", "where", "which", "who", "why", "will", "with", "can", "our", "we",
    "about", "does", "do", "tell", "me", "please",
}


def tokenize_query(text: str) -> List[str]:
    tokens = re.findall(r"[a-zA-Z0-9_]{2,}", text.lower())
    return [t for t in tokens if t not in STOPWORDS]


def cosine_similarity(vec_a: Optional[Sequence[float]], vec_b: Optional[Sequence[float]]) -> float:
    if not vec_a or not vec_b or len(vec_a) != len(vec_b):
        return 0.0
    dot = 0.0
    norm_a = 0.0
    norm_b = 0.0
    for a, b in zip(vec_a, vec_b):
        dot += a * b
        norm_a += a * a
        norm_b += b * b
    if norm_a <= 1e-12 or norm_b <= 1e-12:
        return 0.0
    return float(dot / (math.sqrt(norm_a) * math.sqrt(norm_b)))


def lexical_overlap_score(query_tokens: List[str], content: str, doc_title: str = "") -> float:
    if not query_tokens:
        return 0.0
    lower_content = content.lower()
    lower_title = doc_title.lower()
    matched = 0
    exact_phrase_bonus = 0.0
    for tok in query_tokens:
        if tok in lower_content or tok in lower_title:
            matched += 1
    if len(query_tokens) >= 2:
        phrase = " ".join(query_tokens[:3])
        if phrase in lower_content:
            exact_phrase_bonus = 0.15
    return min(1.0, (matched / len(query_tokens)) + exact_phrase_bonus)


@dataclass
class RankedChunkResult:
    chunk: DocumentChunk
    document: Document
    semantic_score: float
    keyword_score: float
    combined_score: float
    highlighted_snippet: str


def build_highlighted_snippet(content: str, query_tokens: List[str], max_len: int = 340) -> str:
    clean = re.sub(r"\s+", " ", content).strip()
    if not clean:
        return ""
    best_pos = 0
    lower = clean.lower()
    for tok in query_tokens:
        idx = lower.find(tok)
        if idx != -1:
            best_pos = max(0, idx - 60)
            break
    snippet = clean[best_pos : best_pos + max_len]
    if best_pos > 0:
        snippet = "..." + snippet
    if best_pos + max_len < len(clean):
        snippet = snippet + "..."

    for tok in sorted(set(query_tokens), key=len, reverse=True):
        if len(tok) < 2:
            continue
        pattern = re.compile(rf"\b({re.escape(tok)}\w*)\b", re.IGNORECASE)
        snippet = pattern.sub(r"<mark>\1</mark>", snippet)
    return snippet


def search_authorised_chunks(
    db: Session,
    *,
    organisation_id: str,
    authorised_document_ids: List[str],
    query_text: str,
    query_embedding: List[float],
    search_mode: str = "hybrid",  # semantic | keyword | hybrid
    top_k: int = 10,
    min_score: float = 0.12,
) -> List[RankedChunkResult]:
    """
    Retrieves and ranks chunks strictly within `authorised_document_ids` and `organisation_id`.
    Never touches or returns chunks from unauthorised documents or other organisations.
    """
    if not authorised_document_ids:
        return []

    rows = (
        db.query(DocumentChunk, Document)
        .join(Document, DocumentChunk.document_id == Document.id)
        .filter(
            DocumentChunk.organisation_id == organisation_id,
            Document.organisation_id == organisation_id,
            Document.status == "ready",
            DocumentChunk.document_id.in_(authorised_document_ids),
        )
        .all()
    )

    query_tokens = tokenize_query(query_text)
    results: List[RankedChunkResult] = []

    for chunk, doc in rows:
        sem_score = cosine_similarity(query_embedding, chunk.embedding)
        kw_score = lexical_overlap_score(
            query_tokens,
            f"{chunk.section_title or ''} {chunk.location_label or ''} {chunk.content}",
            doc.title,
        )

        if search_mode == "semantic":
            combined = sem_score
        elif search_mode == "keyword":
            combined = kw_score
        else:
            # Hybrid ranking: combines semantic vector similarity and lexical overlap
            combined = (0.65 * sem_score) + (0.35 * kw_score)
            if kw_score >= 0.5:
                combined = max(combined, 0.55 * kw_score + 0.45 * sem_score)

        if combined >= min_score or (search_mode == "keyword" and kw_score > 0):
            snippet = build_highlighted_snippet(chunk.content, query_tokens)
            results.append(
                RankedChunkResult(
                    chunk=chunk,
                    document=doc,
                    semantic_score=round(float(sem_score), 4),
                    keyword_score=round(float(kw_score), 4),
                    combined_score=round(float(combined), 4),
                    highlighted_snippet=snippet,
                )
            )

    results.sort(key=lambda r: r.combined_score, reverse=True)
    return results[:top_k]

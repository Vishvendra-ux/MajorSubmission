from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional


@dataclass
class CitationReference:
    citation_index: int
    chunk_id: str
    document_id: str
    document_title: str
    file_type: str
    location_label: str
    page_number: Optional[int]
    slide_number: Optional[int]
    sheet_name: Optional[str]
    section_title: Optional[str]
    excerpt: str
    similarity_score: float


@dataclass
class GroundedGenerationResult:
    answer: str
    evidence_sufficient: bool
    confidence_score: float
    citations: List[CitationReference]
    provider_used: str
    model_used: str
    retrieval_metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class SummaryGenerationResult:
    executive_summary: str
    detailed_summary: str
    main_points: List[str]
    entities: Dict[str, List[str]]
    risks_and_actions: List[str]
    citations: List[Dict[str, Any]]
    interpretation_notes: str
    provider_used: str
    model_used: str


class EmbeddingProvider(ABC):
    provider_name: str
    model_name: str
    dimension: int

    @abstractmethod
    def embed_texts(self, texts: List[str]) -> List[List[float]]:
        raise NotImplementedError

    def embed_query(self, text: str) -> List[float]:
        results = self.embed_texts([text])
        return results[0] if results else [0.0] * self.dimension


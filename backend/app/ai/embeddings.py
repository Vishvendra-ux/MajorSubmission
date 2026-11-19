from __future__ import annotations

import hashlib
import math
import re
from typing import Dict, List, Tuple

import httpx

from app.ai.interfaces import EmbeddingProvider
from app.core.config import get_settings
from app.core.logging import get_logger

logger = get_logger(__name__)

# Domain-aware semantic synonym expansion groups for deterministic local embeddings
SEMANTIC_SYNONYM_CLUSTERS: Dict[str, str] = {
    "vacation": "leave_timeoff_pto_holiday",
    "pto": "leave_timeoff_pto_holiday",
    "holiday": "leave_timeoff_pto_holiday",
    "leave": "leave_timeoff_pto_holiday",
    "timeoff": "leave_timeoff_pto_holiday",
    "annual": "leave_timeoff_pto_holiday",
    "salary": "compensation_payroll_remuneration_bonus",
    "compensation": "compensation_payroll_remuneration_bonus",
    "payroll": "compensation_payroll_remuneration_bonus",
    "bonus": "compensation_payroll_remuneration_bonus",
    "password": "security_authentication_credentials_mfa_access",
    "mfa": "security_authentication_credentials_mfa_access",
    "2fa": "security_authentication_credentials_mfa_access",
    "authentication": "security_authentication_credentials_mfa_access",
    "credentials": "security_authentication_credentials_mfa_access",
    "breach": "incident_security_vulnerability_response_sla",
    "incident": "incident_security_vulnerability_response_sla",
    "vulnerability": "incident_security_vulnerability_response_sla",
    "outage": "incident_security_vulnerability_response_sla",
    "budget": "finance_revenue_expenditure_cost_forecast",
    "revenue": "finance_revenue_expenditure_cost_forecast",
    "expense": "finance_revenue_expenditure_cost_forecast",
    "cost": "finance_revenue_expenditure_cost_forecast",
    "financial": "finance_revenue_expenditure_cost_forecast",
    "quarterly": "finance_revenue_expenditure_cost_forecast",
    "remote": "work_from_home_hybrid_telework_policy",
    "hybrid": "work_from_home_hybrid_telework_policy",
    "wfh": "work_from_home_hybrid_telework_policy",
    "telework": "work_from_home_hybrid_telework_policy",
    "retention": "data_privacy_gdpr_deletion_compliance",
    "gdpr": "data_privacy_gdpr_deletion_compliance",
    "privacy": "data_privacy_gdpr_deletion_compliance",
    "encryption": "cryptography_tls_aes_security_protection",
    "encrypted": "cryptography_tls_aes_security_protection",
    "onboarding": "training_orientation_new_hire_employee",
    "reimbursement": "expense_travel_claim_receipt_approval",
    "travel": "expense_travel_claim_receipt_approval",
}


def _simple_stem(word: str) -> str:
    for suffix in ("ingly", "edly", "ments", "ment", "ations", "ation", "ings", "ing", "ed", "ies", "es", "s"):
        if len(word) > len(suffix) + 3 and word.endswith(suffix):
            if suffix == "ies":
                return word[:-3] + "y"
            return word[: -len(suffix)]
    return word


class LocalDeterministicEmbeddingProvider(EmbeddingProvider):
    """
    Deterministic 384-dimensional feature-hashed semantic + lexical embedding model.
    Combines word stems, semantic synonym clusters, word bigrams, and character 4-grams
    with sublinear TF scaling and L2 unit normalization.
    """

    def __init__(self, dimension: int = 384) -> None:
        self.provider_name = "local_deterministic"
        self.model_name = f"sumind-ngram-semantic-{dimension}d"
        self.dimension = dimension

    def _hash_feature(self, feature: str) -> Tuple[int, float]:
        digest = hashlib.blake2b(feature.encode("utf-8"), digest_size=8).digest()
        val = int.from_bytes(digest, "little")
        idx = val % self.dimension
        sign = 1.0 if ((val >> 32) & 1) == 0 else -1.0
        return idx, sign

    def _embed_single(self, text: str) -> List[float]:
        vec = [0.0] * self.dimension
        if not text or not text.strip():
            return vec

        words = re.findall(r"[a-zA-Z0-9]{2,}", text.lower())
        if not words:
            return vec

        counts: Dict[str, float] = {}
        stems: List[str] = []

        for w in words:
            stem = _simple_stem(w)
            stems.append(stem)
            counts[f"w:{w}"] = counts.get(f"w:{w}", 0.0) + 1.4
            counts[f"s:{stem}"] = counts.get(f"s:{stem}", 0.0) + 1.8

            cluster = SEMANTIC_SYNONYM_CLUSTERS.get(w) or SEMANTIC_SYNONYM_CLUSTERS.get(stem)
            if cluster:
                counts[f"c:{cluster}"] = counts.get(f"c:{cluster}", 0.0) + 2.2

            if len(w) >= 4:
                for i in range(len(w) - 3):
                    ngram = w[i : i + 4]
                    counts[f"g:{ngram}"] = counts.get(f"g:{ngram}", 0.0) + 0.35

        for i in range(len(stems) - 1):
            bg = f"b:{stems[i]}_{stems[i + 1]}"
            counts[bg] = counts.get(bg, 0.0) + 1.1

        for feat, weight in counts.items():
            scaled = 1.0 + math.log1p(weight)
            idx, sign = self._hash_feature(feat)
            vec[idx] += sign * scaled

        norm = math.sqrt(sum(v * v for v in vec))
        if norm > 1e-12:
            vec = [round(v / norm, 6) for v in vec]
        return vec

    def embed_texts(self, texts: List[str]) -> List[List[float]]:
        return [self._embed_single(t) for t in texts]


class GeminiEmbeddingProvider(EmbeddingProvider):
    """Google Gemini text-embedding provider with automatic fallback if API key is absent."""

    def __init__(self, api_key: str, model_name: str = "text-embedding-004", dimension: int = 384) -> None:
        self.provider_name = "gemini"
        self.model_name = model_name
        self.dimension = dimension
        self._api_key = api_key
        self._fallback = LocalDeterministicEmbeddingProvider(dimension=dimension)

    def embed_texts(self, texts: List[str]) -> List[List[float]]:
        if not self._api_key:
            return self._fallback.embed_texts(texts)

        settings = get_settings()
        results: List[List[float]] = []
        try:
            with httpx.Client(timeout=15.0) as client:
                for text in texts:
                    url = (
                        f"{settings.LLM_BASE_URL}/models/{self.model_name}:embedContent"
                        f"?key={self._api_key}"
                    )
                    resp = client.post(
                        url,
                        json={
                            "model": f"models/{self.model_name}",
                            "content": {"parts": [{"text": text[:8000]}]},
                            "outputDimensionality": self.dimension,
                        },
                    )
                    resp.raise_for_status()
                    data = resp.json()
                    values = data.get("embedding", {}).get("values", [])
                    if len(values) == self.dimension:
                        results.append([float(x) for x in values])
                    else:
                        results.append(self._fallback.embed_query(text))
            return results
        except Exception as exc:
            logger.warning("Gemini embedding call failed (%s); falling back to local deterministic embeddings.", exc)
            return self._fallback.embed_texts(texts)


def get_embedding_provider() -> EmbeddingProvider:
    settings = get_settings()
    if settings.EMBEDDING_PROVIDER == "gemini" and settings.EMBEDDING_API_KEY:
        return GeminiEmbeddingProvider(
            api_key=settings.EMBEDDING_API_KEY,
            model_name=settings.EMBEDDING_MODEL,
            dimension=settings.EMBEDDING_DIMENSION,
        )
    return LocalDeterministicEmbeddingProvider(dimension=settings.EMBEDDING_DIMENSION)

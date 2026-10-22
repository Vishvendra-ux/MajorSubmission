from __future__ import annotations

import time
from datetime import datetime
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.orm import Session

from app.ai.embeddings import get_embedding_provider
from app.core.rate_limit import enforce_api_rate_limit
from app.db.session import get_db
from app.models.entities import Workspace
from app.repositories.vector_repo import search_authorised_chunks
from app.schemas.api_schemas import SearchRequest
from app.security.permissions import get_authorised_documents
from app.security.rbac import AuthContext, get_current_context
from app.security.sanitization import sanitize_user_text
from app.utils.pagination import paginate_sequence

router = APIRouter(prefix="/search", tags=["Semantic Search"])


@router.post("")
def execute_semantic_search(
    payload: SearchRequest,
    request: Request,
    ctx: AuthContext = Depends(get_current_context),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    enforce_api_rate_limit(request)
    start_time = time.time()

    clean_query = sanitize_user_text(payload.query, 500)

    # Step 1: Resolve authorised ready documents with filters BEFORE querying chunks
    authorised_docs = get_authorised_documents(
        db,
        ctx,
        only_ready=True,
        workspace_id=payload.workspace_id,
        file_type=payload.file_type,
        owner_id=payload.owner_id,
        scoped_document_ids=payload.document_ids,
    )

    if payload.date_from:
        try:
            dt_from = datetime.fromisoformat(payload.date_from)
            authorised_docs = [
                d for d in authorised_docs if d.created_at.replace(tzinfo=None) >= dt_from.replace(tzinfo=None)
            ]
        except ValueError:
            pass

    if payload.date_to:
        try:
            dt_to = datetime.fromisoformat(payload.date_to)
            authorised_docs = [
                d for d in authorised_docs if d.created_at.replace(tzinfo=None) <= dt_to.replace(tzinfo=None)
            ]
        except ValueError:
            pass

    authorised_doc_ids = [d.id for d in authorised_docs]

    # Step 2: Generate query embedding
    embedder = get_embedding_provider()
    query_vec = embedder.embed_query(clean_query)

    # Step 3: Search only within authorised document chunks
    all_ranked = search_authorised_chunks(
        db,
        organisation_id=ctx.organisation.id,
        authorised_document_ids=authorised_doc_ids,
        query_text=clean_query,
        query_embedding=query_vec,
        search_mode=payload.search_mode,
        top_k=100,
        min_score=0.08,
    )

    paged_results, page_meta = paginate_sequence(
        all_ranked, page=payload.page, page_size=payload.page_size
    )

    workspace_cache: Dict[str, Optional[str]] = {}
    items: List[Dict[str, Any]] = []
    for rank_idx, r in enumerate(
        paged_results, start=(page_meta["page"] - 1) * page_meta["page_size"] + 1
    ):
        ws_id = r.document.workspace_id
        ws_name: Optional[str] = None
        if ws_id:
            if ws_id not in workspace_cache:
                ws_obj = db.query(Workspace).filter(Workspace.id == ws_id).first()
                workspace_cache[ws_id] = ws_obj.name if ws_obj else None
            ws_name = workspace_cache[ws_id]

        items.append(
            {
                "rank": rank_idx,
                "chunk_id": r.chunk.id,
                "document_id": r.document.id,
                "document_title": r.document.title,
                "original_filename": r.document.original_filename,
                "file_type": r.document.file_type,
                "visibility": r.document.visibility,
                "workspace_id": ws_id,
                "workspace_name": ws_name,
                "location_label": r.chunk.location_label,
                "page_number": r.chunk.page_number,
                "slide_number": r.chunk.slide_number,
                "sheet_name": r.chunk.sheet_name,
                "section_title": r.chunk.section_title,
                "snippet": r.highlighted_snippet,
                "content": r.chunk.content,
                "semantic_score": r.semantic_score,
                "keyword_score": r.keyword_score,
                "combined_score": r.combined_score,
                "created_at": r.document.created_at,
            }
        )

    elapsed_ms = int((time.time() - start_time) * 1000)
    return {
        "query": clean_query,
        "search_mode": payload.search_mode,
        "authorised_documents_searched": len(authorised_doc_ids),
        "embedding_provider": embedder.provider_name,
        "embedding_model": embedder.model_name,
        "latency_ms": elapsed_ms,
        "items": items,
        "pagination": page_meta,
    }


@router.get("/suggestions")
def get_search_suggestions(
    q: Optional[str] = Query(default=None),
    ctx: AuthContext = Depends(get_current_context),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    authorised_docs = get_authorised_documents(db, ctx, only_ready=True)
    doc_titles = [d.title for d in authorised_docs[:8]]

    default_prompts = [
        "What is our incident response SLA for critical security breaches?",
        "How many days of paid annual leave and remote work are employees allowed?",
        "What are the encryption and data retention requirements in our security policy?",
        "What were the Q3 revenue, R&D expenditure, and cloud infrastructure budgets?",
        "What is the onboarding checklist and compliance training deadline for new hires?",
    ]
    if q and q.strip():
        needle = q.strip().lower()
        filtered_prompts = [p for p in default_prompts if needle in p.lower()]
        filtered_titles = [t for t in doc_titles if needle in t.lower()]
        return {
            "suggested_queries": filtered_prompts or default_prompts[:3],
            "matching_documents": filtered_titles[:5],
        }

    return {
        "suggested_queries": default_prompts,
        "matching_documents": doc_titles[:5],
    }


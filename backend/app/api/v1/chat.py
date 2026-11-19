from __future__ import annotations

import time
from typing import Any, Dict, List, Optional, Tuple

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.orm import Session

from app.ai.embeddings import get_embedding_provider
from app.ai.llm import generate_grounded_rag_response
from app.core.config import get_runtime_config
from app.core.rate_limit import enforce_api_rate_limit
from app.db.session import get_db
from app.models.base import utcnow
from app.models.entities import (
    AuditLog,
    Conversation,
    Document,
    Feedback,
    Message,
)
from app.repositories.vector_repo import search_authorised_chunks
from app.schemas.api_schemas import (
    ConversationCreateRequest,
    ConversationUpdateRequest,
    FeedbackCreateRequest,
    MessageCreateRequest,
)
from app.security.permissions import can_access_document, get_authorised_documents
from app.security.rbac import AuthContext, get_current_context
from app.security.sanitization import sanitize_user_text
from app.utils.pagination import paginate_sequence

router = APIRouter(prefix="/chat", tags=["AI Knowledge Assistant"])


def _serialize_message(
    db: Session,
    msg: Message,
    ctx: AuthContext,
) -> Dict[str, Any]:
    # Recheck permissions on cited documents when viewing historical conversations
    verified_citations: List[Dict[str, Any]] = []
    for cite in msg.citations_json or []:
        doc_id = cite.get("document_id")
        doc = db.query(Document).filter(Document.id == doc_id).first() if doc_id else None
        still_accessible = bool(
            doc and can_access_document(db, ctx, doc, required_level="view")
        )
        verified_citations.append(
            {
                **cite,
                "is_accessible": still_accessible,
                "excerpt": cite.get("excerpt", "")
                if still_accessible
                else "[Access to this cited source has been revoked or restricted]",
            }
        )

    user_feedback = (
        db.query(Feedback)
        .filter(
            Feedback.message_id == msg.id,
            Feedback.user_id == ctx.user.id,
        )
        .first()
    )

    return {
        "id": msg.id,
        "conversation_id": msg.conversation_id,
        "role": msg.role,
        "content": msg.content,
        "citations": verified_citations,
        "evidence_sufficient": msg.evidence_sufficient,
        "confidence_score": msg.confidence_score,
        "provider_used": msg.provider_used,
        "model_used": msg.model_used,
        "retrieval_metadata": msg.retrieval_metadata_json or {},
        "latency_ms": msg.latency_ms,
        "user_feedback": {
            "id": user_feedback.id,
            "rating": user_feedback.rating,
            "comment": user_feedback.comment,
            "issue_category": user_feedback.issue_category,
            "updated_at": user_feedback.updated_at,
        }
        if user_feedback
        else None,
        "created_at": msg.created_at,
    }


def _serialize_conversation(
    db: Session,
    conv: Conversation,
    include_messages: bool = False,
    ctx: Optional[AuthContext] = None,
) -> Dict[str, Any]:
    msg_count = db.query(Message).filter(Message.conversation_id == conv.id).count()
    last_msg = (
        db.query(Message)
        .filter(Message.conversation_id == conv.id)
        .order_by(Message.created_at.desc())
        .first()
    )
    payload: Dict[str, Any] = {
        "id": conv.id,
        "organisation_id": conv.organisation_id,
        "user_id": conv.user_id,
        "workspace_id": conv.workspace_id,
        "title": conv.title,
        "scoped_document_ids": conv.scoped_document_ids_json or [],
        "is_archived": conv.is_archived,
        "message_count": msg_count,
        "last_message_preview": (last_msg.content[:140] if last_msg else None),
        "created_at": conv.created_at,
        "updated_at": conv.updated_at,
    }
    if include_messages and ctx is not None:
        msgs = (
            db.query(Message)
            .filter(Message.conversation_id == conv.id)
            .order_by(Message.created_at.asc())
            .all()
        )
        payload["messages"] = [_serialize_message(db, m, ctx) for m in msgs]
    return payload


def _get_owned_conversation(
    db: Session,
    ctx: AuthContext,
    conversation_id: str,
) -> Conversation:
    conv = db.query(Conversation).filter(Conversation.id == conversation_id).first()
    if not conv:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Conversation not found.",
        )
    if conv.organisation_id != ctx.organisation.id or (
        conv.user_id != ctx.user.id and ctx.role != "admin"
    ):
        db.add(
            AuditLog(
                organisation_id=ctx.organisation.id,
                actor_user_id=ctx.user.id,
                actor_email=ctx.user.email,
                actor_role=ctx.role,
                action="security.conversation_access_denied",
                target_type="conversation",
                target_id=conversation_id,
                status="denied",
                ip_address=ctx.ip_address,
                user_agent=ctx.user_agent,
                metadata_json={},
            )
        )
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to access this conversation.",
        )
    return conv


@router.post("/conversations", status_code=status.HTTP_201_CREATED)
def create_conversation(
    payload: ConversationCreateRequest,
    request: Request,
    ctx: AuthContext = Depends(get_current_context),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    enforce_api_rate_limit(request)

    # Filter scoped_document_ids to only documents the user is actually authorised to view
    valid_scoped_ids: List[str] = []
    if payload.scoped_document_ids:
        auth_docs = get_authorised_documents(
            db,
            ctx,
            only_ready=False,
            scoped_document_ids=payload.scoped_document_ids,
        )
        valid_scoped_ids = [d.id for d in auth_docs]

    title = sanitize_user_text(
        payload.title
        or (payload.initial_question[:80] if payload.initial_question else "New Knowledge Session"),
        200,
    )
    conv = Conversation(
        organisation_id=ctx.organisation.id,
        user_id=ctx.user.id,
        workspace_id=payload.workspace_id,
        title=title,
        scoped_document_ids_json=valid_scoped_ids,
        is_archived=False,
    )
    db.add(conv)
    db.commit()
    db.refresh(conv)

    if payload.initial_question and payload.initial_question.strip():
        _process_question_in_conversation(
            db=db,
            ctx=ctx,
            conv=conv,
            question=payload.initial_question.strip(),
            scoped_document_ids=valid_scoped_ids or None,
            search_mode="hybrid",
        )
        db.refresh(conv)

    return _serialize_conversation(db, conv, include_messages=True, ctx=ctx)


@router.get("/conversations")
def list_conversations(
    q: Optional[str] = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    ctx: AuthContext = Depends(get_current_context),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    query = (
        db.query(Conversation)
        .filter(
            Conversation.organisation_id == ctx.organisation.id,
            Conversation.user_id == ctx.user.id,
        )
        .order_by(Conversation.updated_at.desc())
    )
    convs = query.all()
    if q and q.strip():
        needle = q.strip().lower()
        convs = [c for c in convs if needle in c.title.lower()]

    paged, meta = paginate_sequence(convs, page=page, page_size=page_size)
    return {
        "items": [_serialize_conversation(db, c, include_messages=False) for c in paged],
        "pagination": meta,
    }


@router.get("/conversations/{conversation_id}")
def get_conversation_detail(
    conversation_id: str,
    ctx: AuthContext = Depends(get_current_context),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    conv = _get_owned_conversation(db, ctx, conversation_id)
    return _serialize_conversation(db, conv, include_messages=True, ctx=ctx)


@router.patch("/conversations/{conversation_id}")
def update_conversation(
    conversation_id: str,
    payload: ConversationUpdateRequest,
    ctx: AuthContext = Depends(get_current_context),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    conv = _get_owned_conversation(db, ctx, conversation_id)
    if payload.title is not None:
        conv.title = sanitize_user_text(payload.title, 200)
    if payload.scoped_document_ids is not None:
        if payload.scoped_document_ids:
            auth_docs = get_authorised_documents(
                db, ctx, scoped_document_ids=payload.scoped_document_ids
            )
            conv.scoped_document_ids_json = [d.id for d in auth_docs]
        else:
            conv.scoped_document_ids_json = []
    if payload.is_archived is not None:
        conv.is_archived = payload.is_archived

    db.commit()
    db.refresh(conv)
    return _serialize_conversation(db, conv, include_messages=True, ctx=ctx)


@router.delete("/conversations/{conversation_id}")
def delete_conversation(
    conversation_id: str,
    ctx: AuthContext = Depends(get_current_context),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    conv = _get_owned_conversation(db, ctx, conversation_id)
    db.delete(conv)
    db.commit()
    return {"message": "Conversation deleted.", "deleted_conversation_id": conversation_id}


def _process_question_in_conversation(
    *,
    db: Session,
    ctx: AuthContext,
    conv: Conversation,
    question: str,
    scoped_document_ids: Optional[List[str]],
    search_mode: str,
) -> Tuple[Message, Message]:
    start_time = time.time()
    clean_question = sanitize_user_text(question, 3000)

    # Save user message
    user_msg = Message(
        conversation_id=conv.id,
        organisation_id=ctx.organisation.id,
        user_id=ctx.user.id,
        role="user",
        content=clean_question,
        citations_json=[],
        evidence_sufficient=True,
        confidence_score=1.0,
    )
    db.add(user_msg)
    db.flush()

    # Update conversation title if it was default
    if conv.title in ("New Knowledge Session", "Untitled Conversation"):
        conv.title = clean_question[:90]

    # Identify permitted ready documents (re-checking permissions on every turn!)
    effective_scope = (
        scoped_document_ids
        if scoped_document_ids is not None
        else (conv.scoped_document_ids_json or None)
    )
    authorised_docs = get_authorised_documents(
        db,
        ctx,
        only_ready=True,
        workspace_id=conv.workspace_id,
        scoped_document_ids=effective_scope if effective_scope else None,
    )
    authorised_doc_ids = [d.id for d in authorised_docs]

    # Prior conversation history for follow-up context
    prior_msgs = (
        db.query(Message)
        .filter(Message.conversation_id == conv.id, Message.id != user_msg.id)
        .order_by(Message.created_at.asc())
        .all()
    )
    history_dicts = [{"role": m.role, "content": m.content} for m in prior_msgs[-4:]]

    # Expand follow-up query with recent user question terms for retrieval if needed
    retrieval_query = clean_question
    if len(clean_question.split()) <= 5 and history_dicts:
        prev_user_qs = [h["content"] for h in history_dicts if h["role"] == "user"]
        if prev_user_qs:
            retrieval_query = f"{prev_user_qs[-1]} {clean_question}"

    embedder = get_embedding_provider()
    query_vec = embedder.embed_query(retrieval_query)

    cfg = get_runtime_config()
    top_k = int(cfg.get("rag_top_k", 6))
    min_sim = float(cfg.get("rag_min_similarity_score", 0.15))

    ranked_chunks = search_authorised_chunks(
        db,
        organisation_id=ctx.organisation.id,
        authorised_document_ids=authorised_doc_ids,
        query_text=retrieval_query,
        query_embedding=query_vec,
        search_mode=search_mode,
        top_k=top_k,
        min_score=min_sim * 0.6,
    )

    gen_result = generate_grounded_rag_response(
        question=clean_question,
        ranked_chunks=ranked_chunks,
        conversation_history=history_dicts,
    )

    latency_ms = int((time.time() - start_time) * 1000)
    serialized_citations = [
        {
            "citation_index": c.citation_index,
            "chunk_id": c.chunk_id,
            "document_id": c.document_id,
            "document_title": c.document_title,
            "file_type": c.file_type,
            "location_label": c.location_label,
            "page_number": c.page_number,
            "slide_number": c.slide_number,
            "sheet_name": c.sheet_name,
            "section_title": c.section_title,
            "excerpt": c.excerpt,
            "similarity_score": c.similarity_score,
        }
        for c in gen_result.citations
    ]

    assistant_msg = Message(
        conversation_id=conv.id,
        organisation_id=ctx.organisation.id,
        user_id=None,
        role="assistant",
        content=gen_result.answer,
        citations_json=serialized_citations,
        evidence_sufficient=gen_result.evidence_sufficient,
        confidence_score=gen_result.confidence_score,
        provider_used=gen_result.provider_used,
        model_used=gen_result.model_used,
        retrieval_metadata_json={
            **gen_result.retrieval_metadata,
            "authorised_documents_in_scope": len(authorised_doc_ids),
            "scoped_document_titles": [d.title for d in authorised_docs[:10]],
            "search_mode": search_mode,
        },
        latency_ms=latency_ms,
    )
    db.add(assistant_msg)
    conv.updated_at = utcnow()
    db.commit()
    db.refresh(user_msg)
    db.refresh(assistant_msg)
    return user_msg, assistant_msg


@router.post("/conversations/{conversation_id}/messages", status_code=status.HTTP_201_CREATED)
def ask_question_in_conversation(
    conversation_id: str,
    payload: MessageCreateRequest,
    request: Request,
    ctx: AuthContext = Depends(get_current_context),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    enforce_api_rate_limit(request)
    conv = _get_owned_conversation(db, ctx, conversation_id)

    if payload.scoped_document_ids is not None:
        if payload.scoped_document_ids:
            # Verify every requested scoped document is authorised for this user
            for req_doc_id in payload.scoped_document_ids:
                doc_obj = db.query(Document).filter(Document.id == req_doc_id).first()
                if not doc_obj or not can_access_document(db, ctx, doc_obj, required_level="view"):
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail="One or more selected scope documents are outside your permitted access.",
                    )
            conv.scoped_document_ids_json = payload.scoped_document_ids

    user_msg, assistant_msg = _process_question_in_conversation(
        db=db,
        ctx=ctx,
        conv=conv,
        question=payload.question,
        scoped_document_ids=payload.scoped_document_ids,
        search_mode=payload.search_mode,
    )

    return {
        "conversation_id": conv.id,
        "user_message": _serialize_message(db, user_msg, ctx),
        "assistant_message": _serialize_message(db, assistant_msg, ctx),
    }


@router.post("/messages/{message_id}/feedback", status_code=status.HTTP_201_CREATED)
def submit_message_feedback(
    message_id: str,
    payload: FeedbackCreateRequest,
    ctx: AuthContext = Depends(get_current_context),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    msg = db.query(Message).filter(Message.id == message_id).first()
    if not msg:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Target assistant message not found.",
        )
    if msg.organisation_id != ctx.organisation.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot submit feedback for a message outside your organisation.",
        )
    if msg.role != "assistant":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Feedback can only be submitted on assistant responses.",
        )

    conv = _get_owned_conversation(db, ctx, msg.conversation_id)

    clean_comment = sanitize_user_text(payload.comment or "", 1500) if payload.comment else None
    existing = (
        db.query(Feedback)
        .filter(
            Feedback.user_id == ctx.user.id,
            Feedback.message_id == msg.id,
        )
        .first()
    )

    if existing:
        if existing.rating == payload.rating and (existing.comment or None) == clean_comment:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Duplicate feedback submission: you have already recorded this exact rating for this message.",
            )
        existing.rating = payload.rating
        existing.comment = clean_comment
        existing.issue_category = payload.issue_category
        db.commit()
        db.refresh(existing)
        fb = existing
    else:
        fb = Feedback(
            organisation_id=ctx.organisation.id,
            user_id=ctx.user.id,
            conversation_id=conv.id,
            message_id=msg.id,
            rating=payload.rating,
            comment=clean_comment,
            issue_category=payload.issue_category,
            model_metadata_json={
                "provider_used": msg.provider_used,
                "model_used": msg.model_used,
                "evidence_sufficient": msg.evidence_sufficient,
                "citation_count": len(msg.citations_json or []),
            },
        )
        db.add(fb)
        db.add(
            AuditLog(
                organisation_id=ctx.organisation.id,
                actor_user_id=ctx.user.id,
                actor_email=ctx.user.email,
                actor_role=ctx.role,
                action="assistant.feedback_submitted",
                target_type="message",
                target_id=msg.id,
                status="success",
                ip_address=ctx.ip_address,
                user_agent=ctx.user_agent,
                metadata_json={"rating": payload.rating},
            )
        )
        db.commit()
        db.refresh(fb)

    return {
        "id": fb.id,
        "message_id": fb.message_id,
        "conversation_id": fb.conversation_id,
        "rating": fb.rating,
        "comment": fb.comment,
        "issue_category": fb.issue_category,
        "model_metadata": fb.model_metadata_json,
        "created_at": fb.created_at,
        "updated_at": fb.updated_at,
    }


@router.get("/feedback")
def list_feedback_history(
    rating: Optional[str] = Query(default=None),
    scope: str = Query(default="mine"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    ctx: AuthContext = Depends(get_current_context),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    query = (
        db.query(Feedback, Message, Conversation)
        .join(Message, Feedback.message_id == Message.id)
        .join(Conversation, Feedback.conversation_id == Conversation.id)
        .filter(Feedback.organisation_id == ctx.organisation.id)
    )
    if scope != "organisation" or ctx.role not in ("admin", "manager"):
        query = query.filter(Feedback.user_id == ctx.user.id)

    if rating in ("positive", "negative"):
        query = query.filter(Feedback.rating == rating)

    rows = query.order_by(Feedback.created_at.desc()).all()
    paged, meta = paginate_sequence(rows, page=page, page_size=page_size)

    items = []
    for fb, msg, conv in paged:
        items.append(
            {
                "id": fb.id,
                "rating": fb.rating,
                "comment": fb.comment,
                "issue_category": fb.issue_category,
                "conversation_id": conv.id,
                "conversation_title": conv.title,
                "message_id": msg.id,
                "answer_excerpt": msg.content[:220],
                "provider_used": msg.provider_used,
                "model_used": msg.model_used,
                "created_at": fb.created_at,
                "updated_at": fb.updated_at,
            }
        )
    return {"items": items, "pagination": meta}

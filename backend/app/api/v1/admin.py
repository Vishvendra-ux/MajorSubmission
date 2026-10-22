from __future__ import annotations

from collections import Counter
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.ai.embeddings import get_embedding_provider
from app.api.v1.documents import serialize_document
from app.core.config import (
    get_runtime_config,
    get_settings,
    update_runtime_config,
)
from app.db.session import get_db, get_db_status
from app.models.entities import (
    AuditLog,
    Conversation,
    Document,
    DocumentChunk,
    DocumentSummary,
    Feedback,
    Message,
    OrganisationMembership,
    ProcessingJob,
    User,
    Workspace,
    WorkspaceMembership,
)
from app.repositories.mongo_repo import mongo_repo
from app.schemas.api_schemas import SystemConfigUpdateRequest
from app.security.permissions import get_authorised_documents
from app.security.rbac import AuthContext, get_current_context, require_roles
from app.utils.pagination import paginate_sequence
from app.workers.celery_app import get_worker_status
from app.workers.tasks import dispatch_ingestion_job

router = APIRouter(tags=["Dashboards, Analytics, Administration & Health"])


@router.get("/health")
def health_check() -> Dict[str, Any]:
    settings = get_settings()
    embedder = get_embedding_provider()
    llm_configured = bool(
        settings.LLM_PROVIDER in ("extractive_grounded", "mock_test")
        or settings.LLM_API_KEY
    )
    return {
        "status": "healthy",
        "application": settings.APP_NAME,
        "environment": settings.APP_ENV,
        "services": {
            "postgresql": get_db_status(),
            "mongodb": mongo_repo.get_status(),
            "worker_queue": get_worker_status(),
            "ai_provider": {
                "llm_provider": settings.LLM_PROVIDER,
                "llm_model": settings.LLM_MODEL,
                "api_key_configured": bool(settings.LLM_API_KEY),
                "extractive_grounded_fallback_enabled": settings.ALLOW_EXTRACTIVE_GROUNDED_FALLBACK,
                "operational": llm_configured or settings.ALLOW_EXTRACTIVE_GROUNDED_FALLBACK,
                "embedding_provider": embedder.provider_name,
                "embedding_model": embedder.model_name,
                "embedding_dimension": embedder.dimension,
            },
        },
    }


@router.get("/dashboard/overview")
def get_user_dashboard_overview(
    days: int = Query(default=30, ge=1, le=365),
    ctx: AuthContext = Depends(get_current_context),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """
    Returns real database-backed metrics scoped to the authenticated user's permissions.
    """
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    accessible_docs = get_authorised_documents(db, ctx, only_ready=False)
    accessible_doc_ids = [d.id for d in accessible_docs]

    ready_docs = [d for d in accessible_docs if d.status == "ready"]
    processing_docs = [d for d in accessible_docs if d.status in ("uploaded", "queued", "processing")]
    failed_docs = [d for d in accessible_docs if d.status == "failed"]

    summaries_count = (
        db.query(DocumentSummary)
        .filter(
            DocumentSummary.organisation_id == ctx.organisation.id,
            DocumentSummary.document_id.in_(accessible_doc_ids),
        )
        .count()
        if accessible_doc_ids
        else 0
    )

    if ctx.role == "admin":
        questions_asked = (
            db.query(Message)
            .filter(
                Message.organisation_id == ctx.organisation.id,
                Message.role == "user",
            )
            .count()
        )
        feedbacks = (
            db.query(Feedback)
            .filter(Feedback.organisation_id == ctx.organisation.id)
            .all()
        )
        active_users = (
            db.query(OrganisationMembership)
            .filter(OrganisationMembership.organisation_id == ctx.organisation.id)
            .count()
        )
    else:
        questions_asked = (
            db.query(Message)
            .filter(
                Message.organisation_id == ctx.organisation.id,
                Message.user_id == ctx.user.id,
                Message.role == "user",
            )
            .count()
        )
        feedbacks = (
            db.query(Feedback)
            .filter(
                Feedback.organisation_id == ctx.organisation.id,
                Feedback.user_id == ctx.user.id,
            )
            .all()
        )
        active_users = 1

    positive_fb = sum(1 for f in feedbacks if f.rating == "positive")
    negative_fb = sum(1 for f in feedbacks if f.rating == "negative")
    total_fb = len(feedbacks)
    satisfaction_rate = round((positive_fb / total_fb) * 100, 1) if total_fb > 0 else 100.0

    # File type breakdown from actual accessible documents
    type_counts = Counter(d.file_type.upper() for d in accessible_docs)
    documents_by_type = [
        {"file_type": ft, "count": count} for ft, count in sorted(type_counts.items())
    ]

    # Visibility breakdown
    vis_counts = Counter(d.visibility for d in accessible_docs)
    documents_by_visibility = [
        {"visibility": vis, "count": count} for vis, count in sorted(vis_counts.items())
    ]

    # Recent conversations for this user
    recent_convs = (
        db.query(Conversation)
        .filter(
            Conversation.organisation_id == ctx.organisation.id,
            Conversation.user_id == ctx.user.id,
        )
        .order_by(Conversation.updated_at.desc())
        .limit(5)
        .all()
    )

    return {
        "time_window_days": days,
        "cutoff_date": cutoff.isoformat(),
        "metrics": {
            "total_accessible_documents": len(accessible_docs),
            "documents_ready": len(ready_docs),
            "documents_processing": len(processing_docs),
            "documents_failed": len(failed_docs),
            "total_indexed_chunks": sum(d.chunk_count for d in ready_docs),
            "questions_asked": questions_asked,
            "summaries_generated": summaries_count,
            "active_users_in_scope": active_users,
            "feedback_total": total_fb,
            "feedback_positive": positive_fb,
            "feedback_negative": negative_fb,
            "satisfaction_rate_percent": satisfaction_rate,
        },
        "charts": {
            "documents_by_type": documents_by_type,
            "documents_by_visibility": documents_by_visibility,
            "feedback_breakdown": [
                {"name": "Positive", "value": positive_fb},
                {"name": "Negative", "value": negative_fb},
            ],
        },
        "recent_documents": [serialize_document(db, d, ctx) for d in accessible_docs[:6]],
        "recent_conversations": [
            {
                "id": c.id,
                "title": c.title,
                "updated_at": c.updated_at,
                "scoped_count": len(c.scoped_document_ids_json or []),
            }
            for c in recent_convs
        ],
    }


@router.get("/manager/overview")
def get_manager_team_overview(
    workspace_id: Optional[str] = Query(default=None),
    ctx: AuthContext = Depends(require_roles("admin", "manager")),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """
    Team & Workspace analytics and resource overview scoped to the manager's permitted workspaces.
    """
    if ctx.role == "admin":
        workspaces = (
            db.query(Workspace)
            .filter(Workspace.organisation_id == ctx.organisation.id)
            .all()
        )
    else:
        target_ws_ids = ctx.managed_workspace_ids or ctx.workspace_ids
        workspaces = (
            db.query(Workspace)
            .filter(
                Workspace.organisation_id == ctx.organisation.id,
                Workspace.id.in_(target_ws_ids),
            )
            .all()
            if target_ws_ids
            else []
        )

    if workspace_id:
        workspaces = [w for w in workspaces if w.id == workspace_id]

    ws_ids = [w.id for w in workspaces]
    team_docs = [
        d
        for d in get_authorised_documents(db, ctx, only_ready=False)
        if (d.workspace_id in ws_ids) or (ctx.role == "admin" and not workspace_id)
    ]

    team_member_rows = (
        db.query(WorkspaceMembership, User, Workspace)
        .join(User, WorkspaceMembership.user_id == User.id)
        .join(Workspace, WorkspaceMembership.workspace_id == Workspace.id)
        .filter(WorkspaceMembership.workspace_id.in_(ws_ids))
        .all()
        if ws_ids
        else []
    )

    unique_member_ids = {u.id for _, u, _ in team_member_rows}
    team_questions = (
        db.query(Message)
        .filter(
            Message.organisation_id == ctx.organisation.id,
            Message.role == "user",
            Message.user_id.in_(list(unique_member_ids)),
        )
        .count()
        if unique_member_ids
        else 0
    )

    docs_per_workspace = []
    for ws in workspaces:
        w_docs = [d for d in team_docs if d.workspace_id == ws.id]
        w_members = [m for m, _, w in team_member_rows if w.id == ws.id]
        docs_per_workspace.append(
            {
                "workspace_id": ws.id,
                "workspace_name": ws.name,
                "slug": ws.slug,
                "document_count": len(w_docs),
                "ready_count": sum(1 for d in w_docs if d.status == "ready"),
                "member_count": len(w_members),
            }
        )

    return {
        "metrics": {
            "managed_workspaces_count": len(workspaces),
            "team_members_count": len(unique_member_ids),
            "team_documents_count": len(team_docs),
            "team_ready_documents": sum(1 for d in team_docs if d.status == "ready"),
            "team_questions_asked": team_questions,
        },
        "workspaces": docs_per_workspace,
        "team_documents": [serialize_document(db, d, ctx, include_policies=True) for d in team_docs[:25]],
        "team_members": [
            {
                "user_id": u.id,
                "full_name": u.full_name,
                "email": u.email,
                "department": u.department,
                "job_title": u.job_title,
                "workspace_id": w.id,
                "workspace_name": w.name,
                "workspace_role": wm.workspace_role,
            }
            for wm, u, w in team_member_rows
        ],
    }


@router.get("/admin/dashboard")
def get_admin_dashboard(
    ctx: AuthContext = Depends(require_roles("admin")),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    org_id = ctx.organisation.id
    all_docs = db.query(Document).filter(Document.organisation_id == org_id).all()
    all_users = (
        db.query(OrganisationMembership)
        .filter(OrganisationMembership.organisation_id == org_id)
        .all()
    )
    all_jobs = (
        db.query(ProcessingJob)
        .filter(ProcessingJob.organisation_id == org_id)
        .order_by(ProcessingJob.created_at.desc())
        .all()
    )
    all_feedback = db.query(Feedback).filter(Feedback.organisation_id == org_id).all()
    recent_audits = (
        db.query(AuditLog)
        .filter(AuditLog.organisation_id == org_id)
        .order_by(AuditLog.created_at.desc())
        .limit(10)
        .all()
    )

    role_dist = Counter(m.role for m in all_users)
    status_dist = Counter(d.status for d in all_docs)

    return {
        "organisation": {
            "id": ctx.organisation.id,
            "name": ctx.organisation.name,
            "slug": ctx.organisation.slug,
            "is_demo": ctx.organisation.is_demo,
        },
        "metrics": {
            "total_users": len(all_users),
            "admin_count": role_dist.get("admin", 0),
            "manager_count": role_dist.get("manager", 0),
            "employee_count": role_dist.get("employee", 0),
            "total_documents": len(all_docs),
            "ready_documents": status_dist.get("ready", 0),
            "processing_documents": status_dist.get("processing", 0) + status_dist.get("queued", 0),
            "failed_documents": status_dist.get("failed", 0),
            "total_chunks": db.query(DocumentChunk).filter(DocumentChunk.organisation_id == org_id).count(),
            "total_conversations": db.query(Conversation).filter(Conversation.organisation_id == org_id).count(),
            "total_questions": db.query(Message).filter(Message.organisation_id == org_id, Message.role == "user").count(),
            "total_summaries": db.query(DocumentSummary).filter(DocumentSummary.organisation_id == org_id).count(),
            "total_feedback": len(all_feedback),
            "positive_feedback": sum(1 for f in all_feedback if f.rating == "positive"),
            "negative_feedback": sum(1 for f in all_feedback if f.rating == "negative"),
            "failed_jobs_count": sum(1 for j in all_jobs if j.status == "failed"),
        },
        "recent_audit_logs": [
            {
                "id": a.id,
                "actor_email": a.actor_email,
                "actor_role": a.actor_role,
                "action": a.action,
                "target_type": a.target_type,
                "target_id": a.target_id,
                "status": a.status,
                "created_at": a.created_at,
            }
            for a in recent_audits
        ],
        "service_status": {
            "postgresql": get_db_status(),
            "mongodb": mongo_repo.get_status(),
            "worker": get_worker_status(),
        },
    }


@router.get("/admin/analytics")
def get_admin_analytics(
    days: int = Query(default=30, ge=1, le=365),
    ctx: AuthContext = Depends(require_roles("admin", "manager")),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    org_id = ctx.organisation.id
    docs = get_authorised_documents(db, ctx, only_ready=False)

    msgs = (
        db.query(Message)
        .filter(Message.organisation_id == org_id)
        .order_by(Message.created_at.asc())
        .all()
    )
    feedbacks = (
        db.query(Feedback)
        .filter(Feedback.organisation_id == org_id)
        .order_by(Feedback.created_at.asc())
        .all()
    )

    by_type = Counter(d.file_type.upper() for d in docs)
    by_status = Counter(d.status for d in docs)
    by_visibility = Counter(d.visibility for d in docs)

    assistant_msgs = [m for m in msgs if m.role == "assistant"]
    grounded_count = sum(1 for m in assistant_msgs if m.evidence_sufficient)
    insufficient_count = sum(1 for m in assistant_msgs if not m.evidence_sufficient)
    avg_latency = (
        int(sum(m.latency_ms for m in assistant_msgs) / len(assistant_msgs))
        if assistant_msgs
        else 0
    )

    pos_fb = sum(1 for f in feedbacks if f.rating == "positive")
    neg_fb = sum(1 for f in feedbacks if f.rating == "negative")

    # Group activity by date (derived strictly from real database records)
    activity_by_day: Dict[str, Dict[str, int]] = {}
    for d in docs:
        day_str = d.created_at.strftime("%Y-%m-%d")
        activity_by_day.setdefault(
            day_str, {"documents": 0, "questions": 0, "positive_feedback": 0, "negative_feedback": 0}
        )
        activity_by_day[day_str]["documents"] += 1

    for m in msgs:
        if m.role == "user":
            day_str = m.created_at.strftime("%Y-%m-%d")
            activity_by_day.setdefault(
                day_str, {"documents": 0, "questions": 0, "positive_feedback": 0, "negative_feedback": 0}
            )
            activity_by_day[day_str]["questions"] += 1

    for f in feedbacks:
        day_str = f.created_at.strftime("%Y-%m-%d")
        activity_by_day.setdefault(
            day_str, {"documents": 0, "questions": 0, "positive_feedback": 0, "negative_feedback": 0}
        )
        if f.rating == "positive":
            activity_by_day[day_str]["positive_feedback"] += 1
        else:
            activity_by_day[day_str]["negative_feedback"] += 1

    timeline = [
        {"date": day, **vals} for day, vals in sorted(activity_by_day.items())
    ]

    return {
        "days": days,
        "summary": {
            "total_documents": len(docs),
            "total_storage_bytes": sum(d.file_size_bytes for d in docs),
            "total_chunks": sum(d.chunk_count for d in docs),
            "total_assistant_responses": len(assistant_msgs),
            "grounded_answers_count": grounded_count,
            "insufficient_evidence_count": insufficient_count,
            "average_response_latency_ms": avg_latency,
            "positive_feedback_count": pos_fb,
            "negative_feedback_count": neg_fb,
        },
        "charts": {
            "documents_by_type": [{"name": k, "count": v} for k, v in sorted(by_type.items())],
            "documents_by_status": [{"name": k, "count": v} for k, v in sorted(by_status.items())],
            "documents_by_visibility": [{"name": k, "count": v} for k, v in sorted(by_visibility.items())],
            "answer_grounding_ratio": [
                {"name": "Evidence-Grounded Answers", "value": grounded_count},
                {"name": "Insufficient Evidence Refusals", "value": insufficient_count},
            ],
            "feedback_ratio": [
                {"name": "Positive", "value": pos_fb},
                {"name": "Negative", "value": neg_fb},
            ],
            "activity_timeline": timeline,
        },
    }


@router.get("/admin/audit-logs")
def list_audit_logs(
    action: Optional[str] = Query(default=None),
    status_filter: Optional[str] = Query(default=None, alias="status"),
    actor_email: Optional[str] = Query(default=None),
    target_type: Optional[str] = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=1, le=100),
    ctx: AuthContext = Depends(require_roles("admin")),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    query = db.query(AuditLog).filter(
        (AuditLog.organisation_id == ctx.organisation.id) | (AuditLog.organisation_id.is_(None))
    )
    if action:
        query = query.filter(AuditLog.action.ilike(f"%{action.strip()}%"))
    if status_filter:
        query = query.filter(AuditLog.status == status_filter)
    if actor_email:
        query = query.filter(AuditLog.actor_email.ilike(f"%{actor_email.strip()}%"))
    if target_type:
        query = query.filter(AuditLog.target_type == target_type)

    logs = query.order_by(AuditLog.created_at.desc()).all()
    paged, meta = paginate_sequence(logs, page=page, page_size=page_size)

    return {
        "items": [
            {
                "id": a.id,
                "organisation_id": a.organisation_id,
                "actor_user_id": a.actor_user_id,
                "actor_email": a.actor_email,
                "actor_role": a.actor_role,
                "action": a.action,
                "target_type": a.target_type,
                "target_id": a.target_id,
                "status": a.status,
                "ip_address": a.ip_address,
                "user_agent": a.user_agent,
                "metadata": a.metadata_json or {},
                "created_at": a.created_at,
            }
            for a in paged
        ],
        "pagination": meta,
    }


@router.get("/admin/jobs")
def list_processing_jobs(
    status_filter: Optional[str] = Query(default=None, alias="status"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=1, le=100),
    ctx: AuthContext = Depends(require_roles("admin")),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    query = (
        db.query(ProcessingJob, Document)
        .join(Document, ProcessingJob.document_id == Document.id)
        .filter(ProcessingJob.organisation_id == ctx.organisation.id)
    )
    if status_filter:
        query = query.filter(ProcessingJob.status == status_filter)

    rows = query.order_by(ProcessingJob.created_at.desc()).all()
    paged, meta = paginate_sequence(rows, page=page, page_size=page_size)

    items = []
    for job, doc in paged:
        items.append(
            {
                "id": job.id,
                "document_id": doc.id,
                "document_title": doc.title,
                "original_filename": doc.original_filename,
                "file_type": doc.file_type,
                "job_type": job.job_type,
                "status": job.status,
                "worker_mode": job.worker_mode,
                "attempt_count": job.attempt_count,
                "max_attempts": job.max_attempts,
                "progress_percent": job.progress_percent,
                "current_stage": job.current_stage,
                "error_message": job.error_message,
                "duration_ms": job.duration_ms,
                "started_at": job.started_at,
                "completed_at": job.completed_at,
                "created_at": job.created_at,
            }
        )
    return {
        "worker_status": get_worker_status(),
        "items": items,
        "pagination": meta,
    }


@router.post("/admin/jobs/{job_id}/retry")
def retry_processing_job(
    job_id: str,
    background_tasks: BackgroundTasks,
    process_immediately: bool = Query(default=True),
    ctx: AuthContext = Depends(require_roles("admin")),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    job = (
        db.query(ProcessingJob)
        .filter(
            ProcessingJob.id == job_id,
            ProcessingJob.organisation_id == ctx.organisation.id,
        )
        .first()
    )
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Processing job not found.")

    doc = db.query(Document).filter(Document.id == job.document_id).first()
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Associated document not found.")

    job.attempt_count += 1
    job.status = "queued"
    job.progress_percent = 5
    job.current_stage = "Queued for retry"
    job.error_message = None

    doc.status = "queued"
    doc.processing_progress = 5
    doc.processing_stage = "Queued for retry"
    doc.processing_error = None

    db.add(
        AuditLog(
            organisation_id=ctx.organisation.id,
            actor_user_id=ctx.user.id,
            actor_email=ctx.user.email,
            actor_role=ctx.role,
            action="admin.job_retried",
            target_type="processing_job",
            target_id=job.id,
            status="success",
            ip_address=ctx.ip_address,
            user_agent=ctx.user_agent,
            metadata_json={"document_id": doc.id, "attempt": job.attempt_count},
        )
    )
    db.commit()

    worker_mode = dispatch_ingestion_job(
        document_id=doc.id,
        job_id=job.id,
        background_tasks=None if process_immediately else background_tasks,
        run_synchronously=process_immediately,
    )
    db.refresh(job)
    db.refresh(doc)

    return {
        "message": "Job retry executed.",
        "worker_mode": worker_mode,
        "job": {
            "id": job.id,
            "document_id": doc.id,
            "status": job.status,
            "attempt_count": job.attempt_count,
            "progress_percent": job.progress_percent,
            "current_stage": job.current_stage,
            "error_message": job.error_message,
        },
        "document_status": doc.status,
    }


@router.get("/admin/system-config")
def get_system_configuration(
    ctx: AuthContext = Depends(require_roles("admin")),
) -> Dict[str, Any]:
    settings = get_settings()
    embedder = get_embedding_provider()
    return {
        "editable_settings": get_runtime_config(),
        "environment_info": {
            "app_name": settings.APP_NAME,
            "app_env": settings.APP_ENV,
            "llm_provider": settings.LLM_PROVIDER,
            "llm_model": settings.LLM_MODEL,
            "llm_api_key_present": bool(settings.LLM_API_KEY),
            "embedding_provider": embedder.provider_name,
            "embedding_model": embedder.model_name,
            "embedding_dimension": embedder.dimension,
            "email_provider": settings.EMAIL_PROVIDER,
            "supported_formats": ["pdf", "docx", "pptx", "xlsx", "txt"],
        },
        "infrastructure_status": {
            "postgresql": get_db_status(),
            "mongodb": mongo_repo.get_status(),
            "worker": get_worker_status(),
        },
    }


@router.patch("/admin/system-config")
def patch_system_configuration(
    payload: SystemConfigUpdateRequest,
    ctx: AuthContext = Depends(require_roles("admin")),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    updates = payload.model_dump(exclude_none=True)
    updated_cfg = update_runtime_config(updates)

    db.add(
        AuditLog(
            organisation_id=ctx.organisation.id,
            actor_user_id=ctx.user.id,
            actor_email=ctx.user.email,
            actor_role=ctx.role,
            action="admin.system_config_updated",
            target_type="system_config",
            target_id=ctx.organisation.id,
            status="success",
            ip_address=ctx.ip_address,
            user_agent=ctx.user_agent,
            metadata_json=updates,
        )
    )
    db.commit()
    return {"editable_settings": updated_cfg, "message": "System configuration updated."}

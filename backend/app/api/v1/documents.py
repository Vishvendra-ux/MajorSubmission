from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    File,
    Form,
    HTTPException,
    Query,
    Request,
    UploadFile,
    status,
)
from fastapi.responses import FileResponse, Response
from sqlalchemy.orm import Session

from app.ai.llm import generate_grounded_document_summary
from app.core.rate_limit import enforce_api_rate_limit
from app.db.session import get_db
from app.ingestion.validator import validate_uploaded_file
from app.models.entities import (
    AuditLog,
    Document,
    DocumentAccessPolicy,
    DocumentChunk,
    DocumentSummary,
    Notification,
    Organisation,
    OrganisationMembership,
    ProcessingJob,
    User,
    Workspace,
    WorkspaceMembership,
)
from app.repositories.mongo_repo import mongo_repo
from app.schemas.api_schemas import DocumentPolicyCreateRequest, DocumentUpdateRequest
from app.security.jwt import create_signed_download_token, decode_token
from app.security.permissions import (
    can_access_document,
    enforce_document_access,
    get_authorised_documents,
)
from app.security.rbac import AuthContext, get_current_context
from app.security.sanitization import sanitize_filename, sanitize_user_text
from app.utils.checksum import compute_sha256
from app.utils.pagination import paginate_sequence
from app.utils.storage import delete_stored_file, save_uploaded_file
from app.workers.tasks import dispatch_ingestion_job

router = APIRouter(prefix="/documents", tags=["Documents"])


def serialize_document(
    db: Session,
    doc: Document,
    ctx: AuthContext,
    include_policies: bool = False,
) -> Dict[str, Any]:
    uploader = db.query(User).filter(User.id == doc.uploader_id).first()
    workspace = (
        db.query(Workspace).filter(Workspace.id == doc.workspace_id).first()
        if doc.workspace_id
        else None
    )
    has_summary = (
        db.query(DocumentSummary.id)
        .filter(DocumentSummary.document_id == doc.id)
        .first()
        is not None
    )
    can_manage = can_access_document(db, ctx, doc, required_level="manage")
    can_download = can_access_document(db, ctx, doc, required_level="download")

    data: Dict[str, Any] = {
        "id": doc.id,
        "organisation_id": doc.organisation_id,
        "workspace_id": doc.workspace_id,
        "workspace_name": workspace.name if workspace else None,
        "uploader_id": doc.uploader_id,
        "uploader_name": uploader.full_name if uploader else "System",
        "uploader_email": uploader.email if uploader else "",
        "title": doc.title,
        "description": doc.description,
        "original_filename": doc.original_filename,
        "file_type": doc.file_type,
        "mime_type": doc.mime_type,
        "file_size_bytes": doc.file_size_bytes,
        "sha256_checksum": doc.sha256_checksum,
        "status": doc.status,
        "visibility": doc.visibility,
        "allowed_roles": doc.allowed_roles_json or ["admin", "manager", "employee"],
        "tags": doc.tags_json or [],
        "page_count": doc.page_count,
        "chunk_count": doc.chunk_count,
        "processing_progress": doc.processing_progress,
        "processing_stage": doc.processing_stage,
        "processing_error": doc.processing_error,
        "ocr_used": doc.ocr_used,
        "is_demo": doc.is_demo,
        "has_summary": has_summary,
        "can_manage": can_manage,
        "can_download": can_download,
        "indexed_at": doc.indexed_at,
        "created_at": doc.created_at,
        "updated_at": doc.updated_at,
    }
    if include_policies:
        policies = (
            db.query(DocumentAccessPolicy)
            .filter(DocumentAccessPolicy.document_id == doc.id)
            .order_by(DocumentAccessPolicy.created_at.desc())
            .all()
        )
        data["access_policies"] = [
            {
                "id": p.id,
                "principal_type": p.principal_type,
                "principal_id": p.principal_id,
                "access_level": p.access_level,
                "effect": p.effect,
                "created_at": p.created_at,
            }
            for p in policies
        ]
    return data


@router.post("", status_code=status.HTTP_201_CREATED)
async def upload_document(
    request: Request,
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    title: Optional[str] = Form(default=None),
    description: Optional[str] = Form(default=None),
    visibility: str = Form(default="organisation"),
    workspace_id: Optional[str] = Form(default=None),
    allowed_roles: Optional[str] = Form(default=None),
    tags: Optional[str] = Form(default=None),
    process_immediately: bool = Form(default=True),
    ctx: AuthContext = Depends(get_current_context),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    enforce_api_rate_limit(request)

    raw_bytes = await file.read()
    safe_original_name = sanitize_filename(file.filename or "document.txt")
    ext, canonical_mime = validate_uploaded_file(
        safe_original_name, file.content_type or "application/octet-stream", raw_bytes
    )

    if visibility not in ("organisation", "workspace", "restricted"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid visibility setting. Must be organisation, workspace, or restricted.",
        )

    resolved_ws_id: Optional[str] = None
    if workspace_id and workspace_id.strip():
        ws = (
            db.query(Workspace)
            .filter(
                Workspace.id == workspace_id.strip(),
                Workspace.organisation_id == ctx.organisation.id,
            )
            .first()
        )
        if not ws:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Specified workspace does not exist in your organisation.",
            )
        if ctx.role != "admin" and ws.id not in ctx.workspace_ids:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You cannot upload documents to a workspace you do not belong to.",
            )
        resolved_ws_id = ws.id
    elif visibility == "workspace":
        if ctx.workspace_ids:
            resolved_ws_id = ctx.workspace_ids[0]
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Workspace visibility requires selecting a workspace.",
            )

    parsed_roles = ["admin", "manager", "employee"]
    if allowed_roles:
        try:
            candidate = json.loads(allowed_roles) if allowed_roles.startswith("[") else [
                r.strip() for r in allowed_roles.split(",") if r.strip()
            ]
            valid_roles = [r for r in candidate if r in ("admin", "manager", "employee")]
            if valid_roles:
                if "admin" not in valid_roles:
                    valid_roles.insert(0, "admin")
                parsed_roles = valid_roles
        except Exception:
            pass

    parsed_tags: List[str] = []
    if tags:
        try:
            candidate_tags = json.loads(tags) if tags.startswith("[") else [
                t.strip() for t in tags.split(",") if t.strip()
            ]
            parsed_tags = [sanitize_user_text(str(t), 40) for t in candidate_tags[:10] if str(t).strip()]
        except Exception:
            pass

    checksum = compute_sha256(raw_bytes)
    storage_filename, storage_path = save_uploaded_file(
        organisation_id=ctx.organisation.id,
        original_filename=safe_original_name,
        file_ext=ext,
        content=raw_bytes,
    )

    doc_title = sanitize_user_text(
        title.strip() if title and title.strip() else Path(safe_original_name).stem.replace("_", " ").replace("-", " ").title(),
        255,
    )

    doc = Document(
        organisation_id=ctx.organisation.id,
        workspace_id=resolved_ws_id,
        uploader_id=ctx.user.id,
        title=doc_title,
        description=sanitize_user_text(description or "", 1500) if description else None,
        original_filename=safe_original_name,
        storage_filename=storage_filename,
        storage_path=storage_path,
        file_type=ext,
        mime_type=canonical_mime,
        file_size_bytes=len(raw_bytes),
        sha256_checksum=checksum,
        status="queued",
        visibility=visibility,
        allowed_roles_json=parsed_roles,
        tags_json=parsed_tags,
        processing_progress=5,
        processing_stage="Queued for ingestion",
        is_demo=False,
    )
    db.add(doc)
    db.flush()

    job = ProcessingJob(
        document_id=doc.id,
        organisation_id=ctx.organisation.id,
        triggered_by_id=ctx.user.id,
        job_type="ingestion",
        status="queued",
        progress_percent=5,
        current_stage="Queued for ingestion",
    )
    db.add(job)
    db.add(
        AuditLog(
            organisation_id=ctx.organisation.id,
            actor_user_id=ctx.user.id,
            actor_email=ctx.user.email,
            actor_role=ctx.role,
            action="document.uploaded",
            target_type="document",
            target_id=doc.id,
            status="success",
            ip_address=ctx.ip_address,
            user_agent=ctx.user_agent,
            metadata_json={
                "filename": safe_original_name,
                "file_type": ext,
                "size_bytes": len(raw_bytes),
                "visibility": visibility,
                "sha256": checksum,
            },
        )
    )
    db.commit()

    worker_mode = dispatch_ingestion_job(
        document_id=doc.id,
        job_id=job.id,
        background_tasks=None if process_immediately else background_tasks,
        run_synchronously=process_immediately,
    )
    db.refresh(doc)
    db.refresh(job)

    return {
        "document": serialize_document(db, doc, ctx, include_policies=True),
        "job": {
            "id": job.id,
            "status": job.status,
            "worker_mode": worker_mode,
            "progress_percent": job.progress_percent,
            "current_stage": job.current_stage,
        },
    }


@router.get("")
def list_documents(
    q: Optional[str] = Query(default=None),
    file_type: Optional[str] = Query(default=None),
    status_filter: Optional[str] = Query(default=None, alias="status"),
    workspace_id: Optional[str] = Query(default=None),
    owner_id: Optional[str] = Query(default=None),
    date_from: Optional[str] = Query(default=None),
    date_to: Optional[str] = Query(default=None),
    sort_by: str = Query(default="created_at"),
    sort_order: str = Query(default="desc"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=12, ge=1, le=100),
    ctx: AuthContext = Depends(get_current_context),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    docs = get_authorised_documents(
        db,
        ctx,
        only_ready=False,
        workspace_id=workspace_id,
        file_type=file_type,
        owner_id=owner_id,
        status_filter=status_filter,
    )

    if q and q.strip():
        needle = q.strip().lower()
        docs = [
            d
            for d in docs
            if needle in d.title.lower()
            or needle in d.original_filename.lower()
            or (d.description and needle in d.description.lower())
            or any(needle in t.lower() for t in (d.tags_json or []))
        ]

    if date_from:
        try:
            dt_from = datetime.fromisoformat(date_from)
            docs = [d for d in docs if d.created_at.replace(tzinfo=None) >= dt_from.replace(tzinfo=None)]
        except ValueError:
            pass

    if date_to:
        try:
            dt_to = datetime.fromisoformat(date_to)
            docs = [d for d in docs if d.created_at.replace(tzinfo=None) <= dt_to.replace(tzinfo=None)]
        except ValueError:
            pass

    reverse = sort_order.lower() != "asc"
    if sort_by == "title":
        docs.sort(key=lambda d: d.title.lower(), reverse=reverse)
    elif sort_by == "file_size_bytes":
        docs.sort(key=lambda d: d.file_size_bytes, reverse=reverse)
    elif sort_by == "status":
        docs.sort(key=lambda d: d.status, reverse=reverse)
    else:
        docs.sort(key=lambda d: d.created_at, reverse=reverse)

    paged_docs, meta = paginate_sequence(docs, page=page, page_size=page_size)
    return {
        "items": [serialize_document(db, d, ctx) for d in paged_docs],
        "pagination": meta,
    }


@router.get("/{document_id}")
def get_document_detail(
    document_id: str,
    ctx: AuthContext = Depends(get_current_context),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    doc = db.query(Document).filter(Document.id == document_id).first()
    doc = enforce_document_access(db, ctx, doc, required_level="view", document_id_hint=document_id)

    payload = serialize_document(db, doc, ctx, include_policies=True)
    payload["processing_metadata"] = mongo_repo.get_processing_metadata(
        doc.id, doc.organisation_id
    )
    latest_job = (
        db.query(ProcessingJob)
        .filter(ProcessingJob.document_id == doc.id)
        .order_by(ProcessingJob.created_at.desc())
        .first()
    )
    payload["latest_job"] = (
        {
            "id": latest_job.id,
            "job_type": latest_job.job_type,
            "status": latest_job.status,
            "attempt_count": latest_job.attempt_count,
            "progress_percent": latest_job.progress_percent,
            "current_stage": latest_job.current_stage,
            "error_message": latest_job.error_message,
            "duration_ms": latest_job.duration_ms,
            "created_at": latest_job.created_at,
            "completed_at": latest_job.completed_at,
        }
        if latest_job
        else None
    )
    return payload


@router.patch("/{document_id}")
def update_document(
    document_id: str,
    payload: DocumentUpdateRequest,
    ctx: AuthContext = Depends(get_current_context),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    doc = db.query(Document).filter(Document.id == document_id).first()
    doc = enforce_document_access(
        db, ctx, doc, required_level="manage", document_id_hint=document_id
    )

    changes: Dict[str, Any] = {}
    if payload.title is not None:
        doc.title = sanitize_user_text(payload.title, 255)
        changes["title"] = doc.title
    if payload.description is not None:
        doc.description = sanitize_user_text(payload.description, 2000)
        changes["description_updated"] = True
    if payload.visibility is not None:
        doc.visibility = payload.visibility
        changes["visibility"] = payload.visibility
    if payload.workspace_id is not None:
        if payload.workspace_id == "":
            doc.workspace_id = None
        else:
            ws = (
                db.query(Workspace)
                .filter(
                    Workspace.id == payload.workspace_id,
                    Workspace.organisation_id == ctx.organisation.id,
                )
                .first()
            )
            if not ws:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Target workspace not found in your organisation.",
                )
            doc.workspace_id = ws.id
            changes["workspace_id"] = ws.id
    if payload.allowed_roles is not None:
        valid_roles = [
            r for r in payload.allowed_roles if r in ("admin", "manager", "employee")
        ]
        if "admin" not in valid_roles:
            valid_roles.insert(0, "admin")
        doc.allowed_roles_json = valid_roles
        changes["allowed_roles"] = valid_roles
    if payload.tags is not None:
        doc.tags_json = [sanitize_user_text(t, 40) for t in payload.tags[:12] if t.strip()]

    db.add(
        AuditLog(
            organisation_id=ctx.organisation.id,
            actor_user_id=ctx.user.id,
            actor_email=ctx.user.email,
            actor_role=ctx.role,
            action="document.updated",
            target_type="document",
            target_id=doc.id,
            status="success",
            ip_address=ctx.ip_address,
            user_agent=ctx.user_agent,
            metadata_json=changes,
        )
    )
    db.commit()
    db.refresh(doc)
    return serialize_document(db, doc, ctx, include_policies=True)


@router.delete("/{document_id}")
def delete_document(
    document_id: str,
    ctx: AuthContext = Depends(get_current_context),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    doc = db.query(Document).filter(Document.id == document_id).first()
    doc = enforce_document_access(
        db, ctx, doc, required_level="manage", document_id_hint=document_id
    )

    doc.status = "deleting"
    db.flush()

    storage_path = doc.storage_path
    doc_title = doc.title
    org_id = doc.organisation_id

    # Delete MongoDB extracted sections & metadata
    mongo_repo.delete_document_records(doc.id, org_id)

    # Delete relational record (cascades to chunks, summaries, access_policies, jobs)
    db.delete(doc)
    db.add(
        AuditLog(
            organisation_id=org_id,
            actor_user_id=ctx.user.id,
            actor_email=ctx.user.email,
            actor_role=ctx.role,
            action="document.deleted",
            target_type="document",
            target_id=document_id,
            status="success",
            ip_address=ctx.ip_address,
            user_agent=ctx.user_agent,
            metadata_json={"title": doc_title},
        )
    )
    db.commit()

    # Delete physical file from storage
    delete_stored_file(storage_path)

    return {
        "message": f"Document '{doc_title}' and all indexed chunks, summaries, and metadata were deleted.",
        "deleted_document_id": document_id,
    }


@router.get("/{document_id}/status")
def get_document_status(
    document_id: str,
    ctx: AuthContext = Depends(get_current_context),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    doc = db.query(Document).filter(Document.id == document_id).first()
    doc = enforce_document_access(db, ctx, doc, required_level="view", document_id_hint=document_id)

    job = (
        db.query(ProcessingJob)
        .filter(ProcessingJob.document_id == doc.id)
        .order_by(ProcessingJob.created_at.desc())
        .first()
    )
    return {
        "document_id": doc.id,
        "title": doc.title,
        "status": doc.status,
        "processing_progress": doc.processing_progress,
        "processing_stage": doc.processing_stage,
        "processing_error": doc.processing_error,
        "page_count": doc.page_count,
        "chunk_count": doc.chunk_count,
        "ocr_used": doc.ocr_used,
        "indexed_at": doc.indexed_at,
        "job": {
            "id": job.id,
            "status": job.status,
            "attempt_count": job.attempt_count,
            "duration_ms": job.duration_ms,
            "error_message": job.error_message,
        }
        if job
        else None,
    }


@router.post("/{document_id}/reprocess")
def reprocess_document(
    document_id: str,
    background_tasks: BackgroundTasks,
    process_immediately: bool = Query(default=True),
    ctx: AuthContext = Depends(get_current_context),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    doc = db.query(Document).filter(Document.id == document_id).first()
    doc = enforce_document_access(
        db, ctx, doc, required_level="manage", document_id_hint=document_id
    )

    prior_attempts = (
        db.query(ProcessingJob).filter(ProcessingJob.document_id == doc.id).count()
    )

    doc.status = "queued"
    doc.processing_progress = 5
    doc.processing_stage = "Queued for reprocessing"
    doc.processing_error = None

    job = ProcessingJob(
        document_id=doc.id,
        organisation_id=ctx.organisation.id,
        triggered_by_id=ctx.user.id,
        job_type="reprocess",
        status="queued",
        attempt_count=prior_attempts + 1,
        progress_percent=5,
        current_stage="Queued for reprocessing",
    )
    db.add(job)
    db.add(
        AuditLog(
            organisation_id=ctx.organisation.id,
            actor_user_id=ctx.user.id,
            actor_email=ctx.user.email,
            actor_role=ctx.role,
            action="document.reprocess_triggered",
            target_type="document",
            target_id=doc.id,
            status="success",
            ip_address=ctx.ip_address,
            user_agent=ctx.user_agent,
            metadata_json={"attempt": prior_attempts + 1},
        )
    )
    db.commit()

    worker_mode = dispatch_ingestion_job(
        document_id=doc.id,
        job_id=job.id,
        background_tasks=None if process_immediately else background_tasks,
        run_synchronously=process_immediately,
    )
    db.refresh(doc)
    return {
        "message": "Document reprocessing completed." if process_immediately else "Document queued for reprocessing.",
        "worker_mode": worker_mode,
        "document": serialize_document(db, doc, ctx),
    }


@router.get("/{document_id}/signed-download-url")
def get_signed_download_url(
    document_id: str,
    ctx: AuthContext = Depends(get_current_context),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    doc = db.query(Document).filter(Document.id == document_id).first()
    doc = enforce_document_access(
        db, ctx, doc, required_level="download", document_id_hint=document_id
    )
    token = create_signed_download_token(
        user_id=ctx.user.id,
        organisation_id=ctx.organisation.id,
        document_id=doc.id,
    )
    return {
        "document_id": doc.id,
        "download_url": f"/api/v1/documents/{doc.id}/download?download_token={token}",
        "expires_in_seconds": 300,
    }


@router.get("/{document_id}/download")
def download_document(
    document_id: str,
    request: Request,
    download_token: Optional[str] = Query(default=None),
    db: Session = Depends(get_db),
) -> Response:
    # Authenticate either via signed short-lived download_token or Authorization Bearer header
    ctx: Optional[AuthContext] = None
    if download_token:
        payload = decode_token(download_token, expected_type="download")
        if payload.get("doc") != document_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Signed download token does not match the requested document.",
            )
        user = db.query(User).filter(User.id == payload.get("sub"), User.is_active.is_(True)).first()
        org = db.query(Organisation).filter(Organisation.id == payload.get("org"), Organisation.is_active.is_(True)).first()
        membership = (
            db.query(OrganisationMembership)
            .filter(
                OrganisationMembership.user_id == payload.get("sub"),
                OrganisationMembership.organisation_id == payload.get("org"),
            )
            .first()
        )
        if not user or not org or not membership:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid download session.")
        ws_memberships = db.query(WorkspaceMembership).filter(WorkspaceMembership.user_id == user.id).all()
        ctx = AuthContext(
            user=user,
            organisation=org,
            membership=membership,
            role=membership.role,
            workspace_ids=[w.workspace_id for w in ws_memberships],
            managed_workspace_ids=[w.workspace_id for w in ws_memberships if w.workspace_role == "manager"],
            ip_address=request.client.host if request.client else None,
            user_agent=request.headers.get("user-agent"),
        )
    else:
        auth_header = request.headers.get("authorization", "")
        if not auth_header.lower().startswith("bearer "):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Authentication required to download private documents.",
            )
        raw_jwt = auth_header.split(" ", 1)[1].strip()
        from fastapi.security import HTTPAuthorizationCredentials

        ctx = get_current_context(
            request=request,
            credentials=HTTPAuthorizationCredentials(scheme="Bearer", credentials=raw_jwt),
            db=db,
        )

    doc = db.query(Document).filter(Document.id == document_id).first()
    doc = enforce_document_access(
        db, ctx, doc, required_level="download", document_id_hint=document_id
    )

    db.add(
        AuditLog(
            organisation_id=ctx.organisation.id,
            actor_user_id=ctx.user.id,
            actor_email=ctx.user.email,
            actor_role=ctx.role,
            action="document.downloaded",
            target_type="document",
            target_id=doc.id,
            status="success",
            ip_address=ctx.ip_address,
            user_agent=ctx.user_agent,
            metadata_json={"filename": doc.original_filename},
        )
    )
    db.commit()

    file_path = Path(doc.storage_path)
    if file_path.exists() and file_path.is_file():
        return FileResponse(
            path=str(file_path),
            media_type=doc.mime_type,
            filename=doc.original_filename,
        )

    # Fallback if stored file was moved: synthesize downloadable text from indexed chunks
    chunks = (
        db.query(DocumentChunk)
        .filter(DocumentChunk.document_id == doc.id)
        .order_by(DocumentChunk.chunk_index.asc())
        .all()
    )
    synthesized = "\n\n".join(f"[{c.location_label}]\n{c.content}" for c in chunks)
    return Response(
        content=synthesized.encode("utf-8"),
        media_type="text/plain; charset=utf-8",
        headers={
            "Content-Disposition": f'attachment; filename="{doc.original_filename}.txt"'
        },
    )


@router.get("/{document_id}/preview")
def preview_document(
    document_id: str,
    chunk_id: Optional[str] = Query(default=None),
    location: Optional[str] = Query(default=None),
    ctx: AuthContext = Depends(get_current_context),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    doc = db.query(Document).filter(Document.id == document_id).first()
    doc = enforce_document_access(
        db, ctx, doc, required_level="view", document_id_hint=document_id
    )

    chunks = (
        db.query(DocumentChunk)
        .filter(
            DocumentChunk.document_id == doc.id,
            DocumentChunk.organisation_id == ctx.organisation.id,
        )
        .order_by(DocumentChunk.chunk_index.asc())
        .all()
    )
    mongo_sections = mongo_repo.get_extracted_sections(doc.id, doc.organisation.id)

    return {
        "document": serialize_document(db, doc, ctx),
        "highlighted_chunk_id": chunk_id,
        "highlighted_location": location,
        "extracted_sections": mongo_sections.get("sections", []) if mongo_sections else [],
        "chunks": [
            {
                "id": c.id,
                "chunk_index": c.chunk_index,
                "location_label": c.location_label,
                "page_number": c.page_number,
                "slide_number": c.slide_number,
                "sheet_name": c.sheet_name,
                "section_title": c.section_title,
                "content": c.content,
                "token_count": c.token_count,
                "is_highlighted": (c.id == chunk_id)
                or (location is not None and location.lower() in c.location_label.lower()),
            }
            for c in chunks
        ],
    }


@router.get("/{document_id}/summary")
def get_document_summary(
    document_id: str,
    ctx: AuthContext = Depends(get_current_context),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    doc = db.query(Document).filter(Document.id == document_id).first()
    doc = enforce_document_access(
        db, ctx, doc, required_level="view", document_id_hint=document_id
    )

    summary = (
        db.query(DocumentSummary)
        .filter(
            DocumentSummary.document_id == doc.id,
            DocumentSummary.organisation_id == ctx.organisation.id,
        )
        .first()
    )
    if not summary:
        # Automatically generate grounded summary on first request if document is ready
        if doc.status != "ready":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Document is currently '{doc.status}'. Summaries can only be generated for Ready documents.",
            )
        return _create_or_update_summary(db, doc, ctx)

    return _serialize_summary(doc, summary)


@router.post("/{document_id}/summary")
def generate_or_regenerate_summary(
    document_id: str,
    ctx: AuthContext = Depends(get_current_context),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    doc = db.query(Document).filter(Document.id == document_id).first()
    doc = enforce_document_access(
        db, ctx, doc, required_level="view", document_id_hint=document_id
    )
    if doc.status != "ready":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Document must be in Ready state before generating a summary.",
        )
    return _create_or_update_summary(db, doc, ctx)


def _create_or_update_summary(
    db: Session,
    doc: Document,
    ctx: AuthContext,
) -> Dict[str, Any]:
    chunks = (
        db.query(DocumentChunk)
        .filter(
            DocumentChunk.document_id == doc.id,
            DocumentChunk.organisation_id == ctx.organisation.id,
        )
        .order_by(DocumentChunk.chunk_index.asc())
        .all()
    )
    result = generate_grounded_document_summary(doc, chunks)

    summary = (
        db.query(DocumentSummary)
        .filter(DocumentSummary.document_id == doc.id)
        .first()
    )
    if summary:
        summary.executive_summary = result.executive_summary
        summary.detailed_summary = result.detailed_summary
        summary.main_points_json = result.main_points
        summary.entities_json = result.entities
        summary.risks_and_actions_json = result.risks_and_actions
        summary.citations_json = result.citations
        summary.interpretation_notes = result.interpretation_notes
        summary.provider_used = result.provider_used
        summary.model_used = result.model_used
        summary.generated_by_id = ctx.user.id
    else:
        summary = DocumentSummary(
            document_id=doc.id,
            organisation_id=ctx.organisation.id,
            executive_summary=result.executive_summary,
            detailed_summary=result.detailed_summary,
            main_points_json=result.main_points,
            entities_json=result.entities,
            risks_and_actions_json=result.risks_and_actions,
            citations_json=result.citations,
            interpretation_notes=result.interpretation_notes,
            provider_used=result.provider_used,
            model_used=result.model_used,
            generated_by_id=ctx.user.id,
        )
        db.add(summary)

    db.add(
        AuditLog(
            organisation_id=ctx.organisation.id,
            actor_user_id=ctx.user.id,
            actor_email=ctx.user.email,
            actor_role=ctx.role,
            action="document.summary_generated",
            target_type="document",
            target_id=doc.id,
            status="success",
            ip_address=ctx.ip_address,
            user_agent=ctx.user_agent,
            metadata_json={
                "provider_used": result.provider_used,
                "model_used": result.model_used,
            },
        )
    )
    db.commit()
    db.refresh(summary)
    return _serialize_summary(doc, summary)


def _serialize_summary(doc: Document, summary: DocumentSummary) -> Dict[str, Any]:
    return {
        "id": summary.id,
        "document_id": doc.id,
        "document_title": doc.title,
        "file_type": doc.file_type,
        "executive_summary": summary.executive_summary,
        "detailed_summary": summary.detailed_summary,
        "main_points": summary.main_points_json,
        "entities": summary.entities_json,
        "risks_and_actions": summary.risks_and_actions_json,
        "citations": summary.citations_json,
        "interpretation_notes": summary.interpretation_notes,
        "provider_used": summary.provider_used,
        "model_used": summary.model_used,
        "created_at": summary.created_at,
        "updated_at": summary.updated_at,
    }


@router.get("/{document_id}/policies")
def list_document_policies(
    document_id: str,
    ctx: AuthContext = Depends(get_current_context),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    doc = db.query(Document).filter(Document.id == document_id).first()
    doc = enforce_document_access(
        db, ctx, doc, required_level="view", document_id_hint=document_id
    )
    policies = (
        db.query(DocumentAccessPolicy)
        .filter(DocumentAccessPolicy.document_id == doc.id)
        .order_by(DocumentAccessPolicy.created_at.desc())
        .all()
    )
    return {
        "document_id": doc.id,
        "visibility": doc.visibility,
        "allowed_roles": doc.allowed_roles_json,
        "policies": [
            {
                "id": p.id,
                "principal_type": p.principal_type,
                "principal_id": p.principal_id,
                "access_level": p.access_level,
                "effect": p.effect,
                "created_at": p.created_at,
            }
            for p in policies
        ],
    }


@router.post("/{document_id}/policies", status_code=status.HTTP_201_CREATED)
def add_document_policy(
    document_id: str,
    payload: DocumentPolicyCreateRequest,
    ctx: AuthContext = Depends(get_current_context),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    doc = db.query(Document).filter(Document.id == document_id).first()
    doc = enforce_document_access(
        db, ctx, doc, required_level="manage", document_id_hint=document_id
    )

    policy = DocumentAccessPolicy(
        document_id=doc.id,
        organisation_id=ctx.organisation.id,
        principal_type=payload.principal_type,
        principal_id=payload.principal_id,
        access_level=payload.access_level,
        effect=payload.effect,
        granted_by_id=ctx.user.id,
    )
    db.add(policy)
    db.add(
        AuditLog(
            organisation_id=ctx.organisation.id,
            actor_user_id=ctx.user.id,
            actor_email=ctx.user.email,
            actor_role=ctx.role,
            action="document.policy_created",
            target_type="document",
            target_id=doc.id,
            status="success",
            ip_address=ctx.ip_address,
            user_agent=ctx.user_agent,
            metadata_json={
                "principal_type": payload.principal_type,
                "principal_id": payload.principal_id,
                "access_level": payload.access_level,
                "effect": payload.effect,
            },
        )
    )
    if payload.principal_type == "user" and payload.effect == "allow":
        db.add(
            Notification(
                organisation_id=ctx.organisation.id,
                user_id=payload.principal_id,
                title=f"Access Granted: {doc.title}",
                message=f"You have been granted '{payload.access_level}' access to '{doc.title}'.",
                notification_type="permission_granted",
                link_url=f"/app/documents/{doc.id}",
            )
        )
    db.commit()
    db.refresh(policy)
    return {
        "id": policy.id,
        "document_id": doc.id,
        "principal_type": policy.principal_type,
        "principal_id": policy.principal_id,
        "access_level": policy.access_level,
        "effect": policy.effect,
        "created_at": policy.created_at,
    }


@router.delete("/{document_id}/policies/{policy_id}")
def delete_document_policy(
    document_id: str,
    policy_id: str,
    ctx: AuthContext = Depends(get_current_context),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    doc = db.query(Document).filter(Document.id == document_id).first()
    doc = enforce_document_access(
        db, ctx, doc, required_level="manage", document_id_hint=document_id
    )
    policy = (
        db.query(DocumentAccessPolicy)
        .filter(
            DocumentAccessPolicy.id == policy_id,
            DocumentAccessPolicy.document_id == doc.id,
        )
        .first()
    )
    if not policy:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Access policy not found.",
        )
    db.delete(policy)
    db.add(
        AuditLog(
            organisation_id=ctx.organisation.id,
            actor_user_id=ctx.user.id,
            actor_email=ctx.user.email,
            actor_role=ctx.role,
            action="document.policy_deleted",
            target_type="document",
            target_id=doc.id,
            status="success",
            ip_address=ctx.ip_address,
            user_agent=ctx.user_agent,
            metadata_json={"policy_id": policy_id},
        )
    )
    db.commit()
    return {"message": "Access policy removed."}


from __future__ import annotations

from typing import List, Optional

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.entities import AuditLog, Document, DocumentAccessPolicy
from app.security.rbac import AuthContext

ACCESS_LEVEL_RANK = {
    "view": 1,
    "download": 2,
    "manage": 3,
}


def can_access_document(
    db: Session,
    ctx: AuthContext,
    document: Document,
    required_level: str = "view",
) -> bool:
    """
    Evaluates strict multi-tenant and role/workspace/policy-based access to a document.
    1. Organisation isolation: never allow cross-organisation access.
    2. Explicit DENY policy overrides all allow rules.
    3. Admin or uploader has full access within their organisation.
    4. Workspace manager has manage access to documents assigned to their managed workspace.
    5. Explicit ALLOW policy for user, workspace, or role.
    6. Visibility rules: organisation | workspace | restricted.
    """
    if document.organisation_id != ctx.organisation.id:
        return False

    required_rank = ACCESS_LEVEL_RANK.get(required_level, 1)

    policies = (
        db.query(DocumentAccessPolicy)
        .filter(
            DocumentAccessPolicy.document_id == document.id,
            DocumentAccessPolicy.organisation_id == ctx.organisation.id,
        )
        .all()
    )

    # Check explicit DENY policies first
    for pol in policies:
        if pol.effect == "deny":
            if pol.principal_type == "user" and pol.principal_id == ctx.user.id:
                return False
            if pol.principal_type == "role" and pol.principal_id == ctx.role:
                return False
            if pol.principal_type == "workspace" and pol.principal_id in ctx.workspace_ids:
                return False

    # Organisation Admin or document uploader has full access
    if ctx.role == "admin" or document.uploader_id == ctx.user.id:
        return True

    # Check explicit ALLOW policies
    for pol in policies:
        if pol.effect == "allow":
            pol_rank = ACCESS_LEVEL_RANK.get(pol.access_level, 1)
            if pol_rank >= required_rank:
                if pol.principal_type == "user" and pol.principal_id == ctx.user.id:
                    return True
                if pol.principal_type == "role" and pol.principal_id == ctx.role:
                    return True
                if pol.principal_type == "workspace" and pol.principal_id in ctx.workspace_ids:
                    return True

    # visibility == "restricted" requires explicit policy, uploader, or admin
    if document.visibility == "restricted":
        return False

    allowed_roles = document.allowed_roles_json or ["admin", "manager", "employee"]
    if ctx.role not in allowed_roles:
        return False

    # Workspace Manager can manage/download/view non-restricted documents in their managed workspaces
    if (
        ctx.role == "manager"
        and document.workspace_id
        and document.workspace_id in ctx.managed_workspace_ids
    ):
        return True

    # Only admin/uploader/workspace-manager/explicit-manage-policy can manage
    if required_level == "manage":
        return False

    if document.visibility == "organisation":
        return True

    if document.visibility == "workspace":
        if document.workspace_id and document.workspace_id in ctx.workspace_ids:
            return True
        return False

    return False


def enforce_document_access(
    db: Session,
    ctx: AuthContext,
    document: Optional[Document],
    required_level: str = "view",
    document_id_hint: str = "",
) -> Document:
    """
    Verifies document existence and permission. Logs denied cross-org or unauthorized access.
    Returns 403 when a user in the same org lacks permission, and 404/403 without leaking cross-org metadata.
    """
    if document is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Requested document was not found.",
        )

    if document.organisation_id != ctx.organisation.id:
        db.add(
            AuditLog(
                organisation_id=ctx.organisation.id,
                actor_user_id=ctx.user.id,
                actor_email=ctx.user.email,
                actor_role=ctx.role,
                action="security.cross_org_document_denied",
                target_type="document",
                target_id=document.id or document_id_hint,
                status="denied",
                ip_address=ctx.ip_address,
                user_agent=ctx.user_agent,
                metadata_json={"required_level": required_level},
            )
        )
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: document belongs to another organisation boundary.",
        )

    if not can_access_document(db, ctx, document, required_level=required_level):
        db.add(
            AuditLog(
                organisation_id=ctx.organisation.id,
                actor_user_id=ctx.user.id,
                actor_email=ctx.user.email,
                actor_role=ctx.role,
                action="security.document_access_denied",
                target_type="document",
                target_id=document.id,
                status="denied",
                ip_address=ctx.ip_address,
                user_agent=ctx.user_agent,
                metadata_json={
                    "required_level": required_level,
                    "visibility": document.visibility,
                },
            )
        )
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"You do not have '{required_level}' permission for this document.",
        )

    return document


def get_authorised_documents(
    db: Session,
    ctx: AuthContext,
    *,
    only_ready: bool = False,
    workspace_id: Optional[str] = None,
    file_type: Optional[str] = None,
    owner_id: Optional[str] = None,
    status_filter: Optional[str] = None,
    scoped_document_ids: Optional[List[str]] = None,
) -> List[Document]:
    query = db.query(Document).filter(Document.organisation_id == ctx.organisation.id)

    if only_ready:
        query = query.filter(Document.status == "ready")
    elif status_filter:
        query = query.filter(Document.status == status_filter)
    else:
        query = query.filter(Document.status != "deleting")

    if workspace_id:
        query = query.filter(Document.workspace_id == workspace_id)
    if file_type:
        query = query.filter(Document.file_type == file_type.lower())
    if owner_id:
        query = query.filter(Document.uploader_id == owner_id)
    if scoped_document_ids:
        query = query.filter(Document.id.in_(scoped_document_ids))

    candidates = query.order_by(Document.created_at.desc()).all()
    return [doc for doc in candidates if can_access_document(db, ctx, doc, required_level="view")]

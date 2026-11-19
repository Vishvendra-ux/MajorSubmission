from __future__ import annotations

from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.api.v1.auth import ROLE_PERMISSIONS_MAP
from app.db.session import get_db
from app.models.entities import (
    AuditLog,
    Notification,
    OrganisationMembership,
    Permission,
    Role,
    User,
    Workspace,
    WorkspaceMembership,
)
from app.schemas.api_schemas import (
    UserRoleUpdateRequest,
    UserUpdateAdminRequest,
    WorkspaceCreateRequest,
    WorkspaceMemberAddRequest,
)
from app.security.rbac import AuthContext, get_current_context, require_roles
from app.security.sanitization import sanitize_user_text
from app.utils.pagination import paginate_sequence

router = APIRouter(tags=["Users, Roles, Workspaces & Notifications"])


def _serialize_org_user(
    db: Session,
    user: User,
    membership: OrganisationMembership,
) -> Dict[str, Any]:
    ws_rows = (
        db.query(WorkspaceMembership, Workspace)
        .join(Workspace, WorkspaceMembership.workspace_id == Workspace.id)
        .filter(
            WorkspaceMembership.user_id == user.id,
            Workspace.organisation_id == membership.organisation_id,
        )
        .all()
    )
    return {
        "id": user.id,
        "email": user.email,
        "full_name": user.full_name,
        "job_title": user.job_title,
        "department": user.department,
        "is_active": user.is_active,
        "is_demo": user.is_demo,
        "role": membership.role,
        "joined_at": membership.joined_at,
        "last_login_at": user.last_login_at,
        "workspaces": [
            {
                "id": ws.id,
                "name": ws.name,
                "slug": ws.slug,
                "workspace_role": wm.workspace_role,
            }
            for wm, ws in ws_rows
        ],
    }


@router.get("/users")
def list_organisation_users(
    q: Optional[str] = Query(default=None),
    role: Optional[str] = Query(default=None),
    workspace_id: Optional[str] = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=1, le=100),
    ctx: AuthContext = Depends(require_roles("admin", "manager")),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    rows = (
        db.query(User, OrganisationMembership)
        .join(OrganisationMembership, OrganisationMembership.user_id == User.id)
        .filter(OrganisationMembership.organisation_id == ctx.organisation.id)
        .order_by(User.full_name.asc())
        .all()
    )

    items = [_serialize_org_user(db, u, m) for u, m in rows]
    if q and q.strip():
        needle = q.strip().lower()
        items = [
            x
            for x in items
            if needle in x["full_name"].lower()
            or needle in x["email"].lower()
            or (x["department"] and needle in x["department"].lower())
        ]
    if role:
        items = [x for x in items if x["role"] == role]
    if workspace_id:
        items = [
            x
            for x in items
            if any(w["id"] == workspace_id for w in x["workspaces"])
        ]

    paged, meta = paginate_sequence(items, page=page, page_size=page_size)
    return {"items": paged, "pagination": meta}


@router.get("/users/{user_id}")
def get_organisation_user(
    user_id: str,
    ctx: AuthContext = Depends(get_current_context),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    if ctx.role not in ("admin", "manager") and ctx.user.id != user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to view another user's profile.",
        )

    row = (
        db.query(User, OrganisationMembership)
        .join(OrganisationMembership, OrganisationMembership.user_id == User.id)
        .filter(
            User.id == user_id,
            OrganisationMembership.organisation_id == ctx.organisation.id,
        )
        .first()
    )
    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found in your organisation.",
        )
    user, membership = row
    return _serialize_org_user(db, user, membership)


@router.patch("/users/{user_id}")
def update_organisation_user(
    user_id: str,
    payload: UserUpdateAdminRequest,
    ctx: AuthContext = Depends(require_roles("admin")),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    row = (
        db.query(User, OrganisationMembership)
        .join(OrganisationMembership, OrganisationMembership.user_id == User.id)
        .filter(
            User.id == user_id,
            OrganisationMembership.organisation_id == ctx.organisation.id,
        )
        .first()
    )
    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found in your organisation.",
        )

    user, membership = row
    changes: Dict[str, Any] = {}
    if payload.full_name is not None:
        user.full_name = sanitize_user_text(payload.full_name, 140)
        changes["full_name"] = user.full_name
    if payload.job_title is not None:
        user.job_title = sanitize_user_text(payload.job_title, 120)
        changes["job_title"] = user.job_title
    if payload.department is not None:
        user.department = sanitize_user_text(payload.department, 120)
        changes["department"] = user.department
    if payload.is_active is not None:
        if user.id == ctx.user.id and not payload.is_active:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Administrators cannot deactivate their own active session account.",
            )
        user.is_active = payload.is_active
        changes["is_active"] = payload.is_active

    db.add(
        AuditLog(
            organisation_id=ctx.organisation.id,
            actor_user_id=ctx.user.id,
            actor_email=ctx.user.email,
            actor_role=ctx.role,
            action="admin.user_updated",
            target_type="user",
            target_id=user.id,
            status="success",
            ip_address=ctx.ip_address,
            user_agent=ctx.user_agent,
            metadata_json=changes,
        )
    )
    db.commit()
    db.refresh(user)
    return _serialize_org_user(db, user, membership)


@router.get("/roles")
def list_roles_and_permissions(
    ctx: AuthContext = Depends(get_current_context),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    roles = db.query(Role).order_by(Role.name.asc()).all()
    perms = db.query(Permission).order_by(Permission.module.asc(), Permission.code.asc()).all()

    role_counts: Dict[str, int] = {}
    for r_name in ("admin", "manager", "employee"):
        role_counts[r_name] = (
            db.query(OrganisationMembership)
            .filter(
                OrganisationMembership.organisation_id == ctx.organisation.id,
                OrganisationMembership.role == r_name,
            )
            .count()
        )

    role_items: List[Dict[str, Any]] = []
    if roles:
        for r in roles:
            role_items.append(
                {
                    "id": r.id,
                    "name": r.name,
                    "display_name": r.display_name,
                    "description": r.description,
                    "is_system": r.is_system,
                    "member_count": role_counts.get(r.name, 0),
                    "permissions": ROLE_PERMISSIONS_MAP.get(r.name, []),
                }
            )
    else:
        for r_name, desc in [
            ("admin", "Full organisation, user, role, security policy, and audit administration."),
            ("manager", "Team workspace management, document access governance, and team analytics."),
            ("employee", "Document upload, semantic search, grounded AI Q&A, summaries, and feedback."),
        ]:
            role_items.append(
                {
                    "id": r_name,
                    "name": r_name,
                    "display_name": r_name.title(),
                    "description": desc,
                    "is_system": True,
                    "member_count": role_counts.get(r_name, 0),
                    "permissions": ROLE_PERMISSIONS_MAP.get(r_name, []),
                }
            )

    return {
        "roles": role_items,
        "permissions_catalog": [
            {
                "id": p.id,
                "code": p.code,
                "module": p.module,
                "description": p.description,
            }
            for p in perms
        ],
    }


@router.patch("/users/{user_id}/role")
def update_user_role(
    user_id: str,
    payload: UserRoleUpdateRequest,
    ctx: AuthContext = Depends(require_roles("admin")),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    row = (
        db.query(User, OrganisationMembership)
        .join(OrganisationMembership, OrganisationMembership.user_id == User.id)
        .filter(
            User.id == user_id,
            OrganisationMembership.organisation_id == ctx.organisation.id,
        )
        .first()
    )
    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found in your organisation.",
        )
    user, membership = row

    if user.id == ctx.user.id and payload.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You cannot demote your own administrator role.",
        )

    old_role = membership.role
    role_obj = db.query(Role).filter(Role.name == payload.role).first()
    membership.role = payload.role
    if role_obj:
        membership.role_id = role_obj.id

    db.add(
        AuditLog(
            organisation_id=ctx.organisation.id,
            actor_user_id=ctx.user.id,
            actor_email=ctx.user.email,
            actor_role=ctx.role,
            action="admin.role_changed",
            target_type="user",
            target_id=user.id,
            status="success",
            ip_address=ctx.ip_address,
            user_agent=ctx.user_agent,
            metadata_json={"previous_role": old_role, "new_role": payload.role},
        )
    )
    db.add(
        Notification(
            organisation_id=ctx.organisation.id,
            user_id=user.id,
            title="Role Updated",
            message=f"Your organisation role has been updated from '{old_role}' to '{payload.role}'.",
            notification_type="security",
            link_url="/app/profile",
        )
    )
    db.commit()
    return _serialize_org_user(db, user, membership)


@router.get("/workspaces")
def list_workspaces(
    ctx: AuthContext = Depends(get_current_context),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    workspaces = (
        db.query(Workspace)
        .filter(Workspace.organisation_id == ctx.organisation.id)
        .order_by(Workspace.name.asc())
        .all()
    )
    items = []
    for ws in workspaces:
        members = (
            db.query(WorkspaceMembership, User)
            .join(User, WorkspaceMembership.user_id == User.id)
            .filter(WorkspaceMembership.workspace_id == ws.id)
            .all()
        )
        items.append(
            {
                "id": ws.id,
                "organisation_id": ws.organisation_id,
                "name": ws.name,
                "slug": ws.slug,
                "description": ws.description,
                "is_member": ws.id in ctx.workspace_ids or ctx.role == "admin",
                "can_manage": ctx.role == "admin" or ws.id in ctx.managed_workspace_ids,
                "member_count": len(members),
                "members": [
                    {
                        "user_id": u.id,
                        "full_name": u.full_name,
                        "email": u.email,
                        "department": u.department,
                        "workspace_role": wm.workspace_role,
                    }
                    for wm, u in members
                ],
                "created_at": ws.created_at,
            }
        )
    return {
        "organisation": {
            "id": ctx.organisation.id,
            "name": ctx.organisation.name,
            "slug": ctx.organisation.slug,
            "domain": ctx.organisation.domain,
            "description": ctx.organisation.description,
        },
        "items": items,
    }


@router.post("/workspaces", status_code=status.HTTP_201_CREATED)
def create_workspace(
    payload: WorkspaceCreateRequest,
    ctx: AuthContext = Depends(require_roles("admin")),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    existing = (
        db.query(Workspace)
        .filter(
            Workspace.organisation_id == ctx.organisation.id,
            Workspace.slug == payload.slug,
        )
        .first()
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Workspace with slug '{payload.slug}' already exists in your organisation.",
        )

    ws = Workspace(
        organisation_id=ctx.organisation.id,
        name=sanitize_user_text(payload.name, 120),
        slug=payload.slug,
        description=sanitize_user_text(payload.description or "", 500) if payload.description else None,
        created_by_id=ctx.user.id,
    )
    db.add(ws)
    db.flush()

    db.add(
        WorkspaceMembership(
            workspace_id=ws.id,
            user_id=ctx.user.id,
            workspace_role="manager",
            added_by_id=ctx.user.id,
        )
    )
    db.add(
        AuditLog(
            organisation_id=ctx.organisation.id,
            actor_user_id=ctx.user.id,
            actor_email=ctx.user.email,
            actor_role=ctx.role,
            action="workspace.created",
            target_type="workspace",
            target_id=ws.id,
            status="success",
            ip_address=ctx.ip_address,
            user_agent=ctx.user_agent,
            metadata_json={"name": ws.name, "slug": ws.slug},
        )
    )
    db.commit()
    db.refresh(ws)
    return {
        "id": ws.id,
        "name": ws.name,
        "slug": ws.slug,
        "description": ws.description,
        "created_at": ws.created_at,
    }


@router.post("/workspaces/{workspace_id}/members", status_code=status.HTTP_201_CREATED)
def add_workspace_member(
    workspace_id: str,
    payload: WorkspaceMemberAddRequest,
    ctx: AuthContext = Depends(require_roles("admin", "manager")),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    ws = (
        db.query(Workspace)
        .filter(
            Workspace.id == workspace_id,
            Workspace.organisation_id == ctx.organisation.id,
        )
        .first()
    )
    if not ws:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Workspace not found.",
        )

    if ctx.role != "admin" and ws.id not in ctx.managed_workspace_ids:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Managers can only manage membership within their assigned workspaces.",
        )

    # Verify target user belongs to the same organisation
    org_member = (
        db.query(OrganisationMembership)
        .filter(
            OrganisationMembership.organisation_id == ctx.organisation.id,
            OrganisationMembership.user_id == payload.user_id,
        )
        .first()
    )
    if not org_member:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Target user does not belong to your organisation.",
        )

    existing = (
        db.query(WorkspaceMembership)
        .filter(
            WorkspaceMembership.workspace_id == ws.id,
            WorkspaceMembership.user_id == payload.user_id,
        )
        .first()
    )
    if existing:
        existing.workspace_role = payload.workspace_role
    else:
        db.add(
            WorkspaceMembership(
                workspace_id=ws.id,
                user_id=payload.user_id,
                workspace_role=payload.workspace_role,
                added_by_id=ctx.user.id,
            )
        )

    db.add(
        AuditLog(
            organisation_id=ctx.organisation.id,
            actor_user_id=ctx.user.id,
            actor_email=ctx.user.email,
            actor_role=ctx.role,
            action="workspace.member_added",
            target_type="workspace",
            target_id=ws.id,
            status="success",
            ip_address=ctx.ip_address,
            user_agent=ctx.user_agent,
            metadata_json={
                "user_id": payload.user_id,
                "workspace_role": payload.workspace_role,
            },
        )
    )
    db.commit()
    return {"message": "Workspace membership updated.", "workspace_id": ws.id}


@router.delete("/workspaces/{workspace_id}/members/{user_id}")
def remove_workspace_member(
    workspace_id: str,
    user_id: str,
    ctx: AuthContext = Depends(require_roles("admin", "manager")),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    ws = (
        db.query(Workspace)
        .filter(
            Workspace.id == workspace_id,
            Workspace.organisation_id == ctx.organisation.id,
        )
        .first()
    )
    if not ws:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workspace not found.")
    if ctx.role != "admin" and ws.id not in ctx.managed_workspace_ids:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only remove members from workspaces you manage.",
        )

    wm = (
        db.query(WorkspaceMembership)
        .filter(
            WorkspaceMembership.workspace_id == ws.id,
            WorkspaceMembership.user_id == user_id,
        )
        .first()
    )
    if not wm:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found in workspace.")

    db.delete(wm)
    db.add(
        AuditLog(
            organisation_id=ctx.organisation.id,
            actor_user_id=ctx.user.id,
            actor_email=ctx.user.email,
            actor_role=ctx.role,
            action="workspace.member_removed",
            target_type="workspace",
            target_id=ws.id,
            status="success",
            ip_address=ctx.ip_address,
            user_agent=ctx.user_agent,
            metadata_json={"removed_user_id": user_id},
        )
    )
    db.commit()
    return {"message": "Member removed from workspace."}


@router.get("/notifications")
def list_notifications(
    unread_only: bool = Query(default=False),
    ctx: AuthContext = Depends(get_current_context),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    query = db.query(Notification).filter(
        Notification.organisation_id == ctx.organisation.id,
        Notification.user_id == ctx.user.id,
    )
    if unread_only:
        query = query.filter(Notification.is_read.is_(False))

    items = query.order_by(Notification.created_at.desc()).limit(50).all()
    unread_count = (
        db.query(Notification)
        .filter(
            Notification.organisation_id == ctx.organisation.id,
            Notification.user_id == ctx.user.id,
            Notification.is_read.is_(False),
        )
        .count()
    )
    return {
        "unread_count": unread_count,
        "items": [
            {
                "id": n.id,
                "title": n.title,
                "message": n.message,
                "notification_type": n.notification_type,
                "link_url": n.link_url,
                "is_read": n.is_read,
                "created_at": n.created_at,
            }
            for n in items
        ],
    }


@router.patch("/notifications/{notification_id}/read")
def mark_notification_read(
    notification_id: str,
    ctx: AuthContext = Depends(get_current_context),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    notif = (
        db.query(Notification)
        .filter(
            Notification.id == notification_id,
            Notification.user_id == ctx.user.id,
            Notification.organisation_id == ctx.organisation.id,
        )
        .first()
    )
    if not notif:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Notification not found.")
    notif.is_read = True
    db.commit()
    return {"id": notif.id, "is_read": True}


@router.post("/notifications/read-all")
def mark_all_notifications_read(
    ctx: AuthContext = Depends(get_current_context),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    db.query(Notification).filter(
        Notification.user_id == ctx.user.id,
        Notification.organisation_id == ctx.organisation.id,
        Notification.is_read.is_(False),
    ).update({"is_read": True})
    db.commit()
    return {"message": "All notifications marked as read."}


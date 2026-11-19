from __future__ import annotations

import re
from datetime import timedelta
from typing import Any, Dict, List

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.logging import get_logger
from app.core.rate_limit import enforce_auth_rate_limit
from app.db.session import get_db
from app.models.base import utcnow
from app.models.entities import (
    AuditLog,
    Organisation,
    OrganisationMembership,
    PasswordResetRecord,
    RefreshSession,
    Role,
    User,
    Workspace,
    WorkspaceMembership,
)
from app.schemas.api_schemas import (
    AuthTokenResponse,
    ForgotPasswordRequest,
    LoginRequest,
    LogoutRequest,
    ProfileUpdateRequest,
    RefreshTokenRequest,
    RegisterRequest,
    ResetPasswordRequest,
    UserMeResponse,
    WorkspaceMiniResponse,
)
from app.security.jwt import create_access_token, create_refresh_token, decode_token
from app.security.passwords import (
    generate_secure_token,
    hash_password,
    hash_token,
    validate_password_strength,
    verify_password,
)
from app.security.rbac import AuthContext, get_current_context
from app.security.sanitization import sanitize_user_text

logger = get_logger(__name__)
router = APIRouter(prefix="/auth", tags=["Authentication"])

ROLE_PERMISSIONS_MAP: Dict[str, List[str]] = {
    "admin": [
        "documents:upload",
        "documents:read",
        "documents:download",
        "documents:manage",
        "documents:delete",
        "search:execute",
        "assistant:ask",
        "summaries:generate",
        "feedback:submit",
        "users:read",
        "users:manage",
        "roles:manage",
        "workspaces:manage",
        "analytics:org",
        "analytics:team",
        "audit:read",
        "jobs:manage",
        "system:config",
    ],
    "manager": [
        "documents:upload",
        "documents:read",
        "documents:download",
        "documents:manage",
        "search:execute",
        "assistant:ask",
        "summaries:generate",
        "feedback:submit",
        "users:read",
        "workspaces:manage",
        "analytics:team",
    ],
    "employee": [
        "documents:upload",
        "documents:read",
        "documents:download",
        "search:execute",
        "assistant:ask",
        "summaries:generate",
        "feedback:submit",
    ],
}


def build_user_me_response(
    db: Session,
    user: User,
    org: Organisation,
    role: str,
) -> UserMeResponse:
    ws_rows = (
        db.query(WorkspaceMembership, Workspace)
        .join(Workspace, WorkspaceMembership.workspace_id == Workspace.id)
        .filter(
            WorkspaceMembership.user_id == user.id,
            Workspace.organisation_id == org.id,
        )
        .all()
    )
    workspaces = [
        WorkspaceMiniResponse(
            id=ws.id,
            name=ws.name,
            slug=ws.slug,
            workspace_role=wm.workspace_role,
        )
        for wm, ws in ws_rows
    ]
    return UserMeResponse(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        job_title=user.job_title,
        department=user.department,
        is_active=user.is_active,
        is_demo=user.is_demo,
        organisation_id=org.id,
        organisation_name=org.name,
        organisation_slug=org.slug,
        role=role,
        permissions=ROLE_PERMISSIONS_MAP.get(role, ROLE_PERMISSIONS_MAP["employee"]),
        workspaces=workspaces,
        last_login_at=user.last_login_at,
        created_at=user.created_at,
    )


def _issue_session_tokens(
    db: Session,
    request: Request,
    user: User,
    org: Organisation,
    role: str,
) -> AuthTokenResponse:
    access_token, expires_in = create_access_token(
        user_id=user.id,
        organisation_id=org.id,
        role=role,
        email=user.email,
    )
    refresh_token, jti, expires_at = create_refresh_token(
        user_id=user.id,
        organisation_id=org.id,
    )
    session_rec = RefreshSession(
        user_id=user.id,
        organisation_id=org.id,
        token_jti=jti,
        token_hash=hash_token(refresh_token),
        ip_address=request.client.host if request.client else None,
        user_agent=(request.headers.get("user-agent") or "")[:250],
        is_revoked=False,
        expires_at=expires_at,
    )
    db.add(session_rec)
    user.last_login_at = utcnow()
    db.commit()
    db.refresh(user)

    return AuthTokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        token_type="bearer",
        expires_in=expires_in,
        user=build_user_me_response(db, user, org, role),
    )


@router.post("/register", response_model=AuthTokenResponse, status_code=status.HTTP_201_CREATED)
def register_user(
    payload: RegisterRequest,
    request: Request,
    db: Session = Depends(get_db),
) -> AuthTokenResponse:
    enforce_auth_rate_limit(request)

    ok, msg = validate_password_strength(payload.password)
    if not ok:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=msg)

    normalized_email = payload.email.strip().lower()
    existing = db.query(User).filter(User.email == normalized_email).first()
    if existing:
        # Generic message to prevent email enumeration
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Unable to complete registration with the provided details.",
        )

    # Determine or create organisation
    org: Organisation | None = None
    assigned_role = "employee"

    if payload.organisation_slug:
        slug = re.sub(r"[^a-z0-9-]", "-", payload.organisation_slug.strip().lower()).strip("-")
        org = db.query(Organisation).filter(Organisation.slug == slug).first()

    if org is None and payload.organisation_name:
        slug_base = re.sub(
            r"[^a-z0-9]+", "-", payload.organisation_name.strip().lower()
        ).strip("-")[:80] or "enterprise-org"
        slug = slug_base
        counter = 1
        while db.query(Organisation).filter(Organisation.slug == slug).first() is not None:
            counter += 1
            slug = f"{slug_base}-{counter}"
        org = Organisation(
            name=sanitize_user_text(payload.organisation_name, 160),
            slug=slug,
            description="Organisation workspace created on SUMIND-IQ.",
            is_active=True,
            is_demo=False,
        )
        db.add(org)
        db.flush()
        # First creator of a new organisation becomes its Admin and gets a default General workspace
        assigned_role = "admin"
        default_ws = Workspace(
            organisation_id=org.id,
            name="General Knowledge Base",
            slug="general",
            description="Default organisation-wide knowledge workspace.",
        )
        db.add(default_ws)
        db.flush()
    elif org is None:
        # Join default primary organisation if present, otherwise create one
        org = db.query(Organisation).order_by(Organisation.created_at.asc()).first()
        if org is None:
            org = Organisation(
                name="Apex Global Technologies",
                slug="apex-global",
                description="Primary Enterprise Knowledge Workspace",
                is_active=True,
            )
            db.add(org)
            db.flush()

    role_obj = db.query(Role).filter(Role.name == assigned_role).first()

    user = User(
        email=normalized_email,
        full_name=sanitize_user_text(payload.full_name, 140),
        password_hash=hash_password(payload.password),
        job_title=sanitize_user_text(payload.job_title or "Knowledge Member", 120),
        department=sanitize_user_text(payload.department or "Operations", 120),
        is_active=True,
        is_demo=False,
    )
    db.add(user)
    db.flush()

    membership = OrganisationMembership(
        organisation_id=org.id,
        user_id=user.id,
        role=assigned_role,
        role_id=role_obj.id if role_obj else None,
        is_default=True,
    )
    db.add(membership)

    # Add user to default workspace in that org if one exists
    first_ws = (
        db.query(Workspace)
        .filter(Workspace.organisation_id == org.id)
        .order_by(Workspace.created_at.asc())
        .first()
    )
    if first_ws:
        db.add(
            WorkspaceMembership(
                workspace_id=first_ws.id,
                user_id=user.id,
                workspace_role="manager" if assigned_role in ("admin", "manager") else "member",
            )
        )

    db.add(
        AuditLog(
            organisation_id=org.id,
            actor_user_id=user.id,
            actor_email=user.email,
            actor_role=assigned_role,
            action="auth.register",
            target_type="user",
            target_id=user.id,
            status="success",
            ip_address=request.client.host if request.client else None,
            user_agent=(request.headers.get("user-agent") or "")[:250],
            metadata_json={"organisation_slug": org.slug, "role": assigned_role},
        )
    )
    db.commit()

    return _issue_session_tokens(db, request, user, org, assigned_role)


@router.post("/login", response_model=AuthTokenResponse)
def login_user(
    payload: LoginRequest,
    request: Request,
    db: Session = Depends(get_db),
) -> AuthTokenResponse:
    enforce_auth_rate_limit(request)

    normalized_email = payload.email.strip().lower()
    user = db.query(User).filter(User.email == normalized_email).first()

    if not user or not verify_password(payload.password, user.password_hash):
        db.add(
            AuditLog(
                organisation_id=None,
                actor_user_id=user.id if user else None,
                actor_email=normalized_email,
                actor_role=None,
                action="auth.login_failed",
                target_type="user",
                target_id=user.id if user else None,
                status="failure",
                ip_address=request.client.host if request.client else None,
                user_agent=(request.headers.get("user-agent") or "")[:250],
                metadata_json={"reason": "invalid_credentials"},
            )
        )
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password credentials.",
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Your account has been deactivated by an administrator.",
        )

    membership_query = (
        db.query(OrganisationMembership, Organisation)
        .join(Organisation, OrganisationMembership.organisation_id == Organisation.id)
        .filter(
            OrganisationMembership.user_id == user.id,
            Organisation.is_active.is_(True),
        )
    )
    if payload.organisation_slug:
        membership_query = membership_query.filter(
            Organisation.slug == payload.organisation_slug.strip().lower()
        )

    row = membership_query.order_by(OrganisationMembership.is_default.desc()).first()
    if not row:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No active organisation membership found for this account.",
        )

    membership, org = row
    db.add(
        AuditLog(
            organisation_id=org.id,
            actor_user_id=user.id,
            actor_email=user.email,
            actor_role=membership.role,
            action="auth.login_success",
            target_type="user",
            target_id=user.id,
            status="success",
            ip_address=request.client.host if request.client else None,
            user_agent=(request.headers.get("user-agent") or "")[:250],
            metadata_json={"organisation_slug": org.slug},
        )
    )
    db.commit()

    return _issue_session_tokens(db, request, user, org, membership.role)


@router.post("/refresh", response_model=AuthTokenResponse)
def refresh_session_token(
    payload: RefreshTokenRequest,
    request: Request,
    db: Session = Depends(get_db),
) -> AuthTokenResponse:
    enforce_auth_rate_limit(request)
    decoded = decode_token(payload.refresh_token, expected_type="refresh")
    jti = decoded.get("jti")
    user_id = decoded.get("sub")
    org_id = decoded.get("org")

    session_rec = (
        db.query(RefreshSession)
        .filter(
            RefreshSession.token_jti == jti,
            RefreshSession.user_id == user_id,
            RefreshSession.is_revoked.is_(False),
        )
        .first()
    )
    if not session_rec or session_rec.token_hash != hash_token(payload.refresh_token):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh session is invalid or has been revoked.",
        )

    # Rotate refresh token
    session_rec.is_revoked = True
    session_rec.revoked_at = utcnow()

    user = db.query(User).filter(User.id == user_id, User.is_active.is_(True)).first()
    org = db.query(Organisation).filter(Organisation.id == org_id, Organisation.is_active.is_(True)).first()
    membership = (
        db.query(OrganisationMembership)
        .filter(
            OrganisationMembership.user_id == user_id,
            OrganisationMembership.organisation_id == org_id,
        )
        .first()
    )
    if not user or not org or not membership:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User or organisation membership is no longer active.",
        )

    return _issue_session_tokens(db, request, user, org, membership.role)


@router.post("/logout")
def logout_user(
    payload: LogoutRequest,
    ctx: AuthContext = Depends(get_current_context),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    if payload.refresh_token:
        token_h = hash_token(payload.refresh_token)
        rec = (
            db.query(RefreshSession)
            .filter(
                RefreshSession.user_id == ctx.user.id,
                RefreshSession.token_hash == token_h,
            )
            .first()
        )
        if rec:
            rec.is_revoked = True
            rec.revoked_at = utcnow()
    else:
        # Revoke all active refresh sessions for this user in the current org
        db.query(RefreshSession).filter(
            RefreshSession.user_id == ctx.user.id,
            RefreshSession.organisation_id == ctx.organisation.id,
            RefreshSession.is_revoked.is_(False),
        ).update({"is_revoked": True, "revoked_at": utcnow()})

    db.add(
        AuditLog(
            organisation_id=ctx.organisation.id,
            actor_user_id=ctx.user.id,
            actor_email=ctx.user.email,
            actor_role=ctx.role,
            action="auth.logout",
            target_type="session",
            target_id=ctx.user.id,
            status="success",
            ip_address=ctx.ip_address,
            user_agent=ctx.user_agent,
            metadata_json={},
        )
    )
    db.commit()
    return {"message": "Signed out and revoked active session token."}


@router.post("/forgot-password")
def forgot_password(
    payload: ForgotPasswordRequest,
    request: Request,
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    enforce_auth_rate_limit(request)
    settings = get_settings()
    normalized_email = payload.email.strip().lower()
    user = db.query(User).filter(User.email == normalized_email, User.is_active.is_(True)).first()

    dev_reset_token = None
    if user:
        raw_token = generate_secure_token(32)
        rec = PasswordResetRecord(
            user_id=user.id,
            token_hash=hash_token(raw_token),
            is_used=False,
            expires_at=utcnow() + timedelta(minutes=settings.PASSWORD_RESET_EXPIRE_MINUTES),
        )
        db.add(rec)
        db.add(
            AuditLog(
                organisation_id=None,
                actor_user_id=user.id,
                actor_email=user.email,
                actor_role=None,
                action="auth.password_reset_requested",
                target_type="user",
                target_id=user.id,
                status="success",
                ip_address=request.client.host if request.client else None,
                metadata_json={"email_provider": settings.EMAIL_PROVIDER},
            )
        )
        db.commit()
        if settings.EMAIL_PROVIDER == "console_dev" and settings.APP_ENV != "production":
            dev_reset_token = raw_token
            logger.info("DEV MODE password reset token generated for %s", user.email)

    # Always return a generic response so email existence is not revealed
    response: Dict[str, Any] = {
        "message": (
            "If an active account matches that email address, password reset instructions "
            "have been dispatched."
        ),
        "email_provider_mode": settings.EMAIL_PROVIDER,
    }
    if dev_reset_token:
        response["dev_mode_reset_token"] = dev_reset_token
    return response


@router.post("/reset-password")
def reset_password(
    payload: ResetPasswordRequest,
    request: Request,
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    enforce_auth_rate_limit(request)
    ok, msg = validate_password_strength(payload.new_password)
    if not ok:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=msg)

    t_hash = hash_token(payload.token.strip())
    rec = (
        db.query(PasswordResetRecord)
        .filter(
            PasswordResetRecord.token_hash == t_hash,
            PasswordResetRecord.is_used.is_(False),
        )
        .first()
    )
    now = utcnow()
    if not rec:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired password reset token.",
        )

    exp = rec.expires_at
    if exp.tzinfo is None:
        from datetime import timezone

        exp = exp.replace(tzinfo=timezone.utc)
    if exp < now:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password reset token has expired.",
        )

    user = db.query(User).filter(User.id == rec.user_id, User.is_active.is_(True)).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid password reset request.",
        )

    user.password_hash = hash_password(payload.new_password)
    rec.is_used = True
    rec.used_at = now

    # Revoke existing refresh sessions on password reset
    db.query(RefreshSession).filter(
        RefreshSession.user_id == user.id,
        RefreshSession.is_revoked.is_(False),
    ).update({"is_revoked": True, "revoked_at": now})

    db.add(
        AuditLog(
            organisation_id=None,
            actor_user_id=user.id,
            actor_email=user.email,
            actor_role=None,
            action="auth.password_reset_completed",
            target_type="user",
            target_id=user.id,
            status="success",
            ip_address=request.client.host if request.client else None,
            metadata_json={},
        )
    )
    db.commit()
    return {"message": "Password has been reset successfully. You may now sign in."}


@router.get("/me", response_model=UserMeResponse)
def get_me(
    ctx: AuthContext = Depends(get_current_context),
    db: Session = Depends(get_db),
) -> UserMeResponse:
    return build_user_me_response(db, ctx.user, ctx.organisation, ctx.role)


@router.patch("/me", response_model=UserMeResponse)
def update_me(
    payload: ProfileUpdateRequest,
    ctx: AuthContext = Depends(get_current_context),
    db: Session = Depends(get_db),
) -> UserMeResponse:
    user = ctx.user
    if payload.full_name is not None:
        user.full_name = sanitize_user_text(payload.full_name, 140)
    if payload.job_title is not None:
        user.job_title = sanitize_user_text(payload.job_title, 120)
    if payload.department is not None:
        user.department = sanitize_user_text(payload.department, 120)

    if payload.new_password:
        if not payload.current_password or not verify_password(
            payload.current_password, user.password_hash
        ):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Current password is incorrect.",
            )
        ok, msg = validate_password_strength(payload.new_password)
        if not ok:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=msg)
        user.password_hash = hash_password(payload.new_password)

    db.add(
        AuditLog(
            organisation_id=ctx.organisation.id,
            actor_user_id=user.id,
            actor_email=user.email,
            actor_role=ctx.role,
            action="user.profile_updated",
            target_type="user",
            target_id=user.id,
            status="success",
            ip_address=ctx.ip_address,
            user_agent=ctx.user_agent,
            metadata_json={"password_changed": bool(payload.new_password)},
        )
    )
    db.commit()
    db.refresh(user)
    return build_user_me_response(db, user, ctx.organisation, ctx.role)


from __future__ import annotations

from dataclasses import dataclass
from typing import Callable, List, Optional

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.entities import (
    AuditLog,
    Organisation,
    OrganisationMembership,
    User,
    WorkspaceMembership,
)
from app.security.jwt import decode_token

bearer_scheme = HTTPBearer(auto_error=False)


@dataclass
class AuthContext:
    user: User
    organisation: Organisation
    membership: OrganisationMembership
    role: str  # admin | manager | employee
    workspace_ids: List[str]
    managed_workspace_ids: List[str]
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None


def get_current_context(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> AuthContext:
    token: Optional[str] = None
    if credentials and credentials.scheme.lower() == "bearer":
        token = credentials.credentials
    elif "download_token" in request.query_params:
        # Allow short-lived signed download token only on download endpoints
        pass

    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication credentials were not provided.",
        )

    payload = decode_token(token, expected_type="access")
    user_id = payload.get("sub")
    org_id = payload.get("org")

    if not user_id or not org_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Malformed authentication token payload.",
        )

    user = db.query(User).filter(User.id == user_id, User.is_active.is_(True)).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authenticated user account is inactive or no longer exists.",
        )

    org = (
        db.query(Organisation)
        .filter(Organisation.id == org_id, Organisation.is_active.is_(True))
        .first()
    )
    if not org:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Organisation workspace is inactive or inaccessible.",
        )

    membership = (
        db.query(OrganisationMembership)
        .filter(
            OrganisationMembership.user_id == user.id,
            OrganisationMembership.organisation_id == org.id,
        )
        .first()
    )
    if not membership:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User is not a member of the requested organisation.",
        )

    ws_memberships = (
        db.query(WorkspaceMembership)
        .filter(WorkspaceMembership.user_id == user.id)
        .all()
    )
    workspace_ids = [wm.workspace_id for wm in ws_memberships]
    managed_workspace_ids = [
        wm.workspace_id for wm in ws_memberships if wm.workspace_role == "manager"
    ]

    return AuthContext(
        user=user,
        organisation=org,
        membership=membership,
        role=membership.role,
        workspace_ids=workspace_ids,
        managed_workspace_ids=managed_workspace_ids,
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )


def require_roles(*allowed_roles: str) -> Callable[..., AuthContext]:
    def dependency(
        request: Request,
        ctx: AuthContext = Depends(get_current_context),
        db: Session = Depends(get_db),
    ) -> AuthContext:
        if ctx.role not in allowed_roles:
            db.add(
                AuditLog(
                    organisation_id=ctx.organisation.id,
                    actor_user_id=ctx.user.id,
                    actor_email=ctx.user.email,
                    actor_role=ctx.role,
                    action="security.access_denied",
                    target_type="endpoint",
                    target_id=request.url.path,
                    status="denied",
                    ip_address=ctx.ip_address,
                    user_agent=ctx.user_agent,
                    metadata_json={
                        "required_roles": list(allowed_roles),
                        "actual_role": ctx.role,
                        "method": request.method,
                    },
                )
            )
            db.commit()
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have sufficient role permissions to perform this action.",
            )
        return ctx

    return dependency

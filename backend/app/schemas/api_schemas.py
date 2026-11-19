from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, EmailStr, Field


# --- Auth & Profile Schemas ---
class RegisterRequest(BaseModel):
    email: EmailStr
    full_name: str = Field(..., min_length=2, max_length=140)
    password: str = Field(..., min_length=8, max_length=128)
    organisation_name: Optional[str] = Field(default=None, max_length=160)
    organisation_slug: Optional[str] = Field(default=None, max_length=120)
    job_title: Optional[str] = Field(default="Knowledge Analyst", max_length=120)
    department: Optional[str] = Field(default="General", max_length=120)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=1, max_length=128)
    organisation_slug: Optional[str] = None


class RefreshTokenRequest(BaseModel):
    refresh_token: str = Field(..., min_length=10)


class LogoutRequest(BaseModel):
    refresh_token: Optional[str] = None


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str = Field(..., min_length=10)
    new_password: str = Field(..., min_length=8, max_length=128)


class ProfileUpdateRequest(BaseModel):
    full_name: Optional[str] = Field(default=None, min_length=2, max_length=140)
    job_title: Optional[str] = Field(default=None, max_length=120)
    department: Optional[str] = Field(default=None, max_length=120)
    current_password: Optional[str] = None
    new_password: Optional[str] = Field(default=None, min_length=8, max_length=128)


class WorkspaceMiniResponse(BaseModel):
    id: str
    name: str
    slug: str
    workspace_role: str


class UserMeResponse(BaseModel):
    id: str
    email: str
    full_name: str
    job_title: Optional[str]
    department: Optional[str]
    is_active: bool
    is_demo: bool
    organisation_id: str
    organisation_name: str
    organisation_slug: str
    role: str
    permissions: List[str]
    workspaces: List[WorkspaceMiniResponse]
    last_login_at: Optional[datetime]
    created_at: datetime


class AuthTokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int
    user: UserMeResponse


# --- Document & Access Policy Schemas ---
class DocumentPolicyCreateRequest(BaseModel):
    principal_type: str = Field(..., pattern="^(user|workspace|role)$")
    principal_id: str = Field(..., min_length=1, max_length=64)
    access_level: str = Field(default="view", pattern="^(view|download|manage)$")
    effect: str = Field(default="allow", pattern="^(allow|deny)$")


class DocumentUpdateRequest(BaseModel):
    title: Optional[str] = Field(default=None, min_length=2, max_length=255)
    description: Optional[str] = Field(default=None, max_length=2000)
    visibility: Optional[str] = Field(default=None, pattern="^(organisation|workspace|restricted)$")
    workspace_id: Optional[str] = None
    allowed_roles: Optional[List[str]] = None
    tags: Optional[List[str]] = None


# --- Search Schemas ---
class SearchRequest(BaseModel):
    query: str = Field(..., min_length=1, max_length=500)
    search_mode: str = Field(default="hybrid", pattern="^(semantic|keyword|hybrid)$")
    file_type: Optional[str] = None
    workspace_id: Optional[str] = None
    owner_id: Optional[str] = None
    document_ids: Optional[List[str]] = None
    date_from: Optional[str] = None
    date_to: Optional[str] = None
    page: int = Field(default=1, ge=1)
    page_size: int = Field(default=10, ge=1, le=50)


# --- Assistant / Chat Schemas ---
class ConversationCreateRequest(BaseModel):
    title: Optional[str] = Field(default=None, max_length=200)
    workspace_id: Optional[str] = None
    scoped_document_ids: Optional[List[str]] = None
    initial_question: Optional[str] = Field(default=None, max_length=3000)


class ConversationUpdateRequest(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=200)
    scoped_document_ids: Optional[List[str]] = None
    is_archived: Optional[bool] = None


class MessageCreateRequest(BaseModel):
    question: str = Field(..., min_length=2, max_length=3000)
    scoped_document_ids: Optional[List[str]] = None
    search_mode: str = Field(default="hybrid", pattern="^(semantic|keyword|hybrid)$")


class FeedbackCreateRequest(BaseModel):
    rating: str = Field(..., pattern="^(positive|negative)$")
    comment: Optional[str] = Field(default=None, max_length=1500)
    issue_category: Optional[str] = Field(default=None, max_length=64)


# --- Users, Roles & Workspaces Schemas ---
class UserUpdateAdminRequest(BaseModel):
    full_name: Optional[str] = Field(default=None, min_length=2, max_length=140)
    job_title: Optional[str] = Field(default=None, max_length=120)
    department: Optional[str] = Field(default=None, max_length=120)
    is_active: Optional[bool] = None


class UserRoleUpdateRequest(BaseModel):
    role: str = Field(..., pattern="^(admin|manager|employee)$")


class WorkspaceCreateRequest(BaseModel):
    name: str = Field(..., min_length=2, max_length=120)
    slug: str = Field(..., min_length=2, max_length=100, pattern="^[a-z0-9-]+$")
    description: Optional[str] = Field(default=None, max_length=500)


class WorkspaceMemberAddRequest(BaseModel):
    user_id: str = Field(..., min_length=1)
    workspace_role: str = Field(default="member", pattern="^(manager|member)$")


class SystemConfigUpdateRequest(BaseModel):
    max_upload_size_mb: Optional[int] = Field(default=None, ge=1, le=100)
    chunk_size_chars: Optional[int] = Field(default=None, ge=300, le=4000)
    chunk_overlap_chars: Optional[int] = Field(default=None, ge=0, le=1000)
    rag_top_k: Optional[int] = Field(default=None, ge=1, le=20)
    rag_min_similarity_score: Optional[float] = Field(default=None, ge=0.05, le=0.9)
    ocr_enabled: Optional[bool] = None
    conversation_retention_days: Optional[int] = Field(default=None, ge=7, le=3650)
    allow_extractive_grounded_fallback: Optional[bool] = None
    auth_rate_limit_per_minute: Optional[int] = Field(default=None, ge=5, le=500)
    api_rate_limit_per_minute: Optional[int] = Field(default=None, ge=20, le=2000)

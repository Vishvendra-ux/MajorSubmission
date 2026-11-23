# SUMIND-IQ Security Architecture

SUMIND-IQ applies defense-in-depth across authentication, multi-tenant isolation, pre-retrieval RBAC, file ingestion, rate limiting, and audit logging.

---

## 1. Authentication & Credential Security (`JWT + bcrypt`)
- **Password Hashing**: Passwords are hashed using **bcrypt** (`bcryptjs`, cost factor 10) with strict password strength validation (minimum 8 characters, uppercase, lowercase, and numeric/special character).
- **JWT Access & Refresh Rotation**:
  - Short-lived signed JWT access tokens (`type: "access"`) carry `sub` (user ID), `org` (organisation ID), `role`, and `jti`.
  - Refresh tokens (`type: "refresh"`) are stored only as SHA-256 hashes in the `refresh_sessions` MongoDB collection and rotated/revoked on every refresh, logout, or password reset.
- **Anti-Enumeration**: Registration conflict and forgot-password endpoints return generic responses so attackers cannot probe valid emails.

---

## 2. Multi-Tenant Isolation & Pre-Retrieval RBAC
- Every database record (`documents`, `document_chunks`, `conversations`, `messages`, `workspaces`, `audit_logs`, `processing_jobs`) is scoped to an `organisation_id`.
- **6-Rule Document Access Evaluator** (`backend/src/security/auth.ts` -> `canAccessDocument`):
  1. **Cross-Tenant Block**: Rejects any document outside the user's `organisation_id` (`HTTP 403` + `security.cross_org_document_denied` audit log).
  2. **Explicit `DENY` Policies**: User, role, or workspace `deny` policies override all allow rules.
  3. **Admin & Uploader**: Organisation Admins and document uploaders retain full access within their tenant.
  4. **Explicit `ALLOW` Policies**: Granular `view`, `download`, or `manage` grants for users, roles, or workspaces.
  5. **Restricted Classification**: `visibility === "restricted"` denies access unless covered by Admin, Uploader, or an explicit Allow policy.
  6. **Role & Workspace Scope**: Validates `allowed_roles` and `workspace` membership before retrieval.
- **Historical Citation Re-Verification**: Whenever a user re-opens a past conversation, `GET /api/v1/chat/conversations/:id` re-checks `canAccessDocument` for every cited document and redacts excerpts if access was revoked.

---

## 3. Zero-Hallucination Citation Validation
- Every `[Source N]` reference produced by the LLM API is verified by `validateAndExtractCitations()` (`backend/src/ai/llm.ts`) against the exact chunks returned from pre-filtered vector search.
- Fabricated citation indices are stripped, and questions lacking authorised evidence receive an explicit refusal (`evidence_sufficient: false`).

---

## 4. Upload Validation, Private S3 Storage & Rate Limiting
- **Magic-Byte Inspection**: Validates `%PDF-` headers for PDFs, `PK` ZIP headers for `DOCX`/`PPTX`/`XLSX`, and rejects binary null bytes in `.txt` uploads (`backend/src/ingestion/pipeline.ts`).
- **Private Storage & Presigned URLs**: Original files are stored privately in **AWS S3** (or outside public web roots locally) with randomized internal filenames and served exclusively through short-lived S3 presigned URLs or JWT-signed download tokens (`expiresIn: 300s`).
- **Express Rate Limiting**: In-memory sliding-window rate limiters protect `/api/v1/auth/*` (`AUTH_RATE_LIMIT_PER_MINUTE`) and general `/api/v1/*` routes (`API_RATE_LIMIT_PER_MINUTE`), returning `HTTP 429` with `Retry-After` headers on abuse.
- **HTTP Security Headers**: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, and strict CORS allowlists.

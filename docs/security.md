# SUMIND-IQ — Cybersecurity & Access Control Engineering

## 1. Threat Model & Defence-in-Depth

SUMIND-IQ implements server-side security controls across 6 layers:

1. **Authentication & Credential Security (`backend/app/security/passwords.py`, `jwt.py`)**:
   - Passwords are hashed using **Argon2id** (with constant-time verification and complexity enforcement).
   - Short-lived JWT Access Tokens (`HS256`, 30-minute default expiry) are paired with revocable, database-tracked Refresh Sessions (`RefreshSession`) rotated on every `/auth/refresh` call.
   - Generic authentication errors (`"Invalid email or password credentials."` and generic forgot-password responses) prevent account enumeration.
   - Sliding-window rate limiting (`enforce_auth_rate_limit`, `enforce_api_rate_limit`) protects authentication and AI endpoints.

2. **Three-Tier RBAC & Multi-Tenant Isolation (`backend/app/security/rbac.py`, `permissions.py`)**:
   - Every database table and query is scoped by `organisation_id`.
   - Attempting to access another organisation's document, preview, download, summary, or conversation by manipulating UUID parameters returns `HTTP 403 Forbidden` and writes a `denied` entry to `AuditLog`.
   - Roles (`admin`, `manager`, `employee`), workspace memberships (`WorkspaceMembership`), document `visibility` (`organisation`, `workspace`, `restricted`), and explicit `DocumentAccessPolicy` (`allow` / `deny`, where `deny` always takes precedence) are evaluated before any data or vector search is returned.

3. **File Upload Validation & Non-Public Storage (`backend/app/ingestion/validator.py`, `utils/storage.py`)**:
   - Files are validated by extension, MIME type, AND actual magic-byte / ZIP container structure (`%PDF-`, OOXML `word/document.xml`, `ppt/presentation.xml`, `xl/workbook.xml`, UTF-8 decoding).
   - Executable or spoofed files are rejected with `HTTP 400`.
   - Uploaded files are stored outside static web roots using randomized UUID filenames with strict `Path.resolve().relative_to(UPLOAD_ROOT)` path-traversal protection.

4. **Prompt-Injection Defence & Grounding Verification (`backend/app/security/sanitization.py`, `ai/citation_validator.py`)**:
   - Extracted document text is treated as untrusted data. Known prompt-injection patterns (`ignore previous instructions`, `reveal system prompt`, etc.) are detected and sanitized during ingestion (`cleaner.py`) and RAG prompt assembly.
   - Retrieved passages are isolated inside `<untrusted_document_evidence>` XML tags.
   - `CitationValidator` verifies that every `[Source N]` citation in an answer maps to an actual retrieved chunk from an authorised document.
   - Historical conversation views re-verify document access permissions dynamically so revoked documents cannot leak through old chat transcripts.

5. **HTTP Security Headers (`backend/app/core/middleware.py`)**:
   - Every response includes `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy`, and `Content-Security-Policy`.
   - Every request/response carries an `X-Request-ID` correlation header.


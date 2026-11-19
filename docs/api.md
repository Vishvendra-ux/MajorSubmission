# SUMIND-IQ — REST API Reference (`/api/v1`)

Interactive OpenAPI / Swagger documentation is served automatically at:
- **Swagger UI**: `http://localhost:8000/api/docs`
- **ReDoc**: `http://localhost:8000/api/redoc`
- **OpenAPI JSON**: `http://localhost:8000/api/openapi.json`

## 1. Authentication & Profile (`/api/v1/auth`)

| Method | Endpoint | Access | Description |
|---|---|---|---|
| `POST` | `/api/v1/auth/register` | Public (Rate-limited) | Register user & create/join organisation |
| `POST` | `/api/v1/auth/login` | Public (Rate-limited) | Authenticate with email/password & receive JWT + Refresh token |
| `POST` | `/api/v1/auth/refresh` | Public (Rate-limited) | Rotate refresh token and issue new access token |
| `POST` | `/api/v1/auth/logout` | Authenticated | Revoke active refresh session(s) and record audit event |
| `POST` | `/api/v1/auth/forgot-password` | Public (Rate-limited) | Request password reset token (safe dev console mode supported) |
| `POST` | `/api/v1/auth/reset-password` | Public (Rate-limited) | Reset password using valid token and revoke prior sessions |
| `GET` | `/api/v1/auth/me` | Authenticated | Retrieve current user profile, role, permissions, and workspaces |
| `PATCH` | `/api/v1/auth/me` | Authenticated | Update profile details or rotate Argon2id password hash |

## 2. Document Ingestion, Library & Summaries (`/api/v1/documents`)

| Method | Endpoint | Access | Description |
|---|---|---|---|
| `POST` | `/api/v1/documents/upload` | Authenticated | Validate magic bytes, store safely, and run 17-stage ingestion pipeline |
| `GET` | `/api/v1/documents` | Authenticated | Permission-filtered document library with search, status, type & date filters |
| `GET` | `/api/v1/documents/{id}` | Authorised | Retrieve document metadata, processing status, and ACL policies |
| `PATCH` | `/api/v1/documents/{id}` | Owner / Manager / Admin | Update title, tags, visibility scope, or allowed roles |
| `DELETE` | `/api/v1/documents/{id}` | Owner / Admin | Delete file, vector chunks, summaries, and MongoDB metadata |
| `GET` | `/api/v1/documents/{id}/status` | Authorised | Poll real-time ingestion progress, stage, and chunk counts |
| `GET` | `/api/v1/documents/{id}/preview` | Authorised | Retrieve indexed chunks with optional `chunk_id` highlight |
| `GET` | `/api/v1/documents/{id}/download` | Authorised (`download`) | Stream original file with `X-Content-Type-Options: nosniff` |
| `POST` | `/api/v1/documents/{id}/reprocess` | Owner / Manager / Admin | Safely clean old chunks and re-run extraction + embedding |
| `GET` | `/api/v1/documents/{id}/summary` | Authorised | Retrieve or generate structured executive & section summary |
| `POST` | `/api/v1/documents/{id}/summary` | Authorised | Regenerate hierarchical summary from indexed chunks |
| `POST` | `/api/v1/documents/{id}/policies` | Owner / Manager / Admin | Attach explicit `allow` or `deny` ACL policy |
| `DELETE` | `/api/v1/documents/{id}/policies/{policy_id}` | Owner / Manager / Admin | Remove explicit ACL policy |

## 3. Semantic & Hybrid Search (`/api/v1/search`)

| Method | Endpoint | Access | Description |
|---|---|---|---|
| `POST` | `/api/v1/search/query` | Authenticated | Execute `hybrid`, `semantic`, or `keyword` search across authorised chunks |

## 4. Grounded AI Knowledge Assistant & Feedback (`/api/v1/chat`)

| Method | Endpoint | Access | Description |
|---|---|---|---|
| `POST` | `/api/v1/chat/conversations` | Authenticated | Start a new RAG conversation (with optional `initial_question` and document scope) |
| `GET` | `/api/v1/chat/conversations` | Authenticated | List user's conversations |
| `GET` | `/api/v1/chat/conversations/{id}` | Owner / Admin | Retrieve conversation messages with live citation permission re-verification |
| `PATCH` | `/api/v1/chat/conversations/{id}` | Owner | Rename conversation or update scoped documents |
| `DELETE` | `/api/v1/chat/conversations/{id}` | Owner | Delete conversation and its messages |
| `POST` | `/api/v1/chat/conversations/{id}/messages` | Owner | Ask a question and receive a grounded answer + verified citations |
| `POST` | `/api/v1/chat/messages/{message_id}/feedback` | Owner | Submit `positive` or `negative` rating, category, and comment |
| `GET` | `/api/v1/chat/feedback` | Authenticated | List feedback submissions |

## 5. Users, Roles, Workspaces & Admin Governance (`/api/v1`)

| Method | Endpoint | Access | Description |
|---|---|---|---|
| `GET` | `/api/v1/users` | Admin / Manager | List organisation members |
| `PATCH` | `/api/v1/users/{id}` | Admin | Update user details or active status |
| `PATCH` | `/api/v1/users/{id}/role` | Admin | Assign `admin`, `manager`, or `employee` role |
| `GET` | `/api/v1/roles` | Authenticated | List system roles and permissions catalog |
| `GET` | `/api/v1/workspaces` | Authenticated | List organisation workspaces and memberships |
| `POST` | `/api/v1/workspaces` | Admin | Create new departmental workspace |
| `POST` | `/api/v1/workspaces/{id}/members` | Admin / Workspace Manager | Add or update workspace member |
| `DELETE` | `/api/v1/workspaces/{id}/members/{user_id}` | Admin / Workspace Manager | Remove member from workspace |
| `GET` | `/api/v1/dashboard/overview` | Authenticated | User-scoped dashboard metrics & charts |
| `GET` | `/api/v1/manager/overview` | Admin / Manager | Team workspace overview & metrics |
| `GET` | `/api/v1/admin/dashboard` | Admin | Organisation-wide governance overview |
| `GET` | `/api/v1/admin/analytics` | Admin / Manager | Real database-backed RAG & document usage analytics |
| `GET` | `/api/v1/admin/audit-logs` | Admin | Filterable security & governance audit logs |
| `GET` | `/api/v1/admin/jobs` | Admin | List background ingestion jobs |
| `POST` | `/api/v1/admin/jobs/{id}/retry` | Admin | Safely retry ingestion job without duplicating chunks |
| `GET` | `/api/v1/admin/system-config` | Admin | Inspect runtime settings and infrastructure status |
| `PATCH` | `/api/v1/admin/system-config` | Admin | Update safe runtime settings |
| `GET` | `/api/v1/health` | Public | Health check reporting database, worker, and AI provider status |


# SUMIND-IQ REST API Reference (`/api/v1`)

Interactive OpenAPI / Swagger UI documentation is served by the Node.js + Express.js backend at:
- **Swagger UI**: `http://127.0.0.1:8000/api/docs`
- **OpenAPI JSON**: `http://127.0.0.1:8000/api/openapi.json`

All protected endpoints require an `Authorization: Bearer <access_token>` header issued by `/api/v1/auth/login` or `/api/v1/auth/register`.

---

## 1. Authentication & Profile (`/api/v1/auth`)

| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/v1/auth/register` | Public (Rate-limited) | Register user (`bcrypt` hash), join or create isolated organisation, issue JWT + refresh token |
| `POST` | `/api/v1/auth/login` | Public (Rate-limited) | Authenticate with email/password (`bcrypt`), issue JWT access token & revocable refresh session |
| `POST` | `/api/v1/auth/refresh` | Public (Rate-limited) | Rotate refresh session and issue a fresh JWT access token |
| `POST` | `/api/v1/auth/logout` | Authenticated | Revoke current or all organisation refresh sessions |
| `POST` | `/api/v1/auth/forgot-password` | Public (Rate-limited) | Generate time-limited password reset token (non-enumerating) |
| `POST` | `/api/v1/auth/reset-password` | Public (Rate-limited) | Validate reset token, rotate `bcrypt` password hash, revoke existing sessions |
| `GET` | `/api/v1/auth/me` | Authenticated | Return user profile, organisation context, RBAC role, permissions, and workspaces |
| `PATCH` | `/api/v1/auth/me` | Authenticated | Update profile metadata or rotate `bcrypt` password hash |

---

## 2. Documents, Summaries & Access Policies (`/api/v1/documents`)

| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/v1/documents` | Authenticated | Multipart upload (`PDF`, `DOCX`, `PPTX`, `XLSX`, `TXT`), store in AWS S3 / local storage, dispatch BullMQ ingestion |
| `GET` | `/api/v1/documents` | Authenticated | List permission-filtered documents with search, file type, status, workspace, date, sort, and pagination |
| `GET` | `/api/v1/documents/:id` | Permitted (`view`) | Retrieve document metadata, ACL policies, MongoDB extraction telemetry, and latest job |
| `PATCH` | `/api/v1/documents/:id` | Permitted (`manage`) | Update title, description, visibility, workspace, allowed roles, or tags |
| `DELETE` | `/api/v1/documents/:id` | Permitted (`manage`) | Delete file from S3/disk and cascade delete chunks, summaries, policies, structures, and jobs |
| `GET` | `/api/v1/documents/:id/status` | Permitted (`view`) | Poll live ingestion progress, stage, chunk count, and OCR telemetry |
| `POST` | `/api/v1/documents/:id/reprocess` | Permitted (`manage`) | Idempotently re-extract, re-chunk, and re-embed document without duplicate chunks |
| `GET` | `/api/v1/documents/:id/signed-download-url` | Permitted (`download`) | Issue short-lived AWS S3 presigned URL (when configured) or signed JWT download URL |
| `GET` | `/api/v1/documents/:id/download` | Signed Token / Bearer | Stream private document file and record immutable download audit event |
| `GET` | `/api/v1/documents/:id/preview` | Permitted (`view`) | Return extracted sections and indexed chunks with citation highlighting |
| `GET` | `/api/v1/documents/:id/summary` | Permitted (`view`) | Retrieve (or lazily synthesize) structured executive/detailed summary with citations |
| `POST` | `/api/v1/documents/:id/summary` | Permitted (`view`) | Force regenerate grounded hierarchical summary |
| `GET` | `/api/v1/documents/:id/policies` | Permitted (`view`) | List explicit allow/deny document access policies |
| `POST` | `/api/v1/documents/:id/policies` | Permitted (`manage`) | Add user, workspace, or role allow/deny override policy |
| `DELETE` | `/api/v1/documents/:id/policies/:policyId` | Permitted (`manage`) | Remove an access policy override |

---

## 3. Semantic & Hybrid Search (`/api/v1/search`)

| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/v1/search` (alias: `/api/v1/search/query`) | Authenticated | Pre-retrieval ACL-filtered MongoDB Atlas Vector Search + lexical hybrid search with highlighted snippets |
| `GET` | `/api/v1/search/suggestions` | Authenticated | Context-aware query suggestions and matching authorised document titles |

---

## 4. Grounded AI Assistant & Feedback (`/api/v1/chat`)

| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/v1/chat/conversations` | Authenticated | Create a multi-turn conversation (optionally scoped to authorised documents and with an initial question) |
| `GET` | `/api/v1/chat/conversations` | Authenticated | List user's conversations with search and pagination |
| `GET` | `/api/v1/chat/conversations/:id` | Owner / Admin | Load full transcript with live permission re-checks on historical citations |
| `PATCH` | `/api/v1/chat/conversations/:id` | Owner / Admin | Rename, archive, or update scoped document IDs |
| `DELETE` | `/api/v1/chat/conversations/:id` | Owner / Admin | Delete conversation, messages, and feedback |
| `POST` | `/api/v1/chat/conversations/:id/messages` | Owner / Admin | Ask a follow-up question; enforces pre-retrieval ACLs and returns verified `[Source N]` citations |
| `POST` | `/api/v1/chat/messages/:id/feedback` | Owner / Admin | Submit positive/negative rating with duplicate conflict detection (`409`) |
| `GET` | `/api/v1/chat/feedback` | Authenticated | List user or organisation feedback history |

---

## 5. Users, Roles, Workspaces, Analytics & Admin (`/api/v1`)

| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/health` | Public | Live telemetry for MongoDB, AWS S3 storage, BullMQ + Redis, and AI/Embedding providers |
| `GET` | `/api/v1/dashboard/overview` | Authenticated | User-scoped dashboard KPIs, charts, recent documents, and conversations |
| `GET` | `/api/v1/manager/overview` | Admin / Manager | Workspace-scoped team documents, member directory, and question metrics |
| `GET` | `/api/v1/users` | Admin / Manager | Paginated organisation user directory with role and workspace filters |
| `PATCH` | `/api/v1/users/:id` | Admin | Activate/deactivate or edit user profile |
| `PATCH` | `/api/v1/users/:id/role` | Admin | Modify organisation RBAC role (`admin`, `manager`, `employee`) |
| `GET` | `/api/v1/roles` | Authenticated | List system RBAC roles, member counts, and full permission catalog |
| `GET` / `POST` | `/api/v1/workspaces` | Auth / Admin | List organisation workspaces or create a new workspace |
| `POST` / `DELETE` | `/api/v1/workspaces/:id/members` | Admin / Manager | Add or remove workspace members |
| `GET` / `PATCH` / `POST` | `/api/v1/notifications*` | Authenticated | Fetch unread notifications and mark read |
| `GET` | `/api/v1/admin/dashboard` | Admin | Organisation governance KPIs, audit feed, and infrastructure status |
| `GET` | `/api/v1/admin/analytics` | Admin / Manager | Grounding ratios, latency, corpus breakdown, and daily activity timeline |
| `GET` | `/api/v1/admin/audit-logs` | Admin | Filterable immutable security and compliance audit trail |
| `GET` / `POST` | `/api/v1/admin/jobs*` | Admin | Inspect BullMQ/ingestion jobs and trigger safe idempotent retries |
| `GET` / `PATCH` | `/api/v1/admin/system-config` | Admin | Inspect environment profile and tune non-secret runtime chunking/RAG settings |

# SUMIND-IQ — Full-Stack AI Organisational Knowledge Management Platform

**SUMIND-IQ** is a production-minded, secure, role-aware organisational knowledge management and grounded Retrieval-Augmented Generation (RAG) platform. It transforms scattered internal company documents (`PDF`, `DOCX`, `PPTX`, `XLSX`, `TXT`) into a permission-enforced searchable knowledge base with verifiable page, slide, sheet, and section citations.

---

## Key Engineering Highlights

1. **Strict Grounding & Anti-Hallucination Engine**:
   - Every AI-generated answer is grounded strictly in retrieved document chunks that the requesting user is authorised to access.
   - If the authorised knowledge base does not contain sufficient evidence to answer a question, SUMIND-IQ explicitly states that it could not find enough evidence rather than inventing an answer.
   - `CitationValidator` verifies every `[Source N]` reference against authoritative database chunk records and strips any unverified citation.
   - Re-opening historical conversations dynamically re-verifies current document permissions so revoked documents cannot leak through past chat history.

2. **17-Stage Multi-Format Document Ingestion Pipeline**:
   - Supports **PDF** (`PyMuPDF` + `Tesseract OCR` fallback), **DOCX** (`python-docx`), **PPTX** (`python-pptx`), **XLSX** (`openpyxl`), and **TXT**.
   - Validates extension, MIME type, and actual magic-byte / ZIP container structure before storing files outside public static directories with SHA-256 checksums.
   - Preserves source location labels (`Page N`, `Slide N`, `Sheet '...'`, `Section N`) across overlapping sliding-window chunks.
   - Supports idempotent job retries without creating duplicate chunks.

3. **Three-Tier RBAC & Multi-Tenant Isolation**:
   - Enforces **Admin**, **Manager**, and **Employee** roles alongside Organisation boundaries, Departmental Workspaces, Document Visibility (`organisation`, `workspace`, `restricted`), and explicit `allow`/`deny` Access Control Policies on every backend endpoint.
   - Argon2id password hashing, JWT access tokens, rotated refresh sessions, auth rate limiting, security headers, and immutable security audit logs.

4. **Complete Enterprise SaaS Frontend (33 Views Across 4 Scopes)**:
   - **Public (8)**: Landing, Features, Security & Privacy, Login, Register, Forgot Password, Reset Password, Legal Placeholders (`Privacy`, `Terms`), Not Found (`404`).
   - **Authenticated Workspace (12)**: Overview Dashboard, AI Knowledge Assistant, Semantic & Hybrid Search, Document Library, Upload Documents, Document Detail & Chunk Preview, AI Document Summary, Conversation History, Feedback History, Notifications, User Profile & Security Settings, Access Denied (`403`).
   - **Manager Scope (4)**: Team Overview, Accessible Team Documents, Team Usage Analytics, Team Membership & Access Management.
   - **Admin Governance (9)**: Admin Overview, User Management, Role & Permission Matrix, Organisation & Workspace Management, Document Governance, Security Audit Logs, Usage Analytics, Job & Failure Monitoring, System Configuration.

---

## Repository Structure

```text
sumind-iq/
├── frontend/                  # React 18 + Vite + TypeScript + Tailwind CSS + TanStack Query + Recharts
│   ├── src/
│   │   ├── components/        # Reusable UI Primitives, BrandLogo, CitationCard, SourcePreviewModal, SafeMarkdown
│   │   ├── hooks/             # useAuth, useTheme, useToast
│   │   ├── layouts/           # PublicLayout, ProtectedRoute, AppLayout (collapsible sidebar + Cmd+K search)
│   │   ├── pages/             # public/, app/, manager/, admin/
│   │   ├── services/          # apiClient with automatic JWT refresh token rotation
│   │   ├── styles/            # Tailwind CSS + enterprise design tokens
│   │   ├── types/             # Strict TypeScript API contracts
│   │   └── utils/             # Formatting & class helpers
│   ├── tests/                 # Vitest + React Testing Library suite
│   └── e2e/                   # Playwright end-to-end test suite
├── backend/                   # Python FastAPI + SQLAlchemy 2.x + Alembic + Pydantic v2
│   ├── app/
│   │   ├── api/v1/            # auth, documents, search, chat, users, admin
│   │   ├── ai/                # Provider-agnostic LLM, Embeddings & CitationValidator
│   │   ├── core/              # Config, Logging, Exceptions, Rate Limiting, Security Headers
│   │   ├── db/                # SQLAlchemy session, health telemetry & [DEMO] seed data
│   │   ├── ingestion/         # Magic-byte validator, PDF/DOCX/PPTX/XLSX/TXT extractors, OCR, cleaner, chunker
│   │   ├── models/            # 20 SQLAlchemy 2.x relational & vector entities
│   │   ├── repositories/      # Hybrid vector/keyword search & modular MongoDB repository
│   │   ├── schemas/           # Pydantic v2 request/response schemas
│   │   ├── security/          # Argon2id, JWT, RBAC dependencies, ACL engine, prompt sanitization
│   │   ├── utils/             # SHA-256, non-public storage & signed downloads, pagination
│   │   └── workers/           # Celery worker tasks with in-process local dev fallback
│   ├── migrations/            # Alembic schema migrations
│   └── tests/                 # Pytest integration & security test suite
├── infrastructure/
│   ├── docker-compose.yml     # PostgreSQL (pgvector), MongoDB, Redis, Backend, Worker, Frontend
│   ├── docker-compose.prod.yml
│   └── deployment/nginx.conf
├── docs/                      # Architecture, API, Database ER Diagram, Security, Setup & Testing docs
├── .github/workflows/ci.yml   # GitHub Actions CI pipeline
└── .env.example               # Documented environment variables
```

---

## Quick Start

### 1. Backend
```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
alembic upgrade head
python -m app.db.seed
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

### 2. Frontend
```bash
cd frontend
npm install
npm run dev
```

### 3. Seeded Demo Accounts (`[DEMO DATA]`)
- **Admin**: `admin@sumind-iq.demo` / `Admin@12345`
- **Manager**: `manager@sumind-iq.demo` / `Manager@12345`
- **Employee**: `employee@sumind-iq.demo` / `Employee@12345`
- **Isolated Second Tenant**: `isolated@zenith.demo` / `Zenith@12345`

See [`docs/architecture.md`](docs/architecture.md), [`docs/api.md`](docs/api.md), [`docs/database.md`](docs/database.md), [`docs/security.md`](docs/security.md), [`docs/setup.md`](docs/setup.md), and [`docs/testing.md`](docs/testing.md) for full technical documentation.


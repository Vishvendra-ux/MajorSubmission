# SUMIND-IQ Automated Testing & Verification Guide

All backend and frontend tests are written in **TypeScript** and executed with **Vitest** (plus **Playwright** for browser E2E flows).

---

## 1. Backend Integration & Security Tests (`Vitest`)

Located in `backend/tests/backend.test.ts`, the backend test suite executes against the real Express.js application in-process (zero network/port flakiness) and verifies:
- `/api/v1/health` reporting MongoDB, BullMQ + Redis, AWS S3, and JavaScript Embedding SDK status
- User registration, duplicate conflict rejection (`409`), `bcrypt` + JWT login, refresh token rotation, and password reset flow
- Multi-tenant and RBAC document access isolation across Admin, Manager, Employee, and Isolated Tenant (`Zenith BioLabs`)
- Explicit document `allow` / `deny` access policy overrides
- Multi-format document ingestion (`PDF` via PDF.js, `DOCX` via Mammoth.js, `XLSX` via SheetJS, `PPTX` via JSZip, and `TXT`) and magic-byte spoofing rejection (`400`)
- Pre-retrieval permission-filtered hybrid vector search (`/api/v1/search` and `/api/v1/search/query`)
- Grounded RAG Q&A with verified `[Source N]` citations, insufficient-evidence refusal, and duplicate feedback rejection (`409`)
- Hierarchical document summaries, rate limiting headers, and Admin governance access guards (`403` for non-admins)

```bash
# Type-check & run backend suite
npm run lint --prefix backend
npm test --prefix backend
```

---

## 2. Frontend Unit & Component Tests (`Vitest + React Testing Library`)

Located in `frontend/tests/app.test.tsx`, verifying LandingPage, LoginPage demo quick-fill & validation, RegisterPage password strength checks, UploadDocumentsPage, SearchResultsPage, CitationCard (accessible & revoked states), UI primitives, and AccessDeniedPage.

```bash
npm test --prefix frontend
npm run build --prefix frontend
```

---

## 3. Run Everything in One Command

From the project root:
```bash
npm test
npm run build
```

---

## 4. End-to-End Browser Verification (`Playwright`)

With both backend (`:8000`) and frontend (`:5173`) servers running:
```bash
npx --prefix frontend playwright test
```

# SUMIND-IQ — Testing & Quality Assurance

## 1. Backend Automated Tests (`pytest`)

Located in `backend/tests/test_sumind_iq_backend.py`, the backend test suite verifies:
1. **Registration, Login, Token Refresh, Logout & Password Reset** (`test_01_auth_register_login_refresh_logout_and_password_reset`).
2. **RBAC Role Enforcement** across Employee, Manager, and Admin endpoints (`test_02_role_based_access_control_enforcement`).
3. **Cross-Organisation Tenant Isolation** preventing cross-tenant document access (`test_03_cross_organisation_isolation_and_restricted_document_access`).
4. **Multi-Format Upload & Magic-Byte Validation** (`PDF`, `DOCX`, `PPTX`, `XLSX`, `TXT`, and spoofed file rejection) (`test_04_multi_format_upload_validation_and_ingestion`).
5. **Chunking, Metadata & Safe Job Retry** without duplicating chunks (`test_05_chunking_reprocess_and_job_retry_idempotency`).
6. **Permission-Filtered Semantic & Hybrid Search** (`test_06_permission_filtered_semantic_and_hybrid_search`).
7. **Grounded RAG Question Answering with Verified Citations** and dynamic citation masking on permission revocation (`test_07_grounded_rag_with_verified_citations_and_permission_recheck`).
8. **Refusal / Insufficient Evidence Behaviour** when documents do not support an answer (`test_08_insufficient_evidence_refusal_and_prompt_injection_resistance`).
9. **Hierarchical Document Summary Generation** (`test_09_document_summary_generation_and_regeneration`).
10. **Answer Feedback Deduplication & Audit Logging** (`test_10_feedback_submission_deduplication_and_audit_logs`).

### Run Backend Tests & Static Checks
```bash
cd backend
./.venv/bin/pytest tests -v
./.venv/bin/ruff check app tests
./.venv/bin/mypy --config-file pyproject.toml app
```

---

## 2. Frontend Unit & Component Tests (`Vitest` + `React Testing Library`)

Located in `frontend/tests/app.test.tsx`, the frontend test suite verifies:
- Landing page problem/solution presentation and navigation links.
- Login form validation and `[DEMO DATA]` role credential switchers.
- Registration form validation and password complexity checks.
- Document upload page controls, format dropzone, and role permissions.
- Semantic search page retrieval mode selectors and sample queries.
- `CitationCard` rendering for accessible sources vs. revoked/restricted sources.
- `EmptyState`, `ErrorState`, `StatusBadge`, and `AccessDeniedPage` components.

### Run Frontend Tests & Build
```bash
cd frontend
npm test
npm run build
```

---

## 3. End-to-End Playwright Flow (`frontend/e2e/sumind-iq.spec.ts`)

Covers the full 8-step user journey:
1. Login as Employee.
2. Verify RBAC protection on `/app/admin/users` (`AccessDeniedPage`).
3. Upload a sample document and verify `READY` indexing state.
4. Search for a term from the uploaded document.
5. Ask a grounded question in the AI Assistant and verify cited answer.
6. Ask an unsupported question and verify explicit "Insufficient Evidence" refusal.
7. View AI-generated executive document summary.


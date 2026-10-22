from __future__ import annotations

import io
from typing import Dict

import docx
import fitz
import openpyxl
from fastapi.testclient import TestClient
from pptx import Presentation

from app.security.jwt import create_access_token, decode_token
from app.security.passwords import hash_password, validate_password_strength, verify_password


def _auth_headers(client: TestClient, email: str, password: str) -> Dict[str, str]:
    resp = client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": password},
    )
    assert resp.status_code == 200, resp.text
    token = resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def test_password_hashing_and_policy() -> None:
    ok_weak, _ = validate_password_strength("short")
    assert not ok_weak
    ok_no_upper, _ = validate_password_strength("alllowercase123!")
    assert not ok_no_upper
    ok_strong, msg = validate_password_strength("SecurePass#2026")
    assert ok_strong and msg == ""

    hashed = hash_password("SecurePass#2026")
    assert hashed.startswith("$argon2id$")
    assert verify_password("SecurePass#2026", hashed)
    assert not verify_password("WrongPass#2026", hashed)


def test_jwt_token_validation() -> None:
    token, expires_in = create_access_token(
        user_id="user-123",
        organisation_id="org-456",
        role="admin",
        email="admin@example.com",
    )
    assert expires_in > 0
    decoded = decode_token(token, expected_type="access")
    assert decoded["sub"] == "user-123"
    assert decoded["org"] == "org-456"
    assert decoded["role"] == "admin"


def test_registration_login_refresh_and_logout(client: TestClient) -> None:
    # 1. Register a brand new user in a new organisation
    reg_resp = client.post(
        "/api/v1/auth/register",
        json={
            "email": "founder@nova-analytics.io",
            "full_name": "Neha Kapoor",
            "password": "NovaPassword@2026",
            "organisation_name": "Nova Analytics Corp",
            "job_title": "Chief Data Officer",
            "department": "Data Engineering",
        },
    )
    assert reg_resp.status_code == 201, reg_resp.text
    reg_data = reg_resp.json()
    assert reg_data["user"]["email"] == "founder@nova-analytics.io"
    # First creator of a new organisation becomes its admin
    assert reg_data["user"]["role"] == "admin"
    access_token = reg_data["access_token"]
    refresh_token = reg_data["refresh_token"]

    # 2. Duplicate registration returns 409 with generic message
    dup_resp = client.post(
        "/api/v1/auth/register",
        json={
            "email": "founder@nova-analytics.io",
            "full_name": "Neha Kapoor",
            "password": "NovaPassword@2026",
        },
    )
    assert dup_resp.status_code == 409

    # 3. Get /auth/me
    me_resp = client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {access_token}"},
    )
    assert me_resp.status_code == 200
    assert me_resp.json()["organisation_name"] == "Nova Analytics Corp"

    # 4. Refresh session token
    ref_resp = client.post(
        "/api/v1/auth/refresh",
        json={"refresh_token": refresh_token},
    )
    assert ref_resp.status_code == 200
    new_access = ref_resp.json()["access_token"]
    new_refresh = ref_resp.json()["refresh_token"]

    # Old rotated refresh token must now be rejected
    reused_resp = client.post(
        "/api/v1/auth/refresh",
        json={"refresh_token": refresh_token},
    )
    assert reused_resp.status_code == 401

    # 5. Logout revokes active refresh token
    logout_resp = client.post(
        "/api/v1/auth/logout",
        json={"refresh_token": new_refresh},
        headers={"Authorization": f"Bearer {new_access}"},
    )
    assert logout_resp.status_code == 200


def test_forgot_and_reset_password_flow(client: TestClient) -> None:
    forgot_resp = client.post(
        "/api/v1/auth/forgot-password",
        json={"email": "employee@sumind-iq.demo"},
    )
    assert forgot_resp.status_code == 200
    reset_token = forgot_resp.json().get("dev_mode_reset_token")
    assert reset_token

    reset_resp = client.post(
        "/api/v1/auth/reset-password",
        json={"token": reset_token, "new_password": "Employee@12345"},
    )
    assert reset_resp.status_code == 200


def test_rbac_and_organisation_isolation(client: TestClient) -> None:
    admin_headers = _auth_headers(client, "admin@sumind-iq.demo", "Admin@12345")
    manager_headers = _auth_headers(client, "manager@sumind-iq.demo", "Manager@12345")
    employee_headers = _auth_headers(client, "employee@sumind-iq.demo", "Employee@12345")
    zenith_headers = _auth_headers(client, "isolated@zenith.demo", "Zenith@12345")

    # 1. Employee and Manager cannot access Admin-only endpoints
    for hdrs in (employee_headers, manager_headers):
        resp_audit = client.get("/api/v1/admin/audit-logs", headers=hdrs)
        assert resp_audit.status_code == 403
        resp_jobs = client.get("/api/v1/admin/jobs", headers=hdrs)
        assert resp_jobs.status_code == 403
        resp_cfg = client.get("/api/v1/admin/system-config", headers=hdrs)
        assert resp_cfg.status_code == 403

    # 2. Admin CAN access Admin endpoints
    assert client.get("/api/v1/admin/dashboard", headers=admin_headers).status_code == 200
    assert client.get("/api/v1/admin/audit-logs", headers=admin_headers).status_code == 200
    assert client.get("/api/v1/admin/jobs", headers=admin_headers).status_code == 200

    # 3. Manager CAN access Manager Overview, Employee CANNOT
    assert client.get("/api/v1/manager/overview", headers=manager_headers).status_code == 200
    assert client.get("/api/v1/manager/overview", headers=employee_headers).status_code == 403

    # 4. Restricted Admin-only document in Apex Global cannot be accessed by Employee or Manager
    admin_docs = client.get("/api/v1/documents", headers=admin_headers).json()["items"]
    restricted_doc = next(d for d in admin_docs if d["visibility"] == "restricted")

    emp_get_restricted = client.get(
        f"/api/v1/documents/{restricted_doc['id']}", headers=employee_headers
    )
    assert emp_get_restricted.status_code == 403

    mgr_get_restricted = client.get(
        f"/api/v1/documents/{restricted_doc['id']}", headers=manager_headers
    )
    assert mgr_get_restricted.status_code == 403

    # 5. Cross-organisation isolation: Zenith BioLabs user cannot access Apex Global documents, and vice versa
    zenith_docs = client.get("/api/v1/documents", headers=zenith_headers).json()["items"]
    assert len(zenith_docs) >= 1
    zenith_doc_id = zenith_docs[0]["id"]

    cross_org_resp = client.get(
        f"/api/v1/documents/{zenith_doc_id}", headers=admin_headers
    )
    assert cross_org_resp.status_code == 403

    cross_org_preview = client.get(
        f"/api/v1/documents/{zenith_doc_id}/preview", headers=admin_headers
    )
    assert cross_org_preview.status_code == 403


def test_upload_validation_and_all_supported_file_types(client: TestClient) -> None:
    admin_headers = _auth_headers(client, "admin@sumind-iq.demo", "Admin@12345")

    # 1. Reject unsupported file extension
    bad_ext = client.post(
        "/api/v1/documents",
        files={"file": ("malware.exe", b"MZ\x90\x00", "application/octet-stream")},
        headers=admin_headers,
    )
    assert bad_ext.status_code == 400

    # 2. Reject fake PDF without %PDF- signature
    fake_pdf = client.post(
        "/api/v1/documents",
        files={"file": ("fake.pdf", b"not a real pdf file", "application/pdf")},
        headers=admin_headers,
    )
    assert fake_pdf.status_code == 400

    # 3. Upload a real PDF generated with PyMuPDF (fitz)
    pdf_doc = fitz.open()
    page = pdf_doc.new_page()
    page.insert_text(
        (72, 72),
        "Project Titan Disaster Recovery Plan\n"
        "The Recovery Time Objective (RTO) for Tier-1 production services is 30 minutes, "
        "and the Recovery Point Objective (RPO) is 5 minutes using synchronous standby replicas.",
    )
    pdf_bytes = pdf_doc.tobytes()
    pdf_doc.close()

    pdf_resp = client.post(
        "/api/v1/documents",
        files={"file": ("titan_disaster_recovery.pdf", pdf_bytes, "application/pdf")},
        data={"title": "Project Titan Disaster Recovery Plan", "visibility": "organisation"},
        headers=admin_headers,
    )
    assert pdf_resp.status_code == 201, pdf_resp.text
    assert pdf_resp.json()["document"]["status"] == "ready"
    assert pdf_resp.json()["document"]["chunk_count"] >= 1

    # 4. Upload a real DOCX generated with python-docx
    docx_buf = io.BytesIO()
    d_obj = docx.Document()
    d_obj.add_heading("Vendor Procurement Security Checklist", level=1)
    d_obj.add_paragraph(
        "All Tier-1 cloud vendors must provide a valid SOC 2 Type II report and ISO 27001 certification "
        "prior to production onboarding."
    )
    d_obj.save(docx_buf)

    docx_resp = client.post(
        "/api/v1/documents",
        files={
            "file": (
                "vendor_procurement_checklist.docx",
                docx_buf.getvalue(),
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            )
        },
        data={"title": "Vendor Procurement Security Checklist", "visibility": "organisation"},
        headers=admin_headers,
    )
    assert docx_resp.status_code == 201, docx_resp.text
    assert docx_resp.json()["document"]["status"] == "ready"

    # 5. Upload a real PPTX generated with python-pptx
    pptx_buf = io.BytesIO()
    prs = Presentation()
    slide_layout = prs.slide_layouts[0]
    slide = prs.slides.add_slide(slide_layout)
    slide.shapes.title.text = "2026 Product Architecture Roadmap"
    slide.placeholders[1].text = "Zero-trust service mesh deployment scheduled for Q4 2026."
    prs.save(pptx_buf)

    pptx_resp = client.post(
        "/api/v1/documents",
        files={
            "file": (
                "architecture_roadmap_2026.pptx",
                pptx_buf.getvalue(),
                "application/vnd.openxmlformats-officedocument.presentationml.presentation",
            )
        },
        data={"title": "2026 Product Architecture Roadmap", "visibility": "organisation"},
        headers=admin_headers,
    )
    assert pptx_resp.status_code == 201, pptx_resp.text
    assert pptx_resp.json()["document"]["status"] == "ready"

    # 6. Upload a real XLSX generated with openpyxl
    xlsx_buf = io.BytesIO()
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "SLA_Metrics"
    ws.append(["Service Tier", "Target Uptime", "Max Response Time"])
    ws.append(["Core API Gateway", "99.95%", "120ms"])
    wb.save(xlsx_buf)

    xlsx_resp = client.post(
        "/api/v1/documents",
        files={
            "file": (
                "service_sla_matrix.xlsx",
                xlsx_buf.getvalue(),
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            )
        },
        data={"title": "Service SLA Matrix", "visibility": "organisation"},
        headers=admin_headers,
    )
    assert xlsx_resp.status_code == 201, xlsx_resp.text
    assert xlsx_resp.json()["document"]["status"] == "ready"


def test_semantic_search_rag_citations_and_insufficient_evidence(client: TestClient) -> None:
    employee_headers = _auth_headers(client, "employee@sumind-iq.demo", "Employee@12345")

    # 1. Semantic search returns relevant authorised chunks with location metadata
    search_resp = client.post(
        "/api/v1/search",
        json={"query": "incident response SLA and AES-256 encryption", "search_mode": "hybrid"},
        headers=employee_headers,
    )
    assert search_resp.status_code == 200
    search_items = search_resp.json()["items"]
    assert len(search_items) >= 1
    assert search_items[0]["location_label"]
    # Employee search must NEVER return restricted M&A memo or Finance-only workspace document
    returned_titles = [item["document_title"] for item in search_items]
    assert not any("M&A Target Evaluation" in t for t in returned_titles)
    assert not any("Q3 2026 Financial Performance" in t for t in returned_titles)

    # 2. Ask a grounded question in AI Knowledge Assistant
    conv_resp = client.post(
        "/api/v1/chat/conversations",
        json={
            "title": "Leave Policy Verification",
            "initial_question": "How many days of paid annual leave do full-time employees receive?",
        },
        headers=employee_headers,
    )
    assert conv_resp.status_code == 201, conv_resp.text
    conv_data = conv_resp.json()
    messages = conv_data["messages"]
    assert len(messages) == 2
    assistant_msg = messages[1]
    assert assistant_msg["evidence_sufficient"] is True
    assert "24 days" in assistant_msg["content"]
    assert len(assistant_msg["citations"]) >= 1
    first_citation = assistant_msg["citations"][0]
    assert first_citation["document_id"]
    assert first_citation["chunk_id"]
    assert first_citation["location_label"]

    # 3. Verify citation links to an authorised preview with highlighted chunk
    preview_resp = client.get(
        f"/api/v1/documents/{first_citation['document_id']}/preview?chunk_id={first_citation['chunk_id']}",
        headers=employee_headers,
    )
    assert preview_resp.status_code == 200
    chunks = preview_resp.json()["chunks"]
    assert any(c["is_highlighted"] for c in chunks)

    # 4. Ask an unanswerable question not in the knowledge base -> must report insufficient evidence
    unanswerable_resp = client.post(
        f"/api/v1/chat/conversations/{conv_data['id']}/messages",
        json={"question": "What is the orbital velocity of Jupiter's moon Ganymede in km/s?"},
        headers=employee_headers,
    )
    assert unanswerable_resp.status_code == 201
    unans_msg = unanswerable_resp.json()["assistant_message"]
    assert unans_msg["evidence_sufficient"] is False
    assert "Insufficient Evidence" in unans_msg["content"]
    assert unans_msg["citations"] == []

    # 5. Submit feedback and verify duplicate submission rejection (409)
    fb_resp = client.post(
        f"/api/v1/chat/messages/{assistant_msg['id']}/feedback",
        json={"rating": "positive", "comment": "Verified exact leave policy citation."},
        headers=employee_headers,
    )
    assert fb_resp.status_code == 201

    dup_fb_resp = client.post(
        f"/api/v1/chat/messages/{assistant_msg['id']}/feedback",
        json={"rating": "positive", "comment": "Verified exact leave policy citation."},
        headers=employee_headers,
    )
    assert dup_fb_resp.status_code == 409


def test_document_summary_generation_and_signed_download(client: TestClient) -> None:
    employee_headers = _auth_headers(client, "employee@sumind-iq.demo", "Employee@12345")
    docs = client.get("/api/v1/documents", headers=employee_headers).json()["items"]
    assert len(docs) >= 1
    doc_id = docs[0]["id"]

    # 1. Generate / retrieve document summary
    sum_resp = client.post(f"/api/v1/documents/{doc_id}/summary", headers=employee_headers)
    assert sum_resp.status_code == 200
    summary = sum_resp.json()
    assert summary["executive_summary"]
    assert summary["detailed_summary"]
    assert len(summary["main_points"]) >= 1
    assert len(summary["citations"]) >= 1

    # 2. Signed download URL and download verification
    signed_resp = client.get(
        f"/api/v1/documents/{doc_id}/signed-download-url", headers=employee_headers
    )
    assert signed_resp.status_code == 200
    dl_url = signed_resp.json()["download_url"]
    dl_resp = client.get(dl_url)
    assert dl_resp.status_code == 200
    assert len(dl_resp.content) > 20


def test_document_access_policies_reprocess_and_deletion(client: TestClient) -> None:
    admin_headers = _auth_headers(client, "admin@sumind-iq.demo", "Admin@12345")
    employee_headers = _auth_headers(client, "employee@sumind-iq.demo", "Employee@12345")

    # Upload a restricted document as Admin
    upload_resp = client.post(
        "/api/v1/documents",
        files={"file": ("restricted_spec.txt", b"# Restricted Architecture\nInternal key rotation every 30 days.", "text/plain")},
        data={"title": "Restricted Key Rotation Spec", "visibility": "restricted"},
        headers=admin_headers,
    )
    assert upload_resp.status_code == 201
    doc_id = upload_resp.json()["document"]["id"]

    # Employee is initially denied access (403)
    assert client.get(f"/api/v1/documents/{doc_id}", headers=employee_headers).status_code == 403

    # Grant explicit allow policy for role 'employee'
    pol_resp = client.post(
        f"/api/v1/documents/{doc_id}/policies",
        json={
            "principal_type": "role",
            "principal_id": "employee",
            "access_level": "view",
            "effect": "allow",
        },
        headers=admin_headers,
    )
    assert pol_resp.status_code == 201
    policy_id = pol_resp.json()["id"]

    # Employee can now view the document!
    assert client.get(f"/api/v1/documents/{doc_id}", headers=employee_headers).status_code == 200

    # Remove the allow policy -> Employee is denied again
    del_pol = client.delete(
        f"/api/v1/documents/{doc_id}/policies/{policy_id}", headers=admin_headers
    )
    assert del_pol.status_code == 200
    assert client.get(f"/api/v1/documents/{doc_id}", headers=employee_headers).status_code == 403

    # Reprocess document without duplicating chunks
    before_chunks = client.get(f"/api/v1/documents/{doc_id}/status", headers=admin_headers).json()["chunk_count"]
    reproc_resp = client.post(f"/api/v1/documents/{doc_id}/reprocess", headers=admin_headers)
    assert reproc_resp.status_code == 200
    after_chunks = client.get(f"/api/v1/documents/{doc_id}/status", headers=admin_headers).json()["chunk_count"]
    assert before_chunks == after_chunks

    # Delete document and verify 404 afterwards
    del_resp = client.delete(f"/api/v1/documents/{doc_id}", headers=admin_headers)
    assert del_resp.status_code == 200
    assert client.get(f"/api/v1/documents/{doc_id}", headers=admin_headers).status_code == 404


def test_users_roles_workspaces_and_admin_operations(client: TestClient) -> None:
    admin_headers = _auth_headers(client, "admin@sumind-iq.demo", "Admin@12345")

    # 1. List users & roles
    users_resp = client.get("/api/v1/users", headers=admin_headers)
    assert users_resp.status_code == 200
    users = users_resp.json()["items"]
    assert len(users) >= 3

    roles_resp = client.get("/api/v1/roles", headers=admin_headers)
    assert roles_resp.status_code == 200
    assert len(roles_resp.json()["roles"]) == 3

    # 2. Create workspace & add member
    ws_resp = client.post(
        "/api/v1/workspaces",
        json={
            "name": "AI Platform Engineering",
            "slug": "ai-platform-eng",
            "description": "Engineering team workspace for ML & RAG systems",
        },
        headers=admin_headers,
    )
    assert ws_resp.status_code == 201
    ws_id = ws_resp.json()["id"]

    emp_user = next(u for u in users if u["email"] == "employee@sumind-iq.demo")
    add_mem_resp = client.post(
        f"/api/v1/workspaces/{ws_id}/members",
        json={"user_id": emp_user["id"], "workspace_role": "member"},
        headers=admin_headers,
    )
    assert add_mem_resp.status_code == 201

    # 3. Admin Analytics, Jobs Retry & System Config
    analytics_resp = client.get("/api/v1/admin/analytics", headers=admin_headers)
    assert analytics_resp.status_code == 200
    assert analytics_resp.json()["summary"]["total_documents"] >= 1

    jobs_resp = client.get("/api/v1/admin/jobs", headers=admin_headers)
    assert jobs_resp.status_code == 200
    first_job_id = jobs_resp.json()["items"][0]["id"]
    retry_resp = client.post(f"/api/v1/admin/jobs/{first_job_id}/retry", headers=admin_headers)
    assert retry_resp.status_code == 200

    cfg_patch = client.patch(
        "/api/v1/admin/system-config",
        json={"rag_top_k": 8, "max_upload_size_mb": 30},
        headers=admin_headers,
    )
    assert cfg_patch.status_code == 200
    assert cfg_patch.json()["editable_settings"]["rag_top_k"] == 8

    # 4. Notifications & Health endpoint
    notif_resp = client.get("/api/v1/notifications", headers=admin_headers)
    assert notif_resp.status_code == 200
    assert client.post("/api/v1/notifications/read-all", headers=admin_headers).status_code == 200

    health_resp = client.get("/api/v1/health")
    assert health_resp.status_code == 200
    assert health_resp.json()["status"] == "healthy"


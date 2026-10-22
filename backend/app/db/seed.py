from __future__ import annotations

import sys
from typing import Any, Dict, List, Tuple

from sqlalchemy.orm import Session

from app.ai.llm import generate_grounded_document_summary
from app.core.config import get_settings
from app.core.logging import get_logger
from app.db.session import get_engine, get_session_factory
from app.ingestion.pipeline import run_document_ingestion_pipeline
from app.models.base import Base
from app.models.entities import (
    AuditLog,
    Conversation,
    Document,
    DocumentChunk,
    DocumentSummary,
    Feedback,
    Message,
    Organisation,
    OrganisationMembership,
    Permission,
    ProcessingJob,
    Role,
    RolePermission,
    User,
    Workspace,
    WorkspaceMembership,
)
from app.security.passwords import hash_password
from app.utils.checksum import compute_sha256
from app.utils.storage import save_uploaded_file

logger = get_logger(__name__)

PERMISSIONS_SPEC: List[Tuple[str, str, str]] = [
    ("documents:upload", "documents", "Upload new documents into authorised workspaces"),
    ("documents:read", "documents", "View and preview authorised documents and citations"),
    ("documents:download", "documents", "Download original files via signed URLs"),
    ("documents:manage", "documents", "Edit document metadata, access policies, and reprocess"),
    ("documents:delete", "documents", "Permanently delete documents and indexed chunks"),
    ("search:execute", "search", "Execute semantic and hybrid search across authorised documents"),
    ("assistant:ask", "assistant", "Ask questions and receive grounded RAG answers with citations"),
    ("summaries:generate", "summaries", "View and regenerate structured document summaries"),
    ("feedback:submit", "feedback", "Submit quality ratings and comments on AI answers"),
    ("users:read", "users", "View organisation directory and workspace memberships"),
    ("users:manage", "users", "Activate, deactivate, and update organisation users"),
    ("roles:manage", "roles", "Assign and modify organisation RBAC roles"),
    ("workspaces:manage", "workspaces", "Create workspaces and manage team memberships"),
    ("analytics:org", "analytics", "View organisation-wide usage and quality analytics"),
    ("analytics:team", "analytics", "View team and workspace usage analytics"),
    ("audit:read", "security", "Inspect immutable security and compliance audit logs"),
    ("jobs:manage", "operations", "Monitor ingestion jobs and retry failed background tasks"),
    ("system:config", "operations", "Update non-secret runtime application settings"),
]

ROLE_DEFINITIONS = [
    (
        "admin",
        "Administrator",
        "Full organisation governance: manages users, roles, workspaces, access policies, analytics, jobs, and audit logs.",
    ),
    (
        "manager",
        "Workspace Manager",
        "Team-level governance: manages assigned workspaces, team document permissions, and team usage analytics.",
    ),
    (
        "employee",
        "Knowledge Employee",
        "Standard knowledge worker: uploads allowed documents, performs semantic search, asks grounded AI questions, and views summaries.",
    ),
]


def ensure_system_roles_and_permissions(db: Session) -> Dict[str, Role]:
    perm_map: Dict[str, Permission] = {}
    for code, module, desc in PERMISSIONS_SPEC:
        p = db.query(Permission).filter(Permission.code == code).first()
        if not p:
            p = Permission(code=code, module=module, description=desc)
            db.add(p)
            db.flush()
        perm_map[code] = p

    from app.api.v1.auth import ROLE_PERMISSIONS_MAP

    role_map: Dict[str, Role] = {}
    for name, display_name, desc in ROLE_DEFINITIONS:
        r = db.query(Role).filter(Role.name == name).first()
        if not r:
            r = Role(name=name, display_name=display_name, description=desc, is_system=True)
            db.add(r)
            db.flush()
        role_map[name] = r

        existing_rp = {
            rp.permission_id
            for rp in db.query(RolePermission).filter(RolePermission.role_id == r.id).all()
        }
        for p_code in ROLE_PERMISSIONS_MAP.get(name, []):
            perm_obj = perm_map.get(p_code)
            if perm_obj and perm_obj.id not in existing_rp:
                db.add(RolePermission(role_id=r.id, permission_id=perm_obj.id))

    db.commit()
    return role_map


DEMO_DOCUMENTS: List[Dict[str, Any]] = [
    {
        "title": "[DEMO] Enterprise Information Security & Incident Response Policy v4.2",
        "filename": "enterprise_security_incident_policy_v4_2.txt",
        "visibility": "organisation",
        "allowed_roles": ["admin", "manager", "employee"],
        "workspace_slug": "security-governance",
        "tags": ["security", "incident-response", "encryption", "compliance", "demo"],
        "description": "[DEMO DATA] Authoritative corporate policy covering incident response SLAs, encryption standards, MFA, and audit retention.",
        "content": (
            "# 1. Executive Purpose and Scope\n"
            "This Enterprise Information Security & Incident Response Policy (Version 4.2, effective 2026-01-15) "
            "establishes mandatory cybersecurity controls for all Apex Global Technologies systems, cloud workloads, "
            "and knowledge bases. All employees, contractors, and third-party processors must comply with these requirements.\n\n"
            "# 2. Incident Response SLA and Escalation Matrix\n"
            "Critical (Severity-1) security incidents or confirmed data breaches require initial SOC triage within 15 minutes "
            "of alert detection. Containment actions must be initiated within 60 minutes. Executive leadership and the "
            "Chief Information Security Officer (CISO) must be briefed within 2 hours, and regulatory breach notifications "
            "must be filed within 4 hours for critical infrastructure or within 72 hours under GDPR Article 33.\n\n"
            "# 3. Cryptography, Authentication, and Access Control\n"
            "All production databases and document storage volumes must enforce AES-256 encryption at rest. "
            "All external and internal API traffic must enforce TLS 1.3 encryption in transit. "
            "User passwords must be hashed using Argon2id with a minimum password length of 8 characters and hardware-backed "
            "Multi-Factor Authentication (MFA) is mandatory for all Administrator and Manager accounts.\n\n"
            "# 4. Audit Logging and Data Retention\n"
            "Security audit logs recording authentication events, role changes, document uploads, downloads, and permission "
            "modifications must be retained in immutable storage for a minimum of 365 days. Passwords, raw session tokens, "
            "and API keys must never be written to application logs."
        ),
    },
    {
        "title": "[DEMO] Global Employee Handbook — Leave, Hybrid Work & Reimbursements 2026",
        "filename": "global_employee_handbook_2026.txt",
        "visibility": "organisation",
        "allowed_roles": ["admin", "manager", "employee"],
        "workspace_slug": "people-ops",
        "tags": ["hr", "leave-policy", "hybrid-work", "benefits", "demo"],
        "description": "[DEMO DATA] Organisation-wide HR guide for paid annual leave, hybrid remote work schedule, learning stipend, and expense claims.",
        "content": (
            "# 1. Annual Leave, Sick Leave, and Public Holidays\n"
            "Full-time employees at Apex Global Technologies receive 24 days of paid annual leave per calendar year, "
            "accrued at 2 days per month, in addition to 12 days of paid sick/wellness leave and 10 national public holidays. "
            "Up to 8 unused annual leave days may be carried forward into the next calendar year if approved by March 31.\n\n"
            "# 2. Hybrid Work and Remote Work Policy\n"
            "Apex Global operates a structured Hybrid Work Model: employees collaborate on-site 3 days per week "
            "(Tuesday, Wednesday, and Thursday) and may work remotely up to 2 days per week (Monday and Friday). "
            "Employees may also request up to 4 weeks per year of fully remote 'Work From Anywhere' subject to Manager approval "
            "at least 14 days in advance.\n\n"
            "# 3. Professional Development Stipend & Expense Reimbursements\n"
            "Every employee is eligible for an annual learning and certification stipend of USD 1,500 (or INR 125,000) "
            "covering technical courses, books, and conference registrations. Travel and business expense claims must be "
            "submitted with itemized receipts within 30 days of expenditure and are reimbursed within 10 business days.\n\n"
            "# 4. New Hire Onboarding Compliance Deadline\n"
            "All new hires must complete mandatory Information Security Awareness, Data Privacy, and Code of Conduct modules "
            "within 14 days of their start date."
        ),
    },
    {
        "title": "[DEMO] Q3 2026 Financial Performance & Cloud Infrastructure Budget",
        "filename": "q3_2026_financial_and_cloud_budget.txt",
        "visibility": "workspace",
        "allowed_roles": ["admin", "manager"],
        "workspace_slug": "finance-strategy",
        "tags": ["finance", "budget", "q3-2026", "cloud-costs", "demo"],
        "description": "[DEMO DATA] Manager & Admin workspace report detailing Q3 2026 revenue, R&D expenditure, and AI/cloud budget allocations.",
        "content": (
            "# 1. Q3 2026 Financial Highlights\n"
            "In Q3 2026, Apex Global Technologies achieved Annual Recurring Revenue (ARR) of $14.8 million, representing "
            "34% year-over-year growth. Gross margin improved to 78.4%, driven by automated document ingestion pipelines "
            "and multi-tenant PostgreSQL pgvector optimization. Net revenue retention stood at 118%.\n\n"
            "# 2. R&D and Cloud Infrastructure Budget Allocations\n"
            "Total Q3 R&D investment was $2.1 million. Cloud infrastructure expenditure totalled $420,000 for the quarter, "
            "allocated across PostgreSQL high-availability clusters ($145,000), GPU inference and embedding pipelines ($165,000), "
            "and object storage / disaster recovery backups ($110,000).\n\n"
            "# 3. Q4 2026 Cost Optimization Decisions\n"
            "The Finance & Engineering Committee approved migrating cold document archives older than 180 days to tiered storage, "
            "projected to reduce storage expenditure by 22% in Q4 2026. All new vendor commitments exceeding $25,000 require "
            "joint sign-off from the VP of Finance and CISO."
        ),
    },
    {
        "title": "[DEMO] Executive Board M&A Target Evaluation Memo (Restricted)",
        "filename": "board_ma_evaluation_restricted_memo.txt",
        "visibility": "restricted",
        "allowed_roles": ["admin"],
        "workspace_slug": "finance-strategy",
        "tags": ["confidential", "board", "restricted", "demo"],
        "description": "[DEMO DATA] Strictly restricted Administrator-only memorandum used to demonstrate RBAC access enforcement.",
        "content": (
            "# 1. Confidential Project Horizon — M&A Evaluation\n"
            "This restricted memorandum evaluates the proposed acquisition of VectorPulse Analytics for $18.5 million "
            "in cash and equity. Due diligence completion is scheduled for 2026-11-30.\n\n"
            "# 2. Access Governance Notice\n"
            "This document is classified as Restricted (Admin-Only). Standard Employees and Workspace Managers without "
            "an explicit allow policy are prevented from retrieving, previewing, downloading, or citing this file."
        ),
    },
]


def seed_demo_data(db: Session) -> bool:
    """
    Populates explicitly labelled demonstration data if no organisations exist yet.
    Safe and idempotent: never overwrites existing organisations.
    """
    ensure_system_roles_and_permissions(db)

    if db.query(Organisation).count() > 0:
        return False

    logger.info("Seeding SUMIND-IQ demonstration data (explicitly labelled [DEMO])...")
    roles = {r.name: r for r in db.query(Role).all()}

    # 1. Create Primary Demo Organisation
    org = Organisation(
        name="Apex Global Technologies (Demo)",
        slug="apex-global",
        domain="sumind-iq.demo",
        description="[DEMO DATA] Enterprise demonstration organisation for SUMIND-IQ knowledge management.",
        is_active=True,
        is_demo=True,
    )
    db.add(org)
    db.flush()

    # 2. Create Demo Users (Admin, Manager, Employee)
    admin_user = User(
        email="admin@sumind-iq.demo",
        full_name="Aarav Mehta (Demo Admin)",
        password_hash=hash_password("Admin@12345"),
        job_title="VP of Knowledge & Security",
        department="Executive & Security",
        is_active=True,
        is_demo=True,
    )
    manager_user = User(
        email="manager@sumind-iq.demo",
        full_name="Priya Nair (Demo Manager)",
        password_hash=hash_password("Manager@12345"),
        job_title="Engineering & Compliance Manager",
        department="Governance & Finance",
        is_active=True,
        is_demo=True,
    )
    employee_user = User(
        email="employee@sumind-iq.demo",
        full_name="Rohan Sharma (Demo Employee)",
        password_hash=hash_password("Employee@12345"),
        job_title="Product & Operations Analyst",
        department="Product Operations",
        is_active=True,
        is_demo=True,
    )
    db.add_all([admin_user, manager_user, employee_user])
    db.flush()

    for usr, r_name in [
        (admin_user, "admin"),
        (manager_user, "manager"),
        (employee_user, "employee"),
    ]:
        db.add(
            OrganisationMembership(
                organisation_id=org.id,
                user_id=usr.id,
                role=r_name,
                role_id=roles[r_name].id if r_name in roles else None,
                is_default=True,
            )
        )

    # 3. Create Workspaces
    ws_sec = Workspace(
        organisation_id=org.id,
        name="Information Security & Governance",
        slug="security-governance",
        description="[DEMO] Cybersecurity policies, SOC playbooks, and compliance standards.",
        created_by_id=admin_user.id,
        is_demo=True,
    )
    ws_hr = Workspace(
        organisation_id=org.id,
        name="People Operations & HR Policies",
        slug="people-ops",
        description="[DEMO] Employee handbook, benefits, onboarding, and hybrid work policies.",
        created_by_id=admin_user.id,
        is_demo=True,
    )
    ws_fin = Workspace(
        organisation_id=org.id,
        name="Finance & Strategic Planning",
        slug="finance-strategy",
        description="[DEMO] Quarterly financial performance, budgets, and leadership memos.",
        created_by_id=admin_user.id,
        is_demo=True,
    )
    db.add_all([ws_sec, ws_hr, ws_fin])
    db.flush()

    ws_by_slug = {
        "security-governance": ws_sec,
        "people-ops": ws_hr,
        "finance-strategy": ws_fin,
    }

    # Assign workspace memberships
    # Admin & Manager manage all 3 workspaces; Employee belongs to Security & People Ops
    for ws in (ws_sec, ws_hr, ws_fin):
        db.add(
            WorkspaceMembership(
                workspace_id=ws.id,
                user_id=admin_user.id,
                workspace_role="manager",
                added_by_id=admin_user.id,
            )
        )
        db.add(
            WorkspaceMembership(
                workspace_id=ws.id,
                user_id=manager_user.id,
                workspace_role="manager",
                added_by_id=admin_user.id,
            )
        )
    for ws in (ws_sec, ws_hr):
        db.add(
            WorkspaceMembership(
                workspace_id=ws.id,
                user_id=employee_user.id,
                workspace_role="member",
                added_by_id=manager_user.id,
            )
        )
    db.commit()

    # 4. Ingest Demonstration Documents through the actual ingestion pipeline
    created_docs: List[Document] = []
    for spec in DEMO_DOCUMENTS:
        raw_bytes = spec["content"].encode("utf-8")
        storage_filename, storage_path = save_uploaded_file(
            organisation_id=org.id,
            original_filename=spec["filename"],
            file_ext="txt",
            content=raw_bytes,
        )
        ws_obj = ws_by_slug[spec["workspace_slug"]]
        doc = Document(
            organisation_id=org.id,
            workspace_id=ws_obj.id,
            uploader_id=admin_user.id if spec["visibility"] == "restricted" else manager_user.id,
            title=spec["title"],
            description=spec["description"],
            original_filename=spec["filename"],
            storage_filename=storage_filename,
            storage_path=storage_path,
            file_type="txt",
            mime_type="text/plain",
            file_size_bytes=len(raw_bytes),
            sha256_checksum=compute_sha256(raw_bytes),
            status="queued",
            visibility=spec["visibility"],
            allowed_roles_json=spec["allowed_roles"],
            tags_json=spec["tags"],
            is_demo=True,
        )
        db.add(doc)
        db.flush()

        job = ProcessingJob(
            document_id=doc.id,
            organisation_id=org.id,
            triggered_by_id=doc.uploader_id,
            job_type="ingestion",
            status="queued",
            worker_mode="seed_pipeline",
        )
        db.add(job)
        db.commit()

        run_document_ingestion_pipeline(document_id=doc.id, job_id=job.id, db_session=db)
        db.refresh(doc)
        created_docs.append(doc)

        # Pre-generate grounded summary for the first two public demo documents
        if doc.visibility == "organisation":
            chunks = (
                db.query(DocumentChunk)
                .filter(DocumentChunk.document_id == doc.id)
                .order_by(DocumentChunk.chunk_index.asc())
                .all()
            )
            sum_res = generate_grounded_document_summary(doc, chunks)
            db.add(
                DocumentSummary(
                    document_id=doc.id,
                    organisation_id=org.id,
                    executive_summary=sum_res.executive_summary,
                    detailed_summary=sum_res.detailed_summary,
                    main_points_json=sum_res.main_points,
                    entities_json=sum_res.entities,
                    risks_and_actions_json=sum_res.risks_and_actions,
                    citations_json=sum_res.citations,
                    interpretation_notes=sum_res.interpretation_notes,
                    provider_used=sum_res.provider_used,
                    model_used=sum_res.model_used,
                    generated_by_id=admin_user.id,
                )
            )
            db.commit()

    # 5. Create a Demo Grounded Conversation & Feedback for the Employee user
    sec_doc = created_docs[0]
    first_chunk = (
        db.query(DocumentChunk)
        .filter(DocumentChunk.document_id == sec_doc.id)
        .order_by(DocumentChunk.chunk_index.asc())
        .first()
    )
    conv = Conversation(
        organisation_id=org.id,
        user_id=employee_user.id,
        workspace_id=ws_sec.id,
        title="[DEMO] Incident Response SLA & Encryption Standards",
        scoped_document_ids_json=[],
    )
    db.add(conv)
    db.flush()

    u_msg = Message(
        conversation_id=conv.id,
        organisation_id=org.id,
        user_id=employee_user.id,
        role="user",
        content="What is our incident response SLA for critical security breaches and what encryption is required?",
        citations_json=[],
        evidence_sufficient=True,
        confidence_score=1.0,
    )
    db.add(u_msg)
    db.flush()

    cite_list = []
    if first_chunk:
        cite_list.append(
            {
                "citation_index": 1,
                "chunk_id": first_chunk.id,
                "document_id": sec_doc.id,
                "document_title": sec_doc.title,
                "file_type": sec_doc.file_type,
                "location_label": first_chunk.location_label,
                "page_number": first_chunk.page_number,
                "slide_number": None,
                "sheet_name": None,
                "section_title": first_chunk.section_title,
                "excerpt": first_chunk.content[:300],
                "similarity_score": 0.91,
            }
        )

    a_msg = Message(
        conversation_id=conv.id,
        organisation_id=org.id,
        user_id=None,
        role="assistant",
        content=(
            "### Direct Evidence from Authorised Documents\n\n"
            "- Critical (Severity-1) security incidents require initial SOC triage within **15 minutes** of alert detection, "
            "containment initiation within **60 minutes**, CISO briefing within **2 hours**, and regulatory notification within "
            "**4 hours** (or 72 hours under GDPR Article 33). **[Source 1: [DEMO] Enterprise Information Security & Incident Response Policy v4.2]**\n"
            "- All production databases and document storage volumes must enforce **AES-256 encryption at rest** and **TLS 1.3 in transit**, "
            "with Argon2id password hashing and mandatory MFA for Administrators and Managers. **[Source 1]**"
        ),
        citations_json=cite_list,
        evidence_sufficient=True,
        confidence_score=0.91,
        provider_used="extractive_grounded",
        model_used="sumind-extractive-verifier-v1",
        retrieval_metadata_json={"authorised_documents_in_scope": 2, "demo_seed": True},
        latency_ms=42,
    )
    db.add(a_msg)
    db.flush()

    db.add(
        Feedback(
            organisation_id=org.id,
            user_id=employee_user.id,
            conversation_id=conv.id,
            message_id=a_msg.id,
            rating="positive",
            comment="[DEMO] Accurate citation to the exact incident response SLA section.",
            issue_category="accurate_citations",
            model_metadata_json={"provider_used": "extractive_grounded"},
        )
    )

    # 6. Create Second Isolated Demo Organisation for Cross-Org Security Testing
    other_org = Organisation(
        name="Zenith BioLabs Pvt Ltd (Demo Isolated Tenant)",
        slug="zenith-biolabs",
        domain="zenith.demo",
        description="[DEMO DATA] Secondary isolated tenant used to verify multi-tenant boundary enforcement.",
        is_active=True,
        is_demo=True,
    )
    db.add(other_org)
    db.flush()

    other_user = User(
        email="isolated@zenith.demo",
        full_name="Dr. Kabir Sen (Zenith Tenant Admin)",
        password_hash=hash_password("Zenith@12345"),
        job_title="Director of Research",
        department="R&D",
        is_active=True,
        is_demo=True,
    )
    db.add(other_user)
    db.flush()

    db.add(
        OrganisationMembership(
            organisation_id=other_org.id,
            user_id=other_user.id,
            role="admin",
            role_id=roles["admin"].id if "admin" in roles else None,
            is_default=True,
        )
    )

    zenith_bytes = (
        b"# Zenith BioLabs Proprietary Protocol\n"
        b"This document belongs exclusively to Zenith BioLabs Pvt Ltd and must never be accessible "
        b"to users in Apex Global Technologies."
    )
    z_fname, z_path = save_uploaded_file(
        organisation_id=other_org.id,
        original_filename="zenith_proprietary_protocol.txt",
        file_ext="txt",
        content=zenith_bytes,
    )
    z_doc = Document(
        organisation_id=other_org.id,
        workspace_id=None,
        uploader_id=other_user.id,
        title="[DEMO] Zenith BioLabs Proprietary Protocol",
        description="[DEMO DATA] Cross-tenant isolation verification document.",
        original_filename="zenith_proprietary_protocol.txt",
        storage_filename=z_fname,
        storage_path=z_path,
        file_type="txt",
        mime_type="text/plain",
        file_size_bytes=len(zenith_bytes),
        sha256_checksum=compute_sha256(zenith_bytes),
        status="queued",
        visibility="organisation",
        allowed_roles_json=["admin", "manager", "employee"],
        tags_json=["proprietary", "demo"],
        is_demo=True,
    )
    db.add(z_doc)
    db.commit()
    run_document_ingestion_pipeline(document_id=z_doc.id, db_session=db)

    db.add(
        AuditLog(
            organisation_id=org.id,
            actor_user_id=admin_user.id,
            actor_email=admin_user.email,
            actor_role="admin",
            action="system.demo_seed_initialized",
            target_type="organisation",
            target_id=org.id,
            status="success",
            metadata_json={"demo_data": True, "documents_seeded": len(created_docs)},
        )
    )
    db.commit()
    logger.info("Demonstration seed data initialized successfully.")
    return True


def main() -> None:
    settings = get_settings()
    if settings.APP_ENV == "production" and "--force" not in sys.argv:
        print("Refusing to seed demonstration data in production environment without --force.")
        sys.exit(1)

    engine = get_engine()
    Base.metadata.create_all(bind=engine)
    session_factory = get_session_factory()
    with session_factory() as db:
        seeded = seed_demo_data(db)
        if seeded:
            print("SUMIND-IQ demonstration data seeded successfully.")
        else:
            print("Database already contains organisation data; skipped demo seed.")


if __name__ == "__main__":
    main()

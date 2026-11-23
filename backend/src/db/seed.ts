import { generateGroundedDocumentSummary } from '../ai/llm.js';
import { mongoDb, newId, utcNowIso } from './mongo.js';
import { runDocumentIngestionPipeline } from '../ingestion/pipeline.js';
import { hashPassword } from '../security/auth.js';
import { computeSha256, saveUploadedFile } from '../services/storage.js';
import type { DocumentDoc, RoleDoc, UserRole } from '../types/models.js';

const PERMISSIONS_SPEC: Array<[string, string, string]> = [
  ['documents:upload', 'documents', 'Upload new documents into authorised workspaces'],
  ['documents:read', 'documents', 'View and preview authorised documents and citations'],
  ['documents:download', 'documents', 'Download original files via signed URLs'],
  ['documents:manage', 'documents', 'Edit document metadata, access policies, and reprocess'],
  ['documents:delete', 'documents', 'Permanently delete documents and indexed chunks'],
  ['search:execute', 'search', 'Execute semantic and hybrid search across authorised documents'],
  ['assistant:ask', 'assistant', 'Ask questions and receive grounded RAG answers with citations'],
  ['summaries:generate', 'summaries', 'View and regenerate structured document summaries'],
  ['feedback:submit', 'feedback', 'Submit quality ratings and comments on AI answers'],
  ['users:read', 'users', 'View organisation directory and workspace memberships'],
  ['users:manage', 'users', 'Activate, deactivate, and update organisation users'],
  ['roles:manage', 'roles', 'Assign and modify organisation RBAC roles'],
  ['workspaces:manage', 'workspaces', 'Create workspaces and manage team memberships'],
  ['analytics:org', 'analytics', 'View organisation-wide usage and quality analytics'],
  ['analytics:team', 'analytics', 'View team and workspace usage analytics'],
  ['audit:read', 'security', 'Inspect immutable security and compliance audit logs'],
  ['jobs:manage', 'operations', 'Monitor ingestion jobs and retry failed background tasks'],
  ['system:config', 'operations', 'Update non-secret runtime application settings'],
];

const ROLE_DEFINITIONS: Array<[UserRole, string, string]> = [
  [
    'admin',
    'Administrator',
    'Full organisation governance: manages users, roles, workspaces, access policies, analytics, jobs, and audit logs.',
  ],
  [
    'manager',
    'Workspace Manager',
    'Team-level governance: manages assigned workspaces, team document permissions, and team usage analytics.',
  ],
  [
    'employee',
    'Knowledge Employee',
    'Standard knowledge worker: uploads allowed documents, performs semantic search, asks grounded AI questions, and views summaries.',
  ],
];

const DEMO_DOCUMENTS: Array<{
  title: string;
  filename: string;
  visibility: 'organisation' | 'workspace' | 'restricted';
  allowed_roles: UserRole[];
  workspace_slug: string;
  tags: string[];
  description: string;
  content: string;
}> = [
  {
    title: '[DEMO] Enterprise Information Security & Incident Response Policy v4.2',
    filename: 'enterprise_security_incident_policy_v4_2.txt',
    visibility: 'organisation',
    allowed_roles: ['admin', 'manager', 'employee'],
    workspace_slug: 'security-governance',
    tags: ['security', 'incident-response', 'encryption', 'compliance', 'demo'],
    description:
      '[DEMO DATA] Authoritative corporate policy covering incident response SLAs, encryption standards, MFA, and audit retention.',
    content: [
      '# 1. Executive Purpose and Scope',
      'This Enterprise Information Security & Incident Response Policy (Version 4.2, effective 2026-01-15) establishes mandatory cybersecurity controls for all Apex Global Technologies systems, cloud workloads, and knowledge bases. All employees, contractors, and third-party processors must comply with these requirements.',
      '',
      '# 2. Incident Response SLA and Escalation Matrix',
      'Critical (Severity-1) security incidents or confirmed data breaches require initial SOC triage within 15 minutes of alert detection. Containment actions must be initiated within 60 minutes. Executive leadership and the Chief Information Security Officer (CISO) must be briefed within 2 hours, and regulatory breach notifications must be filed within 4 hours for critical infrastructure or within 72 hours under GDPR Article 33.',
      '',
      '# 3. Cryptography, Authentication, and Access Control',
      'All production databases and document storage volumes must enforce AES-256 encryption at rest. All external and internal API traffic must enforce TLS 1.3 encryption in transit. User passwords must be hashed using bcrypt with a minimum password length of 8 characters and hardware-backed Multi-Factor Authentication (MFA) is mandatory for all Administrator and Manager accounts.',
      '',
      '# 4. Audit Logging and Data Retention',
      'Security audit logs recording authentication events, role changes, document uploads, downloads, and permission modifications must be retained in immutable storage for a minimum of 365 days. Passwords, raw session tokens, and API keys must never be written to application logs.',
    ].join('\n'),
  },
  {
    title: '[DEMO] Global Employee Handbook — Leave, Hybrid Work & Reimbursements 2026',
    filename: 'global_employee_handbook_2026.txt',
    visibility: 'organisation',
    allowed_roles: ['admin', 'manager', 'employee'],
    workspace_slug: 'people-ops',
    tags: ['hr', 'leave-policy', 'hybrid-work', 'benefits', 'demo'],
    description:
      '[DEMO DATA] Organisation-wide HR guide for paid annual leave, hybrid remote work schedule, learning stipend, and expense claims.',
    content: [
      '# 1. Annual Leave, Sick Leave, and Public Holidays',
      'Full-time employees at Apex Global Technologies receive 24 days of paid annual leave per calendar year, accrued at 2 days per month, in addition to 12 days of paid sick/wellness leave and 10 national public holidays. Up to 8 unused annual leave days may be carried forward into the next calendar year if approved by March 31.',
      '',
      '# 2. Hybrid Work and Remote Work Policy',
      "Apex Global operates a structured Hybrid Work Model: employees collaborate on-site 3 days per week (Tuesday, Wednesday, and Thursday) and may work remotely up to 2 days per week (Monday and Friday). Employees may also request up to 4 weeks per year of fully remote 'Work From Anywhere' subject to Manager approval at least 14 days in advance.",
      '',
      '# 3. Professional Development Stipend & Expense Reimbursements',
      'Every employee is eligible for an annual learning and certification stipend of USD 1,500 (or INR 125,000) covering technical courses, books, and conference registrations. Travel and business expense claims must be submitted with itemized receipts within 30 days of expenditure and are reimbursed within 10 business days.',
      '',
      '# 4. New Hire Onboarding Compliance Deadline',
      'All new hires must complete mandatory Information Security Awareness, Data Privacy, and Code of Conduct modules within 14 days of their start date.',
    ].join('\n'),
  },
  {
    title: '[DEMO] Q3 2026 Financial Performance & Cloud Infrastructure Budget',
    filename: 'q3_2026_financial_and_cloud_budget.txt',
    visibility: 'workspace',
    allowed_roles: ['admin', 'manager'],
    workspace_slug: 'finance-strategy',
    tags: ['finance', 'budget', 'q3-2026', 'cloud-costs', 'demo'],
    description:
      '[DEMO DATA] Manager & Admin workspace report detailing Q3 2026 revenue, R&D expenditure, and AI/cloud budget allocations.',
    content: [
      '# 1. Q3 2026 Financial Highlights',
      'In Q3 2026, Apex Global Technologies achieved Annual Recurring Revenue (ARR) of $14.8 million, representing 34% year-over-year growth. Gross margin improved to 78.4%, driven by automated document ingestion pipelines and multi-tenant MongoDB Atlas Vector Search optimization. Net revenue retention stood at 118%.',
      '',
      '# 2. R&D and Cloud Infrastructure Budget Allocations',
      'Total Q3 R&D investment was $2.1 million. Cloud infrastructure expenditure totalled $420,000 for the quarter, allocated across MongoDB Atlas high-availability clusters ($145,000), GPU inference and embedding pipelines ($165,000), and AWS S3 object storage / disaster recovery backups ($110,000).',
      '',
      '# 3. Q4 2026 Cost Optimization Decisions',
      'The Finance & Engineering Committee approved migrating cold document archives older than 180 days to AWS S3 Glacier tiered storage, projected to reduce storage expenditure by 22% in Q4 2026. All new vendor commitments exceeding $25,000 require joint sign-off from the VP of Finance and CISO.',
    ].join('\n'),
  },
  {
    title: '[DEMO] Executive Board M&A Target Evaluation Memo (Restricted)',
    filename: 'board_ma_evaluation_restricted_memo.txt',
    visibility: 'restricted',
    allowed_roles: ['admin'],
    workspace_slug: 'finance-strategy',
    tags: ['confidential', 'board', 'restricted', 'demo'],
    description:
      '[DEMO DATA] Strictly restricted Administrator-only memorandum used to demonstrate RBAC access enforcement.',
    content: [
      '# 1. Confidential Project Horizon — M&A Evaluation',
      'This restricted memorandum evaluates the proposed acquisition of VectorPulse Analytics for $18.5 million in cash and equity. Due diligence completion is scheduled for 2026-11-30.',
      '',
      '# 2. Access Governance Notice',
      'This document is classified as Restricted (Admin-Only). Standard Employees and Workspace Managers without an explicit allow policy are prevented from retrieving, previewing, downloading, or citing this file.',
    ].join('\n'),
  },
];

export function ensureSystemRolesAndPermissions(): Record<UserRole, RoleDoc> {
  const existingPerms = new Set(mongoDb.collection('permissions').map((p) => p.code));
  for (const [code, module, description] of PERMISSIONS_SPEC) {
    if (!existingPerms.has(code)) {
      mongoDb.insert('permissions', {
        id: newId(),
        code,
        module,
        description,
      });
    }
  }

  const now = utcNowIso();
  const roleMap = {} as Record<UserRole, RoleDoc>;
  for (const [name, displayName, description] of ROLE_DEFINITIONS) {
    let role = mongoDb.collection('roles').find((r) => r.name === name);
    if (!role) {
      role = mongoDb.insert('roles', {
        id: newId(),
        name,
        display_name: displayName,
        description,
        is_system: true,
        created_at: now,
      });
    }
    roleMap[name] = role;
  }

  return roleMap;
}

export async function seedDemoData(): Promise<boolean> {
  const roles = ensureSystemRolesAndPermissions();

  if (mongoDb.collection('organisations').length > 0) {
    return false;
  }

  const now = utcNowIso();

  // 1. Primary Demo Organisation
  const org = mongoDb.insert('organisations', {
    id: newId(),
    name: 'Apex Global Technologies (Demo)',
    slug: 'apex-global',
    domain: 'sumind-iq.demo',
    description:
      '[DEMO DATA] Enterprise demonstration organisation for SUMIND-IQ knowledge management.',
    is_active: true,
    is_demo: true,
    created_at: now,
    updated_at: now,
  });

  // 2. Demo Users (Admin, Manager, Employee)
  const adminUser = mongoDb.insert('users', {
    id: newId(),
    email: 'admin@sumind-iq.demo',
    full_name: 'Aarav Mehta (Demo Admin)',
    password_hash: hashPassword('Admin@12345'),
    job_title: 'VP of Knowledge & Security',
    department: 'Executive & Security',
    is_active: true,
    is_demo: true,
    last_login_at: now,
    created_at: now,
    updated_at: now,
  });

  const managerUser = mongoDb.insert('users', {
    id: newId(),
    email: 'manager@sumind-iq.demo',
    full_name: 'Priya Nair (Demo Manager)',
    password_hash: hashPassword('Manager@12345'),
    job_title: 'Engineering & Compliance Manager',
    department: 'Governance & Finance',
    is_active: true,
    is_demo: true,
    last_login_at: now,
    created_at: now,
    updated_at: now,
  });

  const employeeUser = mongoDb.insert('users', {
    id: newId(),
    email: 'employee@sumind-iq.demo',
    full_name: 'Rohan Sharma (Demo Employee)',
    password_hash: hashPassword('Employee@12345'),
    job_title: 'Product & Operations Analyst',
    department: 'Product Operations',
    is_active: true,
    is_demo: true,
    last_login_at: now,
    created_at: now,
    updated_at: now,
  });

  for (const [usr, roleName] of [
    [adminUser, 'admin'],
    [managerUser, 'manager'],
    [employeeUser, 'employee'],
  ] as const) {
    mongoDb.insert('organisation_memberships', {
      id: newId(),
      organisation_id: org.id,
      user_id: usr.id,
      role: roleName,
      role_id: roles[roleName].id,
      is_default: true,
      joined_at: now,
    });
  }

  // 3. Workspaces
  const wsSec = mongoDb.insert('workspaces', {
    id: newId(),
    organisation_id: org.id,
    name: 'Information Security & Governance',
    slug: 'security-governance',
    description: '[DEMO] Cybersecurity policies, SOC playbooks, and compliance standards.',
    created_by_id: adminUser.id,
    is_demo: true,
    created_at: now,
    updated_at: now,
  });

  const wsHr = mongoDb.insert('workspaces', {
    id: newId(),
    organisation_id: org.id,
    name: 'People Operations & HR Policies',
    slug: 'people-ops',
    description: '[DEMO] Employee handbook, benefits, onboarding, and hybrid work policies.',
    created_by_id: adminUser.id,
    is_demo: true,
    created_at: now,
    updated_at: now,
  });

  const wsFin = mongoDb.insert('workspaces', {
    id: newId(),
    organisation_id: org.id,
    name: 'Finance & Strategic Planning',
    slug: 'finance-strategy',
    description: '[DEMO] Quarterly financial performance, budgets, and leadership memos.',
    created_by_id: adminUser.id,
    is_demo: true,
    created_at: now,
    updated_at: now,
  });

  const wsBySlug: Record<string, typeof wsSec> = {
    'security-governance': wsSec,
    'people-ops': wsHr,
    'finance-strategy': wsFin,
  };

  for (const ws of [wsSec, wsHr, wsFin]) {
    mongoDb.insert('workspace_memberships', {
      id: newId(),
      workspace_id: ws.id,
      user_id: adminUser.id,
      workspace_role: 'manager',
      added_by_id: adminUser.id,
      created_at: now,
    });
    mongoDb.insert('workspace_memberships', {
      id: newId(),
      workspace_id: ws.id,
      user_id: managerUser.id,
      workspace_role: 'manager',
      added_by_id: adminUser.id,
      created_at: now,
    });
  }
  for (const ws of [wsSec, wsHr]) {
    mongoDb.insert('workspace_memberships', {
      id: newId(),
      workspace_id: ws.id,
      user_id: employeeUser.id,
      workspace_role: 'member',
      added_by_id: managerUser.id,
      created_at: now,
    });
  }

  // 4. Ingest Demonstration Documents
  const createdDocs: DocumentDoc[] = [];
  for (const spec of DEMO_DOCUMENTS) {
    const rawBytes = Buffer.from(spec.content, 'utf-8');
    const stored = await saveUploadedFile({
      organisationId: org.id,
      originalFilename: spec.filename,
      fileExt: 'txt',
      mimeType: 'text/plain',
      content: rawBytes,
    });
    const wsObj = wsBySlug[spec.workspace_slug];
    const uploaderId =
      spec.visibility === 'restricted' ? adminUser.id : managerUser.id;

    const doc = mongoDb.insert('documents', {
      id: newId(),
      organisation_id: org.id,
      workspace_id: wsObj.id,
      uploader_id: uploaderId,
      title: spec.title,
      description: spec.description,
      original_filename: spec.filename,
      storage_filename: stored.storageFilename,
      storage_path: stored.storagePath,
      storage_backend: stored.storageBackend,
      s3_bucket: stored.s3Bucket,
      s3_key: stored.s3Key,
      file_type: 'txt',
      mime_type: 'text/plain',
      file_size_bytes: rawBytes.length,
      sha256_checksum: computeSha256(rawBytes),
      status: 'queued',
      visibility: spec.visibility,
      allowed_roles_json: spec.allowed_roles,
      tags_json: spec.tags,
      page_count: 1,
      chunk_count: 0,
      processing_progress: 5,
      processing_stage: 'Queued for ingestion',
      processing_error: null,
      ocr_used: false,
      is_demo: true,
      indexed_at: null,
      created_at: now,
      updated_at: now,
    });

    const job = mongoDb.insert('processing_jobs', {
      id: newId(),
      document_id: doc.id,
      organisation_id: org.id,
      triggered_by_id: uploaderId,
      job_type: 'ingestion',
      status: 'queued',
      worker_mode: 'seed_pipeline',
      attempt_count: 1,
      max_attempts: 3,
      progress_percent: 5,
      current_stage: 'Queued for ingestion',
      error_message: null,
      duration_ms: null,
      started_at: null,
      completed_at: null,
      created_at: now,
    });

    const processedDoc = await runDocumentIngestionPipeline({
      documentId: doc.id,
      jobId: job.id,
    });
    createdDocs.push(processedDoc);

    if (processedDoc.visibility === 'organisation') {
      const chunks = mongoDb
        .collection('document_chunks')
        .filter((c) => c.document_id === processedDoc.id)
        .sort((a, b) => a.chunk_index - b.chunk_index);
      const sumRes = generateGroundedDocumentSummary(processedDoc, chunks);
      mongoDb.insert('document_summaries', {
        id: newId(),
        document_id: processedDoc.id,
        organisation_id: org.id,
        executive_summary: sumRes.executiveSummary,
        detailed_summary: sumRes.detailedSummary,
        main_points_json: sumRes.mainPoints,
        entities_json: sumRes.entities,
        risks_and_actions_json: sumRes.risksAndActions,
        citations_json: sumRes.citations,
        interpretation_notes: sumRes.interpretationNotes,
        provider_used: sumRes.providerUsed,
        model_used: sumRes.modelUsed,
        generated_by_id: adminUser.id,
        created_at: now,
        updated_at: now,
      });
    }
  }

  // 5. Demo Grounded Conversation & Feedback for Employee
  const secDoc = createdDocs[0];
  const firstChunk = mongoDb
    .collection('document_chunks')
    .filter((c) => c.document_id === secDoc.id)
    .sort((a, b) => a.chunk_index - b.chunk_index)[0];

  const conv = mongoDb.insert('conversations', {
    id: newId(),
    organisation_id: org.id,
    user_id: employeeUser.id,
    workspace_id: wsSec.id,
    title: '[DEMO] Incident Response SLA & Encryption Standards',
    scoped_document_ids_json: [],
    is_archived: false,
    created_at: now,
    updated_at: now,
  });

  mongoDb.insert('messages', {
    id: newId(),
    conversation_id: conv.id,
    organisation_id: org.id,
    user_id: employeeUser.id,
    role: 'user',
    content:
      'What is our incident response SLA for critical security breaches and what encryption is required?',
    citations_json: [],
    evidence_sufficient: true,
    confidence_score: 1.0,
    provider_used: null,
    model_used: null,
    retrieval_metadata_json: {},
    latency_ms: 0,
    created_at: now,
  });

  const citeList = firstChunk
    ? [
        {
          citation_index: 1,
          chunk_id: firstChunk.id,
          document_id: secDoc.id,
          document_title: secDoc.title,
          file_type: secDoc.file_type,
          location_label: firstChunk.location_label,
          page_number: firstChunk.page_number ?? null,
          slide_number: null,
          sheet_name: null,
          section_title: firstChunk.section_title ?? null,
          excerpt: firstChunk.content.slice(0, 300),
          similarity_score: 0.91,
          is_accessible: true,
        },
      ]
    : [];

  const assistantMsg = mongoDb.insert('messages', {
    id: newId(),
    conversation_id: conv.id,
    organisation_id: org.id,
    user_id: null,
    role: 'assistant',
    content: [
      '### Direct Evidence from Authorised Documents',
      '',
      '- Critical (Severity-1) security incidents require initial SOC triage within **15 minutes** of alert detection, containment initiation within **60 minutes**, CISO briefing within **2 hours**, and regulatory notification within **4 hours** (or 72 hours under GDPR Article 33). **[Source 1: [DEMO] Enterprise Information Security & Incident Response Policy v4.2]**',
      '- All production databases and document storage volumes must enforce **AES-256 encryption at rest** and **TLS 1.3 in transit**, with bcrypt password hashing and mandatory MFA for Administrators and Managers. **[Source 1]**',
    ].join('\n'),
    citations_json: citeList,
    evidence_sufficient: true,
    confidence_score: 0.91,
    provider_used: 'extractive_grounded',
    model_used: 'sumind-extractive-verifier-v1',
    retrieval_metadata_json: { authorised_documents_in_scope: 2, demo_seed: true },
    latency_ms: 28,
    created_at: now,
  });

  mongoDb.insert('feedbacks', {
    id: newId(),
    organisation_id: org.id,
    user_id: employeeUser.id,
    conversation_id: conv.id,
    message_id: assistantMsg.id,
    rating: 'positive',
    comment: '[DEMO] Accurate citation to the exact incident response SLA section.',
    issue_category: 'accurate_citations',
    model_metadata_json: { provider_used: 'extractive_grounded' },
    created_at: now,
    updated_at: now,
  });

  // 6. Secondary Isolated Demo Organisation for Cross-Org Security Verification
  const otherOrg = mongoDb.insert('organisations', {
    id: newId(),
    name: 'Zenith BioLabs Pvt Ltd (Demo Isolated Tenant)',
    slug: 'zenith-biolabs',
    domain: 'zenith.demo',
    description:
      '[DEMO DATA] Secondary isolated tenant used to verify multi-tenant boundary enforcement.',
    is_active: true,
    is_demo: true,
    created_at: now,
    updated_at: now,
  });

  const otherUser = mongoDb.insert('users', {
    id: newId(),
    email: 'isolated@zenith.demo',
    full_name: 'Dr. Kabir Sen (Zenith Tenant Admin)',
    password_hash: hashPassword('Zenith@12345'),
    job_title: 'Director of Research',
    department: 'R&D',
    is_active: true,
    is_demo: true,
    last_login_at: now,
    created_at: now,
    updated_at: now,
  });

  mongoDb.insert('organisation_memberships', {
    id: newId(),
    organisation_id: otherOrg.id,
    user_id: otherUser.id,
    role: 'admin',
    role_id: roles.admin.id,
    is_default: true,
    joined_at: now,
  });

  const zenithBytes = Buffer.from(
    '# Zenith BioLabs Proprietary Protocol\nThis document belongs exclusively to Zenith BioLabs Pvt Ltd and must never be accessible to users in Apex Global Technologies.',
    'utf-8'
  );
  const zStored = await saveUploadedFile({
    organisationId: otherOrg.id,
    originalFilename: 'zenith_proprietary_protocol.txt',
    fileExt: 'txt',
    mimeType: 'text/plain',
    content: zenithBytes,
  });

  const zDoc = mongoDb.insert('documents', {
    id: newId(),
    organisation_id: otherOrg.id,
    workspace_id: null,
    uploader_id: otherUser.id,
    title: '[DEMO] Zenith BioLabs Proprietary Protocol',
    description: '[DEMO DATA] Cross-tenant isolation verification document.',
    original_filename: 'zenith_proprietary_protocol.txt',
    storage_filename: zStored.storageFilename,
    storage_path: zStored.storagePath,
    storage_backend: zStored.storageBackend,
    s3_bucket: zStored.s3Bucket,
    s3_key: zStored.s3Key,
    file_type: 'txt',
    mime_type: 'text/plain',
    file_size_bytes: zenithBytes.length,
    sha256_checksum: computeSha256(zenithBytes),
    status: 'queued',
    visibility: 'organisation',
    allowed_roles_json: ['admin', 'manager', 'employee'],
    tags_json: ['proprietary', 'demo'],
    page_count: 1,
    chunk_count: 0,
    processing_progress: 5,
    processing_stage: 'Queued for ingestion',
    processing_error: null,
    ocr_used: false,
    is_demo: true,
    indexed_at: null,
    created_at: now,
    updated_at: now,
  });

  await runDocumentIngestionPipeline({ documentId: zDoc.id });

  mongoDb.insert('audit_logs', {
    id: newId(),
    organisation_id: org.id,
    actor_user_id: adminUser.id,
    actor_email: adminUser.email,
    actor_role: 'admin',
    action: 'system.demo_seed_initialized',
    target_type: 'organisation',
    target_id: org.id,
    status: 'success',
    ip_address: '127.0.0.1',
    user_agent: 'sumind-iq-seed',
    metadata_json: { demo_data: true, documents_seeded: createdDocs.length },
    created_at: now,
  });

  return true;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await mongoDb.init();
  const seeded = await seedDemoData();
  console.log(
    seeded
      ? 'SUMIND-IQ demonstration data seeded into MongoDB successfully.'
      : 'MongoDB already contains organisation data; skipped demo seed.'
  );
}

import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import multer from 'multer';
import { generateGroundedDocumentSummary } from '../ai/llm.js';
import { mongoDb, newId, utcNowIso } from '../db/mongo.js';
import { validateUploadedFile } from '../ingestion/pipeline.js';
import {
  AuthContext,
  canAccessDocument,
  createSignedDownloadToken,
  decodeJwtToken,
  enforceDocumentAccess,
  getAuthorisedDocuments,
  requireAuth,
  resolveAuthContextFromToken,
} from '../security/auth.js';
import {
  computeSha256,
  deleteStoredFile,
  getPresignedS3UrlIfAvailable,
  saveUploadedFile,
} from '../services/storage.js';
import type { DocumentDoc, DocumentSummaryDoc, UserRole } from '../types/models.js';
import {
  HttpError,
  paginateSequence,
  sanitizeFilename,
  sanitizeUserText,
} from '../utils/errors.js';
import { dispatchIngestionJob } from '../workers/queue.js';

export const documentRouter = Router();
const upload = multer({ storage: multer.memoryStorage() });

export function serializeDocument(
  doc: DocumentDoc,
  ctx: AuthContext,
  includePolicies = false
): Record<string, unknown> {
  const uploader = mongoDb.collection('users').find((u) => u.id === doc.uploader_id);
  const workspace = doc.workspace_id
    ? mongoDb.collection('workspaces').find((w) => w.id === doc.workspace_id)
    : null;
  const hasSummary = mongoDb
    .collection('document_summaries')
    .some((s) => s.document_id === doc.id);

  const canManage = canAccessDocument(ctx, doc, 'manage');
  const canDownload = canAccessDocument(ctx, doc, 'download');

  const data: Record<string, unknown> = {
    id: doc.id,
    organisation_id: doc.organisation_id,
    workspace_id: doc.workspace_id ?? null,
    workspace_name: workspace?.name ?? null,
    uploader_id: doc.uploader_id,
    uploader_name: uploader?.full_name || 'System',
    uploader_email: uploader?.email || '',
    title: doc.title,
    description: doc.description ?? null,
    original_filename: doc.original_filename,
    file_type: doc.file_type,
    mime_type: doc.mime_type,
    file_size_bytes: doc.file_size_bytes,
    sha256_checksum: doc.sha256_checksum,
    status: doc.status,
    visibility: doc.visibility,
    allowed_roles: doc.allowed_roles_json || ['admin', 'manager', 'employee'],
    tags: doc.tags_json || [],
    page_count: doc.page_count,
    chunk_count: doc.chunk_count,
    processing_progress: doc.processing_progress,
    processing_stage: doc.processing_stage ?? null,
    processing_error: doc.processing_error ?? null,
    ocr_used: doc.ocr_used,
    is_demo: doc.is_demo,
    has_summary: hasSummary,
    can_manage: canManage,
    can_download: canDownload,
    indexed_at: doc.indexed_at ?? null,
    created_at: doc.created_at,
    updated_at: doc.updated_at,
  };

  if (includePolicies) {
    const policies = mongoDb
      .collection('document_access_policies')
      .filter((p) => p.document_id === doc.id)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));

    data.access_policies = policies.map((p) => ({
      id: p.id,
      principal_type: p.principal_type,
      principal_id: p.principal_id,
      access_level: p.access_level,
      effect: p.effect,
      created_at: p.created_at,
    }));
  }

  return data;
}

documentRouter.post(
  '/',
  requireAuth,
  upload.single('file'),
  async (req, res, next) => {
    try {
      const ctx = req.authContext!;
      const file = req.file;
      if (!file) {
        throw new HttpError(400, 'Multipart file field is required.');
      }

      const rawBytes = file.buffer;
      const safeOriginalName = sanitizeFilename(file.originalname || 'document.txt');
      const { ext, canonicalMime } = validateUploadedFile(
        safeOriginalName,
        file.mimetype || 'application/octet-stream',
        rawBytes
      );

      const visibility = String(req.body.visibility || 'organisation');
      if (!['organisation', 'workspace', 'restricted'].includes(visibility)) {
        throw new HttpError(
          400,
          'Invalid visibility setting. Must be organisation, workspace, or restricted.'
        );
      }

      let resolvedWsId: string | null = null;
      const workspaceIdRaw = req.body.workspace_id ? String(req.body.workspace_id).trim() : '';
      if (workspaceIdRaw) {
        const ws = mongoDb
          .collection('workspaces')
          .find((w) => w.id === workspaceIdRaw && w.organisation_id === ctx.organisation.id);
        if (!ws) {
          throw new HttpError(404, 'Specified workspace does not exist in your organisation.');
        }
        if (ctx.role !== 'admin' && !ctx.workspaceIds.includes(ws.id)) {
          throw new HttpError(
            403,
            'You cannot upload documents to a workspace you do not belong to.'
          );
        }
        resolvedWsId = ws.id;
      } else if (visibility === 'workspace') {
        if (ctx.workspaceIds.length > 0) {
          resolvedWsId = ctx.workspaceIds[0];
        } else {
          throw new HttpError(400, 'Workspace visibility requires selecting a workspace.');
        }
      }

      let parsedRoles: UserRole[] = ['admin', 'manager', 'employee'];
      if (req.body.allowed_roles) {
        try {
          const rawRoles = String(req.body.allowed_roles);
          const candidate: string[] = rawRoles.startsWith('[')
            ? JSON.parse(rawRoles)
            : rawRoles.split(',').map((r) => r.trim());
          const valid = candidate.filter((r): r is UserRole =>
            ['admin', 'manager', 'employee'].includes(r)
          );
          if (valid.length > 0) {
            if (!valid.includes('admin')) valid.unshift('admin');
            parsedRoles = valid;
          }
        } catch {
          // keep default
        }
      }

      let parsedTags: string[] = [];
      if (req.body.tags) {
        try {
          const rawTags = String(req.body.tags);
          const candidate: unknown[] = rawTags.startsWith('[')
            ? JSON.parse(rawTags)
            : rawTags.split(',').map((t) => t.trim());
          parsedTags = candidate
            .slice(0, 10)
            .map((t) => sanitizeUserText(String(t), 40))
            .filter(Boolean);
        } catch {
          // keep empty
        }
      }

      const checksum = computeSha256(rawBytes);
      const stored = await saveUploadedFile({
        organisationId: ctx.organisation.id,
        originalFilename: safeOriginalName,
        fileExt: ext,
        mimeType: canonicalMime,
        content: rawBytes,
      });

      const defaultTitle = path
        .basename(safeOriginalName, path.extname(safeOriginalName))
        .replace(/[_-]+/g, ' ')
        .replace(/\b\w/g, (l) => l.toUpperCase());

      const docTitle = sanitizeUserText(
        req.body.title && String(req.body.title).trim()
          ? String(req.body.title).trim()
          : defaultTitle,
        255
      );

      const now = utcNowIso();
      const doc = mongoDb.insert('documents', {
        id: newId(),
        organisation_id: ctx.organisation.id,
        workspace_id: resolvedWsId,
        uploader_id: ctx.user.id,
        title: docTitle,
        description: req.body.description
          ? sanitizeUserText(String(req.body.description), 1500)
          : null,
        original_filename: safeOriginalName,
        storage_filename: stored.storageFilename,
        storage_path: stored.storagePath,
        storage_backend: stored.storageBackend,
        s3_bucket: stored.s3Bucket,
        s3_key: stored.s3Key,
        file_type: ext,
        mime_type: canonicalMime,
        file_size_bytes: rawBytes.length,
        sha256_checksum: checksum,
        status: 'queued',
        visibility: visibility as DocumentDoc['visibility'],
        allowed_roles_json: parsedRoles,
        tags_json: parsedTags,
        page_count: 1,
        chunk_count: 0,
        processing_progress: 5,
        processing_stage: 'Queued for ingestion',
        processing_error: null,
        ocr_used: false,
        is_demo: false,
        indexed_at: null,
        created_at: now,
        updated_at: now,
      });

      const job = mongoDb.insert('processing_jobs', {
        id: newId(),
        document_id: doc.id,
        organisation_id: ctx.organisation.id,
        triggered_by_id: ctx.user.id,
        job_type: 'ingestion',
        status: 'queued',
        worker_mode: 'bullmq_redis',
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

      mongoDb.insert('audit_logs', {
        id: newId(),
        organisation_id: ctx.organisation.id,
        actor_user_id: ctx.user.id,
        actor_email: ctx.user.email,
        actor_role: ctx.role,
        action: 'document.uploaded',
        target_type: 'document',
        target_id: doc.id,
        status: 'success',
        ip_address: ctx.ipAddress,
        user_agent: ctx.userAgent,
        metadata_json: {
          filename: safeOriginalName,
          file_type: ext,
          size_bytes: rawBytes.length,
          visibility,
          sha256: checksum,
          storage_backend: stored.storageBackend,
        },
        created_at: now,
      });

      const processImmediately =
        req.body.process_immediately === undefined ||
        String(req.body.process_immediately) !== 'false';

      const workerMode = await dispatchIngestionJob({
        documentId: doc.id,
        jobId: job.id,
        runSynchronously: processImmediately,
      });

      const refreshedDoc = mongoDb.collection('documents').find((d) => d.id === doc.id)!;
      const refreshedJob = mongoDb.collection('processing_jobs').find((j) => j.id === job.id)!;

      res.status(201).json({
        document: serializeDocument(refreshedDoc, ctx, true),
        job: {
          id: refreshedJob.id,
          status: refreshedJob.status,
          worker_mode: workerMode,
          progress_percent: refreshedJob.progress_percent,
          current_stage: refreshedJob.current_stage,
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

documentRouter.get('/', requireAuth, (req, res) => {
  const ctx = req.authContext!;
  const q = req.query.q ? String(req.query.q).trim().toLowerCase() : '';
  const fileType = req.query.file_type ? String(req.query.file_type) : null;
  const statusFilter = req.query.status ? String(req.query.status) : null;
  const workspaceId = req.query.workspace_id ? String(req.query.workspace_id) : null;
  const ownerId = req.query.owner_id ? String(req.query.owner_id) : null;
  const dateFrom = req.query.date_from ? String(req.query.date_from) : null;
  const dateTo = req.query.date_to ? String(req.query.date_to) : null;
  const sortBy = req.query.sort_by ? String(req.query.sort_by) : 'created_at';
  const sortOrder = req.query.sort_order ? String(req.query.sort_order) : 'desc';
  const page = Number(req.query.page || 1);
  const pageSize = Number(req.query.page_size || 12);

  let docs = getAuthorisedDocuments(ctx, {
    onlyReady: false,
    workspaceId,
    fileType,
    ownerId,
    statusFilter,
  });

  if (q) {
    docs = docs.filter(
      (d) =>
        d.title.toLowerCase().includes(q) ||
        d.original_filename.toLowerCase().includes(q) ||
        (d.description && d.description.toLowerCase().includes(q)) ||
        (d.tags_json || []).some((t) => t.toLowerCase().includes(q))
    );
  }

  if (dateFrom) {
    const ts = Date.parse(dateFrom);
    if (!Number.isNaN(ts)) {
      docs = docs.filter((d) => Date.parse(d.created_at) >= ts);
    }
  }
  if (dateTo) {
    const ts = Date.parse(dateTo);
    if (!Number.isNaN(ts)) {
      docs = docs.filter((d) => Date.parse(d.created_at) <= ts);
    }
  }

  const dir = sortOrder.toLowerCase() === 'asc' ? 1 : -1;
  docs.sort((a, b) => {
    if (sortBy === 'title') return a.title.localeCompare(b.title) * dir;
    if (sortBy === 'file_size_bytes') return (a.file_size_bytes - b.file_size_bytes) * dir;
    if (sortBy === 'status') return a.status.localeCompare(b.status) * dir;
    return a.created_at.localeCompare(b.created_at) * dir;
  });

  const { items, meta } = paginateSequence(docs, page, pageSize);
  res.json({
    items: items.map((d) => serializeDocument(d, ctx)),
    pagination: meta,
  });
});

documentRouter.get('/:documentId', requireAuth, (req, res, next) => {
  try {
    const ctx = req.authContext!;
    const docId = String(req.params.documentId);
    const rawDoc = mongoDb.collection('documents').find((d) => d.id === docId);
    const doc = enforceDocumentAccess(ctx, rawDoc, 'view', docId);

    const payload = serializeDocument(doc, ctx, true);
    const structure = mongoDb
      .collection('document_structures')
      .find((s) => s.document_id === doc.id && s.organisation_id === doc.organisation_id);
    payload.processing_metadata = structure?.processing_metadata || null;

    const latestJob = mongoDb
      .collection('processing_jobs')
      .filter((j) => j.document_id === doc.id)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];

    payload.latest_job = latestJob
      ? {
          id: latestJob.id,
          job_type: latestJob.job_type,
          status: latestJob.status,
          attempt_count: latestJob.attempt_count,
          progress_percent: latestJob.progress_percent,
          current_stage: latestJob.current_stage,
          error_message: latestJob.error_message,
          duration_ms: latestJob.duration_ms,
          created_at: latestJob.created_at,
          completed_at: latestJob.completed_at,
        }
      : null;

    res.json(payload);
  } catch (err) {
    next(err);
  }
});

documentRouter.patch('/:documentId', requireAuth, (req, res, next) => {
  try {
    const ctx = req.authContext!;
    const docId = String(req.params.documentId);
    const rawDoc = mongoDb.collection('documents').find((d) => d.id === docId);
    const doc = enforceDocumentAccess(ctx, rawDoc, 'manage', docId);

    const patch: Partial<DocumentDoc> = {};
    const changes: Record<string, unknown> = {};

    if (req.body.title !== undefined) {
      patch.title = sanitizeUserText(req.body.title, 255);
      changes.title = patch.title;
    }
    if (req.body.description !== undefined) {
      patch.description = sanitizeUserText(req.body.description, 2000);
      changes.description_updated = true;
    }
    if (req.body.visibility !== undefined) {
      patch.visibility = req.body.visibility;
      changes.visibility = req.body.visibility;
    }
    if (req.body.workspace_id !== undefined) {
      if (req.body.workspace_id === '' || req.body.workspace_id === null) {
        patch.workspace_id = null;
      } else {
        const ws = mongoDb
          .collection('workspaces')
          .find(
            (w) =>
              w.id === String(req.body.workspace_id) &&
              w.organisation_id === ctx.organisation.id
          );
        if (!ws) {
          throw new HttpError(404, 'Target workspace not found in your organisation.');
        }
        patch.workspace_id = ws.id;
        changes.workspace_id = ws.id;
      }
    }
    if (Array.isArray(req.body.allowed_roles)) {
      const valid = (req.body.allowed_roles as string[]).filter((r): r is UserRole =>
        ['admin', 'manager', 'employee'].includes(r)
      );
      if (!valid.includes('admin')) valid.unshift('admin');
      patch.allowed_roles_json = valid;
      changes.allowed_roles = valid;
    }
    if (Array.isArray(req.body.tags)) {
      patch.tags_json = (req.body.tags as string[])
        .slice(0, 12)
        .map((t) => sanitizeUserText(t, 40))
        .filter(Boolean);
    }

    const updated = mongoDb.updateById('documents', doc.id, patch)!;

    mongoDb.insert('audit_logs', {
      id: newId(),
      organisation_id: ctx.organisation.id,
      actor_user_id: ctx.user.id,
      actor_email: ctx.user.email,
      actor_role: ctx.role,
      action: 'document.updated',
      target_type: 'document',
      target_id: doc.id,
      status: 'success',
      ip_address: ctx.ipAddress,
      user_agent: ctx.userAgent,
      metadata_json: changes,
      created_at: utcNowIso(),
    });

    res.json(serializeDocument(updated, ctx, true));
  } catch (err) {
    next(err);
  }
});

documentRouter.delete('/:documentId', requireAuth, async (req, res, next) => {
  try {
    const ctx = req.authContext!;
    const docId = String(req.params.documentId);
    const rawDoc = mongoDb.collection('documents').find((d) => d.id === docId);
    const doc = enforceDocumentAccess(ctx, rawDoc, 'manage', docId);

    const docTitle = doc.title;
    mongoDb.deleteWhere('document_chunks', (c) => c.document_id === doc.id);
    mongoDb.deleteWhere('document_summaries', (s) => s.document_id === doc.id);
    mongoDb.deleteWhere('document_access_policies', (p) => p.document_id === doc.id);
    mongoDb.deleteWhere('document_structures', (s) => s.document_id === doc.id);
    mongoDb.deleteWhere('processing_jobs', (j) => j.document_id === doc.id);
    mongoDb.deleteWhere('documents', (d) => d.id === doc.id);

    await deleteStoredFile({
      storagePath: doc.storage_path,
      s3Bucket: doc.s3_bucket,
      s3Key: doc.s3_key,
    });

    mongoDb.insert('audit_logs', {
      id: newId(),
      organisation_id: ctx.organisation.id,
      actor_user_id: ctx.user.id,
      actor_email: ctx.user.email,
      actor_role: ctx.role,
      action: 'document.deleted',
      target_type: 'document',
      target_id: docId,
      status: 'success',
      ip_address: ctx.ipAddress,
      user_agent: ctx.userAgent,
      metadata_json: { title: docTitle },
      created_at: utcNowIso(),
    });

    res.json({
      message: `Document '${docTitle}' and all indexed chunks, summaries, and metadata were deleted.`,
      deleted_document_id: docId,
    });
  } catch (err) {
    next(err);
  }
});

documentRouter.get('/:documentId/status', requireAuth, (req, res, next) => {
  try {
    const ctx = req.authContext!;
    const docId = String(req.params.documentId);
    const rawDoc = mongoDb.collection('documents').find((d) => d.id === docId);
    const doc = enforceDocumentAccess(ctx, rawDoc, 'view', docId);

    const job = mongoDb
      .collection('processing_jobs')
      .filter((j) => j.document_id === doc.id)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];

    res.json({
      document_id: doc.id,
      title: doc.title,
      status: doc.status,
      processing_progress: doc.processing_progress,
      processing_stage: doc.processing_stage,
      processing_error: doc.processing_error,
      page_count: doc.page_count,
      chunk_count: doc.chunk_count,
      ocr_used: doc.ocr_used,
      indexed_at: doc.indexed_at,
      job: job
        ? {
            id: job.id,
            status: job.status,
            attempt_count: job.attempt_count,
            duration_ms: job.duration_ms,
            error_message: job.error_message,
          }
        : null,
    });
  } catch (err) {
    next(err);
  }
});

documentRouter.post('/:documentId/reprocess', requireAuth, async (req, res, next) => {
  try {
    const ctx = req.authContext!;
    const docId = String(req.params.documentId);
    const rawDoc = mongoDb.collection('documents').find((d) => d.id === docId);
    const doc = enforceDocumentAccess(ctx, rawDoc, 'manage', docId);

    const priorAttempts = mongoDb
      .collection('processing_jobs')
      .filter((j) => j.document_id === doc.id).length;

    const now = utcNowIso();
    mongoDb.updateById('documents', doc.id, {
      status: 'queued',
      processing_progress: 5,
      processing_stage: 'Queued for reprocessing',
      processing_error: null,
    });

    const job = mongoDb.insert('processing_jobs', {
      id: newId(),
      document_id: doc.id,
      organisation_id: ctx.organisation.id,
      triggered_by_id: ctx.user.id,
      job_type: 'reprocess',
      status: 'queued',
      worker_mode: 'bullmq_redis',
      attempt_count: priorAttempts + 1,
      max_attempts: 3,
      progress_percent: 5,
      current_stage: 'Queued for reprocessing',
      error_message: null,
      duration_ms: null,
      started_at: null,
      completed_at: null,
      created_at: now,
    });

    mongoDb.insert('audit_logs', {
      id: newId(),
      organisation_id: ctx.organisation.id,
      actor_user_id: ctx.user.id,
      actor_email: ctx.user.email,
      actor_role: ctx.role,
      action: 'document.reprocess_triggered',
      target_type: 'document',
      target_id: doc.id,
      status: 'success',
      ip_address: ctx.ipAddress,
      user_agent: ctx.userAgent,
      metadata_json: { attempt: priorAttempts + 1 },
      created_at: now,
    });

    const processImmediately = String(req.query.process_immediately ?? 'true') !== 'false';
    const workerMode = await dispatchIngestionJob({
      documentId: doc.id,
      jobId: job.id,
      runSynchronously: processImmediately,
    });

    const updatedDoc = mongoDb.collection('documents').find((d) => d.id === doc.id)!;
    res.json({
      message: processImmediately
        ? 'Document reprocessing completed.'
        : 'Document queued for reprocessing.',
      worker_mode: workerMode,
      document: serializeDocument(updatedDoc, ctx),
    });
  } catch (err) {
    next(err);
  }
});

documentRouter.get('/:documentId/signed-download-url', requireAuth, async (req, res, next) => {
  try {
    const ctx = req.authContext!;
    const docId = String(req.params.documentId);
    const rawDoc = mongoDb.collection('documents').find((d) => d.id === docId);
    const doc = enforceDocumentAccess(ctx, rawDoc, 'download', docId);

    // Prefer native AWS S3 presigned URL when document is persisted in S3
    const s3PresignedUrl = await getPresignedS3UrlIfAvailable({
      s3Bucket: doc.s3_bucket,
      s3Key: doc.s3_key,
      originalFilename: doc.original_filename,
    });

    if (s3PresignedUrl) {
      res.json({
        document_id: doc.id,
        download_url: s3PresignedUrl,
        storage_backend: 'aws_s3',
        expires_in_seconds: 300,
      });
      return;
    }

    const token = createSignedDownloadToken({
      userId: ctx.user.id,
      organisationId: ctx.organisation.id,
      documentId: doc.id,
    });

    res.json({
      document_id: doc.id,
      download_url: `/api/v1/documents/${doc.id}/download?download_token=${token}`,
      storage_backend: 'local_signed_token',
      expires_in_seconds: 300,
    });
  } catch (err) {
    next(err);
  }
});

documentRouter.get('/:documentId/download', (req, res, next) => {
  try {
    const docId = String(req.params.documentId);
    const downloadToken = req.query.download_token ? String(req.query.download_token) : null;
    let ctx: AuthContext;

    if (downloadToken) {
      const payload = decodeJwtToken(downloadToken, 'download');
      if (payload.doc !== docId) {
        throw new HttpError(
          403,
          'Signed download token does not match the requested document.'
        );
      }
      const userId = String(payload.sub || '');
      const orgId = String(payload.org || '');
      const user = mongoDb.collection('users').find((u) => u.id === userId && u.is_active);
      const org = mongoDb.collection('organisations').find((o) => o.id === orgId && o.is_active);
      const membership = mongoDb
        .collection('organisation_memberships')
        .find((m) => m.user_id === userId && m.organisation_id === orgId);
      if (!user || !org || !membership) {
        throw new HttpError(401, 'Invalid download session.');
      }
      const wsMemberships = mongoDb
        .collection('workspace_memberships')
        .filter((w) => w.user_id === user.id);
      ctx = {
        user,
        organisation: org,
        membership,
        role: membership.role,
        workspaceIds: wsMemberships.map((w) => w.workspace_id),
        managedWorkspaceIds: wsMemberships
          .filter((w) => w.workspace_role === 'manager')
          .map((w) => w.workspace_id),
        ipAddress: req.ip || null,
        userAgent: (req.headers['user-agent'] || '').slice(0, 250) || null,
      };
    } else {
      const authHeader = req.headers.authorization || '';
      if (!authHeader.toLowerCase().startsWith('bearer ')) {
        throw new HttpError(401, 'Authentication required to download private documents.');
      }
      ctx = resolveAuthContextFromToken(authHeader.slice(7).trim(), req);
    }

    const rawDoc = mongoDb.collection('documents').find((d) => d.id === docId);
    const doc = enforceDocumentAccess(ctx, rawDoc, 'download', docId);

    mongoDb.insert('audit_logs', {
      id: newId(),
      organisation_id: ctx.organisation.id,
      actor_user_id: ctx.user.id,
      actor_email: ctx.user.email,
      actor_role: ctx.role,
      action: 'document.downloaded',
      target_type: 'document',
      target_id: doc.id,
      status: 'success',
      ip_address: ctx.ipAddress,
      user_agent: ctx.userAgent,
      metadata_json: { filename: doc.original_filename },
      created_at: utcNowIso(),
    });

    if (doc.storage_path && fs.existsSync(doc.storage_path)) {
      res.setHeader('Content-Type', doc.mime_type);
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${doc.original_filename}"`
      );
      res.sendFile(path.resolve(doc.storage_path));
      return;
    }

    const chunks = mongoDb
      .collection('document_chunks')
      .filter((c) => c.document_id === doc.id)
      .sort((a, b) => a.chunk_index - b.chunk_index);
    const synthesized = chunks.map((c) => `[${c.location_label}]\n${c.content}`).join('\n\n');
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${doc.original_filename}.txt"`
    );
    res.send(synthesized);
  } catch (err) {
    next(err);
  }
});

documentRouter.get('/:documentId/preview', requireAuth, (req, res, next) => {
  try {
    const ctx = req.authContext!;
    const docId = String(req.params.documentId);
    const chunkId = req.query.chunk_id ? String(req.query.chunk_id) : null;
    const location = req.query.location ? String(req.query.location) : null;

    const rawDoc = mongoDb.collection('documents').find((d) => d.id === docId);
    const doc = enforceDocumentAccess(ctx, rawDoc, 'view', docId);

    const chunks = mongoDb
      .collection('document_chunks')
      .filter((c) => c.document_id === doc.id && c.organisation_id === ctx.organisation.id)
      .sort((a, b) => a.chunk_index - b.chunk_index);

    const structure = mongoDb
      .collection('document_structures')
      .find((s) => s.document_id === doc.id && s.organisation_id === doc.organisation_id);

    res.json({
      document: serializeDocument(doc, ctx),
      highlighted_chunk_id: chunkId,
      highlighted_location: location,
      extracted_sections: structure?.sections || [],
      chunks: chunks.map((c) => ({
        id: c.id,
        chunk_index: c.chunk_index,
        location_label: c.location_label,
        page_number: c.page_number,
        slide_number: c.slide_number,
        sheet_name: c.sheet_name,
        section_title: c.section_title,
        content: c.content,
        token_count: c.token_count,
        is_highlighted:
          c.id === chunkId ||
          Boolean(location && c.location_label.toLowerCase().includes(location.toLowerCase())),
      })),
    });
  } catch (err) {
    next(err);
  }
});

function serializeSummary(doc: DocumentDoc, summary: DocumentSummaryDoc) {
  return {
    id: summary.id,
    document_id: doc.id,
    document_title: doc.title,
    file_type: doc.file_type,
    executive_summary: summary.executive_summary,
    detailed_summary: summary.detailed_summary,
    main_points: summary.main_points_json,
    entities: summary.entities_json,
    risks_and_actions: summary.risks_and_actions_json,
    citations: summary.citations_json,
    interpretation_notes: summary.interpretation_notes,
    provider_used: summary.provider_used,
    model_used: summary.model_used,
    created_at: summary.created_at,
    updated_at: summary.updated_at,
  };
}

function createOrUpdateSummary(doc: DocumentDoc, ctx: AuthContext) {
  const chunks = mongoDb
    .collection('document_chunks')
    .filter((c) => c.document_id === doc.id && c.organisation_id === ctx.organisation.id)
    .sort((a, b) => a.chunk_index - b.chunk_index);

  const result = generateGroundedDocumentSummary(doc, chunks);
  const existing = mongoDb
    .collection('document_summaries')
    .find((s) => s.document_id === doc.id);

  const now = utcNowIso();
  let summary: DocumentSummaryDoc;
  if (existing) {
    summary = mongoDb.updateById('document_summaries', existing.id, {
      executive_summary: result.executiveSummary,
      detailed_summary: result.detailedSummary,
      main_points_json: result.mainPoints,
      entities_json: result.entities,
      risks_and_actions_json: result.risksAndActions,
      citations_json: result.citations,
      interpretation_notes: result.interpretationNotes,
      provider_used: result.providerUsed,
      model_used: result.modelUsed,
      generated_by_id: ctx.user.id,
    })!;
  } else {
    summary = mongoDb.insert('document_summaries', {
      id: newId(),
      document_id: doc.id,
      organisation_id: ctx.organisation.id,
      executive_summary: result.executiveSummary,
      detailed_summary: result.detailedSummary,
      main_points_json: result.mainPoints,
      entities_json: result.entities,
      risks_and_actions_json: result.risksAndActions,
      citations_json: result.citations,
      interpretation_notes: result.interpretationNotes,
      provider_used: result.providerUsed,
      model_used: result.modelUsed,
      generated_by_id: ctx.user.id,
      created_at: now,
      updated_at: now,
    });
  }

  mongoDb.insert('audit_logs', {
    id: newId(),
    organisation_id: ctx.organisation.id,
    actor_user_id: ctx.user.id,
    actor_email: ctx.user.email,
    actor_role: ctx.role,
    action: 'document.summary_generated',
    target_type: 'document',
    target_id: doc.id,
    status: 'success',
    ip_address: ctx.ipAddress,
    user_agent: ctx.userAgent,
    metadata_json: {
      provider_used: result.providerUsed,
      model_used: result.modelUsed,
    },
    created_at: now,
  });

  return serializeSummary(doc, summary);
}

documentRouter.get('/:documentId/summary', requireAuth, (req, res, next) => {
  try {
    const ctx = req.authContext!;
    const docId = String(req.params.documentId);
    const rawDoc = mongoDb.collection('documents').find((d) => d.id === docId);
    const doc = enforceDocumentAccess(ctx, rawDoc, 'view', docId);

    const summary = mongoDb
      .collection('document_summaries')
      .find((s) => s.document_id === doc.id && s.organisation_id === ctx.organisation.id);

    if (!summary) {
      if (doc.status !== 'ready') {
        throw new HttpError(
          400,
          `Document is currently '${doc.status}'. Summaries can only be generated for Ready documents.`
        );
      }
      res.json(createOrUpdateSummary(doc, ctx));
      return;
    }

    res.json(serializeSummary(doc, summary));
  } catch (err) {
    next(err);
  }
});

documentRouter.post('/:documentId/summary', requireAuth, (req, res, next) => {
  try {
    const ctx = req.authContext!;
    const docId = String(req.params.documentId);
    const rawDoc = mongoDb.collection('documents').find((d) => d.id === docId);
    const doc = enforceDocumentAccess(ctx, rawDoc, 'view', docId);

    if (doc.status !== 'ready') {
      throw new HttpError(400, 'Document must be in Ready state before generating a summary.');
    }

    res.json(createOrUpdateSummary(doc, ctx));
  } catch (err) {
    next(err);
  }
});

documentRouter.get('/:documentId/policies', requireAuth, (req, res, next) => {
  try {
    const ctx = req.authContext!;
    const docId = String(req.params.documentId);
    const rawDoc = mongoDb.collection('documents').find((d) => d.id === docId);
    const doc = enforceDocumentAccess(ctx, rawDoc, 'view', docId);

    const policies = mongoDb
      .collection('document_access_policies')
      .filter((p) => p.document_id === doc.id)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));

    res.json({
      document_id: doc.id,
      visibility: doc.visibility,
      allowed_roles: doc.allowed_roles_json,
      policies: policies.map((p) => ({
        id: p.id,
        principal_type: p.principal_type,
        principal_id: p.principal_id,
        access_level: p.access_level,
        effect: p.effect,
        created_at: p.created_at,
      })),
    });
  } catch (err) {
    next(err);
  }
});

documentRouter.post('/:documentId/policies', requireAuth, (req, res, next) => {
  try {
    const ctx = req.authContext!;
    const docId = String(req.params.documentId);
    const rawDoc = mongoDb.collection('documents').find((d) => d.id === docId);
    const doc = enforceDocumentAccess(ctx, rawDoc, 'manage', docId);

    const { principal_type, principal_id, access_level = 'view', effect = 'allow' } = req.body || {};
    if (!['user', 'workspace', 'role'].includes(principal_type)) {
      throw new HttpError(400, 'principal_type must be user, workspace, or role.');
    }
    if (!principal_id) {
      throw new HttpError(400, 'principal_id is required.');
    }

    const now = utcNowIso();
    const policy = mongoDb.insert('document_access_policies', {
      id: newId(),
      document_id: doc.id,
      organisation_id: ctx.organisation.id,
      principal_type,
      principal_id: String(principal_id),
      access_level,
      effect,
      granted_by_id: ctx.user.id,
      created_at: now,
    });

    mongoDb.insert('audit_logs', {
      id: newId(),
      organisation_id: ctx.organisation.id,
      actor_user_id: ctx.user.id,
      actor_email: ctx.user.email,
      actor_role: ctx.role,
      action: 'document.policy_created',
      target_type: 'document',
      target_id: doc.id,
      status: 'success',
      ip_address: ctx.ipAddress,
      user_agent: ctx.userAgent,
      metadata_json: {
        principal_type,
        principal_id,
        access_level,
        effect,
      },
      created_at: now,
    });

    if (principal_type === 'user' && effect === 'allow') {
      mongoDb.insert('notifications', {
        id: newId(),
        organisation_id: ctx.organisation.id,
        user_id: String(principal_id),
        title: `Access Granted: ${doc.title}`,
        message: `You have been granted '${access_level}' access to '${doc.title}'.`,
        notification_type: 'permission_granted',
        link_url: `/app/documents/${doc.id}`,
        is_read: false,
        created_at: now,
      });
    }

    res.status(201).json({
      id: policy.id,
      document_id: doc.id,
      principal_type: policy.principal_type,
      principal_id: policy.principal_id,
      access_level: policy.access_level,
      effect: policy.effect,
      created_at: policy.created_at,
    });
  } catch (err) {
    next(err);
  }
});

documentRouter.delete('/:documentId/policies/:policyId', requireAuth, (req, res, next) => {
  try {
    const ctx = req.authContext!;
    const documentId = String(req.params.documentId);
    const policyId = String(req.params.policyId);
    const rawDoc = mongoDb.collection('documents').find((d) => d.id === documentId);
    const doc = enforceDocumentAccess(ctx, rawDoc, 'manage', documentId);

    const removed = mongoDb.deleteWhere(
      'document_access_policies',
      (p) => p.id === policyId && p.document_id === doc.id
    );
    if (removed === 0) {
      throw new HttpError(404, 'Access policy not found.');
    }

    mongoDb.insert('audit_logs', {
      id: newId(),
      organisation_id: ctx.organisation.id,
      actor_user_id: ctx.user.id,
      actor_email: ctx.user.email,
      actor_role: ctx.role,
      action: 'document.policy_deleted',
      target_type: 'document',
      target_id: doc.id,
      status: 'success',
      ip_address: ctx.ipAddress,
      user_agent: ctx.userAgent,
      metadata_json: { policy_id: policyId },
      created_at: utcNowIso(),
    });

    res.json({ message: 'Access policy removed.' });
  } catch (err) {
    next(err);
  }
});

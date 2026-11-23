import { Router } from 'express';
import { getEmbeddingProvider } from '../ai/embeddings.js';
import {
  getRuntimeConfig,
  settings,
  updateRuntimeConfig,
} from '../config/index.js';
import { mongoDb, newId, utcNowIso } from '../db/mongo.js';
import {
  ROLE_PERMISSIONS_MAP,
  getAuthorisedDocuments,
  requireAuth,
  requireRoles,
} from '../security/auth.js';
import { getStorageStatus } from '../services/storage.js';
import type {
  OrganisationMembershipDoc,
  UserDoc,
  UserRole,
} from '../types/models.js';
import { HttpError, paginateSequence, sanitizeUserText } from '../utils/errors.js';
import { dispatchIngestionJob, getWorkerStatus } from '../workers/queue.js';
import { serializeDocument } from './documentRoutes.js';

export const userAdminRouter = Router();

function serializeOrgUser(user: UserDoc, membership: OrganisationMembershipDoc) {
  const orgWorkspaces = new Map(
    mongoDb
      .collection('workspaces')
      .filter((w) => w.organisation_id === membership.organisation_id)
      .map((w) => [w.id, w])
  );
  const wsMemberships = mongoDb
    .collection('workspace_memberships')
    .filter((wm) => wm.user_id === user.id && orgWorkspaces.has(wm.workspace_id));

  return {
    id: user.id,
    email: user.email,
    full_name: user.full_name,
    job_title: user.job_title ?? null,
    department: user.department ?? null,
    is_active: user.is_active,
    is_demo: user.is_demo,
    role: membership.role,
    joined_at: membership.joined_at,
    last_login_at: user.last_login_at ?? null,
    workspaces: wsMemberships.map((wm) => {
      const ws = orgWorkspaces.get(wm.workspace_id)!;
      return {
        id: ws.id,
        name: ws.name,
        slug: ws.slug,
        workspace_role: wm.workspace_role,
      };
    }),
  };
}

// --- Users, Roles, Workspaces & Notifications ---
userAdminRouter.get('/users', requireRoles('admin', 'manager'), (req, res) => {
  const ctx = req.authContext!;
  const q = req.query.q ? String(req.query.q).trim().toLowerCase() : '';
  const roleFilter = req.query.role ? String(req.query.role) : null;
  const workspaceId = req.query.workspace_id ? String(req.query.workspace_id) : null;
  const page = Number(req.query.page || 1);
  const pageSize = Number(req.query.page_size || 25);

  const memberships = mongoDb
    .collection('organisation_memberships')
    .filter((m) => m.organisation_id === ctx.organisation.id);

  let items = memberships
    .map((m) => {
      const u = mongoDb.collection('users').find((usr) => usr.id === m.user_id);
      return u ? serializeOrgUser(u, m) : null;
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a, b) => a.full_name.localeCompare(b.full_name));

  if (q) {
    items = items.filter(
      (x) =>
        x.full_name.toLowerCase().includes(q) ||
        x.email.toLowerCase().includes(q) ||
        (x.department && x.department.toLowerCase().includes(q))
    );
  }
  if (roleFilter) {
    items = items.filter((x) => x.role === roleFilter);
  }
  if (workspaceId) {
    items = items.filter((x) => x.workspaces.some((w) => w.id === workspaceId));
  }

  const { items: paged, meta } = paginateSequence(items, page, pageSize);
  res.json({ items: paged, pagination: meta });
});

userAdminRouter.get('/users/:userId', requireAuth, (req, res, next) => {
  try {
    const ctx = req.authContext!;
    const { userId } = req.params;
    if (!['admin', 'manager'].includes(ctx.role) && ctx.user.id !== userId) {
      throw new HttpError(403, "You do not have permission to view another user's profile.");
    }

    const membership = mongoDb
      .collection('organisation_memberships')
      .find((m) => m.user_id === userId && m.organisation_id === ctx.organisation.id);
    const user = mongoDb.collection('users').find((u) => u.id === userId);
    if (!user || !membership) {
      throw new HttpError(404, 'User not found in your organisation.');
    }

    res.json(serializeOrgUser(user, membership));
  } catch (err) {
    next(err);
  }
});

userAdminRouter.patch('/users/:userId', requireRoles('admin'), (req, res, next) => {
  try {
    const ctx = req.authContext!;
    const { userId } = req.params;
    const membership = mongoDb
      .collection('organisation_memberships')
      .find((m) => m.user_id === userId && m.organisation_id === ctx.organisation.id);
    const user = mongoDb.collection('users').find((u) => u.id === userId);
    if (!user || !membership) {
      throw new HttpError(404, 'User not found in your organisation.');
    }

    const patch: Partial<UserDoc> = {};
    const changes: Record<string, unknown> = {};

    if (req.body.full_name !== undefined) {
      patch.full_name = sanitizeUserText(req.body.full_name, 140);
      changes.full_name = patch.full_name;
    }
    if (req.body.job_title !== undefined) {
      patch.job_title = sanitizeUserText(req.body.job_title, 120);
      changes.job_title = patch.job_title;
    }
    if (req.body.department !== undefined) {
      patch.department = sanitizeUserText(req.body.department, 120);
      changes.department = patch.department;
    }
    if (req.body.is_active !== undefined) {
      if (user.id === ctx.user.id && !req.body.is_active) {
        throw new HttpError(
          400,
          'Administrators cannot deactivate their own active session account.'
        );
      }
      patch.is_active = Boolean(req.body.is_active);
      changes.is_active = patch.is_active;
    }

    const updatedUser = mongoDb.updateById('users', user.id, patch)!;

    mongoDb.insert('audit_logs', {
      id: newId(),
      organisation_id: ctx.organisation.id,
      actor_user_id: ctx.user.id,
      actor_email: ctx.user.email,
      actor_role: ctx.role,
      action: 'admin.user_updated',
      target_type: 'user',
      target_id: user.id,
      status: 'success',
      ip_address: ctx.ipAddress,
      user_agent: ctx.userAgent,
      metadata_json: changes,
      created_at: utcNowIso(),
    });

    res.json(serializeOrgUser(updatedUser, membership));
  } catch (err) {
    next(err);
  }
});

userAdminRouter.get('/roles', requireAuth, (req, res) => {
  const ctx = req.authContext!;
  const roles = [...mongoDb.collection('roles')].sort((a, b) =>
    a.name.localeCompare(b.name)
  );
  const perms = [...mongoDb.collection('permissions')].sort((a, b) =>
    a.module === b.module ? a.code.localeCompare(b.code) : a.module.localeCompare(b.module)
  );

  const memberships = mongoDb
    .collection('organisation_memberships')
    .filter((m) => m.organisation_id === ctx.organisation.id);

  const roleCounts: Record<string, number> = {
    admin: memberships.filter((m) => m.role === 'admin').length,
    manager: memberships.filter((m) => m.role === 'manager').length,
    employee: memberships.filter((m) => m.role === 'employee').length,
  };

  res.json({
    roles: roles.map((r) => ({
      id: r.id,
      name: r.name,
      display_name: r.display_name,
      description: r.description,
      is_system: r.is_system,
      member_count: roleCounts[r.name] || 0,
      permissions: ROLE_PERMISSIONS_MAP[r.name] || [],
    })),
    permissions_catalog: perms.map((p) => ({
      id: p.id,
      code: p.code,
      module: p.module,
      description: p.description,
    })),
  });
});

userAdminRouter.patch('/users/:userId/role', requireRoles('admin'), (req, res, next) => {
  try {
    const ctx = req.authContext!;
    const { userId } = req.params;
    const { role } = req.body || {};

    if (!['admin', 'manager', 'employee'].includes(role)) {
      throw new HttpError(400, 'Role must be admin, manager, or employee.');
    }

    const membership = mongoDb
      .collection('organisation_memberships')
      .find((m) => m.user_id === userId && m.organisation_id === ctx.organisation.id);
    const user = mongoDb.collection('users').find((u) => u.id === userId);
    if (!user || !membership) {
      throw new HttpError(404, 'User not found in your organisation.');
    }

    if (user.id === ctx.user.id && role !== 'admin') {
      throw new HttpError(400, 'You cannot demote your own administrator role.');
    }

    const oldRole = membership.role;
    const roleObj = mongoDb.collection('roles').find((r) => r.name === role);
    const updatedMembership = mongoDb.updateById(
      'organisation_memberships',
      membership.id,
      {
        role: role as UserRole,
        role_id: roleObj?.id || null,
      }
    )!;

    const now = utcNowIso();
    mongoDb.insert('audit_logs', {
      id: newId(),
      organisation_id: ctx.organisation.id,
      actor_user_id: ctx.user.id,
      actor_email: ctx.user.email,
      actor_role: ctx.role,
      action: 'admin.role_changed',
      target_type: 'user',
      target_id: user.id,
      status: 'success',
      ip_address: ctx.ipAddress,
      user_agent: ctx.userAgent,
      metadata_json: { previous_role: oldRole, new_role: role },
      created_at: now,
    });

    mongoDb.insert('notifications', {
      id: newId(),
      organisation_id: ctx.organisation.id,
      user_id: user.id,
      title: 'Role Updated',
      message: `Your organisation role has been updated from '${oldRole}' to '${role}'.`,
      notification_type: 'security',
      link_url: '/app/profile',
      is_read: false,
      created_at: now,
    });

    res.json(serializeOrgUser(user, updatedMembership));
  } catch (err) {
    next(err);
  }
});

userAdminRouter.get('/workspaces', requireAuth, (req, res) => {
  const ctx = req.authContext!;
  const workspaces = mongoDb
    .collection('workspaces')
    .filter((w) => w.organisation_id === ctx.organisation.id)
    .sort((a, b) => a.name.localeCompare(b.name));

  const items = workspaces.map((ws) => {
    const wms = mongoDb
      .collection('workspace_memberships')
      .filter((wm) => wm.workspace_id === ws.id);
    const members = wms
      .map((wm) => {
        const u = mongoDb.collection('users').find((usr) => usr.id === wm.user_id);
        return u
          ? {
              user_id: u.id,
              full_name: u.full_name,
              email: u.email,
              department: u.department,
              workspace_role: wm.workspace_role,
            }
          : null;
      })
      .filter(Boolean);

    return {
      id: ws.id,
      organisation_id: ws.organisation_id,
      name: ws.name,
      slug: ws.slug,
      description: ws.description,
      is_member: ctx.workspaceIds.includes(ws.id) || ctx.role === 'admin',
      can_manage: ctx.role === 'admin' || ctx.managedWorkspaceIds.includes(ws.id),
      member_count: members.length,
      members,
      created_at: ws.created_at,
    };
  });

  res.json({
    organisation: {
      id: ctx.organisation.id,
      name: ctx.organisation.name,
      slug: ctx.organisation.slug,
      domain: ctx.organisation.domain,
      description: ctx.organisation.description,
    },
    items,
  });
});

userAdminRouter.post('/workspaces', requireRoles('admin'), (req, res, next) => {
  try {
    const ctx = req.authContext!;
    const { name, slug, description } = req.body || {};
    if (!name || !slug) {
      throw new HttpError(400, 'Workspace name and slug are required.');
    }

    const cleanSlug = String(slug)
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/^-+|-+$/g, '');

    const existing = mongoDb
      .collection('workspaces')
      .find((w) => w.organisation_id === ctx.organisation.id && w.slug === cleanSlug);
    if (existing) {
      throw new HttpError(
        409,
        `Workspace with slug '${cleanSlug}' already exists in your organisation.`
      );
    }

    const now = utcNowIso();
    const ws = mongoDb.insert('workspaces', {
      id: newId(),
      organisation_id: ctx.organisation.id,
      name: sanitizeUserText(name, 120),
      slug: cleanSlug,
      description: description ? sanitizeUserText(description, 500) : null,
      created_by_id: ctx.user.id,
      is_demo: false,
      created_at: now,
      updated_at: now,
    });

    mongoDb.insert('workspace_memberships', {
      id: newId(),
      workspace_id: ws.id,
      user_id: ctx.user.id,
      workspace_role: 'manager',
      added_by_id: ctx.user.id,
      created_at: now,
    });

    mongoDb.insert('audit_logs', {
      id: newId(),
      organisation_id: ctx.organisation.id,
      actor_user_id: ctx.user.id,
      actor_email: ctx.user.email,
      actor_role: ctx.role,
      action: 'workspace.created',
      target_type: 'workspace',
      target_id: ws.id,
      status: 'success',
      ip_address: ctx.ipAddress,
      user_agent: ctx.userAgent,
      metadata_json: { name: ws.name, slug: ws.slug },
      created_at: now,
    });

    res.status(201).json({
      id: ws.id,
      name: ws.name,
      slug: ws.slug,
      description: ws.description,
      created_at: ws.created_at,
    });
  } catch (err) {
    next(err);
  }
});

userAdminRouter.post(
  '/workspaces/:workspaceId/members',
  requireRoles('admin', 'manager'),
  (req, res, next) => {
    try {
      const ctx = req.authContext!;
      const { workspaceId } = req.params;
      const { user_id, workspace_role = 'member' } = req.body || {};

      const ws = mongoDb
        .collection('workspaces')
        .find((w) => w.id === workspaceId && w.organisation_id === ctx.organisation.id);
      if (!ws) {
        throw new HttpError(404, 'Workspace not found.');
      }

      if (ctx.role !== 'admin' && !ctx.managedWorkspaceIds.includes(ws.id)) {
        throw new HttpError(
          403,
          'Managers can only manage membership within their assigned workspaces.'
        );
      }

      const orgMember = mongoDb
        .collection('organisation_memberships')
        .find((m) => m.organisation_id === ctx.organisation.id && m.user_id === user_id);
      if (!orgMember) {
        throw new HttpError(404, 'Target user does not belong to your organisation.');
      }

      const existing = mongoDb
        .collection('workspace_memberships')
        .find((wm) => wm.workspace_id === ws.id && wm.user_id === user_id);

      const now = utcNowIso();
      if (existing) {
        mongoDb.updateById('workspace_memberships', existing.id, {
          workspace_role: workspace_role === 'manager' ? 'manager' : 'member',
        });
      } else {
        mongoDb.insert('workspace_memberships', {
          id: newId(),
          workspace_id: ws.id,
          user_id: String(user_id),
          workspace_role: workspace_role === 'manager' ? 'manager' : 'member',
          added_by_id: ctx.user.id,
          created_at: now,
        });
      }

      mongoDb.insert('audit_logs', {
        id: newId(),
        organisation_id: ctx.organisation.id,
        actor_user_id: ctx.user.id,
        actor_email: ctx.user.email,
        actor_role: ctx.role,
        action: 'workspace.member_added',
        target_type: 'workspace',
        target_id: ws.id,
        status: 'success',
        ip_address: ctx.ipAddress,
        user_agent: ctx.userAgent,
        metadata_json: { user_id, workspace_role },
        created_at: now,
      });

      res.status(201).json({
        message: 'Workspace membership updated.',
        workspace_id: ws.id,
      });
    } catch (err) {
      next(err);
    }
  }
);

userAdminRouter.delete(
  '/workspaces/:workspaceId/members/:userId',
  requireRoles('admin', 'manager'),
  (req, res, next) => {
    try {
      const ctx = req.authContext!;
      const { workspaceId, userId } = req.params;

      const ws = mongoDb
        .collection('workspaces')
        .find((w) => w.id === workspaceId && w.organisation_id === ctx.organisation.id);
      if (!ws) {
        throw new HttpError(404, 'Workspace not found.');
      }
      if (ctx.role !== 'admin' && !ctx.managedWorkspaceIds.includes(ws.id)) {
        throw new HttpError(403, 'You can only remove members from workspaces you manage.');
      }

      const removed = mongoDb.deleteWhere(
        'workspace_memberships',
        (wm) => wm.workspace_id === ws.id && wm.user_id === userId
      );
      if (removed === 0) {
        throw new HttpError(404, 'Member not found in workspace.');
      }

      mongoDb.insert('audit_logs', {
        id: newId(),
        organisation_id: ctx.organisation.id,
        actor_user_id: ctx.user.id,
        actor_email: ctx.user.email,
        actor_role: ctx.role,
        action: 'workspace.member_removed',
        target_type: 'workspace',
        target_id: ws.id,
        status: 'success',
        ip_address: ctx.ipAddress,
        user_agent: ctx.userAgent,
        metadata_json: { removed_user_id: userId },
        created_at: utcNowIso(),
      });

      res.json({ message: 'Member removed from workspace.' });
    } catch (err) {
      next(err);
    }
  }
);

userAdminRouter.get('/notifications', requireAuth, (req, res) => {
  const ctx = req.authContext!;
  const unreadOnly = String(req.query.unread_only || 'false') === 'true';

  const allUserNotifs = mongoDb
    .collection('notifications')
    .filter(
      (n) => n.organisation_id === ctx.organisation.id && n.user_id === ctx.user.id
    )
    .sort((a, b) => b.created_at.localeCompare(a.created_at));

  const unreadCount = allUserNotifs.filter((n) => !n.is_read).length;
  const filtered = unreadOnly ? allUserNotifs.filter((n) => !n.is_read) : allUserNotifs;

  res.json({
    unread_count: unreadCount,
    items: filtered.slice(0, 50).map((n) => ({
      id: n.id,
      title: n.title,
      message: n.message,
      notification_type: n.notification_type,
      link_url: n.link_url,
      is_read: n.is_read,
      created_at: n.created_at,
    })),
  });
});

userAdminRouter.patch('/notifications/:notificationId/read', requireAuth, (req, res, next) => {
  try {
    const ctx = req.authContext!;
    const notif = mongoDb
      .collection('notifications')
      .find(
        (n) =>
          n.id === req.params.notificationId &&
          n.user_id === ctx.user.id &&
          n.organisation_id === ctx.organisation.id
      );
    if (!notif) {
      throw new HttpError(404, 'Notification not found.');
    }
    mongoDb.updateById('notifications', notif.id, { is_read: true });
    res.json({ id: notif.id, is_read: true });
  } catch (err) {
    next(err);
  }
});

userAdminRouter.post('/notifications/read-all', requireAuth, (req, res) => {
  const ctx = req.authContext!;
  for (const n of mongoDb.collection('notifications')) {
    if (
      n.user_id === ctx.user.id &&
      n.organisation_id === ctx.organisation.id &&
      !n.is_read
    ) {
      mongoDb.updateById('notifications', n.id, { is_read: true });
    }
  }
  res.json({ message: 'All notifications marked as read.' });
});

// --- Health, Overview Dashboards, Manager Analytics & Admin Governance ---
userAdminRouter.get('/health', (_req, res) => {
  const embedder = getEmbeddingProvider();
  const mongoStatus = mongoDb.getStatus();
  const workerStatus = getWorkerStatus();
  const storageStatus = getStorageStatus();

  res.json({
    status: 'healthy',
    application: settings.APP_NAME,
    runtime: 'Node.js + Express.js',
    environment: settings.APP_ENV,
    services: {
      mongodb: mongoStatus,
      postgresql: mongoStatus,
      storage_s3: storageStatus,
      worker_queue: workerStatus,
      ai_provider: {
        llm_provider: settings.LLM_PROVIDER,
        llm_model: settings.LLM_MODEL,
        api_key_configured: Boolean(settings.LLM_API_KEY),
        extractive_grounded_fallback_enabled: settings.ALLOW_EXTRACTIVE_GROUNDED_FALLBACK,
        operational: true,
        embedding_provider: embedder.providerName,
        embedding_model: embedder.modelName,
        embedding_dimension: embedder.dimension,
      },
    },
  });
});

userAdminRouter.get('/dashboard/overview', requireAuth, (req, res) => {
  const ctx = req.authContext!;
  const days = Math.max(1, Math.min(365, Number(req.query.days || 30)));
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const accessibleDocs = getAuthorisedDocuments(ctx, { onlyReady: false });
  const accessibleDocIds = new Set(accessibleDocs.map((d) => d.id));

  const readyDocs = accessibleDocs.filter((d) => d.status === 'ready');
  const processingDocs = accessibleDocs.filter((d) =>
    ['uploaded', 'queued', 'processing'].includes(d.status)
  );
  const failedDocs = accessibleDocs.filter((d) => d.status === 'failed');

  const summariesCount = mongoDb
    .collection('document_summaries')
    .filter(
      (s) =>
        s.organisation_id === ctx.organisation.id && accessibleDocIds.has(s.document_id)
    ).length;

  const isAdmin = ctx.role === 'admin';
  const questionsAsked = mongoDb
    .collection('messages')
    .filter(
      (m) =>
        m.organisation_id === ctx.organisation.id &&
        m.role === 'user' &&
        (isAdmin || m.user_id === ctx.user.id)
    ).length;

  const feedbacks = mongoDb
    .collection('feedbacks')
    .filter(
      (f) =>
        f.organisation_id === ctx.organisation.id &&
        (isAdmin || f.user_id === ctx.user.id)
    );

  const activeUsers = isAdmin
    ? mongoDb
        .collection('organisation_memberships')
        .filter((m) => m.organisation_id === ctx.organisation.id).length
    : 1;

  const positiveFb = feedbacks.filter((f) => f.rating === 'positive').length;
  const negativeFb = feedbacks.filter((f) => f.rating === 'negative').length;
  const totalFb = feedbacks.length;
  const satisfactionRate =
    totalFb > 0 ? Number(((positiveFb / totalFb) * 100).toFixed(1)) : 100.0;

  const typeCounts = new Map<string, number>();
  const visCounts = new Map<string, number>();
  for (const d of accessibleDocs) {
    const ft = d.file_type.toUpperCase();
    typeCounts.set(ft, (typeCounts.get(ft) || 0) + 1);
    visCounts.set(d.visibility, (visCounts.get(d.visibility) || 0) + 1);
  }

  const recentConvs = mongoDb
    .collection('conversations')
    .filter((c) => c.organisation_id === ctx.organisation.id && c.user_id === ctx.user.id)
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
    .slice(0, 5);

  res.json({
    time_window_days: days,
    cutoff_date: cutoff,
    metrics: {
      total_accessible_documents: accessibleDocs.length,
      documents_ready: readyDocs.length,
      documents_processing: processingDocs.length,
      documents_failed: failedDocs.length,
      total_indexed_chunks: readyDocs.reduce((acc, d) => acc + d.chunk_count, 0),
      questions_asked: questionsAsked,
      summaries_generated: summariesCount,
      active_users_in_scope: activeUsers,
      feedback_total: totalFb,
      feedback_positive: positiveFb,
      feedback_negative: negativeFb,
      satisfaction_rate_percent: satisfactionRate,
    },
    charts: {
      documents_by_type: Array.from(typeCounts.entries()).map(([file_type, count]) => ({
        file_type,
        count,
      })),
      documents_by_visibility: Array.from(visCounts.entries()).map(
        ([visibility, count]) => ({ visibility, count })
      ),
      feedback_breakdown: [
        { name: 'Positive', value: positiveFb },
        { name: 'Negative', value: negativeFb },
      ],
    },
    recent_documents: accessibleDocs.slice(0, 6).map((d) => serializeDocument(d, ctx)),
    recent_conversations: recentConvs.map((c) => ({
      id: c.id,
      title: c.title,
      updated_at: c.updated_at,
      scoped_count: (c.scoped_document_ids_json || []).length,
    })),
  });
});

userAdminRouter.get(
  '/manager/overview',
  requireRoles('admin', 'manager'),
  (req, res) => {
    const ctx = req.authContext!;
    const workspaceIdFilter = req.query.workspace_id ? String(req.query.workspace_id) : null;

    let workspaces = mongoDb
      .collection('workspaces')
      .filter((w) => w.organisation_id === ctx.organisation.id);

    if (ctx.role !== 'admin') {
      const targetIds = new Set(
        ctx.managedWorkspaceIds.length > 0 ? ctx.managedWorkspaceIds : ctx.workspaceIds
      );
      workspaces = workspaces.filter((w) => targetIds.has(w.id));
    }
    if (workspaceIdFilter) {
      workspaces = workspaces.filter((w) => w.id === workspaceIdFilter);
    }

    const wsIds = new Set(workspaces.map((w) => w.id));
    const teamDocs = getAuthorisedDocuments(ctx, { onlyReady: false }).filter(
      (d) =>
        (d.workspace_id && wsIds.has(d.workspace_id)) ||
        (ctx.role === 'admin' && !workspaceIdFilter)
    );

    const wsMemberships = mongoDb
      .collection('workspace_memberships')
      .filter((wm) => wsIds.has(wm.workspace_id));

    const uniqueMemberIds = new Set(wsMemberships.map((wm) => wm.user_id));
    const teamQuestions = mongoDb
      .collection('messages')
      .filter(
        (m) =>
          m.organisation_id === ctx.organisation.id &&
          m.role === 'user' &&
          m.user_id &&
          uniqueMemberIds.has(m.user_id)
      ).length;

    const docsPerWorkspace = workspaces.map((ws) => {
      const wDocs = teamDocs.filter((d) => d.workspace_id === ws.id);
      const wMembers = wsMemberships.filter((m) => m.workspace_id === ws.id);
      return {
        workspace_id: ws.id,
        workspace_name: ws.name,
        slug: ws.slug,
        document_count: wDocs.length,
        ready_count: wDocs.filter((d) => d.status === 'ready').length,
        member_count: wMembers.length,
      };
    });

    const teamMembers = wsMemberships
      .map((wm) => {
        const u = mongoDb.collection('users').find((usr) => usr.id === wm.user_id);
        const w = workspaces.find((ws) => ws.id === wm.workspace_id);
        return u && w
          ? {
              user_id: u.id,
              full_name: u.full_name,
              email: u.email,
              department: u.department,
              job_title: u.job_title,
              workspace_id: w.id,
              workspace_name: w.name,
              workspace_role: wm.workspace_role,
            }
          : null;
      })
      .filter(Boolean);

    res.json({
      metrics: {
        managed_workspaces_count: workspaces.length,
        team_members_count: uniqueMemberIds.size,
        team_documents_count: teamDocs.length,
        team_ready_documents: teamDocs.filter((d) => d.status === 'ready').length,
        team_questions_asked: teamQuestions,
      },
      workspaces: docsPerWorkspace,
      team_documents: teamDocs
        .slice(0, 25)
        .map((d) => serializeDocument(d, ctx, true)),
      team_members: teamMembers,
    });
  }
);

userAdminRouter.get('/admin/dashboard', requireRoles('admin'), (req, res) => {
  const ctx = req.authContext!;
  const orgId = ctx.organisation.id;

  const allDocs = mongoDb.collection('documents').filter((d) => d.organisation_id === orgId);
  const allUsers = mongoDb
    .collection('organisation_memberships')
    .filter((m) => m.organisation_id === orgId);
  const allJobs = mongoDb
    .collection('processing_jobs')
    .filter((j) => j.organisation_id === orgId);
  const allFeedback = mongoDb
    .collection('feedbacks')
    .filter((f) => f.organisation_id === orgId);
  const recentAudits = mongoDb
    .collection('audit_logs')
    .filter((a) => a.organisation_id === orgId)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 10);

  const mongoStatus = mongoDb.getStatus();

  res.json({
    organisation: {
      id: ctx.organisation.id,
      name: ctx.organisation.name,
      slug: ctx.organisation.slug,
      is_demo: ctx.organisation.is_demo,
    },
    metrics: {
      total_users: allUsers.length,
      admin_count: allUsers.filter((u) => u.role === 'admin').length,
      manager_count: allUsers.filter((u) => u.role === 'manager').length,
      employee_count: allUsers.filter((u) => u.role === 'employee').length,
      total_documents: allDocs.length,
      ready_documents: allDocs.filter((d) => d.status === 'ready').length,
      processing_documents: allDocs.filter((d) =>
        ['processing', 'queued'].includes(d.status)
      ).length,
      failed_documents: allDocs.filter((d) => d.status === 'failed').length,
      total_chunks: mongoDb
        .collection('document_chunks')
        .filter((c) => c.organisation_id === orgId).length,
      total_conversations: mongoDb
        .collection('conversations')
        .filter((c) => c.organisation_id === orgId).length,
      total_questions: mongoDb
        .collection('messages')
        .filter((m) => m.organisation_id === orgId && m.role === 'user').length,
      total_summaries: mongoDb
        .collection('document_summaries')
        .filter((s) => s.organisation_id === orgId).length,
      total_feedback: allFeedback.length,
      positive_feedback: allFeedback.filter((f) => f.rating === 'positive').length,
      negative_feedback: allFeedback.filter((f) => f.rating === 'negative').length,
      failed_jobs_count: allJobs.filter((j) => j.status === 'failed').length,
    },
    recent_audit_logs: recentAudits.map((a) => ({
      id: a.id,
      actor_email: a.actor_email,
      actor_role: a.actor_role,
      action: a.action,
      target_type: a.target_type,
      target_id: a.target_id,
      status: a.status,
      created_at: a.created_at,
    })),
    service_status: {
      postgresql: mongoStatus,
      mongodb: mongoStatus,
      worker: getWorkerStatus(),
      storage: getStorageStatus(),
    },
  });
});

userAdminRouter.get(
  '/admin/analytics',
  requireRoles('admin', 'manager'),
  (req, res) => {
    const ctx = req.authContext!;
    const days = Math.max(1, Math.min(365, Number(req.query.days || 30)));
    const orgId = ctx.organisation.id;

    const docs = getAuthorisedDocuments(ctx, { onlyReady: false });
    const msgs = mongoDb
      .collection('messages')
      .filter((m) => m.organisation_id === orgId);
    const feedbacks = mongoDb
      .collection('feedbacks')
      .filter((f) => f.organisation_id === orgId);

    const byType = new Map<string, number>();
    const byStatus = new Map<string, number>();
    const byVisibility = new Map<string, number>();

    for (const d of docs) {
      const ft = d.file_type.toUpperCase();
      byType.set(ft, (byType.get(ft) || 0) + 1);
      byStatus.set(d.status, (byStatus.get(d.status) || 0) + 1);
      byVisibility.set(d.visibility, (byVisibility.get(d.visibility) || 0) + 1);
    }

    const assistantMsgs = msgs.filter((m) => m.role === 'assistant');
    const groundedCount = assistantMsgs.filter((m) => m.evidence_sufficient).length;
    const insufficientCount = assistantMsgs.filter((m) => !m.evidence_sufficient).length;
    const avgLatency =
      assistantMsgs.length > 0
        ? Math.round(
            assistantMsgs.reduce((acc, m) => acc + (m.latency_ms || 0), 0) /
              assistantMsgs.length
          )
        : 0;

    const posFb = feedbacks.filter((f) => f.rating === 'positive').length;
    const negFb = feedbacks.filter((f) => f.rating === 'negative').length;

    const activityByDay = new Map<
      string,
      {
        documents: number;
        questions: number;
        positive_feedback: number;
        negative_feedback: number;
      }
    >();

    const ensureDay = (iso: string) => {
      const day = iso.slice(0, 10);
      if (!activityByDay.has(day)) {
        activityByDay.set(day, {
          documents: 0,
          questions: 0,
          positive_feedback: 0,
          negative_feedback: 0,
        });
      }
      return activityByDay.get(day)!;
    };

    for (const d of docs) ensureDay(d.created_at).documents += 1;
    for (const m of msgs) {
      if (m.role === 'user') ensureDay(m.created_at).questions += 1;
    }
    for (const f of feedbacks) {
      if (f.rating === 'positive') ensureDay(f.created_at).positive_feedback += 1;
      else ensureDay(f.created_at).negative_feedback += 1;
    }

    const timeline = Array.from(activityByDay.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, vals]) => ({ date, ...vals }));

    res.json({
      days,
      summary: {
        total_documents: docs.length,
        total_storage_bytes: docs.reduce((acc, d) => acc + d.file_size_bytes, 0),
        total_chunks: docs.reduce((acc, d) => acc + d.chunk_count, 0),
        total_assistant_responses: assistantMsgs.length,
        grounded_answers_count: groundedCount,
        insufficient_evidence_count: insufficientCount,
        average_response_latency_ms: avgLatency,
        positive_feedback_count: posFb,
        negative_feedback_count: negFb,
      },
      charts: {
        documents_by_type: Array.from(byType.entries()).map(([name, count]) => ({
          name,
          count,
        })),
        documents_by_status: Array.from(byStatus.entries()).map(([name, count]) => ({
          name,
          count,
        })),
        documents_by_visibility: Array.from(byVisibility.entries()).map(
          ([name, count]) => ({ name, count })
        ),
        answer_grounding_ratio: [
          { name: 'Evidence-Grounded Answers', value: groundedCount },
          { name: 'Insufficient Evidence Refusals', value: insufficientCount },
        ],
        feedback_ratio: [
          { name: 'Positive', value: posFb },
          { name: 'Negative', value: negFb },
        ],
        activity_timeline: timeline,
      },
    });
  }
);

userAdminRouter.get('/admin/audit-logs', requireRoles('admin'), (req, res) => {
  const ctx = req.authContext!;
  const action = req.query.action ? String(req.query.action).trim().toLowerCase() : '';
  const statusFilter = req.query.status ? String(req.query.status) : '';
  const actorEmail = req.query.actor_email
    ? String(req.query.actor_email).trim().toLowerCase()
    : '';
  const targetType = req.query.target_type ? String(req.query.target_type) : '';
  const page = Number(req.query.page || 1);
  const pageSize = Number(req.query.page_size || 25);

  let logs = mongoDb
    .collection('audit_logs')
    .filter(
      (a) => a.organisation_id === ctx.organisation.id || a.organisation_id === null
    );

  if (action) logs = logs.filter((a) => a.action.toLowerCase().includes(action));
  if (statusFilter) logs = logs.filter((a) => a.status === statusFilter);
  if (actorEmail) {
    logs = logs.filter((a) => (a.actor_email || '').toLowerCase().includes(actorEmail));
  }
  if (targetType) logs = logs.filter((a) => a.target_type === targetType);

  logs.sort((a, b) => b.created_at.localeCompare(a.created_at));
  const { items: paged, meta } = paginateSequence(logs, page, pageSize);

  res.json({
    items: paged.map((a) => ({
      id: a.id,
      organisation_id: a.organisation_id,
      actor_user_id: a.actor_user_id,
      actor_email: a.actor_email,
      actor_role: a.actor_role,
      action: a.action,
      target_type: a.target_type,
      target_id: a.target_id,
      status: a.status,
      ip_address: a.ip_address,
      user_agent: a.user_agent,
      metadata: a.metadata_json || {},
      created_at: a.created_at,
    })),
    pagination: meta,
  });
});

userAdminRouter.get('/admin/jobs', requireRoles('admin'), (req, res) => {
  const ctx = req.authContext!;
  const statusFilter = req.query.status ? String(req.query.status) : '';
  const page = Number(req.query.page || 1);
  const pageSize = Number(req.query.page_size || 25);

  let jobs = mongoDb
    .collection('processing_jobs')
    .filter((j) => j.organisation_id === ctx.organisation.id);

  if (statusFilter) {
    jobs = jobs.filter((j) => j.status === statusFilter);
  }
  jobs.sort((a, b) => b.created_at.localeCompare(a.created_at));

  const { items: paged, meta } = paginateSequence(jobs, page, pageSize);
  const items = paged.map((job) => {
    const doc = mongoDb.collection('documents').find((d) => d.id === job.document_id);
    return {
      id: job.id,
      document_id: job.document_id,
      document_title: doc?.title || 'Deleted Document',
      original_filename: doc?.original_filename || '',
      file_type: doc?.file_type || 'txt',
      job_type: job.job_type,
      status: job.status,
      worker_mode: job.worker_mode,
      attempt_count: job.attempt_count,
      max_attempts: job.max_attempts,
      progress_percent: job.progress_percent,
      current_stage: job.current_stage,
      error_message: job.error_message,
      duration_ms: job.duration_ms,
      started_at: job.started_at,
      completed_at: job.completed_at,
      created_at: job.created_at,
    };
  });

  res.json({
    worker_status: getWorkerStatus(),
    items,
    pagination: meta,
  });
});

userAdminRouter.post(
  '/admin/jobs/:jobId/retry',
  requireRoles('admin'),
  async (req, res, next) => {
    try {
      const ctx = req.authContext!;
      const job = mongoDb
        .collection('processing_jobs')
        .find(
          (j) =>
            j.id === req.params.jobId && j.organisation_id === ctx.organisation.id
        );
      if (!job) {
        throw new HttpError(404, 'Processing job not found.');
      }

      const doc = mongoDb.collection('documents').find((d) => d.id === job.document_id);
      if (!doc) {
        throw new HttpError(404, 'Associated document not found.');
      }

      const nextAttempt = job.attempt_count + 1;
      mongoDb.updateById('processing_jobs', job.id, {
        attempt_count: nextAttempt,
        status: 'queued',
        progress_percent: 5,
        current_stage: 'Queued for retry',
        error_message: null,
      });

      mongoDb.updateById('documents', doc.id, {
        status: 'queued',
        processing_progress: 5,
        processing_stage: 'Queued for retry',
        processing_error: null,
      });

      mongoDb.insert('audit_logs', {
        id: newId(),
        organisation_id: ctx.organisation.id,
        actor_user_id: ctx.user.id,
        actor_email: ctx.user.email,
        actor_role: ctx.role,
        action: 'admin.job_retried',
        target_type: 'processing_job',
        target_id: job.id,
        status: 'success',
        ip_address: ctx.ipAddress,
        user_agent: ctx.userAgent,
        metadata_json: { document_id: doc.id, attempt: nextAttempt },
        created_at: utcNowIso(),
      });

      const processImmediately = String(req.query.process_immediately ?? 'true') !== 'false';
      const workerMode = await dispatchIngestionJob({
        documentId: doc.id,
        jobId: job.id,
        runSynchronously: processImmediately,
      });

      const refreshedJob = mongoDb.collection('processing_jobs').find((j) => j.id === job.id)!;
      const refreshedDoc = mongoDb.collection('documents').find((d) => d.id === doc.id)!;

      res.json({
        message: 'Job retry executed.',
        worker_mode: workerMode,
        job: {
          id: refreshedJob.id,
          document_id: doc.id,
          status: refreshedJob.status,
          attempt_count: refreshedJob.attempt_count,
          progress_percent: refreshedJob.progress_percent,
          current_stage: refreshedJob.current_stage,
          error_message: refreshedJob.error_message,
        },
        document_status: refreshedDoc.status,
      });
    } catch (err) {
      next(err);
    }
  }
);

userAdminRouter.get('/admin/system-config', requireRoles('admin'), (_req, res) => {
  const embedder = getEmbeddingProvider();
  const mongoStatus = mongoDb.getStatus();

  res.json({
    editable_settings: getRuntimeConfig(),
    environment_info: {
      app_name: settings.APP_NAME,
      app_env: settings.APP_ENV,
      backend_stack: 'Node.js + Express.js + MongoDB + BullMQ + AWS S3',
      llm_provider: settings.LLM_PROVIDER,
      llm_model: settings.LLM_MODEL,
      llm_api_key_present: Boolean(settings.LLM_API_KEY),
      embedding_provider: embedder.providerName,
      embedding_model: embedder.modelName,
      embedding_dimension: embedder.dimension,
      email_provider: settings.EMAIL_PROVIDER,
      supported_formats: ['pdf', 'docx', 'pptx', 'xlsx', 'txt'],
    },
    infrastructure_status: {
      postgresql: mongoStatus,
      mongodb: mongoStatus,
      worker: getWorkerStatus(),
      storage_s3: getStorageStatus(),
    },
  });
});

userAdminRouter.patch('/admin/system-config', requireRoles('admin'), (req, res) => {
  const ctx = req.authContext!;
  const updates = req.body || {};
  const updatedCfg = updateRuntimeConfig(updates);

  mongoDb.insert('audit_logs', {
    id: newId(),
    organisation_id: ctx.organisation.id,
    actor_user_id: ctx.user.id,
    actor_email: ctx.user.email,
    actor_role: ctx.role,
    action: 'admin.system_config_updated',
    target_type: 'system_config',
    target_id: ctx.organisation.id,
    status: 'success',
    ip_address: ctx.ipAddress,
    user_agent: ctx.userAgent,
    metadata_json: updates,
    created_at: utcNowIso(),
  });

  res.json({
    editable_settings: updatedCfg,
    message: 'System configuration updated.',
  });
});

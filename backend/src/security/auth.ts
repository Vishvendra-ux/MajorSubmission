import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import type { NextFunction, Request, Response } from 'express';
import { settings } from '../config/index.js';
import { mongoDb, newId, utcNowIso } from '../db/mongo.js';
import type {
  DocumentDoc,
  OrganisationDoc,
  OrganisationMembershipDoc,
  UserDoc,
  UserRole,
} from '../types/models.js';
import { HttpError } from '../utils/errors.js';

export const ROLE_PERMISSIONS_MAP: Record<UserRole, string[]> = {
  admin: [
    'documents:upload',
    'documents:read',
    'documents:download',
    'documents:manage',
    'documents:delete',
    'search:execute',
    'assistant:ask',
    'summaries:generate',
    'feedback:submit',
    'users:read',
    'users:manage',
    'roles:manage',
    'workspaces:manage',
    'analytics:org',
    'analytics:team',
    'audit:read',
    'jobs:manage',
    'system:config',
  ],
  manager: [
    'documents:upload',
    'documents:read',
    'documents:download',
    'documents:manage',
    'search:execute',
    'assistant:ask',
    'summaries:generate',
    'feedback:submit',
    'users:read',
    'workspaces:manage',
    'analytics:team',
  ],
  employee: [
    'documents:upload',
    'documents:read',
    'documents:download',
    'search:execute',
    'assistant:ask',
    'summaries:generate',
    'feedback:submit',
  ],
};

export function hashPassword(plain: string): string {
  return bcrypt.hashSync(plain, 10);
}

export function verifyPassword(plain: string, hashed: string): boolean {
  try {
    return bcrypt.compareSync(plain, hashed);
  } catch {
    return false;
  }
}

export function validatePasswordStrength(password: string): { ok: boolean; message: string } {
  if (!password || password.length < 8) {
    return { ok: false, message: 'Password must be at least 8 characters long.' };
  }
  if (!/[A-Z]/.test(password)) {
    return { ok: false, message: 'Password must contain at least one uppercase letter.' };
  }
  if (!/[a-z]/.test(password)) {
    return { ok: false, message: 'Password must contain at least one lowercase letter.' };
  }
  if (!/[0-9!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password)) {
    return {
      ok: false,
      message: 'Password must contain at least one digit or special character.',
    };
  }
  return { ok: true, message: 'Valid' };
}

export function hashToken(rawToken: string): string {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

export function generateSecureToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('hex');
}

export function createAccessToken(params: {
  userId: string;
  organisationId: string;
  role: UserRole;
  email: string;
}): { token: string; expiresIn: number } {
  const expiresIn = settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60;
  const token = jwt.sign(
    {
      sub: params.userId,
      org: params.organisationId,
      role: params.role,
      email: params.email,
      type: 'access',
      jti: crypto.randomUUID(),
    },
    settings.SECRET_KEY,
    { expiresIn }
  );
  return { token, expiresIn };
}

export function createRefreshToken(params: {
  userId: string;
  organisationId: string;
}): { token: string; jti: string; expiresAt: string } {
  const jti = crypto.randomUUID();
  const expiresInSeconds = settings.REFRESH_TOKEN_EXPIRE_DAYS * 24 * 60 * 60;
  const expiresAt = new Date(Date.now() + expiresInSeconds * 1000).toISOString();
  const token = jwt.sign(
    {
      sub: params.userId,
      org: params.organisationId,
      type: 'refresh',
      jti,
    },
    settings.SECRET_KEY,
    { expiresIn: expiresInSeconds }
  );
  return { token, jti, expiresAt };
}

export function createSignedDownloadToken(params: {
  userId: string;
  organisationId: string;
  documentId: string;
}): string {
  return jwt.sign(
    {
      sub: params.userId,
      org: params.organisationId,
      doc: params.documentId,
      type: 'download',
      jti: crypto.randomUUID(),
    },
    settings.SECRET_KEY,
    { expiresIn: settings.SIGNED_DOWNLOAD_TTL_SECONDS }
  );
}

export function decodeJwtToken(
  token: string,
  expectedType: 'access' | 'refresh' | 'download'
): Record<string, unknown> {
  try {
    const decoded = jwt.verify(token, settings.SECRET_KEY) as Record<string, unknown>;
    if (decoded.type !== expectedType) {
      throw new HttpError(401, `Invalid token type: expected ${expectedType}.`);
    }
    return decoded;
  } catch (err) {
    if (err instanceof HttpError) throw err;
    throw new HttpError(401, 'Invalid or expired authentication token.');
  }
}

export interface AuthContext {
  user: UserDoc;
  organisation: OrganisationDoc;
  membership: OrganisationMembershipDoc;
  role: UserRole;
  workspaceIds: string[];
  managedWorkspaceIds: string[];
  ipAddress: string | null;
  userAgent: string | null;
}

declare global {
  namespace Express {
    interface Request {
      authContext?: AuthContext;
    }
  }
}

export function resolveAuthContextFromToken(rawJwt: string, req: Request): AuthContext {
  const payload = decodeJwtToken(rawJwt, 'access');
  const userId = String(payload.sub || '');
  const orgId = String(payload.org || '');

  const user = mongoDb.collection('users').find((u) => u.id === userId);
  if (!user || !user.is_active) {
    throw new HttpError(401, 'Authenticated user account is inactive or no longer exists.');
  }

  const org = mongoDb.collection('organisations').find((o) => o.id === orgId);
  if (!org || !org.is_active) {
    throw new HttpError(401, 'Authenticated organisation is inactive or does not exist.');
  }

  const membership = mongoDb
    .collection('organisation_memberships')
    .find((m) => m.user_id === user.id && m.organisation_id === org.id);
  if (!membership) {
    throw new HttpError(403, 'User is not a member of the active organisation.');
  }

  const orgWorkspaces = new Set(
    mongoDb
      .collection('workspaces')
      .filter((w) => w.organisation_id === org.id)
      .map((w) => w.id)
  );
  const wsMemberships = mongoDb
    .collection('workspace_memberships')
    .filter((wm) => wm.user_id === user.id && orgWorkspaces.has(wm.workspace_id));

  return {
    user,
    organisation: org,
    membership,
    role: membership.role,
    workspaceIds: wsMemberships.map((w) => w.workspace_id),
    managedWorkspaceIds: wsMemberships
      .filter((w) => w.workspace_role === 'manager')
      .map((w) => w.workspace_id),
    ipAddress: req.ip || req.socket?.remoteAddress || null,
    userAgent: (req.headers['user-agent'] || '').slice(0, 250) || null,
  };
}

export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  try {
    const header = req.headers.authorization || '';
    if (!header.toLowerCase().startsWith('bearer ')) {
      throw new HttpError(401, 'Authentication required: missing Bearer token.');
    }
    const token = header.slice(7).trim();
    req.authContext = resolveAuthContextFromToken(token, req);
    next();
  } catch (err) {
    next(err);
  }
}

export function requireRoles(...allowedRoles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    requireAuth(req, res, (err?: unknown) => {
      if (err) return next(err);
      const ctx = req.authContext!;
      if (!allowedRoles.includes(ctx.role)) {
        mongoDb.insert('audit_logs', {
          id: newId(),
          organisation_id: ctx.organisation.id,
          actor_user_id: ctx.user.id,
          actor_email: ctx.user.email,
          actor_role: ctx.role,
          action: 'security.role_access_denied',
          target_type: 'endpoint',
          target_id: req.originalUrl,
          status: 'denied',
          ip_address: ctx.ipAddress,
          user_agent: ctx.userAgent,
          metadata_json: { required_roles: allowedRoles },
          created_at: utcNowIso(),
        });
        return next(
          new HttpError(
            403,
            `Insufficient role permissions. Required one of: ${allowedRoles.join(', ')}.`
          )
        );
      }
      next();
    });
  };
}

const ACCESS_LEVEL_RANK: Record<'view' | 'download' | 'manage', number> = {
  view: 1,
  download: 2,
  manage: 3,
};

export function canAccessDocument(
  ctx: AuthContext,
  doc: DocumentDoc,
  requiredLevel: 'view' | 'download' | 'manage' = 'view'
): boolean {
  if (doc.organisation_id !== ctx.organisation.id) {
    return false;
  }

  const requiredRank = ACCESS_LEVEL_RANK[requiredLevel] || 1;
  const policies = mongoDb
    .collection('document_access_policies')
    .filter((p) => p.document_id === doc.id && p.organisation_id === ctx.organisation.id);

  // 1. Explicit DENY overrides all allow rules
  for (const pol of policies) {
    if (pol.effect === 'deny') {
      if (pol.principal_type === 'user' && pol.principal_id === ctx.user.id) return false;
      if (pol.principal_type === 'role' && pol.principal_id === ctx.role) return false;
      if (pol.principal_type === 'workspace' && ctx.workspaceIds.includes(pol.principal_id)) {
        return false;
      }
    }
  }

  // 2. Admin or uploader has full access within their organisation
  if (ctx.role === 'admin' || doc.uploader_id === ctx.user.id) {
    return true;
  }

  // 3. Explicit ALLOW policies
  for (const pol of policies) {
    if (pol.effect === 'allow') {
      const polRank = ACCESS_LEVEL_RANK[pol.access_level] || 1;
      if (polRank >= requiredRank) {
        if (pol.principal_type === 'user' && pol.principal_id === ctx.user.id) return true;
        if (pol.principal_type === 'role' && pol.principal_id === ctx.role) return true;
        if (
          pol.principal_type === 'workspace' &&
          ctx.workspaceIds.includes(pol.principal_id)
        ) {
          return true;
        }
      }
    }
  }

  if (doc.visibility === 'restricted') {
    return false;
  }

  const allowedRoles = doc.allowed_roles_json?.length
    ? doc.allowed_roles_json
    : (['admin', 'manager', 'employee'] as UserRole[]);
  if (!allowedRoles.includes(ctx.role)) {
    return false;
  }

  if (
    ctx.role === 'manager' &&
    doc.workspace_id &&
    ctx.managedWorkspaceIds.includes(doc.workspace_id)
  ) {
    return true;
  }

  if (requiredLevel === 'manage') {
    return false;
  }

  if (doc.visibility === 'organisation') {
    return true;
  }

  if (doc.visibility === 'workspace') {
    return Boolean(doc.workspace_id && ctx.workspaceIds.includes(doc.workspace_id));
  }

  return false;
}

export function enforceDocumentAccess(
  ctx: AuthContext,
  doc: DocumentDoc | undefined | null,
  requiredLevel: 'view' | 'download' | 'manage' = 'view',
  documentIdHint = ''
): DocumentDoc {
  if (!doc) {
    throw new HttpError(404, 'Requested document was not found.');
  }

  if (doc.organisation_id !== ctx.organisation.id) {
    mongoDb.insert('audit_logs', {
      id: newId(),
      organisation_id: ctx.organisation.id,
      actor_user_id: ctx.user.id,
      actor_email: ctx.user.email,
      actor_role: ctx.role,
      action: 'security.cross_org_document_denied',
      target_type: 'document',
      target_id: doc.id || documentIdHint,
      status: 'denied',
      ip_address: ctx.ipAddress,
      user_agent: ctx.userAgent,
      metadata_json: { required_level: requiredLevel },
      created_at: utcNowIso(),
    });
    throw new HttpError(
      403,
      'Access denied: document belongs to another organisation boundary.'
    );
  }

  if (!canAccessDocument(ctx, doc, requiredLevel)) {
    mongoDb.insert('audit_logs', {
      id: newId(),
      organisation_id: ctx.organisation.id,
      actor_user_id: ctx.user.id,
      actor_email: ctx.user.email,
      actor_role: ctx.role,
      action: 'security.document_access_denied',
      target_type: 'document',
      target_id: doc.id,
      status: 'denied',
      ip_address: ctx.ipAddress,
      user_agent: ctx.userAgent,
      metadata_json: {
        required_level: requiredLevel,
        visibility: doc.visibility,
      },
      created_at: utcNowIso(),
    });
    throw new HttpError(
      403,
      `You do not have '${requiredLevel}' permission for this document.`
    );
  }

  return doc;
}

export function getAuthorisedDocuments(
  ctx: AuthContext,
  options: {
    onlyReady?: boolean;
    workspaceId?: string | null;
    fileType?: string | null;
    ownerId?: string | null;
    statusFilter?: string | null;
    scopedDocumentIds?: string[] | null;
  } = {}
): DocumentDoc[] {
  const scopedSet = options.scopedDocumentIds ? new Set(options.scopedDocumentIds) : null;

  return mongoDb
    .collection('documents')
    .filter((d) => {
      if (d.organisation_id !== ctx.organisation.id) return false;
      if (options.onlyReady && d.status !== 'ready') return false;
      if (!options.onlyReady && options.statusFilter && d.status !== options.statusFilter) {
        return false;
      }
      if (!options.onlyReady && !options.statusFilter && d.status === 'deleting') {
        return false;
      }
      if (options.workspaceId && d.workspace_id !== options.workspaceId) return false;
      if (options.fileType && d.file_type !== options.fileType.toLowerCase()) return false;
      if (options.ownerId && d.uploader_id !== options.ownerId) return false;
      if (scopedSet && !scopedSet.has(d.id)) return false;
      return canAccessDocument(ctx, d, 'view');
    })
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

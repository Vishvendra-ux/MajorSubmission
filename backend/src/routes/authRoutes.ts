import { Router, Request } from 'express';
import { settings } from '../config/index.js';
import { mongoDb, newId, utcNowIso } from '../db/mongo.js';
import {
  ROLE_PERMISSIONS_MAP,
  createAccessToken,
  createRefreshToken,
  decodeJwtToken,
  generateSecureToken,
  hashPassword,
  hashToken,
  requireAuth,
  validatePasswordStrength,
  verifyPassword,
} from '../security/auth.js';
import type { OrganisationDoc, UserDoc, UserRole } from '../types/models.js';
import { HttpError, sanitizeUserText } from '../utils/errors.js';

export const authRouter = Router();

export function buildUserMeResponse(user: UserDoc, org: OrganisationDoc, role: UserRole) {
  const orgWorkspaces = new Map(
    mongoDb
      .collection('workspaces')
      .filter((w) => w.organisation_id === org.id)
      .map((w) => [w.id, w])
  );
  const memberships = mongoDb
    .collection('workspace_memberships')
    .filter((wm) => wm.user_id === user.id && orgWorkspaces.has(wm.workspace_id));

  const workspaces = memberships.map((wm) => {
    const ws = orgWorkspaces.get(wm.workspace_id)!;
    return {
      id: ws.id,
      name: ws.name,
      slug: ws.slug,
      workspace_role: wm.workspace_role,
    };
  });

  return {
    id: user.id,
    email: user.email,
    full_name: user.full_name,
    job_title: user.job_title ?? null,
    department: user.department ?? null,
    is_active: user.is_active,
    is_demo: user.is_demo,
    organisation_id: org.id,
    organisation_name: org.name,
    organisation_slug: org.slug,
    role,
    permissions: ROLE_PERMISSIONS_MAP[role] || ROLE_PERMISSIONS_MAP.employee,
    workspaces,
    last_login_at: user.last_login_at ?? null,
    created_at: user.created_at,
  };
}

function issueSessionTokens(
  req: Request,
  user: UserDoc,
  org: OrganisationDoc,
  role: UserRole
) {
  const { token: accessToken, expiresIn } = createAccessToken({
    userId: user.id,
    organisationId: org.id,
    role,
    email: user.email,
  });
  const { token: refreshToken, jti, expiresAt } = createRefreshToken({
    userId: user.id,
    organisationId: org.id,
  });

  const now = utcNowIso();
  mongoDb.insert('refresh_sessions', {
    id: newId(),
    user_id: user.id,
    organisation_id: org.id,
    token_jti: jti,
    token_hash: hashToken(refreshToken),
    ip_address: req.ip || null,
    user_agent: (req.headers['user-agent'] || '').slice(0, 250) || null,
    is_revoked: false,
    revoked_at: null,
    expires_at: expiresAt,
    created_at: now,
  });

  const updatedUser = mongoDb.updateById('users', user.id, {
    last_login_at: now,
  })!;

  return {
    access_token: accessToken,
    refresh_token: refreshToken,
    token_type: 'bearer',
    expires_in: expiresIn,
    user: buildUserMeResponse(updatedUser, org, role),
  };
}

authRouter.post('/register', (req, res, next) => {
  try {
    const {
      email,
      full_name,
      password,
      organisation_name,
      organisation_slug,
      job_title,
      department,
    } = req.body || {};

    if (!email || !full_name || !password) {
      throw new HttpError(400, 'Email, full name, and password are required.');
    }

    const strength = validatePasswordStrength(String(password));
    if (!strength.ok) {
      throw new HttpError(400, strength.message);
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const existing = mongoDb.collection('users').find((u) => u.email === normalizedEmail);
    if (existing) {
      throw new HttpError(
        409,
        'Unable to complete registration with the provided details.'
      );
    }

    const now = utcNowIso();
    let org: OrganisationDoc | undefined;
    let assignedRole: UserRole = 'employee';

    if (organisation_slug && String(organisation_slug).trim()) {
      const slug = String(organisation_slug)
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '-')
        .replace(/^-+|-+$/g, '');
      org = mongoDb.collection('organisations').find((o) => o.slug === slug);
    }

    if (!org && organisation_name && String(organisation_name).trim()) {
      const slugBase =
        String(organisation_name)
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '')
          .slice(0, 80) || 'enterprise-org';
      let slug = slugBase;
      let counter = 1;
      while (mongoDb.collection('organisations').some((o) => o.slug === slug)) {
        counter += 1;
        slug = `${slugBase}-${counter}`;
      }

      org = mongoDb.insert('organisations', {
        id: newId(),
        name: sanitizeUserText(organisation_name, 160),
        slug,
        domain: null,
        description: 'Organisation workspace created on SUMIND-IQ.',
        is_active: true,
        is_demo: false,
        created_at: now,
        updated_at: now,
      });

      assignedRole = 'admin';
      mongoDb.insert('workspaces', {
        id: newId(),
        organisation_id: org.id,
        name: 'General Knowledge Base',
        slug: 'general',
        description: 'Default organisation-wide knowledge workspace.',
        created_by_id: null,
        is_demo: false,
        created_at: now,
        updated_at: now,
      });
    } else if (!org) {
      org = [...mongoDb.collection('organisations')].sort((a, b) =>
        a.created_at.localeCompare(b.created_at)
      )[0];
      if (!org) {
        org = mongoDb.insert('organisations', {
          id: newId(),
          name: 'Apex Global Technologies',
          slug: 'apex-global',
          domain: 'sumind-iq.demo',
          description: 'Primary Enterprise Knowledge Workspace',
          is_active: true,
          is_demo: false,
          created_at: now,
          updated_at: now,
        });
      }
    }

    const roleObj = mongoDb.collection('roles').find((r) => r.name === assignedRole);
    const user = mongoDb.insert('users', {
      id: newId(),
      email: normalizedEmail,
      full_name: sanitizeUserText(full_name, 140),
      password_hash: hashPassword(String(password)),
      job_title: sanitizeUserText(job_title || 'Knowledge Member', 120),
      department: sanitizeUserText(department || 'Operations', 120),
      is_active: true,
      is_demo: false,
      last_login_at: now,
      created_at: now,
      updated_at: now,
    });

    mongoDb.insert('organisation_memberships', {
      id: newId(),
      organisation_id: org.id,
      user_id: user.id,
      role: assignedRole,
      role_id: roleObj?.id || null,
      is_default: true,
      joined_at: now,
    });

    const firstWs = mongoDb
      .collection('workspaces')
      .filter((w) => w.organisation_id === org!.id)
      .sort((a, b) => a.created_at.localeCompare(b.created_at))[0];

    if (firstWs) {
      mongoDb.insert('workspace_memberships', {
        id: newId(),
        workspace_id: firstWs.id,
        user_id: user.id,
        workspace_role: assignedRole === 'admin' ? 'manager' : 'member',
        added_by_id: user.id,
        created_at: now,
      });
    }

    mongoDb.insert('audit_logs', {
      id: newId(),
      organisation_id: org.id,
      actor_user_id: user.id,
      actor_email: user.email,
      actor_role: assignedRole,
      action: 'auth.register',
      target_type: 'user',
      target_id: user.id,
      status: 'success',
      ip_address: req.ip || null,
      user_agent: (req.headers['user-agent'] || '').slice(0, 250) || null,
      metadata_json: { organisation_slug: org.slug, role: assignedRole },
      created_at: now,
    });

    res.status(201).json(issueSessionTokens(req, user, org, assignedRole));
  } catch (err) {
    next(err);
  }
});

authRouter.post('/login', (req, res, next) => {
  try {
    const { email, password, organisation_slug } = req.body || {};
    if (!email || !password) {
      throw new HttpError(400, 'Email and password are required.');
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const user = mongoDb.collection('users').find((u) => u.email === normalizedEmail);

    if (!user || !verifyPassword(String(password), user.password_hash)) {
      mongoDb.insert('audit_logs', {
        id: newId(),
        organisation_id: null,
        actor_user_id: user?.id || null,
        actor_email: normalizedEmail,
        actor_role: null,
        action: 'auth.login_failed',
        target_type: 'user',
        target_id: user?.id || null,
        status: 'failure',
        ip_address: req.ip || null,
        user_agent: (req.headers['user-agent'] || '').slice(0, 250) || null,
        metadata_json: { reason: 'invalid_credentials' },
        created_at: utcNowIso(),
      });
      throw new HttpError(401, 'Invalid email or password credentials.');
    }

    if (!user.is_active) {
      throw new HttpError(403, 'Your account has been deactivated by an administrator.');
    }

    const memberships = mongoDb
      .collection('organisation_memberships')
      .filter((m) => m.user_id === user.id)
      .sort((a, b) => Number(b.is_default) - Number(a.is_default));

    let chosenMembership = memberships[0];
    let chosenOrg: OrganisationDoc | undefined;

    for (const m of memberships) {
      const org = mongoDb
        .collection('organisations')
        .find((o) => o.id === m.organisation_id && o.is_active);
      if (!org) continue;
      if (
        organisation_slug &&
        org.slug !== String(organisation_slug).trim().toLowerCase()
      ) {
        continue;
      }
      chosenMembership = m;
      chosenOrg = org;
      break;
    }

    if (!chosenMembership || !chosenOrg) {
      throw new HttpError(403, 'No active organisation membership found for this account.');
    }

    mongoDb.insert('audit_logs', {
      id: newId(),
      organisation_id: chosenOrg.id,
      actor_user_id: user.id,
      actor_email: user.email,
      actor_role: chosenMembership.role,
      action: 'auth.login_success',
      target_type: 'user',
      target_id: user.id,
      status: 'success',
      ip_address: req.ip || null,
      user_agent: (req.headers['user-agent'] || '').slice(0, 250) || null,
      metadata_json: { organisation_slug: chosenOrg.slug },
      created_at: utcNowIso(),
    });

    res.json(issueSessionTokens(req, user, chosenOrg, chosenMembership.role));
  } catch (err) {
    next(err);
  }
});

authRouter.post('/refresh', (req, res, next) => {
  try {
    const { refresh_token } = req.body || {};
    if (!refresh_token) {
      throw new HttpError(400, 'refresh_token is required.');
    }
    const decoded = decodeJwtToken(String(refresh_token), 'refresh');
    const jti = String(decoded.jti || '');
    const userId = String(decoded.sub || '');
    const orgId = String(decoded.org || '');

    const sessionRec = mongoDb
      .collection('refresh_sessions')
      .find(
        (s) =>
          s.token_jti === jti &&
          s.user_id === userId &&
          !s.is_revoked &&
          s.token_hash === hashToken(String(refresh_token))
      );

    if (!sessionRec) {
      throw new HttpError(401, 'Refresh session is invalid or has been revoked.');
    }

    mongoDb.updateById('refresh_sessions', sessionRec.id, {
      is_revoked: true,
      revoked_at: utcNowIso(),
    });

    const user = mongoDb.collection('users').find((u) => u.id === userId && u.is_active);
    const org = mongoDb.collection('organisations').find((o) => o.id === orgId && o.is_active);
    const membership = mongoDb
      .collection('organisation_memberships')
      .find((m) => m.user_id === userId && m.organisation_id === orgId);

    if (!user || !org || !membership) {
      throw new HttpError(401, 'User or organisation membership is no longer active.');
    }

    res.json(issueSessionTokens(req, user, org, membership.role));
  } catch (err) {
    next(err);
  }
});

authRouter.post('/logout', requireAuth, (req, res) => {
  const ctx = req.authContext!;
  const { refresh_token } = req.body || {};
  const now = utcNowIso();

  if (refresh_token) {
    const th = hashToken(String(refresh_token));
    const rec = mongoDb
      .collection('refresh_sessions')
      .find((s) => s.user_id === ctx.user.id && s.token_hash === th);
    if (rec) {
      mongoDb.updateById('refresh_sessions', rec.id, {
        is_revoked: true,
        revoked_at: now,
      });
    }
  } else {
    for (const s of mongoDb.collection('refresh_sessions')) {
      if (
        s.user_id === ctx.user.id &&
        s.organisation_id === ctx.organisation.id &&
        !s.is_revoked
      ) {
        mongoDb.updateById('refresh_sessions', s.id, {
          is_revoked: true,
          revoked_at: now,
        });
      }
    }
  }

  mongoDb.insert('audit_logs', {
    id: newId(),
    organisation_id: ctx.organisation.id,
    actor_user_id: ctx.user.id,
    actor_email: ctx.user.email,
    actor_role: ctx.role,
    action: 'auth.logout',
    target_type: 'session',
    target_id: ctx.user.id,
    status: 'success',
    ip_address: ctx.ipAddress,
    user_agent: ctx.userAgent,
    metadata_json: {},
    created_at: now,
  });

  res.json({ message: 'Signed out and revoked active session token.' });
});

authRouter.post('/forgot-password', (req, res, next) => {
  try {
    const { email } = req.body || {};
    const normalizedEmail = String(email || '').trim().toLowerCase();
    const user = mongoDb
      .collection('users')
      .find((u) => u.email === normalizedEmail && u.is_active);

    let devResetToken: string | undefined;
    if (user) {
      const rawToken = generateSecureToken(32);
      const expiresAt = new Date(
        Date.now() + settings.PASSWORD_RESET_EXPIRE_MINUTES * 60 * 1000
      ).toISOString();

      mongoDb.insert('password_resets', {
        id: newId(),
        user_id: user.id,
        token_hash: hashToken(rawToken),
        is_used: false,
        used_at: null,
        expires_at: expiresAt,
        created_at: utcNowIso(),
      });

      mongoDb.insert('audit_logs', {
        id: newId(),
        organisation_id: null,
        actor_user_id: user.id,
        actor_email: user.email,
        actor_role: null,
        action: 'auth.password_reset_requested',
        target_type: 'user',
        target_id: user.id,
        status: 'success',
        ip_address: req.ip || null,
        user_agent: null,
        metadata_json: { email_provider: settings.EMAIL_PROVIDER },
        created_at: utcNowIso(),
      });

      if (settings.EMAIL_PROVIDER === 'console_dev' && settings.APP_ENV !== 'production') {
        devResetToken = rawToken;
      }
    }

    res.json({
      message:
        'If an active account matches that email address, password reset instructions have been dispatched.',
      email_provider_mode: settings.EMAIL_PROVIDER,
      ...(devResetToken ? { dev_mode_reset_token: devResetToken } : {}),
    });
  } catch (err) {
    next(err);
  }
});

authRouter.post('/reset-password', (req, res, next) => {
  try {
    const { token, new_password } = req.body || {};
    if (!token || !new_password) {
      throw new HttpError(400, 'Reset token and new password are required.');
    }

    const strength = validatePasswordStrength(String(new_password));
    if (!strength.ok) {
      throw new HttpError(400, strength.message);
    }

    const tHash = hashToken(String(token).trim());
    const rec = mongoDb
      .collection('password_resets')
      .find((r) => r.token_hash === tHash && !r.is_used);

    if (!rec) {
      throw new HttpError(400, 'Invalid or expired password reset token.');
    }
    if (new Date(rec.expires_at).getTime() < Date.now()) {
      throw new HttpError(400, 'Password reset token has expired.');
    }

    const user = mongoDb
      .collection('users')
      .find((u) => u.id === rec.user_id && u.is_active);
    if (!user) {
      throw new HttpError(400, 'Invalid password reset request.');
    }

    const now = utcNowIso();
    mongoDb.updateById('users', user.id, {
      password_hash: hashPassword(String(new_password)),
    });
    mongoDb.updateById('password_resets', rec.id, {
      is_used: true,
      used_at: now,
    });

    for (const s of mongoDb.collection('refresh_sessions')) {
      if (s.user_id === user.id && !s.is_revoked) {
        mongoDb.updateById('refresh_sessions', s.id, {
          is_revoked: true,
          revoked_at: now,
        });
      }
    }

    mongoDb.insert('audit_logs', {
      id: newId(),
      organisation_id: null,
      actor_user_id: user.id,
      actor_email: user.email,
      actor_role: null,
      action: 'auth.password_reset_completed',
      target_type: 'user',
      target_id: user.id,
      status: 'success',
      ip_address: req.ip || null,
      user_agent: null,
      metadata_json: {},
      created_at: now,
    });

    res.json({ message: 'Password has been reset successfully. You may now sign in.' });
  } catch (err) {
    next(err);
  }
});

authRouter.get('/me', requireAuth, (req, res) => {
  const ctx = req.authContext!;
  res.json(buildUserMeResponse(ctx.user, ctx.organisation, ctx.role));
});

authRouter.patch('/me', requireAuth, (req, res, next) => {
  try {
    const ctx = req.authContext!;
    const { full_name, job_title, department, current_password, new_password } = req.body || {};

    const patch: Partial<UserDoc> = {};
    if (full_name !== undefined) patch.full_name = sanitizeUserText(full_name, 140);
    if (job_title !== undefined) patch.job_title = sanitizeUserText(job_title, 120);
    if (department !== undefined) patch.department = sanitizeUserText(department, 120);

    if (new_password) {
      if (
        !current_password ||
        !verifyPassword(String(current_password), ctx.user.password_hash)
      ) {
        throw new HttpError(400, 'Current password is incorrect.');
      }
      const strength = validatePasswordStrength(String(new_password));
      if (!strength.ok) {
        throw new HttpError(400, strength.message);
      }
      patch.password_hash = hashPassword(String(new_password));
    }

    const updatedUser = mongoDb.updateById('users', ctx.user.id, patch)!;

    mongoDb.insert('audit_logs', {
      id: newId(),
      organisation_id: ctx.organisation.id,
      actor_user_id: ctx.user.id,
      actor_email: ctx.user.email,
      actor_role: ctx.role,
      action: 'user.profile_updated',
      target_type: 'user',
      target_id: ctx.user.id,
      status: 'success',
      ip_address: ctx.ipAddress,
      user_agent: ctx.userAgent,
      metadata_json: { password_changed: Boolean(new_password) },
      created_at: utcNowIso(),
    });

    res.json(buildUserMeResponse(updatedUser, ctx.organisation, ctx.role));
  } catch (err) {
    next(err);
  }
});

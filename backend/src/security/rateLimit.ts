import type { NextFunction, Request, Response } from 'express';
import { getRuntimeConfig } from '../config/index.js';
import { HttpError } from '../utils/errors.js';

interface BucketEntry {
  timestamps: number[];
}

const WINDOW_MS = 60 * 1000;
const authBuckets = new Map<string, BucketEntry>();
const apiBuckets = new Map<string, BucketEntry>();

function checkBucket(
  store: Map<string, BucketEntry>,
  key: string,
  limit: number
): { allowed: boolean; remaining: number; retryAfterSeconds: number } {
  const now = Date.now();
  const cutoff = now - WINDOW_MS;
  const entry = store.get(key) || { timestamps: [] };
  entry.timestamps = entry.timestamps.filter((t) => t > cutoff);

  if (entry.timestamps.length >= limit) {
    const oldest = entry.timestamps[0] || now;
    const retryAfterSeconds = Math.max(1, Math.ceil((oldest + WINDOW_MS - now) / 1000));
    store.set(key, entry);
    return { allowed: false, remaining: 0, retryAfterSeconds };
  }

  entry.timestamps.push(now);
  store.set(key, entry);
  return {
    allowed: true,
    remaining: Math.max(0, limit - entry.timestamps.length),
    retryAfterSeconds: 0,
  };
}

function getClientKey(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0].trim();
  }
  return req.ip || req.socket?.remoteAddress || '127.0.0.1';
}

export function authRateLimiter(req: Request, res: Response, next: NextFunction): void {
  const limit = getRuntimeConfig().auth_rate_limit_per_minute;
  const key = `auth:${getClientKey(req)}`;
  const { allowed, remaining, retryAfterSeconds } = checkBucket(authBuckets, key, limit);
  res.setHeader('X-RateLimit-Limit', String(limit));
  res.setHeader('X-RateLimit-Remaining', String(remaining));

  if (!allowed) {
    res.setHeader('Retry-After', String(retryAfterSeconds));
    next(
      new HttpError(
        429,
        `Too many authentication attempts. Please retry after ${retryAfterSeconds} seconds.`,
        'RATE_LIMIT_EXCEEDED',
        { retry_after_seconds: retryAfterSeconds }
      )
    );
    return;
  }
  next();
}

export function apiRateLimiter(req: Request, res: Response, next: NextFunction): void {
  const limit = getRuntimeConfig().api_rate_limit_per_minute;
  const key = `api:${getClientKey(req)}`;
  const { allowed, remaining, retryAfterSeconds } = checkBucket(apiBuckets, key, limit);
  res.setHeader('X-RateLimit-Limit', String(limit));
  res.setHeader('X-RateLimit-Remaining', String(remaining));

  if (!allowed) {
    res.setHeader('Retry-After', String(retryAfterSeconds));
    next(
      new HttpError(
        429,
        `API rate limit exceeded (${limit} requests/min). Please retry after ${retryAfterSeconds} seconds.`,
        'RATE_LIMIT_EXCEEDED',
        { retry_after_seconds: retryAfterSeconds }
      )
    );
    return;
  }
  next();
}

export function resetRateLimitersForTesting(): void {
  authBuckets.clear();
  apiBuckets.clear();
}

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { settings } from '../config/index.js';

export interface StoredFileDescriptor {
  storageFilename: string;
  storagePath: string;
  storageBackend: 's3' | 'local';
  s3Bucket: string | null;
  s3Key: string | null;
}

function isS3Configured(): boolean {
  return Boolean(
    settings.AWS_ACCESS_KEY_ID &&
      settings.AWS_SECRET_ACCESS_KEY &&
      settings.AWS_S3_BUCKET
  );
}

let s3ClientInstance: S3Client | null = null;

function getS3Client(): S3Client | null {
  if (!isS3Configured()) return null;
  if (!s3ClientInstance) {
    s3ClientInstance = new S3Client({
      region: settings.AWS_REGION,
      ...(settings.AWS_S3_ENDPOINT ? { endpoint: settings.AWS_S3_ENDPOINT } : {}),
      credentials: {
        accessKeyId: settings.AWS_ACCESS_KEY_ID,
        secretAccessKey: settings.AWS_SECRET_ACCESS_KEY,
      },
    });
  }
  return s3ClientInstance;
}

export function computeSha256(buffer: Buffer): string {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

export async function saveUploadedFile(params: {
  organisationId: string;
  originalFilename: string;
  fileExt: string;
  mimeType: string;
  content: Buffer;
}): Promise<StoredFileDescriptor> {
  const uniqueId = crypto.randomUUID().replace(/-/g, '').slice(0, 16);
  const safeBase = path
    .basename(params.originalFilename, path.extname(params.originalFilename))
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, 60);
  const storageFilename = `${uniqueId}_${safeBase}.${params.fileExt}`;
  const s3Key = `organisations/${params.organisationId}/${storageFilename}`;

  // Always write a local copy for low-latency PDF.js / Mammoth.js / SheetJS / Tesseract.js processing
  const orgDir = path.join(settings.STORAGE_DIR, params.organisationId);
  fs.mkdirSync(orgDir, { recursive: true });
  const localPath = path.join(orgDir, storageFilename);
  fs.writeFileSync(localPath, params.content);

  const s3 = getS3Client();
  if (s3) {
    try {
      await s3.send(
        new PutObjectCommand({
          Bucket: settings.AWS_S3_BUCKET,
          Key: s3Key,
          Body: params.content,
          ContentType: params.mimeType,
        })
      );
      return {
        storageFilename,
        storagePath: localPath,
        storageBackend: 's3',
        s3Bucket: settings.AWS_S3_BUCKET,
        s3Key,
      };
    } catch {
      // Fallback gracefully to local storage if S3 bucket is unreachable
    }
  }

  return {
    storageFilename,
    storagePath: localPath,
    storageBackend: 'local',
    s3Bucket: null,
    s3Key: null,
  };
}

export async function getPresignedS3UrlIfAvailable(params: {
  s3Bucket?: string | null;
  s3Key?: string | null;
  originalFilename: string;
}): Promise<string | null> {
  const s3 = getS3Client();
  if (!s3 || !params.s3Bucket || !params.s3Key) return null;
  try {
    const cmd = new GetObjectCommand({
      Bucket: params.s3Bucket,
      Key: params.s3Key,
      ResponseContentDisposition: `attachment; filename="${params.originalFilename}"`,
    });
    return await getSignedUrl(s3, cmd, {
      expiresIn: settings.SIGNED_DOWNLOAD_TTL_SECONDS,
    });
  } catch {
    return null;
  }
}

export async function deleteStoredFile(params: {
  storagePath: string;
  s3Bucket?: string | null;
  s3Key?: string | null;
}): Promise<void> {
  try {
    if (params.storagePath && fs.existsSync(params.storagePath)) {
      fs.unlinkSync(params.storagePath);
    }
  } catch {
    // Ignore missing file on cleanup
  }

  const s3 = getS3Client();
  if (s3 && params.s3Bucket && params.s3Key) {
    try {
      await s3.send(
        new DeleteObjectCommand({
          Bucket: params.s3Bucket,
          Key: params.s3Key,
        })
      );
    } catch {
      // Ignore S3 cleanup error
    }
  }
}

export function getStorageStatus(): Record<string, unknown> {
  const configured = isS3Configured();
  return {
    provider: configured ? 'aws_s3' : 'aws_s3_local_fallback',
    mode: configured ? `AWS S3 (${settings.AWS_S3_BUCKET})` : 'Local Private Storage Fallback',
    s3_bucket: settings.AWS_S3_BUCKET,
    aws_region: settings.AWS_REGION,
    s3_credentials_configured: configured,
    using_dev_fallback: !configured,
    fallback_reason: configured
      ? null
      : 'AWS S3 credentials not set in .env; storing files privately on local disk with signed download tokens.',
    local_cache_dir: settings.STORAGE_DIR,
    operational: true,
  };
}

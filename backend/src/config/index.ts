import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export const BACKEND_ROOT = path.resolve(__dirname, '../..');

dotenv.config({ path: path.join(BACKEND_ROOT, '.env') });
dotenv.config({ path: path.resolve(BACKEND_ROOT, '../.env') });

export interface AppSettings {
  APP_NAME: string;
  APP_ENV: string;
  APP_DEBUG: boolean;
  PORT: number;
  API_V1_PREFIX: string;
  SECRET_KEY: string;
  ACCESS_TOKEN_EXPIRE_MINUTES: number;
  REFRESH_TOKEN_EXPIRE_DAYS: number;
  PASSWORD_RESET_EXPIRE_MINUTES: number;
  ALLOWED_ORIGINS: string;
  FRONTEND_BASE_URL: string;

  // MongoDB & MongoDB Atlas Vector Search
  MONGODB_URI: string;
  MONGODB_DB_NAME: string;
  MONGODB_VECTOR_INDEX_NAME: string;
  ALLOW_LOCAL_MONGO_FALLBACK: boolean;
  LOCAL_MONGO_STORE_PATH: string;

  // AWS S3 File Storage (with local disk fallback)
  AWS_REGION: string;
  AWS_S3_BUCKET: string;
  AWS_ACCESS_KEY_ID: string;
  AWS_SECRET_ACCESS_KEY: string;
  AWS_S3_ENDPOINT: string;
  STORAGE_DIR: string;
  MAX_UPLOAD_SIZE_MB: number;
  SIGNED_DOWNLOAD_TTL_SECONDS: number;

  // BullMQ + Redis Queue
  REDIS_URL: string;
  BULLMQ_QUEUE_NAME: string;
  ALLOW_IN_PROCESS_WORKER_FALLBACK: boolean;

  // Document Processing & OCR
  CHUNK_SIZE_CHARS: number;
  CHUNK_OVERLAP_CHARS: number;
  OCR_ENABLED: boolean;

  // AI Integration (LLM API + JavaScript Embedding SDK/API)
  LLM_PROVIDER: string;
  LLM_API_KEY: string;
  LLM_MODEL: string;
  LLM_BASE_URL: string;
  LLM_TIMEOUT_SECONDS: number;
  ALLOW_EXTRACTIVE_GROUNDED_FALLBACK: boolean;

  EMBEDDING_PROVIDER: string;
  EMBEDDING_API_KEY: string;
  EMBEDDING_MODEL: string;
  EMBEDDING_DIMENSION: number;
  RAG_TOP_K: number;
  RAG_MIN_SIMILARITY_SCORE: number;

  // Email & Security
  EMAIL_PROVIDER: string;
  AUTH_RATE_LIMIT_PER_MINUTE: number;
  API_RATE_LIMIT_PER_MINUTE: number;
  CONVERSATION_RETENTION_DAYS: number;
}

export const settings: AppSettings = {
  APP_NAME: process.env.APP_NAME || 'SUMIND-IQ',
  APP_ENV: process.env.APP_ENV || process.env.NODE_ENV || 'development',
  APP_DEBUG: process.env.APP_DEBUG === 'true',
  PORT: Number(process.env.PORT || 8000),
  API_V1_PREFIX: process.env.API_V1_PREFIX || '/api/v1',
  SECRET_KEY:
    process.env.SECRET_KEY ||
    'sumind-iq-dev-only-secret-key-change-in-production-9f8e7d6c5b4a3210',
  ACCESS_TOKEN_EXPIRE_MINUTES: Number(process.env.ACCESS_TOKEN_EXPIRE_MINUTES || 60),
  REFRESH_TOKEN_EXPIRE_DAYS: Number(process.env.REFRESH_TOKEN_EXPIRE_DAYS || 7),
  PASSWORD_RESET_EXPIRE_MINUTES: Number(process.env.PASSWORD_RESET_EXPIRE_MINUTES || 30),
  ALLOWED_ORIGINS:
    process.env.ALLOWED_ORIGINS ||
    'http://localhost:5173,http://127.0.0.1:5173,http://localhost:4173,http://localhost:3000',
  FRONTEND_BASE_URL: process.env.FRONTEND_BASE_URL || 'http://localhost:5173',

  MONGODB_URI: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017',
  MONGODB_DB_NAME: process.env.MONGODB_DB_NAME || 'sumindiq_db',
  MONGODB_VECTOR_INDEX_NAME: process.env.MONGODB_VECTOR_INDEX_NAME || 'chunk_vector_index',
  ALLOW_LOCAL_MONGO_FALLBACK: process.env.ALLOW_LOCAL_MONGO_FALLBACK !== 'false',
  LOCAL_MONGO_STORE_PATH:
    process.env.LOCAL_MONGO_STORE_PATH || path.join(BACKEND_ROOT, 'data', 'mongodb_store.json'),

  AWS_REGION: process.env.AWS_REGION || 'ap-south-1',
  AWS_S3_BUCKET: process.env.AWS_S3_BUCKET || 'sumind-iq-documents',
  AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID || '',
  AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY || '',
  AWS_S3_ENDPOINT: process.env.AWS_S3_ENDPOINT || '',
  STORAGE_DIR: process.env.STORAGE_DIR || path.join(BACKEND_ROOT, 'storage', 'documents'),
  MAX_UPLOAD_SIZE_MB: Number(process.env.MAX_UPLOAD_SIZE_MB || 25),
  SIGNED_DOWNLOAD_TTL_SECONDS: Number(process.env.SIGNED_DOWNLOAD_TTL_SECONDS || 300),

  REDIS_URL: process.env.REDIS_URL || 'redis://127.0.0.1:6379/0',
  BULLMQ_QUEUE_NAME: process.env.BULLMQ_QUEUE_NAME || 'sumindiq-ingestion-queue',
  ALLOW_IN_PROCESS_WORKER_FALLBACK: process.env.ALLOW_IN_PROCESS_WORKER_FALLBACK !== 'false',

  CHUNK_SIZE_CHARS: Number(process.env.CHUNK_SIZE_CHARS || 1000),
  CHUNK_OVERLAP_CHARS: Number(process.env.CHUNK_OVERLAP_CHARS || 200),
  OCR_ENABLED: process.env.OCR_ENABLED !== 'false',

  LLM_PROVIDER: process.env.LLM_PROVIDER || 'gemini',
  LLM_API_KEY: process.env.LLM_API_KEY || process.env.GEMINI_API_KEY || '',
  LLM_MODEL: process.env.LLM_MODEL || 'gemini-2.5-flash',
  LLM_BASE_URL:
    process.env.LLM_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta',
  LLM_TIMEOUT_SECONDS: Number(process.env.LLM_TIMEOUT_SECONDS || 45),
  ALLOW_EXTRACTIVE_GROUNDED_FALLBACK:
    process.env.ALLOW_EXTRACTIVE_GROUNDED_FALLBACK !== 'false',

  EMBEDDING_PROVIDER: process.env.EMBEDDING_PROVIDER || 'js_semantic_sdk',
  EMBEDDING_API_KEY: process.env.EMBEDDING_API_KEY || process.env.GEMINI_API_KEY || '',
  EMBEDDING_MODEL: process.env.EMBEDDING_MODEL || 'text-embedding-004',
  EMBEDDING_DIMENSION: Number(process.env.EMBEDDING_DIMENSION || 384),
  RAG_TOP_K: Number(process.env.RAG_TOP_K || 6),
  RAG_MIN_SIMILARITY_SCORE: Number(process.env.RAG_MIN_SIMILARITY_SCORE || 0.15),

  EMAIL_PROVIDER: process.env.EMAIL_PROVIDER || 'console_dev',
  AUTH_RATE_LIMIT_PER_MINUTE: Number(process.env.AUTH_RATE_LIMIT_PER_MINUTE || 35),
  API_RATE_LIMIT_PER_MINUTE: Number(process.env.API_RATE_LIMIT_PER_MINUTE || 240),
  CONVERSATION_RETENTION_DAYS: Number(process.env.CONVERSATION_RETENTION_DAYS || 365),
};

export function getCorsOrigins(): string[] {
  return settings.ALLOWED_ORIGINS.split(',')
    .map((o) => o.trim())
    .filter(Boolean);
}

export interface RuntimeSystemConfig {
  max_upload_size_mb: number;
  chunk_size_chars: number;
  chunk_overlap_chars: number;
  rag_top_k: number;
  rag_min_similarity_score: number;
  ocr_enabled: boolean;
  conversation_retention_days: number;
  allow_extractive_grounded_fallback: boolean;
  auth_rate_limit_per_minute: number;
  api_rate_limit_per_minute: number;
}

const runtimeOverrides: Partial<RuntimeSystemConfig> = {};

export function getRuntimeConfig(): RuntimeSystemConfig {
  return {
    max_upload_size_mb: settings.MAX_UPLOAD_SIZE_MB,
    chunk_size_chars: settings.CHUNK_SIZE_CHARS,
    chunk_overlap_chars: settings.CHUNK_OVERLAP_CHARS,
    rag_top_k: settings.RAG_TOP_K,
    rag_min_similarity_score: settings.RAG_MIN_SIMILARITY_SCORE,
    ocr_enabled: settings.OCR_ENABLED,
    conversation_retention_days: settings.CONVERSATION_RETENTION_DAYS,
    allow_extractive_grounded_fallback: settings.ALLOW_EXTRACTIVE_GROUNDED_FALLBACK,
    auth_rate_limit_per_minute: settings.AUTH_RATE_LIMIT_PER_MINUTE,
    api_rate_limit_per_minute: settings.API_RATE_LIMIT_PER_MINUTE,
    ...runtimeOverrides,
  };
}

export function updateRuntimeConfig(
  updates: Partial<RuntimeSystemConfig>
): RuntimeSystemConfig {
  for (const [k, v] of Object.entries(updates)) {
    if (v !== undefined) {
      (runtimeOverrides as Record<string, unknown>)[k] = v;
    }
  }
  return getRuntimeConfig();
}

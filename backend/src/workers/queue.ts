import { Queue, Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { settings } from '../config/index.js';
import { mongoDb } from '../db/mongo.js';
import { runDocumentIngestionPipeline } from '../ingestion/pipeline.js';

let bullQueue: Queue | null = null;
let bullWorker: Worker | null = null;
let redisReachable = false;
let initialized = false;

export async function initWorkerQueue(): Promise<void> {
  if (initialized) return;
  initialized = true;

  if (!process.env.REDIS_URL && settings.ALLOW_IN_PROCESS_WORKER_FALLBACK) {
    redisReachable = false;
    return;
  }

  try {
    const probe = new Redis(settings.REDIS_URL, {
      connectTimeout: 1200,
      maxRetriesPerRequest: 1,
      retryStrategy: () => null,
    });
    await probe.ping();
    await probe.quit();

    const connection = new Redis(settings.REDIS_URL, {
      maxRetriesPerRequest: null,
    });

    bullQueue = new Queue(settings.BULLMQ_QUEUE_NAME, { connection });
    bullWorker = new Worker(
      settings.BULLMQ_QUEUE_NAME,
      async (job) => {
        const { documentId, jobId } = job.data as { documentId: string; jobId: string };
        await runDocumentIngestionPipeline({ documentId, jobId });
      },
      { connection }
    );
    redisReachable = true;
  } catch {
    redisReachable = false;
  }
}

export async function dispatchIngestionJob(params: {
  documentId: string;
  jobId: string;
  runSynchronously?: boolean;
}): Promise<string> {
  if (!params.runSynchronously && redisReachable && bullQueue) {
    try {
      await bullQueue.add(
        'ingest-document',
        { documentId: params.documentId, jobId: params.jobId },
        { attempts: 3, removeOnComplete: 100, removeOnFail: 100 }
      );
      mongoDb.updateById('processing_jobs', params.jobId, {
        worker_mode: 'bullmq_redis',
      });
      return 'bullmq_redis';
    } catch {
      // Fall through to in-process execution
    }
  }

  const mode = params.runSynchronously ? 'in_process_sync' : 'in_process_async';
  mongoDb.updateById('processing_jobs', params.jobId, {
    worker_mode: mode,
  });

  if (params.runSynchronously) {
    await runDocumentIngestionPipeline({
      documentId: params.documentId,
      jobId: params.jobId,
    });
  } else {
    setImmediate(() => {
      runDocumentIngestionPipeline({
        documentId: params.documentId,
        jobId: params.jobId,
      }).catch(() => {});
    });
  }
  return mode;
}

export function getWorkerStatus(): Record<string, unknown> {
  return {
    queue_engine: 'BullMQ + Redis',
    queue_name: settings.BULLMQ_QUEUE_NAME,
    broker_url: settings.REDIS_URL,
    redis_connected: redisReachable,
    mode: redisReachable ? 'BullMQ + Redis Worker' : 'In-Process Async Fallback',
    active_mode: redisReachable ? 'bullmq_redis_worker' : 'in_process_fallback_worker',
    using_dev_fallback: !redisReachable,
    fallback_reason: redisReachable
      ? null
      : 'Redis broker not running locally; dispatching BullMQ ingestion jobs via in-process async worker.',
    in_process_fallback_enabled: settings.ALLOW_IN_PROCESS_WORKER_FALLBACK,
    operational: redisReachable || settings.ALLOW_IN_PROCESS_WORKER_FALLBACK,
  };
}

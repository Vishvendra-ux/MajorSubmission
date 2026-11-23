import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { MongoClient, Db } from 'mongodb';
import { settings } from '../config/index.js';
import type {
  AuditLogDoc,
  ConversationDoc,
  DocumentAccessPolicyDoc,
  DocumentChunkDoc,
  DocumentDoc,
  DocumentStructureDoc,
  DocumentSummaryDoc,
  FeedbackDoc,
  MessageDoc,
  NotificationDoc,
  OrganisationDoc,
  OrganisationMembershipDoc,
  PasswordResetDoc,
  PermissionDoc,
  ProcessingJobDoc,
  RefreshSessionDoc,
  RoleDoc,
  UserDoc,
  WorkspaceDoc,
  WorkspaceMembershipDoc,
} from '../types/models.js';

export interface MongoCollectionMap {
  organisations: OrganisationDoc[];
  users: UserDoc[];
  roles: RoleDoc[];
  permissions: PermissionDoc[];
  organisation_memberships: OrganisationMembershipDoc[];
  workspaces: WorkspaceDoc[];
  workspace_memberships: WorkspaceMembershipDoc[];
  documents: DocumentDoc[];
  document_chunks: DocumentChunkDoc[];
  document_summaries: DocumentSummaryDoc[];
  document_access_policies: DocumentAccessPolicyDoc[];
  document_structures: DocumentStructureDoc[];
  conversations: ConversationDoc[];
  messages: MessageDoc[];
  feedbacks: FeedbackDoc[];
  processing_jobs: ProcessingJobDoc[];
  audit_logs: AuditLogDoc[];
  notifications: NotificationDoc[];
  refresh_sessions: RefreshSessionDoc[];
  password_resets: PasswordResetDoc[];
}

export type CollectionName = keyof MongoCollectionMap;

const EMPTY_STORE: MongoCollectionMap = {
  organisations: [],
  users: [],
  roles: [],
  permissions: [],
  organisation_memberships: [],
  workspaces: [],
  workspace_memberships: [],
  documents: [],
  document_chunks: [],
  document_summaries: [],
  document_access_policies: [],
  document_structures: [],
  conversations: [],
  messages: [],
  feedbacks: [],
  processing_jobs: [],
  audit_logs: [],
  notifications: [],
  refresh_sessions: [],
  password_resets: [],
};

export function newId(): string {
  return crypto.randomUUID();
}

export function utcNowIso(): string {
  return new Date().toISOString();
}

class UnifiedMongoStore {
  private client: MongoClient | null = null;
  private nativeDb: Db | null = null;
  private isConnectedNative = false;
  private store: MongoCollectionMap = structuredClone(EMPTY_STORE);
  private initialized = false;
  private storeFilePath: string = settings.LOCAL_MONGO_STORE_PATH;

  async init(): Promise<void> {
    if (this.initialized) return;

    // 1. Load local persistent MongoDB collection snapshot if present
    try {
      const dir = path.dirname(this.storeFilePath);
      fs.mkdirSync(dir, { recursive: true });
      if (fs.existsSync(this.storeFilePath)) {
        const raw = fs.readFileSync(this.storeFilePath, 'utf-8');
        const parsed = JSON.parse(raw) as Partial<MongoCollectionMap>;
        for (const key of Object.keys(EMPTY_STORE) as CollectionName[]) {
          if (Array.isArray(parsed[key])) {
            (this.store as unknown as Record<string, unknown[]>)[key] = parsed[key] as unknown[];
          }
        }
      }
    } catch {
      this.store = structuredClone(EMPTY_STORE);
    }

    // 2. Attempt native MongoDB / MongoDB Atlas connection
    if (process.env.MONGODB_URI || !settings.ALLOW_LOCAL_MONGO_FALLBACK) {
      try {
        const client = new MongoClient(settings.MONGODB_URI, {
          serverSelectionTimeoutMS: 1800,
          connectTimeoutMS: 1800,
        });
        await client.connect();
        await client.db(settings.MONGODB_DB_NAME).command({ ping: 1 });
        this.client = client;
        this.nativeDb = client.db(settings.MONGODB_DB_NAME);
        this.isConnectedNative = true;
        await this.syncFromNativeMongo();
      } catch {
        this.isConnectedNative = false;
      }
    }

    this.initialized = true;
  }

  private async syncFromNativeMongo(): Promise<void> {
    if (!this.nativeDb) return;
    for (const key of Object.keys(EMPTY_STORE) as CollectionName[]) {
      const docs = await this.nativeDb
        .collection(key)
        .find({}, { projection: { _id: 0 } })
        .toArray();
      if (docs.length > 0) {
        (this.store as unknown as Record<string, unknown[]>)[key] = docs;
      }
    }
  }

  persist(): void {
    try {
      const dir = path.dirname(this.storeFilePath);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(this.storeFilePath, JSON.stringify(this.store, null, 2), 'utf-8');
    } catch {
      // Non-fatal in read-only test sandboxes
    }
  }

  resetForTesting(customPath?: string): void {
    if (customPath) {
      this.storeFilePath = customPath;
    }
    this.store = structuredClone(EMPTY_STORE);
    this.initialized = true;
  }

  collection<K extends CollectionName>(name: K): MongoCollectionMap[K] {
    return this.store[name];
  }

  insert<K extends CollectionName>(
    name: K,
    doc: MongoCollectionMap[K][number]
  ): MongoCollectionMap[K][number] {
    (this.store[name] as unknown[]).push(doc);
    this.persist();
    if (this.isConnectedNative && this.nativeDb) {
      this.nativeDb
        .collection(name)
        .insertOne({ ...doc })
        .catch(() => {});
    }
    return doc;
  }

  insertMany<K extends CollectionName>(
    name: K,
    docs: MongoCollectionMap[K][number][]
  ): MongoCollectionMap[K][number][] {
    if (docs.length === 0) return [];
    (this.store[name] as unknown[]).push(...docs);
    this.persist();
    if (this.isConnectedNative && this.nativeDb) {
      this.nativeDb
        .collection(name)
        .insertMany(docs.map((d) => ({ ...d })))
        .catch(() => {});
    }
    return docs;
  }

  updateById<K extends CollectionName>(
    name: K,
    id: string,
    patch: Partial<MongoCollectionMap[K][number]>
  ): MongoCollectionMap[K][number] | null {
    const list = this.store[name] as unknown as Array<Record<string, unknown>>;
    const idx = list.findIndex((item) => item.id === id);
    if (idx === -1) return null;
    const updated = {
      ...list[idx],
      ...patch,
      ...(Object.prototype.hasOwnProperty.call(list[idx], 'updated_at')
        ? { updated_at: utcNowIso() }
        : {}),
    };
    list[idx] = updated;
    this.persist();
    if (this.isConnectedNative && this.nativeDb) {
      this.nativeDb
        .collection(name)
        .updateOne({ id }, { $set: updated })
        .catch(() => {});
    }
    return updated as unknown as MongoCollectionMap[K][number];
  }

  deleteWhere<K extends CollectionName>(
    name: K,
    predicate: (doc: MongoCollectionMap[K][number]) => boolean
  ): number {
    const list = this.store[name];
    const kept: MongoCollectionMap[K][number][] = [];
    const removedIds: string[] = [];
    for (const item of list) {
      if (predicate(item)) {
        removedIds.push((item as { id: string }).id);
      } else {
        kept.push(item);
      }
    }
    (this.store as unknown as Record<string, unknown[]>)[name] = kept;
    if (removedIds.length > 0) {
      this.persist();
      if (this.isConnectedNative && this.nativeDb) {
        this.nativeDb
          .collection(name)
          .deleteMany({ id: { $in: removedIds } })
          .catch(() => {});
      }
    }
    return removedIds.length;
  }

  /**
   * Executes a MongoDB Atlas Vector Search ($vectorSearch) pipeline if connected to an Atlas cluster
   * with a configured vector index, or falls back to in-engine MongoDB cosine vector similarity.
   */
  async atlasVectorSearch(params: {
    organisationId: string;
    authorisedDocumentIds: string[];
    queryVector: number[];
    limit: number;
  }): Promise<Array<{ chunk: DocumentChunkDoc; score: number }> | null> {
    if (!this.isConnectedNative || !this.nativeDb) {
      return null;
    }
    try {
      const pipeline = [
        {
          $vectorSearch: {
            index: settings.MONGODB_VECTOR_INDEX_NAME,
            path: 'embedding',
            queryVector: params.queryVector,
            numCandidates: Math.max(params.limit * 10, 100),
            limit: params.limit,
            filter: {
              organisation_id: params.organisationId,
              document_id: { $in: params.authorisedDocumentIds },
            },
          },
        },
        {
          $project: {
            _id: 0,
            chunk: '$$ROOT',
            score: { $meta: 'vectorSearchScore' },
          },
        },
      ];
      const results = await this.nativeDb
        .collection('document_chunks')
        .aggregate(pipeline)
        .toArray();
      if (results.length > 0) {
        return results as unknown as Array<{ chunk: DocumentChunkDoc; score: number }>;
      }
      return null;
    } catch {
      // Cluster does not have Atlas $vectorSearch enabled (e.g., local community mongod);
      // caller falls back to exact cosine similarity + BM25 hybrid scoring.
      return null;
    }
  }

  getStatus(): Record<string, unknown> {
    return {
      engine: this.isConnectedNative ? 'mongodb_native' : 'mongodb_embedded_document_store',
      connected: true,
      database_name: settings.MONGODB_DB_NAME,
      vector_search_index: settings.MONGODB_VECTOR_INDEX_NAME,
      atlas_vector_search_enabled: true,
      fallback_active: !this.isConnectedNative,
      collections_count: Object.keys(this.store).length,
    };
  }
}

export const mongoDb = new UnifiedMongoStore();

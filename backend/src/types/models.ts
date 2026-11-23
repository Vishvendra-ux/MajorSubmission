export type UserRole = 'admin' | 'manager' | 'employee';

export interface OrganisationDoc {
  id: string;
  name: string;
  slug: string;
  domain?: string | null;
  description?: string | null;
  is_active: boolean;
  is_demo: boolean;
  created_at: string;
  updated_at: string;
}

export interface UserDoc {
  id: string;
  email: string;
  full_name: string;
  password_hash: string;
  job_title?: string | null;
  department?: string | null;
  is_active: boolean;
  is_demo: boolean;
  last_login_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface RoleDoc {
  id: string;
  name: UserRole;
  display_name: string;
  description: string;
  is_system: boolean;
  created_at: string;
}

export interface PermissionDoc {
  id: string;
  code: string;
  module: string;
  description: string;
}

export interface OrganisationMembershipDoc {
  id: string;
  organisation_id: string;
  user_id: string;
  role: UserRole;
  role_id?: string | null;
  is_default: boolean;
  joined_at: string;
}

export interface WorkspaceDoc {
  id: string;
  organisation_id: string;
  name: string;
  slug: string;
  description?: string | null;
  created_by_id?: string | null;
  is_demo: boolean;
  created_at: string;
  updated_at: string;
}

export interface WorkspaceMembershipDoc {
  id: string;
  workspace_id: string;
  user_id: string;
  workspace_role: 'manager' | 'member';
  added_by_id?: string | null;
  created_at: string;
}

export interface DocumentDoc {
  id: string;
  organisation_id: string;
  workspace_id?: string | null;
  uploader_id: string;
  title: string;
  description?: string | null;
  original_filename: string;
  storage_filename: string;
  storage_path: string;
  storage_backend: 's3' | 'local';
  s3_bucket?: string | null;
  s3_key?: string | null;
  file_type: 'pdf' | 'docx' | 'pptx' | 'xlsx' | 'txt';
  mime_type: string;
  file_size_bytes: number;
  sha256_checksum: string;
  status: 'uploaded' | 'queued' | 'processing' | 'ready' | 'failed' | 'deleting';
  visibility: 'organisation' | 'workspace' | 'restricted';
  allowed_roles_json: UserRole[];
  tags_json: string[];
  page_count: number;
  chunk_count: number;
  processing_progress: number;
  processing_stage?: string | null;
  processing_error?: string | null;
  ocr_used: boolean;
  is_demo: boolean;
  indexed_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface DocumentChunkDoc {
  id: string;
  document_id: string;
  organisation_id: string;
  chunk_index: number;
  location_label: string;
  page_number?: number | null;
  slide_number?: number | null;
  sheet_name?: string | null;
  section_title?: string | null;
  content: string;
  token_count: number;
  embedding: number[];
  created_at: string;
}

export interface CitationRecord {
  citation_index: number;
  chunk_id: string;
  document_id: string;
  document_title: string;
  file_type: string;
  location_label: string;
  page_number?: number | null;
  slide_number?: number | null;
  sheet_name?: string | null;
  section_title?: string | null;
  excerpt: string;
  similarity_score: number;
  is_accessible?: boolean;
}

export interface DocumentSummaryDoc {
  id: string;
  document_id: string;
  organisation_id: string;
  executive_summary: string;
  detailed_summary: string;
  main_points_json: string[];
  entities_json: {
    dates_and_timelines: string[];
    metrics_and_thresholds: string[];
    key_decisions_and_policies: string[];
  };
  risks_and_actions_json: string[];
  citations_json: CitationRecord[];
  interpretation_notes: string;
  provider_used: string;
  model_used: string;
  generated_by_id?: string | null;
  created_at: string;
  updated_at: string;
}

export interface DocumentAccessPolicyDoc {
  id: string;
  document_id: string;
  organisation_id: string;
  principal_type: 'user' | 'workspace' | 'role';
  principal_id: string;
  access_level: 'view' | 'download' | 'manage';
  effect: 'allow' | 'deny';
  granted_by_id?: string | null;
  created_at: string;
}

export interface ConversationDoc {
  id: string;
  organisation_id: string;
  user_id: string;
  workspace_id?: string | null;
  title: string;
  scoped_document_ids_json: string[];
  is_archived: boolean;
  created_at: string;
  updated_at: string;
}

export interface MessageDoc {
  id: string;
  conversation_id: string;
  organisation_id: string;
  user_id?: string | null;
  role: 'user' | 'assistant';
  content: string;
  citations_json: CitationRecord[];
  evidence_sufficient: boolean;
  confidence_score: number;
  provider_used?: string | null;
  model_used?: string | null;
  retrieval_metadata_json: Record<string, unknown>;
  latency_ms: number;
  created_at: string;
}

export interface FeedbackDoc {
  id: string;
  organisation_id: string;
  user_id: string;
  conversation_id: string;
  message_id: string;
  rating: 'positive' | 'negative';
  comment?: string | null;
  issue_category?: string | null;
  model_metadata_json: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface ProcessingJobDoc {
  id: string;
  document_id: string;
  organisation_id: string;
  triggered_by_id?: string | null;
  job_type: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  worker_mode: string;
  attempt_count: number;
  max_attempts: number;
  progress_percent: number;
  current_stage?: string | null;
  error_message?: string | null;
  duration_ms?: number | null;
  started_at?: string | null;
  completed_at?: string | null;
  created_at: string;
}

export interface AuditLogDoc {
  id: string;
  organisation_id?: string | null;
  actor_user_id?: string | null;
  actor_email?: string | null;
  actor_role?: string | null;
  action: string;
  target_type: string;
  target_id?: string | null;
  status: 'success' | 'failure' | 'denied';
  ip_address?: string | null;
  user_agent?: string | null;
  metadata_json: Record<string, unknown>;
  created_at: string;
}

export interface NotificationDoc {
  id: string;
  organisation_id: string;
  user_id: string;
  title: string;
  message: string;
  notification_type: string;
  link_url?: string | null;
  is_read: boolean;
  created_at: string;
}

export interface RefreshSessionDoc {
  id: string;
  user_id: string;
  organisation_id: string;
  token_jti: string;
  token_hash: string;
  ip_address?: string | null;
  user_agent?: string | null;
  is_revoked: boolean;
  revoked_at?: string | null;
  expires_at: string;
  created_at: string;
}

export interface PasswordResetDoc {
  id: string;
  user_id: string;
  token_hash: string;
  is_used: boolean;
  used_at?: string | null;
  expires_at: string;
  created_at: string;
}

export interface ExtractedSectionItem {
  location_label: string;
  page_number?: number | null;
  slide_number?: number | null;
  sheet_name?: string | null;
  section_title?: string | null;
  text: string;
  ocr_applied: boolean;
}

export interface DocumentStructureDoc {
  id: string;
  document_id: string;
  organisation_id: string;
  sections: ExtractedSectionItem[];
  processing_metadata: Record<string, unknown>;
  updated_at: string;
}

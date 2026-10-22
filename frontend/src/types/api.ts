export type UserRole = 'admin' | 'manager' | 'employee';

export interface WorkspaceMini {
  id: string;
  name: string;
  slug: string;
  workspace_role: 'manager' | 'member';
}

export interface UserProfile {
  id: string;
  email: string;
  full_name: string;
  job_title?: string | null;
  department?: string | null;
  is_active: boolean;
  is_demo: boolean;
  organisation_id: string;
  organisation_name: string;
  organisation_slug: string;
  role: UserRole;
  permissions: string[];
  workspaces: WorkspaceMini[];
  last_login_at?: string | null;
  created_at: string;
}

export interface AuthTokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  user: UserProfile;
}

export interface PaginationMeta {
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
}

export interface AccessPolicy {
  id: string;
  principal_type: 'user' | 'workspace' | 'role';
  principal_id: string;
  access_level: 'view' | 'download' | 'manage';
  effect: 'allow' | 'deny';
  created_at: string;
}

export interface DocumentItem {
  id: string;
  organisation_id: string;
  workspace_id?: string | null;
  workspace_name?: string | null;
  uploader_id: string;
  uploader_name: string;
  uploader_email: string;
  title: string;
  description?: string | null;
  original_filename: string;
  file_type: 'pdf' | 'docx' | 'pptx' | 'xlsx' | 'txt';
  mime_type: string;
  file_size_bytes: number;
  sha256_checksum: string;
  status: 'uploaded' | 'queued' | 'processing' | 'ready' | 'failed' | 'deleting';
  visibility: 'organisation' | 'workspace' | 'restricted';
  allowed_roles: UserRole[];
  tags: string[];
  page_count: number;
  chunk_count: number;
  processing_progress: number;
  processing_stage?: string | null;
  processing_error?: string | null;
  ocr_used: boolean;
  is_demo: boolean;
  has_summary: boolean;
  can_manage: boolean;
  can_download: boolean;
  indexed_at?: string | null;
  created_at: string;
  updated_at: string;
  access_policies?: AccessPolicy[];
  processing_metadata?: Record<string, unknown> | null;
  latest_job?: ProcessingJobItem | null;
}

export interface DocumentChunkItem {
  id: string;
  chunk_index: number;
  location_label: string;
  page_number?: number | null;
  slide_number?: number | null;
  sheet_name?: string | null;
  section_title?: string | null;
  content: string;
  token_count: number;
  is_highlighted?: boolean;
}

export interface CitationItem {
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
  similarity_score?: number;
  is_accessible?: boolean;
}

export interface DocumentSummary {
  id: string;
  document_id: string;
  document_title: string;
  file_type: string;
  executive_summary: string;
  detailed_summary: string;
  main_points: string[];
  entities: {
    dates_and_timelines?: string[];
    metrics_and_thresholds?: string[];
    key_decisions_and_policies?: string[];
  };
  risks_and_actions: string[];
  citations: CitationItem[];
  interpretation_notes: string;
  provider_used: string;
  model_used: string;
  created_at: string;
  updated_at: string;
}

export interface SearchResultItem {
  rank: number;
  chunk_id: string;
  document_id: string;
  document_title: string;
  original_filename: string;
  file_type: string;
  visibility: string;
  workspace_id?: string | null;
  workspace_name?: string | null;
  location_label: string;
  page_number?: number | null;
  slide_number?: number | null;
  sheet_name?: string | null;
  section_title?: string | null;
  snippet: string;
  content: string;
  semantic_score: number;
  keyword_score: number;
  combined_score: number;
  created_at: string;
}

export interface UserFeedbackMini {
  id: string;
  rating: 'positive' | 'negative';
  comment?: string | null;
  issue_category?: string | null;
  updated_at: string;
}

export interface ChatMessageItem {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant';
  content: string;
  citations: CitationItem[];
  evidence_sufficient: boolean;
  confidence_score: number;
  provider_used?: string | null;
  model_used?: string | null;
  retrieval_metadata?: {
    authorised_documents_in_scope?: number;
    scoped_document_titles?: string[];
    search_mode?: string;
    reason?: string;
  };
  latency_ms: number;
  user_feedback?: UserFeedbackMini | null;
  created_at: string;
}

export interface ConversationItem {
  id: string;
  organisation_id: string;
  user_id: string;
  workspace_id?: string | null;
  title: string;
  scoped_document_ids: string[];
  is_archived: boolean;
  message_count: number;
  last_message_preview?: string | null;
  created_at: string;
  updated_at: string;
  messages?: ChatMessageItem[];
}

export interface ProcessingJobItem {
  id: string;
  document_id?: string;
  document_title?: string;
  original_filename?: string;
  file_type?: string;
  job_type: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  worker_mode?: string;
  attempt_count: number;
  max_attempts?: number;
  progress_percent: number;
  current_stage?: string | null;
  error_message?: string | null;
  duration_ms?: number | null;
  started_at?: string | null;
  completed_at?: string | null;
  created_at: string;
}

export interface AuditLogItem {
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
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface NotificationItem {
  id: string;
  title: string;
  message: string;
  notification_type: string;
  link_url?: string | null;
  is_read: boolean;
  created_at: string;
}


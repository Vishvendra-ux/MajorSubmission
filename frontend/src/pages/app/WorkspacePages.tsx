import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Bell,
  BookOpen,
  CheckCheck,
  ExternalLink,
  Eye,
  FileText,
  Filter,
  KeyRound,
  Lock,
  MessageSquare,
  Search,
  ShieldAlert,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  UserCheck,
} from 'lucide-react';
import { apiRequest } from '../../services/apiClient';
import {
  CitationItem,
  ConversationItem,
  NotificationItem,
  PaginationMeta,
  SearchResultItem,
} from '../../types/api';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  Modal,
  Select,
  Skeleton,
} from '../../components/ui/Primitives';
import { SourcePreviewModal } from '../../components/shared/CitationCard';
import { formatDateTime, formatRelativeTime } from '../../utils/format';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../hooks/useToast';

function highlightText(text: string, query: string): React.ReactNode {
  if (!query.trim()) return text;
  const terms = query
    .trim()
    .split(/\s+/)
    .filter((t) => t.length >= 2)
    .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  if (terms.length === 0) return text;
  const regex = new RegExp(`(${terms.join('|')})`, 'gi');
  const parts = text.split(regex);
  return parts.map((part, idx) =>
    regex.test(part) ? (
      <mark
        key={idx}
        className="rounded bg-brand-100 px-1 py-0.5 font-medium text-brand-900 dark:bg-brand-900/60 dark:text-brand-200"
      >
        {part}
      </mark>
    ) : (
      part
    )
  );
}

export function SearchResultsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const initialQuery = searchParams.get('q') || '';
  const [queryInput, setQueryInput] = useState(initialQuery);
  const [activeQuery, setActiveQuery] = useState(initialQuery);
  const [mode, setMode] = useState<'hybrid' | 'semantic' | 'keyword'>('hybrid');
  const [fileType, setFileType] = useState<string>('');
  const [workspaceId, setWorkspaceId] = useState<string>('');
  const [topK, setTopK] = useState<number>(12);
  const [selectedCitation, setSelectedCitation] = useState<CitationItem | null>(null);

  useEffect(() => {
    const q = searchParams.get('q') || '';
    if (q && q !== activeQuery) {
      setQueryInput(q);
      setActiveQuery(q);
    }
  }, [searchParams, activeQuery]);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['semantic-search', activeQuery, mode, fileType, workspaceId, topK],
    queryFn: () =>
      apiRequest<{
        query: string;
        mode: string;
        total_authorised_documents: number;
        results_count: number;
        items: SearchResultItem[];
      }>('/search/query', {
        method: 'POST',
        body: {
          query: activeQuery,
          mode,
          file_types: fileType ? [fileType] : undefined,
          workspace_id: workspaceId || undefined,
          top_k: topK,
        },
      }),
    enabled: activeQuery.trim().length >= 2,
  });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (queryInput.trim().length < 2) return;
    setActiveQuery(queryInput.trim());
    setSearchParams({ q: queryInput.trim() });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
            Semantic & Hybrid Knowledge Search
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Search across all authorised document chunks using dense embeddings and lexical relevance.
          </p>
        </div>
        {data && (
          <Badge variant="brand">
            {data.total_authorised_documents} Authorised Documents in Scope
          </Badge>
        )}
      </div>

      <Card className="p-5">
        <form onSubmit={handleSearch} className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
              <input
                type="search"
                value={queryInput}
                onChange={(e) => setQueryInput(e.target.value)}
                placeholder="Search concepts, policies, metrics, clauses, or procedures..."
                className="w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-10 pr-4 text-sm text-slate-900 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
            </div>
            <Button type="submit" isLoading={isFetching}>
              <Search className="h-4 w-4" />
              Search Knowledge Base
            </Button>
          </div>

          <div className="grid grid-cols-1 gap-3 pt-1 sm:grid-cols-4">
            <Select
              label="Retrieval Mode"
              value={mode}
              onChange={(e) => setMode(e.target.value as 'hybrid' | 'semantic' | 'keyword')}
              options={[
                { value: 'hybrid', label: 'Hybrid (Vector + Keyword)' },
                { value: 'semantic', label: 'Semantic Vector Only' },
                { value: 'keyword', label: 'Exact Keyword / BM25' },
              ]}
            />
            <Select
              label="File Type"
              value={fileType}
              onChange={(e) => setFileType(e.target.value)}
              options={[
                { value: '', label: 'All Formats' },
                { value: 'pdf', label: 'PDF Documents' },
                { value: 'docx', label: 'Word (DOCX)' },
                { value: 'pptx', label: 'Presentations (PPTX)' },
                { value: 'xlsx', label: 'Spreadsheets (XLSX)' },
                { value: 'txt', label: 'Plain Text (TXT)' },
              ]}
            />
            <Select
              label="Workspace Scope"
              value={workspaceId}
              onChange={(e) => setWorkspaceId(e.target.value)}
              options={[
                { value: '', label: 'All Authorised Workspaces' },
                ...(user?.workspaces || []).map((w) => ({
                  value: w.id,
                  label: w.name,
                })),
              ]}
            />
            <Select
              label="Max Chunks (Top-K)"
              value={String(topK)}
              onChange={(e) => setTopK(Number(e.target.value))}
              options={[
                { value: '8', label: 'Top 8 Chunks' },
                { value: '12', label: 'Top 12 Chunks' },
                { value: '20', label: 'Top 20 Chunks' },
              ]}
            />
          </div>
        </form>
      </Card>

      {!activeQuery ? (
        <Card className="p-8">
          <EmptyState
            icon={<Search className="h-6 w-6" />}
            title="Enter a search query to explore indexed knowledge"
            description="Try searching for 'RPO recovery time objective', 'remote work stipend', 'cloud budget variance', or 'encryption standard'."
          />
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {[
              'disaster recovery RPO RTO targets',
              'zero trust encryption key rotation',
              'hybrid work reimbursement policy',
              'Q3 cloud infrastructure spend',
            ].map((sample) => (
              <button
                key={sample}
                type="button"
                onClick={() => {
                  setQueryInput(sample);
                  setActiveQuery(sample);
                  setSearchParams({ q: sample });
                }}
                className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700 hover:border-brand-400 hover:text-brand-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
              >
                “{sample}”
              </button>
            ))}
          </div>
        </Card>
      ) : isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((n) => (
            <Skeleton key={n} className="h-36 w-full" />
          ))}
        </div>
      ) : data && data.items.length === 0 ? (
        <Card className="p-8">
          <EmptyState
            icon={<Filter className="h-6 w-6" />}
            title={`No matching passages found for "${activeQuery}"`}
            description="No authorised document chunks matched your query and filter criteria. Try broadening your filters or asking the AI Assistant."
          />
        </Card>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>
              Showing <strong>{data?.items.length || 0}</strong> grounded passages for{' '}
              <strong>“{activeQuery}”</strong> ({mode} mode)
            </span>
          </div>

          {data?.items.map((item) => (
            <Card key={item.chunk_id} className="p-5 transition hover:border-brand-300 dark:hover:border-brand-700">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-brand-600 text-xs font-bold text-white">
                    #{item.rank}
                  </span>
                  <Link
                    to={`/app/documents/${item.document_id}`}
                    className="text-base font-semibold text-slate-900 hover:text-brand-600 dark:text-white dark:hover:text-brand-400"
                  >
                    {item.document_title}
                  </Link>
                  <Badge variant="brand">{item.location_label}</Badge>
                  <Badge variant="default">{item.file_type.toUpperCase()}</Badge>
                  {item.workspace_name && <Badge variant="info">{item.workspace_name}</Badge>}
                </div>

                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <span title="Combined hybrid score">
                    Score: <strong>{Math.round(item.combined_score * 100)}%</strong>
                  </span>
                  <span className="text-slate-300 dark:text-slate-700">|</span>
                  <span>Vec: {Math.round(item.semantic_score * 100)}%</span>
                  <span>Lex: {Math.round(item.keyword_score * 100)}%</span>
                </div>
              </div>

              <p className="mt-3 rounded-lg bg-slate-50 p-3.5 text-sm leading-relaxed text-slate-700 dark:bg-slate-800/60 dark:text-slate-300">
                {highlightText(item.content, activeQuery)}
              </p>

              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs text-slate-500">
                  Source file: <code className="font-mono">{item.original_filename}</code>
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() =>
                      setSelectedCitation({
                        citation_index: item.rank,
                        chunk_id: item.chunk_id,
                        document_id: item.document_id,
                        document_title: item.document_title,
                        file_type: item.file_type,
                        location_label: item.location_label,
                        page_number: item.page_number,
                        slide_number: item.slide_number,
                        sheet_name: item.sheet_name,
                        section_title: item.section_title,
                        excerpt: item.content,
                        similarity_score: item.combined_score,
                        is_accessible: true,
                      })
                    }
                  >
                    <Eye className="h-3.5 w-3.5" />
                    Inspect Source Chunk
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => navigate(`/app/assistant?docId=${item.document_id}`)}
                  >
                    <Sparkles className="h-3.5 w-3.5 text-brand-600" />
                    Ask Assistant
                  </Button>
                  <Link
                    to={`/app/documents/${item.document_id}`}
                    className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline dark:text-brand-400"
                  >
                    Document Detail <ExternalLink className="h-3 w-3" />
                  </Link>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <SourcePreviewModal
        citation={selectedCitation}
        onClose={() => setSelectedCitation(null)}
      />
    </div>
  );
}

export function ConversationHistoryPage() {
  const navigate = useNavigate();
  const { notify } = useToast();
  const queryClient = useQueryClient();
  const [filterText, setFilterText] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['conversations-list'],
    queryFn: () =>
      apiRequest<{ items: ConversationItem[]; meta: PaginationMeta }>(
        '/chat/conversations?page=1&page_size=50'
      ),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      apiRequest(`/chat/conversations/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations-list'] });
      notify({
        title: 'Conversation deleted',
        description: 'The conversation and its messages were removed.',
        variant: 'info',
      });
    },
  });

  const items = (data?.items || []).filter((c) =>
    !filterText
      ? true
      : c.title.toLowerCase().includes(filterText.toLowerCase()) ||
        (c.last_message_preview || '').toLowerCase().includes(filterText.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
            Conversation History
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Review and resume your grounded Q&A sessions with the SUMIND-IQ Knowledge Assistant.
          </p>
        </div>
        <Button onClick={() => navigate('/app/assistant')}>
          <MessageSquare className="h-4 w-4" />
          New Assistant Session
        </Button>
      </div>

      <Card className="p-4">
        <Input
          placeholder="Filter conversations by title or question preview..."
          value={filterText}
          onChange={(e) => setFilterText(e.target.value)}
        />
      </Card>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((n) => (
            <Skeleton key={n} className="h-24 w-full" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <Card className="p-8">
          <EmptyState
            icon={<MessageSquare className="h-6 w-6" />}
            title="No conversations found"
            description="Start a grounded question-answering session with the AI Knowledge Assistant."
            action={
              <Button onClick={() => navigate('/app/assistant')}>
                Open AI Assistant
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {items.map((conv) => (
            <Card key={conv.id} className="flex flex-col justify-between gap-4 p-5 sm:flex-row sm:items-center">
              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    to={`/app/assistant?conversationId=${conv.id}`}
                    className="text-base font-semibold text-slate-900 hover:text-brand-600 dark:text-white dark:hover:text-brand-400"
                  >
                    {conv.title}
                  </Link>
                  <Badge variant="brand">{conv.message_count} messages</Badge>
                  {conv.scoped_document_ids.length > 0 && (
                    <Badge variant="info">
                      Scoped to {conv.scoped_document_ids.length} document(s)
                    </Badge>
                  )}
                </div>
                {conv.last_message_preview && (
                  <p className="line-clamp-2 text-sm text-slate-600 dark:text-slate-400">
                    {conv.last_message_preview}
                  </p>
                )}
                <p className="text-xs text-slate-400">
                  Last updated {formatRelativeTime(conv.updated_at)} ({formatDateTime(conv.updated_at)})
                </p>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => navigate(`/app/assistant?conversationId=${conv.id}`)}
                >
                  Resume Session
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => deleteMutation.mutate(conv.id)}
                  aria-label={`Delete conversation ${conv.title}`}
                >
                  <Trash2 className="h-4 w-4 text-rose-600" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

interface FeedbackHistoryEntry {
  id: string;
  conversation_id: string;
  conversation_title?: string;
  message_id: string;
  rating: 'positive' | 'negative';
  issue_category?: string | null;
  comment?: string | null;
  answer_excerpt: string;
  provider_used?: string | null;
  model_used?: string | null;
  created_at: string;
}

export function FeedbackHistoryPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['my-feedback-history'],
    queryFn: () =>
      apiRequest<{ items: FeedbackHistoryEntry[]; pagination: PaginationMeta }>(
        '/chat/feedback?page=1&page_size=50'
      ),
  });

  const items = data?.items || [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
          Answer Quality Feedback History
        </h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Track the ratings and citation quality evaluations you have submitted on AI-generated answers.
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((n) => (
            <Skeleton key={n} className="h-28 w-full" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <Card className="p-8">
          <EmptyState
            icon={<ThumbsUp className="h-6 w-6" />}
            title="No feedback submitted yet"
            description="When you rate AI responses with a thumbs-up or thumbs-down in the Assistant, your submissions appear here."
          />
        </Card>
      ) : (
        <div className="space-y-4">
          {items.map((item) => (
            <Card key={item.id} className="p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  {item.rating === 'positive' ? (
                    <Badge variant="success">
                      <ThumbsUp className="mr-1 h-3 w-3" /> Helpful / Verified
                    </Badge>
                  ) : (
                    <Badge variant="danger">
                      <ThumbsDown className="mr-1 h-3 w-3" /> Needs Improvement
                    </Badge>
                  )}
                  {item.issue_category && (
                    <Badge variant="warning">{item.issue_category}</Badge>
                  )}
                  {item.conversation_title && (
                    <Badge variant="default">{item.conversation_title}</Badge>
                  )}
                </div>
                <span className="text-xs text-slate-500">
                  Submitted {formatDateTime(item.created_at)}
                </span>
              </div>

              {item.comment && (
                <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-800 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-200">
                  <span className="font-semibold">Your Note: </span>
                  {item.comment}
                </div>
              )}

              <p className="mt-3 text-xs text-slate-600 dark:text-slate-400">
                <span className="font-medium text-slate-700 dark:text-slate-300">
                  Evaluated Response Preview:{' '}
                </span>
                {item.answer_excerpt}
              </p>

              <div className="mt-3 flex justify-end">
                <Link
                  to={`/app/assistant?conversationId=${item.conversation_id}`}
                  className="text-xs font-medium text-brand-600 hover:underline dark:text-brand-400"
                >
                  Open Conversation →
                </Link>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

export function NotificationsPage() {
  const queryClient = useQueryClient();
  const { notify } = useToast();
  const navigate = useNavigate();

  const { data, isLoading } = useQuery({
    queryKey: ['notifications'],
    queryFn: () =>
      apiRequest<{ unread_count: number; items: NotificationItem[] }>(
        '/notifications'
      ),
  });

  const markReadMutation = useMutation({
    mutationFn: (id: string) =>
      apiRequest(`/notifications/${id}/read`, { method: 'PATCH' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const markAllMutation = useMutation({
    mutationFn: () =>
      apiRequest('/notifications/read-all', { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      notify({
        title: 'All notifications marked as read',
        variant: 'success',
      });
    },
  });

  const items = data?.items || [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
            Processing & Security Notifications
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Real-time alerts for document ingestion completions, OCR status, and workspace updates.
          </p>
        </div>
        {items.length > 0 && (
          <Button
            variant="secondary"
            onClick={() => markAllMutation.mutate()}
            isLoading={markAllMutation.isPending}
          >
            <CheckCheck className="h-4 w-4" />
            Mark All as Read ({data?.unread_count || 0} unread)
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((n) => (
            <Skeleton key={n} className="h-20 w-full" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <Card className="p-8">
          <EmptyState
            icon={<Bell className="h-6 w-6" />}
            title="You're all caught up"
            description="New notifications appear here when documents finish indexing or access policies change."
          />
        </Card>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <Card
              key={item.id}
              className={`flex flex-col justify-between gap-4 p-4 sm:flex-row sm:items-center ${
                !item.is_read
                  ? 'border-l-4 border-l-brand-600 bg-brand-50/30 dark:bg-brand-950/20'
                  : ''
              }`}
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-slate-900 dark:text-white">
                    {item.title}
                  </span>
                  <Badge
                    variant={
                      item.notification_type === 'success'
                        ? 'success'
                        : item.notification_type === 'error'
                        ? 'danger'
                        : 'info'
                    }
                  >
                    {item.notification_type}
                  </Badge>
                  {!item.is_read && <Badge variant="brand">Unread</Badge>}
                </div>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  {item.message}
                </p>
                <p className="text-xs text-slate-400">
                  {formatRelativeTime(item.created_at)} ({formatDateTime(item.created_at)})
                </p>
              </div>

              <div className="flex items-center gap-2">
                {item.link_url && (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      if (!item.is_read) markReadMutation.mutate(item.id);
                      navigate(item.link_url!);
                    }}
                  >
                    Open Resource
                  </Button>
                )}
                {!item.is_read && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => markReadMutation.mutate(item.id)}
                  >
                    Mark Read
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

export function ProfileSettingsPage() {
  const { user, refreshProfile } = useAuth();
  const { notify } = useToast();

  const [fullName, setFullName] = useState(user?.full_name || '');
  const [jobTitle, setJobTitle] = useState(user?.job_title || '');
  const [department, setDepartment] = useState(user?.department || '');
  const [savingProfile, setSavingProfile] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);

  useEffect(() => {
    if (user) {
      setFullName(user.full_name);
      setJobTitle(user.job_title || '');
      setDepartment(user.department || '');
    }
  }, [user]);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    try {
      await apiRequest('/auth/me', {
        method: 'PATCH',
        body: {
          full_name: fullName,
          job_title: jobTitle || null,
          department: department || null,
        },
      });
      await refreshProfile();
      notify({
        title: 'Profile updated',
        description: 'Your identity details have been saved.',
        variant: 'success',
      });
    } catch (err: unknown) {
      notify({
        title: 'Update failed',
        description: err instanceof Error ? err.message : 'Unable to update profile',
        variant: 'error',
      });
    } finally {
      setSavingProfile(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setChangingPassword(true);
    try {
      await apiRequest('/auth/me', {
        method: 'PATCH',
        body: {
          current_password: currentPassword,
          new_password: newPassword,
        },
      });
      setCurrentPassword('');
      setNewPassword('');
      notify({
        title: 'Password updated',
        description: 'Your Argon2id password hash has been rotated.',
        variant: 'success',
      });
    } catch (err: unknown) {
      notify({
        title: 'Password rotation failed',
        description: err instanceof Error ? err.message : 'Check your current password and complexity.',
        variant: 'error',
      });
    } finally {
      setChangingPassword(false);
    }
  };

  if (!user) return null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
          User Profile & Security Settings
        </h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Manage your identity attributes, password credentials, and inspect your active RBAC permissions.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="p-6 lg:col-span-2">
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">
            Personal & Organisational Identity
          </h2>
          <form onSubmit={handleSaveProfile} className="mt-4 space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input
                label="Email Address (Verified Identity)"
                value={user.email}
                disabled
              />
              <Input
                label="Organisation Tenant"
                value={`${user.organisation_name} (${user.organisation_slug})`}
                disabled
              />
            </div>
            <Input
              label="Full Name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
            />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input
                label="Job Title"
                value={jobTitle}
                onChange={(e) => setJobTitle(e.target.value)}
                placeholder="e.g. Senior Security Analyst"
              />
              <Input
                label="Department"
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                placeholder="e.g. Information Security"
              />
            </div>
            <div className="flex justify-end">
              <Button type="submit" isLoading={savingProfile}>
                <UserCheck className="h-4 w-4" />
                Save Profile Changes
              </Button>
            </div>
          </form>
        </Card>

        <Card className="p-6">
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">
            Role & Access Matrix
          </h2>
          <div className="mt-4 space-y-4 text-sm">
            <div>
              <span className="text-xs font-medium uppercase text-slate-400">
                Assigned Role
              </span>
              <div className="mt-1 flex items-center gap-2">
                <Badge variant="brand">{user.role.toUpperCase()}</Badge>
                {user.is_demo && <Badge variant="warning">DEMO ACCOUNT</Badge>}
              </div>
            </div>

            <div>
              <span className="text-xs font-medium uppercase text-slate-400">
                Workspace Memberships ({user.workspaces.length})
              </span>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {user.workspaces.map((ws) => (
                  <Badge key={ws.id} variant="info">
                    {ws.name} ({ws.workspace_role})
                  </Badge>
                ))}
              </div>
            </div>

            <div>
              <span className="text-xs font-medium uppercase text-slate-400">
                Effective Permissions ({user.permissions.length})
              </span>
              <div className="mt-1.5 flex max-h-48 flex-wrap gap-1 overflow-y-auto">
                {user.permissions.map((perm) => (
                  <span
                    key={perm}
                    className="rounded border border-slate-200 bg-slate-50 px-2 py-0.5 font-mono text-[11px] text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                  >
                    {perm}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </Card>
      </div>

      <Card className="p-6">
        <div className="flex items-center gap-2">
          <KeyRound className="h-5 w-5 text-brand-600" />
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">
            Rotate Password Credential
          </h2>
        </div>
        <form onSubmit={handleChangePassword} className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Input
            label="Current Password"
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            required
          />
          <Input
            label="New Password (min 8 chars, upper, lower, digit)"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
          />
          <div className="flex items-end">
            <Button type="submit" variant="secondary" isLoading={changingPassword}>
              <Lock className="h-4 w-4" />
              Update Password
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}

export function AccessDeniedPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="mx-auto max-w-lg py-16 text-center">
      <Card className="p-8">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-rose-100 text-rose-600 dark:bg-rose-950/60 dark:text-rose-400">
          <ShieldAlert className="h-7 w-7" />
        </div>
        <h1 className="mt-4 text-xl font-bold text-slate-900 dark:text-white">
          Access Denied — Insufficient Role Permissions
        </h1>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
          Your current account role (<strong>{user?.role?.toUpperCase() || 'GUEST'}</strong>) is not
          authorised to view this administrative or team-scoped resource. All access attempts are
          recorded in the organisation security audit log.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <Button onClick={() => navigate('/app/dashboard')}>
            Return to Overview Dashboard
          </Button>
          <Button variant="secondary" onClick={() => navigate('/app/documents')}>
            <BookOpen className="h-4 w-4" />
            Document Library
          </Button>
        </div>
      </Card>
    </div>
  );
}

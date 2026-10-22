import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  AlertTriangle,
  ArrowRight,
  Bot,
  CheckCircle2,
  Clock,
  FileText,
  MessageSquare,
  Search,
  Sparkles,
  ThumbsUp,
  Upload,
} from 'lucide-react';
import { apiRequest } from '../../services/apiClient';
import { useAuth } from '../../hooks/useAuth';
import type { DocumentItem } from '../../types/api';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Select,
  Skeleton,
  StatusBadge,
} from '../../components/ui/Primitives';
import { formatBytes, formatDate } from '../../utils/format';

interface DashboardData {
  time_window_days: number;
  metrics: {
    total_accessible_documents: number;
    documents_ready: number;
    documents_processing: number;
    documents_failed: number;
    total_indexed_chunks: number;
    questions_asked: number;
    summaries_generated: number;
    active_users_in_scope: number;
    feedback_total: number;
    feedback_positive: number;
    feedback_negative: number;
    satisfaction_rate_percent: number;
  };
  charts: {
    documents_by_type: { file_type: string; count: number }[];
    documents_by_visibility: { visibility: string; count: number }[];
    feedback_breakdown: { name: string; value: number }[];
  };
  recent_documents: DocumentItem[];
  recent_conversations: {
    id: string;
    title: string;
    updated_at: string;
    scoped_count: number;
  }[];
}

const PIE_COLORS = ['#2563eb', '#10b981', '#f59e0b', '#6366f1'];

export function OverviewDashboardPage() {
  const { user } = useAuth();
  const [days, setDays] = useState('30');
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiRequest<DashboardData>(`/dashboard/overview?days=${days}`);
      setData(res);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load dashboard overview');
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-12 w-72" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((n) => (
            <Skeleton key={n} className="h-28 w-full" />
          ))}
        </div>
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }

  if (error || !data) {
    return <ErrorState message={error || 'No dashboard data'} onRetry={loadDashboard} />;
  }

  const m = data.metrics;

  return (
    <div className="space-y-8">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              Knowledge Intelligence Overview
            </h1>
            <Badge variant="blue">{user?.role.toUpperCase()} SCOPE</Badge>
          </div>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Real-time metrics derived from authorised documents and grounded RAG interactions in{' '}
            <strong>{user?.organisation_name}</strong>.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="w-40">
            <Select
              aria-label="Time window filter"
              value={days}
              onChange={(e) => setDays(e.target.value)}
              options={[
                { value: '7', label: 'Last 7 days' },
                { value: '30', label: 'Last 30 days' },
                { value: '90', label: 'Last 90 days' },
                { value: '365', label: 'Last 12 months' },
              ]}
            />
          </div>
          <Link to="/app/upload">
            <Button variant="outline" size="md">
              <Upload className="h-4 w-4" />
              Upload File
            </Button>
          </Link>
          <Link to="/app/assistant">
            <Button variant="primary" size="md">
              <Bot className="h-4 w-4" />
              Ask Assistant
            </Button>
          </Link>
        </div>
      </div>

      {/* Primary KPI Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Accessible Documents
            </span>
            <FileText className="h-4 w-4 text-blue-600" />
          </div>
          <p className="mt-3 text-3xl font-extrabold text-slate-900 dark:text-white">
            {m.total_accessible_documents}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            <span className="font-semibold text-emerald-600">{m.documents_ready} ready</span> •{' '}
            {m.total_indexed_chunks} indexed chunks
          </p>
        </Card>

        <Card className="p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Ingestion Pipeline
            </span>
            {m.documents_failed > 0 ? (
              <AlertTriangle className="h-4 w-4 text-rose-500" />
            ) : (
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            )}
          </div>
          <p className="mt-3 text-3xl font-extrabold text-slate-900 dark:text-white">
            {m.documents_processing}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Active jobs •{' '}
            <span className={m.documents_failed > 0 ? 'text-rose-600 font-semibold' : ''}>
              {m.documents_failed} failed
            </span>
          </p>
        </Card>

        <Card className="p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Grounded Q&A & Summaries
            </span>
            <Sparkles className="h-4 w-4 text-indigo-600" />
          </div>
          <p className="mt-3 text-3xl font-extrabold text-slate-900 dark:text-white">
            {m.questions_asked}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Questions asked • <strong>{m.summaries_generated}</strong> executive summaries
          </p>
        </Card>

        <Card className="p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Answer Quality Rating
            </span>
            <ThumbsUp className="h-4 w-4 text-emerald-600" />
          </div>
          <p className="mt-3 text-3xl font-extrabold text-slate-900 dark:text-white">
            {m.satisfaction_rate_percent}%
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {m.feedback_positive} positive / {m.feedback_negative} negative ({m.feedback_total}{' '}
            total)
          </p>
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                Authorised Documents by File Type
              </h2>
              <p className="text-xs text-slate-500">
                Distribution across PDF, DOCX, PPTX, XLSX, and TXT formats
              </p>
            </div>
          </div>
          <div className="h-60 w-full">
            {data.charts.documents_by_type.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.charts.documents_by_type}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="file_type" tick={{ fontSize: 12 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Bar dataKey="count" fill="#2563eb" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-xs text-slate-400">
                No documents uploaded yet
              </div>
            )}
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                Access Visibility Distribution
              </h2>
              <p className="text-xs text-slate-500">
                Breakdown by Organisation, Workspace, and Restricted scope
              </p>
            </div>
          </div>
          <div className="h-60 w-full">
            {data.charts.documents_by_visibility.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={data.charts.documents_by_visibility}
                    dataKey="count"
                    nameKey="visibility"
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    label={({ name, value }) => `${name}: ${value}`}
                  >
                    {data.charts.documents_by_visibility.map((_, index) => (
                      <Cell key={index} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-xs text-slate-400">
                No visibility records available
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* Recent Activity Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Recent Authorised Documents
              </h2>
              <p className="text-xs text-slate-500">
                Click any document to inspect chunks, citations, or executive summary
              </p>
            </div>
            <Link
              to="/app/documents"
              className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:underline"
            >
              View All
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          {data.recent_documents.length === 0 ? (
            <EmptyState
              title="No documents in your scope yet"
              description="Upload a PDF, DOCX, PPTX, XLSX, or TXT file to start building your searchable knowledge base."
              action={
                <Link to="/app/upload">
                  <Button variant="primary" size="sm">
                    Upload First Document
                  </Button>
                </Link>
              }
            />
          ) : (
            <div className="divide-y divide-slate-200 dark:divide-slate-800">
              {data.recent_documents.map((doc) => (
                <div
                  key={doc.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 py-3.5"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Link
                        to={`/app/documents/${doc.id}`}
                        className="truncate text-sm font-semibold text-slate-900 dark:text-white hover:text-blue-600"
                      >
                        {doc.title}
                      </Link>
                      {doc.is_demo && <Badge variant="amber">DEMO</Badge>}
                    </div>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {doc.file_type.toUpperCase()} • {formatBytes(doc.file_size_bytes)} •{' '}
                      {doc.chunk_count} chunks • Visibility: <strong>{doc.visibility}</strong> •{' '}
                      {formatDate(doc.created_at)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <StatusBadge status={doc.status} />
                    <Link to={`/app/documents/${doc.id}/summary`}>
                      <Button variant="outline" size="sm">
                        Summary
                      </Button>
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              Recent Conversations
            </h2>
            <Link
              to="/app/conversations"
              className="text-xs font-semibold text-blue-600 hover:underline"
            >
              History
            </Link>
          </div>

          {data.recent_conversations.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-500">
              No assistant conversations yet.
            </div>
          ) : (
            <div className="space-y-2.5">
              {data.recent_conversations.map((conv) => (
                <Link
                  key={conv.id}
                  to={`/app/assistant?conversation=${conv.id}`}
                  className="block rounded-xl border border-slate-200 dark:border-slate-800 p-3 hover:border-blue-500 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <MessageSquare className="h-4 w-4 text-blue-600 shrink-0" />
                    <span className="truncate text-xs font-semibold text-slate-900 dark:text-white">
                      {conv.title}
                    </span>
                  </div>
                  <div className="mt-1.5 flex items-center justify-between text-[11px] text-slate-400">
                    <span>
                      {conv.scoped_count > 0
                        ? `${conv.scoped_count} scoped doc(s)`
                        : 'All authorised docs'}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {formatDate(conv.updated_at)}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}

          <div className="pt-2 border-t border-slate-200 dark:border-slate-800">
            <Link to="/app/search" className="block">
              <Button variant="outline" size="sm" className="w-full">
                <Search className="h-3.5 w-3.5" />
                Open Semantic Search
              </Button>
            </Link>
          </div>
        </Card>
      </div>
    </div>
  );
}


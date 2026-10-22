import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
  BarChart3,
  BookOpen,
  Briefcase,
  FileText,
  KeyRound,
  Lock,
  Plus,
  Shield,
  Trash2,
  UserPlus,
  Users,
} from 'lucide-react';
import { apiRequest } from '../../services/apiClient';
import { DocumentItem } from '../../types/api';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  Modal,
  Select,
  Skeleton,
  StatCard,
} from '../../components/ui/Primitives';
import { formatBytes, formatDateTime } from '../../utils/format';
import { useToast } from '../../hooks/useToast';

interface ManagerOverviewResponse {
  metrics: {
    managed_workspaces_count: number;
    team_members_count: number;
    team_documents_count: number;
    team_ready_documents: number;
    team_questions_asked: number;
  };
  workspaces: Array<{
    workspace_id: string;
    workspace_name: string;
    slug: string;
    document_count: number;
    ready_count: number;
    member_count: number;
  }>;
  team_documents: DocumentItem[];
  team_members: Array<{
    user_id: string;
    full_name: string;
    email: string;
    department?: string | null;
    job_title?: string | null;
    workspace_id: string;
    workspace_name: string;
    workspace_role: 'manager' | 'member';
  }>;
}

const CHART_COLORS = ['#2563eb', '#0ea5e9', '#10b981', '#f59e0b', '#6366f1'];

export function TeamOverviewPage() {
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string>('');

  const { data, isLoading } = useQuery({
    queryKey: ['manager-overview', selectedWorkspaceId],
    queryFn: () =>
      apiRequest<ManagerOverviewResponse>(
        `/manager/overview${selectedWorkspaceId ? `?workspace_id=${selectedWorkspaceId}` : ''}`
      ),
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-24 w-full" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
          {[1, 2, 3, 4].map((n) => (
            <Skeleton key={n} className="h-28 w-full" />
          ))}
        </div>
      </div>
    );
  }

  const metrics = data?.metrics;

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
              Team & Workspace Overview
            </h1>
            <Badge variant="info">Manager Scope</Badge>
          </div>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Monitor team knowledge assets, member access, and grounded Q&A adoption across your assigned workspaces.
          </p>
        </div>

        <div className="w-full sm:w-64">
          <Select
            value={selectedWorkspaceId}
            onChange={(e) => setSelectedWorkspaceId(e.target.value)}
            options={[
              { value: '', label: 'All Permitted Workspaces' },
              ...(data?.workspaces || []).map((w) => ({
                value: w.workspace_id,
                label: w.workspace_name,
              })),
            ]}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard
          label="Managed Workspaces"
          value={metrics?.managed_workspaces_count ?? 0}
          icon={<Briefcase className="h-5 w-5" />}
        />
        <StatCard
          label="Team Members"
          value={metrics?.team_members_count ?? 0}
          icon={<Users className="h-5 w-5" />}
        />
        <StatCard
          label="Team Documents"
          value={metrics?.team_documents_count ?? 0}
          icon={<BookOpen className="h-5 w-5" />}
        />
        <StatCard
          label="Indexed & Ready"
          value={metrics?.team_ready_documents ?? 0}
          icon={<FileText className="h-5 w-5" />}
        />
        <StatCard
          label="Team Questions Asked"
          value={metrics?.team_questions_asked ?? 0}
          icon={<BarChart3 className="h-5 w-5" />}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">
              Workspaces Under Your Governance
            </h2>
            <Link
              to="/app/manager/access"
              className="text-xs font-medium text-brand-600 hover:underline dark:text-brand-400"
            >
              Manage Members →
            </Link>
          </div>
          <div className="mt-4 space-y-3">
            {(data?.workspaces || []).map((ws) => (
              <div
                key={ws.workspace_id}
                className="flex items-center justify-between rounded-lg border border-slate-200 p-3.5 dark:border-slate-800"
              >
                <div>
                  <p className="font-semibold text-slate-900 dark:text-white">
                    {ws.workspace_name}
                  </p>
                  <p className="text-xs text-slate-500">Slug: {ws.slug}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="brand">{ws.document_count} docs</Badge>
                  <Badge variant="info">{ws.member_count} members</Badge>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">
              Recent Team Knowledge Documents
            </h2>
            <Link
              to="/app/manager/documents"
              className="text-xs font-medium text-brand-600 hover:underline dark:text-brand-400"
            >
              View All Team Docs →
            </Link>
          </div>
          <div className="mt-4 space-y-3">
            {(data?.team_documents || []).slice(0, 5).map((doc) => (
              <div
                key={doc.id}
                className="flex items-center justify-between rounded-lg border border-slate-200 p-3 dark:border-slate-800"
              >
                <div>
                  <Link
                    to={`/app/documents/${doc.id}`}
                    className="text-sm font-medium text-slate-900 hover:text-brand-600 dark:text-white dark:hover:text-brand-400"
                  >
                    {doc.title}
                  </Link>
                  <p className="text-xs text-slate-500">
                    {doc.workspace_name || 'Organisation-wide'} • {doc.chunk_count} chunks •{' '}
                    {formatBytes(doc.file_size_bytes)}
                  </p>
                </div>
                <Badge variant={doc.status === 'ready' ? 'success' : 'warning'}>
                  {doc.status.toUpperCase()}
                </Badge>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

export function TeamDocumentsPage() {
  const { notify } = useToast();
  const queryClient = useQueryClient();
  const [searchFilter, setSearchFilter] = useState('');
  const [editingDoc, setEditingDoc] = useState<DocumentItem | null>(null);
  const [visibility, setVisibility] = useState<'organisation' | 'workspace' | 'restricted'>(
    'workspace'
  );
  const [allowedRoles, setAllowedRoles] = useState<string[]>(['admin', 'manager', 'employee']);

  const { data, isLoading } = useQuery({
    queryKey: ['manager-overview-docs'],
    queryFn: () => apiRequest<ManagerOverviewResponse>('/manager/overview'),
  });

  const updateDocMutation = useMutation({
    mutationFn: (payload: {
      docId: string;
      visibility: string;
      allowed_roles: string[];
    }) =>
      apiRequest(`/documents/${payload.docId}`, {
        method: 'PATCH',
        body: {
          visibility: payload.visibility,
          allowed_roles: payload.allowed_roles,
        },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['manager-overview-docs'] });
      setEditingDoc(null);
      notify({
        title: 'Document access updated',
        description: 'Visibility and role boundaries have been updated.',
        variant: 'success',
      });
    },
    onError: (err: unknown) => {
      notify({
        title: 'Update failed',
        description: err instanceof Error ? err.message : 'Unable to update document policy',
        variant: 'error',
      });
    },
  });

  const docs = (data?.team_documents || []).filter((d) =>
    !searchFilter
      ? true
      : d.title.toLowerCase().includes(searchFilter.toLowerCase()) ||
        (d.workspace_name || '').toLowerCase().includes(searchFilter.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
            Accessible Team Documents
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Inspect and govern document visibility and role permissions within your managed team workspaces.
          </p>
        </div>
        <Link to="/app/upload">
          <Button>
            <Plus className="h-4 w-4" />
            Upload Team Document
          </Button>
        </Link>
      </div>

      <Card className="p-4">
        <Input
          placeholder="Filter team documents by title or workspace..."
          value={searchFilter}
          onChange={(e) => setSearchFilter(e.target.value)}
        />
      </Card>

      {isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : docs.length === 0 ? (
        <Card className="p-8">
          <EmptyState
            icon={<BookOpen className="h-6 w-6" />}
            title="No team documents found"
            description="Upload documents to your team workspace to make them searchable."
          />
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500 dark:border-slate-800 dark:bg-slate-900">
                <tr>
                  <th className="px-4 py-3">Document</th>
                  <th className="px-4 py-3">Workspace</th>
                  <th className="px-4 py-3">Visibility</th>
                  <th className="px-4 py-3">Allowed Roles</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {docs.map((doc) => (
                  <tr key={doc.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                    <td className="px-4 py-3">
                      <Link
                        to={`/app/documents/${doc.id}`}
                        className="font-semibold text-slate-900 hover:text-brand-600 dark:text-white"
                      >
                        {doc.title}
                      </Link>
                      <p className="text-xs text-slate-500">
                        {doc.file_type.toUpperCase()} • {doc.chunk_count} chunks • Uploaded by{' '}
                        {doc.uploader_name}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="info">{doc.workspace_name || 'Organisation'}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Badge
                        variant={
                          doc.visibility === 'restricted'
                            ? 'danger'
                            : doc.visibility === 'workspace'
                            ? 'warning'
                            : 'default'
                        }
                      >
                        {doc.visibility}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {doc.allowed_roles.map((r) => (
                          <span
                            key={r}
                            className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                          >
                            {r}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={doc.status === 'ready' ? 'success' : 'warning'}>
                        {doc.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-2">
                        {doc.can_manage && (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => {
                              setEditingDoc(doc);
                              setVisibility(doc.visibility);
                              setAllowedRoles(doc.allowed_roles);
                            }}
                          >
                            <Lock className="h-3.5 w-3.5" />
                            Access Scope
                          </Button>
                        )}
                        <Link to={`/app/documents/${doc.id}`}>
                          <Button size="sm" variant="ghost">
                            Inspect
                          </Button>
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Modal
        open={Boolean(editingDoc)}
        onClose={() => setEditingDoc(null)}
        title={`Configure Access Scope — ${editingDoc?.title || ''}`}
      >
        {editingDoc && (
          <div className="space-y-4">
            <Select
              label="Document Visibility Boundary"
              value={visibility}
              onChange={(e) =>
                setVisibility(e.target.value as 'organisation' | 'workspace' | 'restricted')
              }
              options={[
                { value: 'organisation', label: 'Organisation-Wide (All Permitted Roles)' },
                { value: 'workspace', label: 'Workspace Members Only' },
                { value: 'restricted', label: 'Restricted (Explicit Policy / Role Only)' },
              ]}
            />

            <div>
              <label className="block text-xs font-semibold uppercase text-slate-500">
                Authorised Roles
              </label>
              <div className="mt-2 flex gap-4">
                {(['admin', 'manager', 'employee'] as const).map((r) => (
                  <label key={r} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={allowedRoles.includes(r)}
                      disabled={r === 'admin'}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setAllowedRoles((prev) => Array.from(new Set([...prev, r])));
                        } else {
                          setAllowedRoles((prev) => prev.filter((item) => item !== r));
                        }
                      }}
                    />
                    <span className="capitalize">{r}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3">
              <Button variant="secondary" onClick={() => setEditingDoc(null)}>
                Cancel
              </Button>
              <Button
                isLoading={updateDocMutation.isPending}
                onClick={() =>
                  updateDocMutation.mutate({
                    docId: editingDoc.id,
                    visibility,
                    allowed_roles: allowedRoles,
                  })
                }
              >
                Save Access Policy
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

export function TeamAnalyticsPage() {
  const [days, setDays] = useState(30);

  const { data, isLoading } = useQuery({
    queryKey: ['team-analytics', days],
    queryFn: () =>
      apiRequest<{
        days: number;
        summary: {
          total_documents: number;
          total_storage_bytes: number;
          total_chunks: number;
          total_assistant_responses: number;
          grounded_answers_count: number;
          insufficient_evidence_count: number;
          average_response_latency_ms: number;
          positive_feedback_count: number;
          negative_feedback_count: number;
        };
        charts: {
          documents_by_type: Array<{ name: string; count: number }>;
          documents_by_visibility: Array<{ name: string; count: number }>;
          answer_grounding_ratio: Array<{ name: string; value: number }>;
          feedback_ratio: Array<{ name: string; value: number }>;
        };
      }>(`/admin/analytics?days=${days}`),
  });

  if (isLoading) {
    return <Skeleton className="h-96 w-full" />;
  }

  const s = data?.summary;

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
            Team Knowledge & RAG Usage Analytics
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Real database-backed analytics for document coverage, grounding verification, and answer quality.
          </p>
        </div>
        <div className="w-44">
          <Select
            value={String(days)}
            onChange={(e) => setDays(Number(e.target.value))}
            options={[
              { value: '7', label: 'Last 7 Days' },
              { value: '30', label: 'Last 30 Days' },
              { value: '90', label: 'Last 90 Days' },
            ]}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Accessible Documents"
          value={s?.total_documents ?? 0}
          subtitle={formatBytes(s?.total_storage_bytes ?? 0)}
          icon={<FileText className="h-5 w-5" />}
        />
        <StatCard
          label="Indexed Vector Chunks"
          value={s?.total_chunks ?? 0}
          subtitle="Searchable passages"
          icon={<BookOpen className="h-5 w-5" />}
        />
        <StatCard
          label="Grounded AI Answers"
          value={s?.grounded_answers_count ?? 0}
          subtitle={`${s?.insufficient_evidence_count ?? 0} safe refusals`}
          icon={<Shield className="h-5 w-5" />}
        />
        <StatCard
          label="Avg RAG Latency"
          value={`${s?.average_response_latency_ms ?? 0} ms`}
          subtitle={`${s?.positive_feedback_count ?? 0} positive ratings`}
          icon={<BarChart3 className="h-5 w-5" />}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="p-6">
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">
            Documents by Format
          </h2>
          <div className="mt-4 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data?.charts.documents_by_type || []}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="name" />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="count" fill="#2563eb" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="p-6">
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">
            Answer Grounding vs. Refusal Distribution
          </h2>
          <div className="mt-4 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data?.charts.answer_grounding_ratio || []}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={85}
                  label
                >
                  {(data?.charts.answer_grounding_ratio || []).map((_, index) => (
                    <Cell
                      key={index}
                      fill={CHART_COLORS[index % CHART_COLORS.length]}
                    />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>
    </div>
  );
}

export function TeamAccessManagementPage() {
  const { notify } = useToast();
  const queryClient = useQueryClient();

  const [selectedWsId, setSelectedWsId] = useState<string>('');
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [workspaceRole, setWorkspaceRole] = useState<'member' | 'manager'>('member');

  const { data: wsData, isLoading } = useQuery({
    queryKey: ['workspaces-list'],
    queryFn: () =>
      apiRequest<{
        items: Array<{
          id: string;
          name: string;
          slug: string;
          description?: string;
          can_manage: boolean;
          member_count: number;
          members: Array<{
            user_id: string;
            full_name: string;
            email: string;
            department?: string;
            workspace_role: 'manager' | 'member';
          }>;
        }>;
      }>('/workspaces'),
  });

  const { data: orgUsers } = useQuery({
    queryKey: ['org-users-for-manager'],
    queryFn: () =>
      apiRequest<{
        items: Array<{
          id: string;
          full_name: string;
          email: string;
          role: string;
          department?: string;
        }>;
      }>('/users?page=1&page_size=100'),
  });

  const addMemberMutation = useMutation({
    mutationFn: (payload: {
      workspaceId: string;
      user_id: string;
      workspace_role: 'manager' | 'member';
    }) =>
      apiRequest(`/workspaces/${payload.workspaceId}/members`, {
        method: 'POST',
        body: {
          user_id: payload.user_id,
          workspace_role: payload.workspace_role,
        },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workspaces-list'] });
      queryClient.invalidateQueries({ queryKey: ['manager-overview'] });
      notify({
        title: 'Workspace member updated',
        description: 'User access to the team workspace has been saved.',
        variant: 'success',
      });
    },
    onError: (err: unknown) => {
      notify({
        title: 'Cannot update membership',
        description: err instanceof Error ? err.message : 'Operation denied',
        variant: 'error',
      });
    },
  });

  const removeMemberMutation = useMutation({
    mutationFn: (payload: { workspaceId: string; userId: string }) =>
      apiRequest(`/workspaces/${payload.workspaceId}/members/${payload.userId}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workspaces-list'] });
      notify({
        title: 'Member removed from workspace',
        variant: 'info',
      });
    },
  });

  const manageableWorkspaces = (wsData?.items || []).filter((w) => w.can_manage);
  const activeWsId = selectedWsId || manageableWorkspaces[0]?.id || '';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
          Team Membership & Document-Access Management
        </h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Assign organisation members to workspaces within your managerial scope.
        </p>
      </div>

      <Card className="p-6">
        <h2 className="text-base font-semibold text-slate-900 dark:text-white">
          Add or Update Workspace Member
        </h2>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-4">
          <Select
            label="Target Workspace"
            value={activeWsId}
            onChange={(e) => setSelectedWsId(e.target.value)}
            options={manageableWorkspaces.map((w) => ({
              value: w.id,
              label: w.name,
            }))}
          />
          <Select
            label="Organisation Member"
            value={selectedUserId}
            onChange={(e) => setSelectedUserId(e.target.value)}
            options={[
              { value: '', label: 'Select user...' },
              ...(orgUsers?.items || []).map((u) => ({
                value: u.id,
                label: `${u.full_name} (${u.email})`,
              })),
            ]}
          />
          <Select
            label="Workspace Role"
            value={workspaceRole}
            onChange={(e) => setWorkspaceRole(e.target.value as 'manager' | 'member')}
            options={[
              { value: 'member', label: 'Member (Read/Upload)' },
              { value: 'manager', label: 'Workspace Manager' },
            ]}
          />
          <div className="flex items-end">
            <Button
              disabled={!activeWsId || !selectedUserId}
              isLoading={addMemberMutation.isPending}
              onClick={() =>
                addMemberMutation.mutate({
                  workspaceId: activeWsId,
                  user_id: selectedUserId,
                  workspace_role: workspaceRole,
                })
              }
            >
              <UserPlus className="h-4 w-4" />
              Grant Workspace Access
            </Button>
          </div>
        </div>
      </Card>

      {isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <div className="space-y-4">
          {manageableWorkspaces.map((ws) => (
            <Card key={ws.id} className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                    {ws.name}
                  </h3>
                  <p className="text-xs text-slate-500">
                    {ws.description || `Workspace slug: ${ws.slug}`}
                  </p>
                </div>
                <Badge variant="brand">{ws.member_count} members</Badge>
              </div>

              <div className="mt-4 divide-y divide-slate-200 dark:divide-slate-800">
                {ws.members.map((m) => (
                  <div
                    key={m.user_id}
                    className="flex items-center justify-between py-2.5 text-sm"
                  >
                    <div>
                      <span className="font-medium text-slate-900 dark:text-white">
                        {m.full_name}
                      </span>{' '}
                      <span className="text-xs text-slate-500">({m.email})</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge
                        variant={m.workspace_role === 'manager' ? 'brand' : 'default'}
                      >
                        {m.workspace_role}
                      </Badge>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          removeMemberMutation.mutate({
                            workspaceId: ws.id,
                            userId: m.user_id,
                          })
                        }
                      >
                        <Trash2 className="h-4 w-4 text-rose-600" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}


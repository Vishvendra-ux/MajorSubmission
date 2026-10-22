import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Briefcase,
  CheckCircle2,
  Cpu,
  Database,
  FileText,
  FolderKanban,
  KeyRound,
  Lock,
  Plus,
  RefreshCw,
  ScrollText,
  Server,
  Settings,
  Shield,
  ShieldCheck,
  Trash2,
  Users,
} from 'lucide-react';
import { apiRequest } from '../../services/apiClient';
import {
  AuditLogItem,
  DocumentItem,
  PaginationMeta,
  ProcessingJobItem,
  UserRole,
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
  StatCard,
} from '../../components/ui/Primitives';
import { formatBytes, formatDateTime } from '../../utils/format';
import { useToast } from '../../hooks/useToast';

const COLORS = ['#2563eb', '#10b981', '#f59e0b', '#ef4444', '#6366f1'];

export function AdminOverviewPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['admin-dashboard'],
    queryFn: () =>
      apiRequest<{
        organisation: {
          id: string;
          name: string;
          slug: string;
          is_demo: boolean;
        };
        metrics: {
          total_users: number;
          admin_count: number;
          manager_count: number;
          employee_count: number;
          total_documents: number;
          ready_documents: number;
          processing_documents: number;
          failed_documents: number;
          total_chunks: number;
          total_conversations: number;
          total_questions: number;
          total_summaries: number;
          total_feedback: number;
          positive_feedback: number;
          negative_feedback: number;
          failed_jobs_count: number;
        };
        recent_audit_logs: AuditLogItem[];
        service_status: {
          postgresql: {
            engine: string;
            using_dev_fallback: boolean;
            fallback_reason?: string | null;
          };
          mongodb: {
            mode: string;
            using_dev_fallback: boolean;
            fallback_reason?: string | null;
          };
          worker: {
            mode: string;
            using_dev_fallback: boolean;
          };
        };
      }>('/admin/dashboard'),
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

  const m = data?.metrics;

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
              Enterprise Administration Overview
            </h1>
            <Badge variant="brand">Admin Governance</Badge>
          </div>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Organisation tenant: <strong>{data?.organisation.name}</strong> ({data?.organisation.slug})
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/app/admin/users">
            <Button variant="secondary" size="sm">
              <Users className="h-4 w-4" /> Users
            </Button>
          </Link>
          <Link to="/app/admin/audit-logs">
            <Button variant="secondary" size="sm">
              <ScrollText className="h-4 w-4" /> Audit Logs
            </Button>
          </Link>
          <Link to="/app/admin/system-config">
            <Button size="sm">
              <Settings className="h-4 w-4" /> System Config
            </Button>
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Organisation Users"
          value={m?.total_users ?? 0}
          subtitle={`${m?.admin_count ?? 0} Admin • ${m?.manager_count ?? 0} Mgr • ${m?.employee_count ?? 0} Emp`}
          icon={<Users className="h-5 w-5" />}
        />
        <StatCard
          label="Knowledge Corpus"
          value={m?.total_documents ?? 0}
          subtitle={`${m?.ready_documents ?? 0} ready • ${m?.total_chunks ?? 0} chunks`}
          icon={<FileText className="h-5 w-5" />}
        />
        <StatCard
          label="RAG Queries & Summaries"
          value={m?.total_questions ?? 0}
          subtitle={`${m?.total_conversations ?? 0} sessions • ${m?.total_summaries ?? 0} summaries`}
          icon={<Activity className="h-5 w-5" />}
        />
        <StatCard
          label="Ingestion Queue Health"
          value={m?.failed_jobs_count === 0 ? 'Healthy' : `${m?.failed_jobs_count} Failed`}
          subtitle={`${m?.processing_documents ?? 0} active jobs`}
          icon={<Cpu className="h-5 w-5" />}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="p-6 lg:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">
              Recent Security & Governance Audit Trail
            </h2>
            <Link
              to="/app/admin/audit-logs"
              className="text-xs font-medium text-brand-600 hover:underline dark:text-brand-400"
            >
              Full Audit Log →
            </Link>
          </div>
          <div className="mt-4 divide-y divide-slate-200 dark:divide-slate-800">
            {(data?.recent_audit_logs || []).map((log) => (
              <div
                key={log.id}
                className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm"
              >
                <div className="flex items-center gap-2">
                  <Badge
                    variant={
                      log.status === 'success'
                        ? 'success'
                        : log.status === 'denied'
                        ? 'danger'
                        : 'warning'
                    }
                  >
                    {log.status}
                  </Badge>
                  <code className="font-mono text-xs font-semibold text-slate-800 dark:text-slate-200">
                    {log.action}
                  </code>
                  <span className="text-xs text-slate-500">
                    by {log.actor_email || 'system'} ({log.actor_role || 'n/a'})
                  </span>
                </div>
                <span className="text-xs text-slate-400">
                  {formatDateTime(log.created_at)}
                </span>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-6">
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">
            Infrastructure & Runtime Telemetry
          </h2>
          <div className="mt-4 space-y-4 text-sm">
            <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
              <div className="flex items-center justify-between">
                <span className="font-medium">Authoritative RDBMS</span>
                <Badge
                  variant={
                    data?.service_status.postgresql.using_dev_fallback ? 'warning' : 'success'
                  }
                >
                  {data?.service_status.postgresql.engine}
                </Badge>
              </div>
              {data?.service_status.postgresql.using_dev_fallback && (
                <p className="mt-1 text-xs text-slate-500">
                  Dev Fallback Active: {data.service_status.postgresql.fallback_reason}
                </p>
              )}
            </div>

            <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
              <div className="flex items-center justify-between">
                <span className="font-medium">Document Metadata Store</span>
                <Badge
                  variant={
                    data?.service_status.mongodb.using_dev_fallback ? 'warning' : 'success'
                  }
                >
                  {data?.service_status.mongodb.mode}
                </Badge>
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
              <div className="flex items-center justify-between">
                <span className="font-medium">Background Worker</span>
                <Badge
                  variant={
                    data?.service_status.worker.using_dev_fallback ? 'info' : 'success'
                  }
                >
                  {data?.service_status.worker.mode}
                </Badge>
              </div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

interface OrgUserItem {
  id: string;
  email: string;
  full_name: string;
  job_title?: string | null;
  department?: string | null;
  is_active: boolean;
  is_demo: boolean;
  role: UserRole;
  joined_at: string;
  last_login_at?: string | null;
  workspaces: Array<{
    id: string;
    name: string;
    slug: string;
    workspace_role: string;
  }>;
}

export function UserManagementPage() {
  const { notify } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['admin-users', search, roleFilter],
    queryFn: () => {
      const params = new URLSearchParams({ page: '1', page_size: '50' });
      if (search.trim()) params.set('q', search.trim());
      if (roleFilter) params.set('role', roleFilter);
      return apiRequest<{ items: OrgUserItem[]; pagination: PaginationMeta }>(
        `/users?${params.toString()}`
      );
    },
  });

  const updateRoleMutation = useMutation({
    mutationFn: (payload: { userId: string; role: UserRole }) =>
      apiRequest(`/users/${payload.userId}/role`, {
        method: 'PATCH',
        body: { role: payload.role },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      notify({
        title: 'User role updated',
        description: 'RBAC permissions and audit log have been updated.',
        variant: 'success',
      });
    },
    onError: (err: unknown) => {
      notify({
        title: 'Role update failed',
        description: err instanceof Error ? err.message : 'Could not change role',
        variant: 'error',
      });
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: (payload: { userId: string; is_active: boolean }) =>
      apiRequest(`/users/${payload.userId}`, {
        method: 'PATCH',
        body: { is_active: payload.is_active },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      notify({
        title: 'Account status updated',
        variant: 'info',
      });
    },
    onError: (err: unknown) => {
      notify({
        title: 'Status change failed',
        description: err instanceof Error ? err.message : 'Unable to update status',
        variant: 'error',
      });
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
          User Identity & Role Management
        </h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Manage user accounts, role assignments, and active session eligibility across your organisation.
        </p>
      </div>

      <Card className="p-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="sm:col-span-2">
            <Input
              placeholder="Search by full name, email, or department..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            options={[
              { value: '', label: 'All Roles' },
              { value: 'admin', label: 'Administrators' },
              { value: 'manager', label: 'Managers' },
              { value: 'employee', label: 'Employees' },
            ]}
          />
        </div>
      </Card>

      {isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500 dark:border-slate-800 dark:bg-slate-900">
                <tr>
                  <th className="px-4 py-3">User Identity</th>
                  <th className="px-4 py-3">Department / Title</th>
                  <th className="px-4 py-3">Workspaces</th>
                  <th className="px-4 py-3">Assigned Role</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Governance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {(data?.items || []).map((u) => (
                  <tr key={u.id}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-slate-900 dark:text-white">
                          {u.full_name}
                        </span>
                        {u.is_demo && <Badge variant="warning">DEMO</Badge>}
                      </div>
                      <p className="text-xs text-slate-500">{u.email}</p>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-400">
                      <div>{u.job_title || '—'}</div>
                      <div className="text-slate-400">{u.department || '—'}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {u.workspaces.map((w) => (
                          <Badge key={w.id} variant="info">
                            {w.name}
                          </Badge>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <select
                        aria-label={`Role for ${u.email}`}
                        value={u.role}
                        onChange={(e) =>
                          updateRoleMutation.mutate({
                            userId: u.id,
                            role: e.target.value as UserRole,
                          })
                        }
                        className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                      >
                        <option value="admin">Admin</option>
                        <option value="manager">Manager</option>
                        <option value="employee">Employee</option>
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={u.is_active ? 'success' : 'danger'}>
                        {u.is_active ? 'Active' : 'Suspended'}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() =>
                          toggleActiveMutation.mutate({
                            userId: u.id,
                            is_active: !u.is_active,
                          })
                        }
                      >
                        {u.is_active ? 'Deactivate' : 'Activate'}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

export function RolePermissionPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['roles-and-permissions'],
    queryFn: () =>
      apiRequest<{
        roles: Array<{
          id: string;
          name: string;
          display_name: string;
          description: string;
          is_system: boolean;
          member_count: number;
          permissions: string[];
        }>;
        permissions_catalog: Array<{
          id: string;
          code: string;
          module: string;
          description: string;
        }>;
      }>('/roles'),
  });

  if (isLoading) return <Skeleton className="h-80 w-full" />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
          Role-Based Access Control (RBAC) Matrix
        </h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Authoritative permission definitions enforced on every FastAPI backend endpoint and database query.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {(data?.roles || []).map((role) => (
          <Card key={role.id} className="flex flex-col justify-between p-6">
            <div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-5 w-5 text-brand-600" />
                  <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                    {role.display_name}
                  </h2>
                </div>
                <Badge variant="brand">{role.member_count} users</Badge>
              </div>
              <p className="mt-2 text-xs text-slate-600 dark:text-slate-400">
                {role.description}
              </p>

              <div className="mt-4">
                <p className="text-xs font-semibold uppercase text-slate-400">
                  Granted Capabilities ({role.permissions.length})
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {role.permissions.map((perm) => (
                    <span
                      key={perm}
                      className="rounded border border-slate-200 bg-slate-50 px-2 py-0.5 font-mono text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                    >
                      {perm}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </Card>
        ))}
      </div>

      <Card className="p-6">
        <h2 className="text-base font-semibold text-slate-900 dark:text-white">
          System Permissions Catalog
        </h2>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(data?.permissions_catalog || []).map((p) => (
            <div
              key={p.id}
              className="rounded-lg border border-slate-200 p-3 dark:border-slate-800"
            >
              <div className="flex items-center justify-between">
                <code className="font-mono text-xs font-bold text-brand-600 dark:text-brand-400">
                  {p.code}
                </code>
                <Badge variant="default">{p.module}</Badge>
              </div>
              <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                {p.description}
              </p>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

export function OrgWorkspacePage() {
  const { notify } = useToast();
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [description, setDescription] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['workspaces-list'],
    queryFn: () =>
      apiRequest<{
        organisation: {
          id: string;
          name: string;
          slug: string;
          domain?: string;
          description?: string;
        };
        items: Array<{
          id: string;
          name: string;
          slug: string;
          description?: string;
          member_count: number;
          members: Array<{
            user_id: string;
            full_name: string;
            email: string;
            workspace_role: string;
          }>;
        }>;
      }>('/workspaces'),
  });

  const createWsMutation = useMutation({
    mutationFn: () =>
      apiRequest('/workspaces', {
        method: 'POST',
        body: { name, slug, description },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workspaces-list'] });
      setName('');
      setSlug('');
      setDescription('');
      notify({
        title: 'Workspace created',
        description: 'New department workspace is ready for document isolation.',
        variant: 'success',
      });
    },
    onError: (err: unknown) => {
      notify({
        title: 'Workspace creation failed',
        description: err instanceof Error ? err.message : 'Unable to create workspace',
        variant: 'error',
      });
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
          Organisation & Workspace Boundaries
        </h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Configure departmental workspaces within{' '}
          <strong>{data?.organisation.name || 'your organisation'}</strong> to isolate sensitive documents.
        </p>
      </div>

      <Card className="p-6">
        <h2 className="text-base font-semibold text-slate-900 dark:text-white">
          Create New Departmental Workspace
        </h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            createWsMutation.mutate();
          }}
          className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-4"
        >
          <Input
            label="Workspace Name"
            placeholder="e.g. Legal & Compliance"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setSlug(
                e.target.value
                  .toLowerCase()
                  .replace(/[^a-z0-9]+/g, '-')
                  .replace(/^-|-$/g, '')
              );
            }}
            required
          />
          <Input
            label="Identifier Slug"
            placeholder="legal-compliance"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            required
          />
          <Input
            label="Description"
            placeholder="Contracts, regulatory filings, and audits"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <div className="flex items-end">
            <Button type="submit" isLoading={createWsMutation.isPending}>
              <Plus className="h-4 w-4" />
              Create Workspace
            </Button>
          </div>
        </form>
      </Card>

      {isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {(data?.items || []).map((ws) => (
            <Card key={ws.id} className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    {ws.name}
                  </h3>
                  <p className="text-xs text-slate-500">Slug: {ws.slug}</p>
                </div>
                <Badge variant="brand">{ws.member_count} members</Badge>
              </div>
              {ws.description && (
                <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
                  {ws.description}
                </p>
              )}
              <div className="mt-4 flex flex-wrap gap-1.5">
                {ws.members.map((m) => (
                  <Badge key={m.user_id} variant="default">
                    {m.full_name} ({m.workspace_role})
                  </Badge>
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

export function AdminDocumentManagementPage() {
  const { notify } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [policyDoc, setPolicyDoc] = useState<DocumentItem | null>(null);
  const [principalType, setPrincipalType] = useState<'role' | 'workspace' | 'user'>('role');
  const [principalId, setPrincipalId] = useState('employee');
  const [effect, setEffect] = useState<'allow' | 'deny'>('allow');
  const [accessLevel, setAccessLevel] = useState<'view' | 'download' | 'manage'>('view');

  const { data, isLoading } = useQuery({
    queryKey: ['admin-all-docs', search],
    queryFn: () =>
      apiRequest<{ items: DocumentItem[]; pagination: PaginationMeta }>(
        `/documents?page=1&page_size=50${search ? `&q=${encodeURIComponent(search)}` : ''}`
      ),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest(`/documents/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-all-docs'] });
      notify({
        title: 'Document deleted',
        description: 'File, chunks, embeddings, and summaries have been purged.',
        variant: 'info',
      });
    },
  });

  const addPolicyMutation = useMutation({
    mutationFn: (docId: string) =>
      apiRequest(`/documents/${docId}/policies`, {
        method: 'POST',
        body: {
          principal_type: principalType,
          principal_id: principalId,
          access_level: accessLevel,
          effect,
        },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-all-docs'] });
      setPolicyDoc(null);
      notify({
        title: 'Access policy attached',
        description: 'Fine-grained ACL rule recorded and enforced.',
        variant: 'success',
      });
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
            Organisation Document Governance
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Audit ownership, attach explicit allow/deny ACL policies, or purge sensitive documents.
          </p>
        </div>
        <Link to="/app/upload">
          <Button>
            <Plus className="h-4 w-4" />
            Upload Document
          </Button>
        </Link>
      </div>

      <Card className="p-4">
        <Input
          placeholder="Search all organisation documents by title, filename, or tag..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </Card>

      {isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500 dark:border-slate-800 dark:bg-slate-900">
                <tr>
                  <th className="px-4 py-3">Document</th>
                  <th className="px-4 py-3">Owner</th>
                  <th className="px-4 py-3">Scope & Roles</th>
                  <th className="px-4 py-3">Chunks</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {(data?.items || []).map((doc) => (
                  <tr key={doc.id}>
                    <td className="px-4 py-3">
                      <Link
                        to={`/app/documents/${doc.id}`}
                        className="font-semibold text-slate-900 hover:text-brand-600 dark:text-white"
                      >
                        {doc.title}
                      </Link>
                      <p className="text-xs text-slate-500">
                        {doc.original_filename} ({formatBytes(doc.file_size_bytes)})
                      </p>
                    </td>
                    <td className="px-4 py-3 text-xs">
                      <div className="font-medium text-slate-800 dark:text-slate-200">
                        {doc.uploader_name}
                      </div>
                      <div className="text-slate-400">{doc.uploader_email}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-1">
                        <Badge variant="info">{doc.visibility}</Badge>
                        {doc.allowed_roles.map((r) => (
                          <Badge key={r} variant="default">
                            {r}
                          </Badge>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs font-semibold">
                      {doc.chunk_count}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={doc.status === 'ready' ? 'success' : 'warning'}>
                        {doc.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => setPolicyDoc(doc)}
                        >
                          <KeyRound className="h-3.5 w-3.5" />
                          ACL Rule
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => deleteMutation.mutate(doc.id)}
                          aria-label={`Delete ${doc.title}`}
                        >
                          <Trash2 className="h-4 w-4 text-rose-600" />
                        </Button>
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
        open={Boolean(policyDoc)}
        onClose={() => setPolicyDoc(null)}
        title={`Add Explicit ACL Policy — ${policyDoc?.title || ''}`}
      >
        {policyDoc && (
          <div className="space-y-4">
            <Select
              label="Principal Type"
              value={principalType}
              onChange={(e) =>
                setPrincipalType(e.target.value as 'role' | 'workspace' | 'user')
              }
              options={[
                { value: 'role', label: 'Role (admin / manager / employee)' },
                { value: 'workspace', label: 'Workspace ID' },
                { value: 'user', label: 'Specific User ID' },
              ]}
            />
            <Input
              label="Principal Identifier (Role name, Workspace ID, or User ID)"
              value={principalId}
              onChange={(e) => setPrincipalId(e.target.value)}
            />
            <div className="grid grid-cols-2 gap-3">
              <Select
                label="Policy Effect"
                value={effect}
                onChange={(e) => setEffect(e.target.value as 'allow' | 'deny')}
                options={[
                  { value: 'allow', label: 'ALLOW Access' },
                  { value: 'deny', label: 'DENY Access (Explicit Override)' },
                ]}
              />
              <Select
                label="Access Level"
                value={accessLevel}
                onChange={(e) =>
                  setAccessLevel(e.target.value as 'view' | 'download' | 'manage')
                }
                options={[
                  { value: 'view', label: 'View & Ask Assistant' },
                  { value: 'download', label: 'Download Original File' },
                  { value: 'manage', label: 'Manage Policy' },
                ]}
              />
            </div>
            <div className="flex justify-end gap-2 pt-3">
              <Button variant="secondary" onClick={() => setPolicyDoc(null)}>
                Cancel
              </Button>
              <Button
                isLoading={addPolicyMutation.isPending}
                onClick={() => addPolicyMutation.mutate(policyDoc.id)}
              >
                Save ACL Policy
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

export function AuditLogsPage() {
  const [actionFilter, setActionFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [actorFilter, setActorFilter] = useState('');
  const [selectedLog, setSelectedLog] = useState<AuditLogItem | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['admin-audit-logs', actionFilter, statusFilter, actorFilter],
    queryFn: () => {
      const params = new URLSearchParams({ page: '1', page_size: '50' });
      if (actionFilter.trim()) params.set('action', actionFilter.trim());
      if (statusFilter) params.set('status', statusFilter);
      if (actorFilter.trim()) params.set('actor_email', actorFilter.trim());
      return apiRequest<{ items: AuditLogItem[]; pagination: PaginationMeta }>(
        `/admin/audit-logs?${params.toString()}`
      );
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
          Security & Access Audit Logs
        </h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Tamper-evident record of authentication events, permission denials, document uploads, and administrative actions.
        </p>
      </div>

      <Card className="p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Input
            placeholder="Filter by action (e.g. auth.login, document.uploaded)..."
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
          />
          <Input
            placeholder="Filter by actor email..."
            value={actorFilter}
            onChange={(e) => setActorFilter(e.target.value)}
          />
          <Select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            options={[
              { value: '', label: 'All Statuses' },
              { value: 'success', label: 'Success' },
              { value: 'denied', label: 'Access Denied' },
              { value: 'failure', label: 'Failure' },
            ]}
          />
        </div>
      </Card>

      {isLoading ? (
        <Skeleton className="h-80 w-full" />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500 dark:border-slate-800 dark:bg-slate-900">
                <tr>
                  <th className="px-4 py-3">Timestamp</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Action</th>
                  <th className="px-4 py-3">Actor</th>
                  <th className="px-4 py-3">Target</th>
                  <th className="px-4 py-3 text-right">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {(data?.items || []).map((log) => (
                  <tr key={log.id}>
                    <td className="px-4 py-3 text-xs text-slate-500">
                      {formatDateTime(log.created_at)}
                    </td>
                    <td className="px-4 py-3">
                      <Badge
                        variant={
                          log.status === 'success'
                            ? 'success'
                            : log.status === 'denied'
                            ? 'danger'
                            : 'warning'
                        }
                      >
                        {log.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs font-semibold text-slate-900 dark:text-white">
                      {log.action}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      <div>{log.actor_email || 'Anonymous / System'}</div>
                      <div className="text-slate-400">{log.actor_role || ''}</div>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-400">
                      {log.target_type} {log.target_id ? `(${log.target_id.slice(0, 8)}…)` : ''}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setSelectedLog(log)}
                      >
                        Metadata
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Modal
        open={Boolean(selectedLog)}
        onClose={() => setSelectedLog(null)}
        title={`Audit Event — ${selectedLog?.action || ''}`}
      >
        {selectedLog && (
          <div className="space-y-3 text-xs">
            <div className="grid grid-cols-2 gap-2 rounded-lg bg-slate-50 p-3 dark:bg-slate-800">
              <div>
                <span className="font-semibold">Actor:</span> {selectedLog.actor_email || 'System'}
              </div>
              <div>
                <span className="font-semibold">Role:</span> {selectedLog.actor_role || 'N/A'}
              </div>
              <div>
                <span className="font-semibold">IP Address:</span> {selectedLog.ip_address || 'Local'}
              </div>
              <div>
                <span className="font-semibold">Timestamp:</span>{' '}
                {formatDateTime(selectedLog.created_at)}
              </div>
            </div>
            <div>
              <p className="font-semibold text-slate-700 dark:text-slate-300">
                Structured Audit Metadata:
              </p>
              <pre className="mt-1.5 overflow-x-auto rounded-lg bg-slate-900 p-3 font-mono text-xs text-slate-100">
                {JSON.stringify(selectedLog.metadata, null, 2)}
              </pre>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

export function UsageAnalyticsPage() {
  const [days, setDays] = useState(30);

  const { data, isLoading } = useQuery({
    queryKey: ['admin-analytics', days],
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
          documents_by_status: Array<{ name: string; count: number }>;
          documents_by_visibility: Array<{ name: string; count: number }>;
          answer_grounding_ratio: Array<{ name: string; value: number }>;
          feedback_ratio: Array<{ name: string; value: number }>;
          activity_timeline: Array<{
            date: string;
            documents: number;
            questions: number;
            positive_feedback: number;
            negative_feedback: number;
          }>;
        };
      }>(`/admin/analytics?days=${days}`),
  });

  if (isLoading) return <Skeleton className="h-96 w-full" />;

  const s = data?.summary;

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
            Organisation Usage & Grounding Analytics
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Real-time telemetry calculated directly from PostgreSQL records.
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
          label="Total Corpus Size"
          value={`${s?.total_documents ?? 0} Docs`}
          subtitle={`${formatBytes(s?.total_storage_bytes ?? 0)} • ${s?.total_chunks ?? 0} chunks`}
          icon={<Database className="h-5 w-5" />}
        />
        <StatCard
          label="Grounded Answers"
          value={s?.grounded_answers_count ?? 0}
          subtitle={`Out of ${s?.total_assistant_responses ?? 0} total responses`}
          icon={<CheckCircle2 className="h-5 w-5" />}
        />
        <StatCard
          label="Evidence Refusals"
          value={s?.insufficient_evidence_count ?? 0}
          subtitle="Hallucinations prevented"
          icon={<Shield className="h-5 w-5" />}
        />
        <StatCard
          label="User Feedback"
          value={`+${s?.positive_feedback_count ?? 0} / -${s?.negative_feedback_count ?? 0}`}
          subtitle={`Avg latency: ${s?.average_response_latency_ms ?? 0} ms`}
          icon={<BarChart3 className="h-5 w-5" />}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="p-6">
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">
            Activity Timeline (Uploads vs. Questions)
          </h2>
          <div className="mt-4 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data?.charts.activity_timeline || []}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="date" />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="documents"
                  name="Documents Uploaded"
                  stroke="#2563eb"
                  strokeWidth={2}
                />
                <Line
                  type="monotone"
                  dataKey="questions"
                  name="Questions Asked"
                  stroke="#10b981"
                  strokeWidth={2}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="p-6">
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">
            Documents by Visibility Scope
          </h2>
          <div className="mt-4 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data?.charts.documents_by_visibility || []}
                  dataKey="count"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={85}
                  label
                >
                  {(data?.charts.documents_by_visibility || []).map((_, idx) => (
                    <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>
    </div>
  );
}

export function JobMonitoringPage() {
  const { notify } = useToast();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['admin-jobs', statusFilter],
    queryFn: () =>
      apiRequest<{
        worker_status: {
          mode: string;
          broker_url: string;
          using_dev_fallback: boolean;
          fallback_reason?: string | null;
        };
        items: ProcessingJobItem[];
        pagination: PaginationMeta;
      }>(`/admin/jobs?page=1&page_size=50${statusFilter ? `&status=${statusFilter}` : ''}`),
  });

  const retryMutation = useMutation({
    mutationFn: (jobId: string) =>
      apiRequest(`/admin/jobs/${jobId}/retry`, { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-jobs'] });
      notify({
        title: 'Ingestion job retried',
        description: 'Previous partial chunks were cleaned and the pipeline re-indexed the document.',
        variant: 'success',
      });
    },
    onError: (err: unknown) => {
      notify({
        title: 'Retry failed',
        description: err instanceof Error ? err.message : 'Unable to retry job',
        variant: 'error',
      });
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
            Ingestion Pipeline & Job Monitoring
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Inspect background document parsing, OCR, chunking, and vector indexing jobs. Safe retries prevent duplicate chunks.
          </p>
        </div>
        <div className="w-48">
          <Select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            options={[
              { value: '', label: 'All Job States' },
              { value: 'completed', label: 'Completed' },
              { value: 'processing', label: 'Processing' },
              { value: 'queued', label: 'Queued' },
              { value: 'failed', label: 'Failed' },
            ]}
          />
        </div>
      </div>

      {data?.worker_status && (
        <Card className="border-brand-200 bg-brand-50/40 p-4 dark:border-brand-900 dark:bg-brand-950/20">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2">
              <Server className="h-4 w-4 text-brand-600" />
              <span className="font-semibold text-slate-900 dark:text-white">
                Active Queue Dispatcher: {data.worker_status.mode}
              </span>
            </div>
            {data.worker_status.using_dev_fallback && (
              <span className="text-slate-600 dark:text-slate-400">
                {data.worker_status.fallback_reason}
              </span>
            )}
          </div>
        </Card>
      )}

      {isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500 dark:border-slate-800 dark:bg-slate-900">
                <tr>
                  <th className="px-4 py-3">Document</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Stage & Progress</th>
                  <th className="px-4 py-3">Attempts</th>
                  <th className="px-4 py-3">Duration</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {(data?.items || []).map((job) => (
                  <tr key={job.id}>
                    <td className="px-4 py-3">
                      <Link
                        to={`/app/documents/${job.document_id}`}
                        className="font-semibold text-slate-900 hover:text-brand-600 dark:text-white"
                      >
                        {job.document_title || job.original_filename}
                      </Link>
                      <p className="text-xs text-slate-500">
                        Job ID: {job.id.slice(0, 8)} • {job.file_type?.toUpperCase()}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <Badge
                        variant={
                          job.status === 'completed'
                            ? 'success'
                            : job.status === 'failed'
                            ? 'danger'
                            : 'warning'
                        }
                      >
                        {job.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-xs">
                      <div className="font-medium text-slate-800 dark:text-slate-200">
                        {job.current_stage || 'Completed'} ({job.progress_percent}%)
                      </div>
                      {job.error_message && (
                        <div className="mt-1 text-rose-600 dark:text-rose-400">
                          Error: {job.error_message}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {job.attempt_count} / {job.max_attempts || 3}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">
                      {job.duration_ms ? `${job.duration_ms} ms` : '—'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button
                        size="sm"
                        variant="secondary"
                        isLoading={retryMutation.isPending}
                        onClick={() => retryMutation.mutate(job.id)}
                      >
                        <RefreshCw className="h-3.5 w-3.5" />
                        Safe Retry
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

export function SystemConfigPage() {
  const { notify } = useToast();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['admin-system-config'],
    queryFn: () =>
      apiRequest<{
        editable_settings: {
          max_upload_size_mb: number;
          chunk_size_chars: number;
          chunk_overlap_chars: number;
          rag_top_k: number;
          rag_min_similarity_score: number;
          ocr_enabled: boolean;
          session_timeout_minutes: number;
        };
        environment_info: {
          app_name: string;
          app_env: string;
          llm_provider: string;
          llm_model: string;
          llm_api_key_present: boolean;
          embedding_provider: string;
          embedding_model: string;
          embedding_dimension: number;
          email_provider: string;
          supported_formats: string[];
        };
      }>('/admin/system-config'),
  });

  const [maxUploadMb, setMaxUploadMb] = useState(25);
  const [chunkSize, setChunkSize] = useState(900);
  const [chunkOverlap, setChunkOverlap] = useState(150);
  const [ragTopK, setRagTopK] = useState(6);
  const [minSim, setMinSim] = useState(0.15);
  const [ocrEnabled, setOcrEnabled] = useState(true);

  useEffect(() => {
    if (data?.editable_settings) {
      setMaxUploadMb(data.editable_settings.max_upload_size_mb);
      setChunkSize(data.editable_settings.chunk_size_chars);
      setChunkOverlap(data.editable_settings.chunk_overlap_chars);
      setRagTopK(data.editable_settings.rag_top_k);
      setMinSim(data.editable_settings.rag_min_similarity_score);
      setOcrEnabled(data.editable_settings.ocr_enabled);
    }
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: () =>
      apiRequest('/admin/system-config', {
        method: 'PATCH',
        body: {
          max_upload_size_mb: Number(maxUploadMb),
          chunk_size_chars: Number(chunkSize),
          chunk_overlap_chars: Number(chunkOverlap),
          rag_top_k: Number(ragTopK),
          rag_min_similarity_score: Number(minSim),
          ocr_enabled: ocrEnabled,
        },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-system-config'] });
      notify({
        title: 'System configuration saved',
        description: 'Runtime ingestion and RAG parameters have been updated and audited.',
        variant: 'success',
      });
    },
  });

  if (isLoading) return <Skeleton className="h-80 w-full" />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
          System Configuration & AI Provider Telemetry
        </h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Tune safe, non-secret runtime parameters for document chunking, OCR, and RAG evidence thresholds. Secrets remain strictly server-side.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="p-6 lg:col-span-2">
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">
            Editable Ingestion & Retrieval Settings
          </h2>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              saveMutation.mutate();
            }}
            className="mt-4 space-y-4"
          >
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input
                label="Max Upload File Size (MB)"
                type="number"
                min={1}
                max={100}
                value={String(maxUploadMb)}
                onChange={(e) => setMaxUploadMb(Number(e.target.value))}
              />
              <Input
                label="RAG Top-K Retrieved Chunks"
                type="number"
                min={1}
                max={20}
                value={String(ragTopK)}
                onChange={(e) => setRagTopK(Number(e.target.value))}
              />
              <Input
                label="Chunk Target Size (Characters)"
                type="number"
                min={250}
                max={4000}
                value={String(chunkSize)}
                onChange={(e) => setChunkSize(Number(e.target.value))}
              />
              <Input
                label="Chunk Overlap (Characters)"
                type="number"
                min={0}
                max={1000}
                value={String(chunkOverlap)}
                onChange={(e) => setChunkOverlap(Number(e.target.value))}
              />
              <Input
                label="Minimum Grounding Similarity Threshold (0.05 - 0.90)"
                type="number"
                step="0.01"
                min={0.05}
                max={0.9}
                value={String(minSim)}
                onChange={(e) => setMinSim(Number(e.target.value))}
              />
              <div className="flex items-center pt-6">
                <label className="flex items-center gap-2.5 text-sm font-medium text-slate-800 dark:text-slate-200">
                  <input
                    type="checkbox"
                    checked={ocrEnabled}
                    onChange={(e) => setOcrEnabled(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-brand-600"
                  />
                  Enable Tesseract OCR for Scanned PDFs
                </label>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <Button type="submit" isLoading={saveMutation.isPending}>
                <Settings className="h-4 w-4" />
                Save Runtime Configuration
              </Button>
            </div>
          </form>
        </Card>

        <Card className="p-6">
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">
            Active AI & Environment Profile
          </h2>
          <div className="mt-4 space-y-3 text-xs">
            <div className="flex justify-between border-b border-slate-100 pb-2 dark:border-slate-800">
              <span className="text-slate-500">LLM Provider</span>
              <span className="font-mono font-semibold">
                {data?.environment_info.llm_provider}
              </span>
            </div>
            <div className="flex justify-between border-b border-slate-100 pb-2 dark:border-slate-800">
              <span className="text-slate-500">LLM Model</span>
              <span className="font-mono">{data?.environment_info.llm_model}</span>
            </div>
            <div className="flex justify-between border-b border-slate-100 pb-2 dark:border-slate-800">
              <span className="text-slate-500">External API Key</span>
              <Badge
                variant={
                  data?.environment_info.llm_api_key_present ? 'success' : 'info'
                }
              >
                {data?.environment_info.llm_api_key_present
                  ? 'Configured (Masked)'
                  : 'Local Grounded Synthesis'}
              </Badge>
            </div>
            <div className="flex justify-between border-b border-slate-100 pb-2 dark:border-slate-800">
              <span className="text-slate-500">Embedding Model</span>
              <span className="font-mono">
                {data?.environment_info.embedding_model} ({data?.environment_info.embedding_dimension}d)
              </span>
            </div>
            <div className="flex justify-between border-b border-slate-100 pb-2 dark:border-slate-800">
              <span className="text-slate-500">Supported Formats</span>
              <span className="font-mono uppercase">
                {data?.environment_info.supported_formats.join(', ')}
              </span>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}


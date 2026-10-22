import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  Check,
  Copy,
  Download,
  Edit3,
  Eye,
  FileSpreadsheet,
  FileText,
  KeyRound,
  Plus,
  RefreshCw,
  Search,
  Shield,
  Sparkles,
  Trash2,
  Upload,
} from 'lucide-react';
import { apiRequest } from '../../services/apiClient';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../hooks/useToast';
import type {
  AccessPolicy,
  CitationItem,
  DocumentChunkItem,
  DocumentItem,
  DocumentSummary,
  PaginationMeta,
  UserRole,
} from '../../types/api';
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  Dialog,
  EmptyState,
  ErrorState,
  Input,
  Pagination,
  Progress,
  Select,
  Skeleton,
  StatusBadge,
} from '../../components/ui/Primitives';
import { CitationCard, SourcePreviewModal } from '../../components/shared/CitationCard';
import { SafeMarkdown } from '../../components/shared/SafeMarkdown';
import { formatBytes, formatDate, formatDateTime } from '../../utils/format';

// ============================================================================
// 1. DOCUMENT LIBRARY PAGE
// ============================================================================
export function DocumentLibraryPage() {
  const { user } = useAuth();
  const { toast } = useToast();

  const [docs, setDocs] = useState<DocumentItem[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta>({
    page: 1,
    page_size: 10,
    total: 0,
    total_pages: 1,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters & Sorting
  const [q, setQ] = useState('');
  const [fileType, setFileType] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [workspaceId, setWorkspaceId] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [sortBy, setSortBy] = useState('created_at');
  const [sortOrder, setSortOrder] = useState('desc');
  const [page, setPage] = useState(1);

  // Modals
  const [renameTarget, setRenameTarget] = useState<DocumentItem | null>(null);
  const [newTitle, setNewTitle] = useState('');
  const [newVisibility, setNewVisibility] = useState<'organisation' | 'workspace' | 'restricted'>(
    'organisation'
  );
  const [deleteTarget, setDeleteTarget] = useState<DocumentItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadDocuments = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('page_size', '10');
      params.set('sort_by', sortBy);
      params.set('sort_order', sortOrder);
      if (q.trim()) params.set('q', q.trim());
      if (fileType) params.set('file_type', fileType);
      if (statusFilter) params.set('status', statusFilter);
      if (workspaceId) params.set('workspace_id', workspaceId);
      if (dateFrom) params.set('date_from', dateFrom);
      if (dateTo) params.set('date_to', dateTo);

      const res = await apiRequest<{
        items: DocumentItem[];
        pagination: PaginationMeta;
      }>(`/documents?${params.toString()}`);
      setDocs(res.items);
      setPagination(res.pagination);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to load document library');
    } finally {
      setLoading(false);
    }
  }, [page, sortBy, sortOrder, q, fileType, statusFilter, workspaceId, dateFrom, dateTo]);

  useEffect(() => {
    loadDocuments();
  }, [loadDocuments]);

  const handleSignedDownload = async (doc: DocumentItem) => {
    try {
      const res = await apiRequest<{ download_url: string }>(
        `/documents/${doc.id}/signed-download-url`
      );
      window.open(res.download_url, '_blank', 'noopener,noreferrer');
      toast({
        title: 'Signed Download Started',
        description: `Generated short-lived signed URL for ${doc.original_filename}.`,
        variant: 'info',
      });
    } catch (err: unknown) {
      toast({
        title: 'Download Denied',
        description: err instanceof Error ? err.message : 'Failed to generate download URL',
        variant: 'error',
      });
    }
  };

  const handleReprocess = async (doc: DocumentItem) => {
    try {
      await apiRequest(`/documents/${doc.id}/reprocess`, { method: 'POST' });
      toast({
        title: 'Document Reprocessed',
        description: `'${doc.title}' chunks and embeddings were refreshed.`,
        variant: 'success',
      });
      loadDocuments();
    } catch (err: unknown) {
      toast({
        title: 'Reprocess Failed',
        description: err instanceof Error ? err.message : 'Error',
        variant: 'error',
      });
    }
  };

  const handleRenameSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!renameTarget || !newTitle.trim()) return;
    try {
      await apiRequest(`/documents/${renameTarget.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          title: newTitle.trim(),
          visibility: newVisibility,
        }),
      });
      setRenameTarget(null);
      toast({ title: 'Document metadata updated', variant: 'success' });
      loadDocuments();
    } catch (err: unknown) {
      toast({
        title: 'Update Failed',
        description: err instanceof Error ? err.message : 'Error',
        variant: 'error',
      });
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await apiRequest(`/documents/${deleteTarget.id}`, { method: 'DELETE' });
      toast({
        title: 'Document Deleted',
        description: `'${deleteTarget.title}' and all indexed chunks were removed.`,
        variant: 'info',
      });
      setDeleteTarget(null);
      loadDocuments();
    } catch (err: unknown) {
      toast({
        title: 'Delete Failed',
        description: err instanceof Error ? err.message : 'Error',
        variant: 'error',
      });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Document Library</h1>
          <p className="text-xs text-slate-500">
            Browse, filter, preview, reprocess, and manage permissions for authorised knowledge
            files.
          </p>
        </div>
        <Link to="/app/upload">
          <Button variant="primary">
            <Upload className="h-4 w-4" />
            Upload New Document
          </Button>
        </Link>
      </div>

      {/* Filter Bar */}
      <Card className="p-4 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
          <div className="lg:col-span-2">
            <Input
              label="Search Title, Filename or Tag"
              placeholder="e.g., security policy, handbook, budget..."
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <Select
            label="File Type"
            value={fileType}
            onChange={(e) => {
              setFileType(e.target.value);
              setPage(1);
            }}
            options={[
              { value: '', label: 'All Formats' },
              { value: 'pdf', label: 'PDF' },
              { value: 'docx', label: 'DOCX' },
              { value: 'pptx', label: 'PPTX' },
              { value: 'xlsx', label: 'XLSX' },
              { value: 'txt', label: 'TXT' },
            ]}
          />
          <Select
            label="Status"
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            options={[
              { value: '', label: 'All States' },
              { value: 'ready', label: 'Ready' },
              { value: 'processing', label: 'Processing' },
              { value: 'queued', label: 'Queued' },
              { value: 'failed', label: 'Failed' },
            ]}
          />
          <Select
            label="Workspace"
            value={workspaceId}
            onChange={(e) => {
              setWorkspaceId(e.target.value);
              setPage(1);
            }}
            options={[
              { value: '', label: 'All Workspaces' },
              ...(user?.workspaces.map((w) => ({ value: w.id, label: w.name })) || []),
            ]}
          />
          <Select
            label="Sort By"
            value={`${sortBy}:${sortOrder}`}
            onChange={(e) => {
              const [sb, so] = e.target.value.split(':');
              setSortBy(sb);
              setSortOrder(so);
            }}
            options={[
              { value: 'created_at:desc', label: 'Newest First' },
              { value: 'created_at:asc', label: 'Oldest First' },
              { value: 'title:asc', label: 'Title (A–Z)' },
              { value: 'file_size_bytes:desc', label: 'Largest Size' },
            ]}
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-1.5 text-slate-500">
              <span>From:</span>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="rounded border border-slate-300 dark:border-slate-700 bg-transparent px-2 py-1"
              />
            </label>
            <label className="flex items-center gap-1.5 text-slate-500">
              <span>To:</span>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="rounded border border-slate-300 dark:border-slate-700 bg-transparent px-2 py-1"
              />
            </label>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setQ('');
              setFileType('');
              setStatusFilter('');
              setWorkspaceId('');
              setDateFrom('');
              setDateTo('');
              setPage(1);
            }}
          >
            Reset Filters
          </Button>
        </div>
      </Card>

      {/* Documents List */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map((n) => (
            <Skeleton key={n} className="h-24 w-full" />
          ))}
        </div>
      ) : error ? (
        <ErrorState message={error} onRetry={loadDocuments} />
      ) : docs.length === 0 ? (
        <EmptyState
          title="No matching documents found"
          description="Try clearing your search filters or upload a new internal document."
          action={
            <Link to="/app/upload">
              <Button variant="primary" size="sm">
                Upload Document
              </Button>
            </Link>
          }
        />
      ) : (
        <Card className="p-4 sm:p-6">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  <th className="py-3 pr-4">Document</th>
                  <th className="py-3 px-3">Format & Size</th>
                  <th className="py-3 px-3">Visibility & Scope</th>
                  <th className="py-3 px-3">Ingestion State</th>
                  <th className="py-3 pl-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
                {docs.map((doc) => (
                  <tr key={doc.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                    <td className="py-4 pr-4 max-w-md">
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-blue-600 shrink-0" />
                        <Link
                          to={`/app/documents/${doc.id}`}
                          className="font-bold text-sm text-slate-900 dark:text-white hover:text-blue-600 truncate"
                        >
                          {doc.title}
                        </Link>
                        {doc.is_demo && <Badge variant="amber">DEMO</Badge>}
                      </div>
                      <p className="mt-1 text-slate-500 truncate">
                        {doc.original_filename} • Uploaded by {doc.uploader_name} on{' '}
                        {formatDate(doc.created_at)}
                      </p>
                    </td>

                    <td className="py-4 px-3 whitespace-nowrap">
                      <Badge variant="neutral">{doc.file_type.toUpperCase()}</Badge>
                      <span className="ml-2 text-slate-500">
                        {formatBytes(doc.file_size_bytes)}
                      </span>
                    </td>

                    <td className="py-4 px-3 whitespace-nowrap">
                      <Badge
                        variant={
                          doc.visibility === 'restricted'
                            ? 'rose'
                            : doc.visibility === 'workspace'
                              ? 'purple'
                              : 'blue'
                        }
                      >
                        {doc.visibility}
                      </Badge>
                      {doc.workspace_name && (
                        <p className="mt-1 text-[11px] text-slate-400">{doc.workspace_name}</p>
                      )}
                    </td>

                    <td className="py-4 px-3 whitespace-nowrap">
                      <StatusBadge status={doc.status} />
                      <p className="mt-1 text-[11px] text-slate-500">
                        {doc.chunk_count} chunks • {doc.page_count} unit(s)
                      </p>
                    </td>

                    <td className="py-4 pl-3 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1.5">
                        <Link to={`/app/documents/${doc.id}`}>
                          <Button variant="outline" size="sm" title="Preview & Inspect Chunks">
                            <Eye className="h-3.5 w-3.5" />
                            Inspect
                          </Button>
                        </Link>
                        <Link to={`/app/documents/${doc.id}/summary`}>
                          <Button variant="outline" size="sm" title="AI Document Summary">
                            <Sparkles className="h-3.5 w-3.5 text-blue-600" />
                            Summary
                          </Button>
                        </Link>
                        {doc.can_download && (
                          <Button
                            variant="ghost"
                            size="sm"
                            aria-label={`Download ${doc.title}`}
                            onClick={() => handleSignedDownload(doc)}
                          >
                            <Download className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        {doc.can_manage && (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              aria-label={`Edit ${doc.title}`}
                              onClick={() => {
                                setRenameTarget(doc);
                                setNewTitle(doc.title);
                                setNewVisibility(doc.visibility);
                              }}
                            >
                              <Edit3 className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              aria-label={`Reprocess ${doc.title}`}
                              onClick={() => handleReprocess(doc)}
                            >
                              <RefreshCw className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              aria-label={`Delete ${doc.title}`}
                              onClick={() => setDeleteTarget(doc)}
                            >
                              <Trash2 className="h-3.5 w-3.5 text-rose-600" />
                            </Button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <Pagination
            page={pagination.page}
            totalPages={pagination.total_pages}
            total={pagination.total}
            onPageChange={(next) => setPage(next)}
          />
        </Card>
      )}

      {/* Rename & Visibility Modal */}
      <Dialog
        open={Boolean(renameTarget)}
        onClose={() => setRenameTarget(null)}
        title="Edit Document Metadata & Visibility"
      >
        <form onSubmit={handleRenameSubmit} className="space-y-4">
          <Input
            label="Document Title"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            required
          />
          <Select
            label="Visibility Scope"
            value={newVisibility}
            onChange={(e) =>
              setNewVisibility(
                e.target.value as 'organisation' | 'workspace' | 'restricted'
              )
            }
            options={[
              { value: 'organisation', label: 'Organisation-Wide (All Permitted Roles)' },
              { value: 'workspace', label: 'Workspace Members Only' },
              { value: 'restricted', label: 'Restricted (Admins, Owner & Explicit Policies)' },
            ]}
          />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setRenameTarget(null)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary">
              Save Changes
            </Button>
          </div>
        </form>
      </Dialog>

      {/* Delete Confirmation Modal */}
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDeleteConfirm}
        isLoading={deleting}
        isDanger
        title="Permanently Delete Document?"
        description={`Deleting '${deleteTarget?.title}' will permanently remove the stored file, all indexed vector chunks, generated summaries, and MongoDB extraction records.`}
        confirmLabel="Delete Permanently"
      />
    </div>
  );
}

// ============================================================================
// 2. UPLOAD DOCUMENTS PAGE
// ============================================================================
export function UploadDocumentsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [visibility, setVisibility] = useState<'organisation' | 'workspace' | 'restricted'>(
    'organisation'
  );
  const [workspaceId, setWorkspaceId] = useState(user?.workspaces[0]?.id || '');
  const [allowedRoles, setAllowedRoles] = useState<UserRole[]>(['admin', 'manager', 'employee']);
  const [tags, setTags] = useState('');

  const [uploading, setUploading] = useState(false);
  const [uploadedDoc, setUploadedDoc] = useState<DocumentItem | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const toggleRole = (role: UserRole) => {
    if (role === 'admin') return; // Admin always included
    setAllowedRoles((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]
    );
  };

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) {
      setUploadError('Please choose a PDF, DOCX, PPTX, XLSX, or TXT file to upload.');
      return;
    }
    setUploading(true);
    setUploadError(null);
    setUploadedDoc(null);

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      if (title.trim()) formData.append('title', title.trim());
      if (description.trim()) formData.append('description', description.trim());
      formData.append('visibility', visibility);
      if (workspaceId) formData.append('workspace_id', workspaceId);
      formData.append('allowed_roles', JSON.stringify(allowedRoles));
      if (tags.trim()) formData.append('tags', tags.trim());
      formData.append('process_immediately', 'true');

      const res = await apiRequest<{ document: DocumentItem }>('/documents', {
        method: 'POST',
        body: formData,
      });

      setUploadedDoc(res.document);
      toast({
        title: 'Document Uploaded & Indexed',
        description: `'${res.document.title}' processed into ${res.document.chunk_count} searchable chunks.`,
        variant: 'success',
      });
    } catch (err: unknown) {
      setUploadError(err instanceof Error ? err.message : 'Document upload failed');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
          Upload & Ingest Internal Document
        </h1>
        <p className="text-xs text-slate-500">
          Supported formats: PDF, DOCX, PPTX, XLSX, TXT. Files are validated by magic-byte
          signature, stored outside public directories, chunked with location metadata, and embedded
          for semantic retrieval.
        </p>
      </div>

      {uploadError && (
        <div
          role="alert"
          className="rounded-xl border border-rose-200 bg-rose-50 dark:bg-rose-950/40 p-4 text-xs font-medium text-rose-700 dark:text-rose-300"
        >
          {uploadError}
        </div>
      )}

      {uploadedDoc && (
        <Card className="p-6 border-emerald-300 dark:border-emerald-800 bg-emerald-50/40 dark:bg-emerald-950/20 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Badge variant="emerald">INGESTION COMPLETE</Badge>
              <h2 className="mt-2 text-lg font-bold text-slate-900 dark:text-white">
                {uploadedDoc.title}
              </h2>
              <p className="text-xs text-slate-600 dark:text-slate-300">
                Indexed {uploadedDoc.chunk_count} chunks across {uploadedDoc.page_count} unit(s) •
                SHA-256: <code className="font-mono">{uploadedDoc.sha256_checksum.slice(0, 16)}...</code>
              </p>
            </div>
            <StatusBadge status={uploadedDoc.status} />
          </div>
          <Progress value={uploadedDoc.processing_progress} />
          <div className="flex flex-wrap gap-2.5">
            <Button
              variant="primary"
              size="sm"
              onClick={() => navigate(`/app/documents/${uploadedDoc.id}`)}
            >
              Inspect Extracted Chunks
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate(`/app/documents/${uploadedDoc.id}/summary`)}
            >
              Generate Executive Summary
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate(`/app/assistant`)}
            >
              Ask AI Assistant
            </Button>
          </div>
        </Card>
      )}

      <Card className="p-6 sm:p-8">
        <form onSubmit={handleUploadSubmit} className="space-y-5">
          {/* File Dropzone */}
          <label
            htmlFor="document-file-input"
            className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-300 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-900/50 p-8 text-center cursor-pointer hover:border-blue-500 transition-colors"
          >
            <Upload className="h-8 w-8 text-blue-600 mb-2" />
            <span className="text-sm font-semibold text-slate-900 dark:text-white">
              {selectedFile ? selectedFile.name : 'Click to select a document file'}
            </span>
            <span className="mt-1 text-xs text-slate-500">
              {selectedFile
                ? `${formatBytes(selectedFile.size)} selected`
                : 'PDF, DOCX, PPTX, XLSX, or TXT (up to 25 MB)'}
            </span>
            <input
              id="document-file-input"
              type="file"
              accept=".pdf,.docx,.pptx,.xlsx,.txt"
              onChange={(e) => {
                const f = e.target.files?.[0] || null;
                setSelectedFile(f);
                if (f && !title) {
                  setTitle(f.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' '));
                }
              }}
              className="sr-only"
            />
          </label>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Document Title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Q4 Information Security Standard"
            />
            <Input
              label="Tags (Comma-separated)"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="security, compliance, sla"
            />
          </div>

          <Input
            label="Description (Optional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Brief context about this document's purpose and audience..."
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Select
              label="Access Visibility"
              value={visibility}
              onChange={(e) =>
                setVisibility(
                  e.target.value as 'organisation' | 'workspace' | 'restricted'
                )
              }
              options={[
                { value: 'organisation', label: 'Organisation-Wide (Selected Roles)' },
                { value: 'workspace', label: 'Workspace Members Only' },
                { value: 'restricted', label: 'Restricted (Admins, Owner & Explicit Policies)' },
              ]}
            />
            <Select
              label="Assign to Workspace"
              value={workspaceId}
              onChange={(e) => setWorkspaceId(e.target.value)}
              options={[
                { value: '', label: 'General / Organisation Level' },
                ...(user?.workspaces.map((w) => ({ value: w.id, label: w.name })) || []),
              ]}
            />
          </div>

          <div className="space-y-2">
            <span className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">
              Permitted Organisational Roles
            </span>
            <div className="flex flex-wrap gap-3">
              {(['admin', 'manager', 'employee'] as UserRole[]).map((r) => (
                <label
                  key={r}
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-xs font-medium cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={allowedRoles.includes(r)}
                    disabled={r === 'admin'}
                    onChange={() => toggleRole(r)}
                    className="rounded text-blue-600"
                  />
                  <span className="capitalize">{r}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
            <Link to="/app/documents">
              <Button variant="outline">Cancel</Button>
            </Link>
            <Button type="submit" variant="primary" isLoading={uploading}>
              <Upload className="h-4 w-4" />
              Upload & Run Ingestion Pipeline
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}

// ============================================================================
// 3. DOCUMENT DETAIL, PREVIEW & ACCESS POLICY PAGE
// ============================================================================
export function DocumentDetailPage() {
  const { documentId } = useParams<{ documentId: string }>();
  const [searchParams] = useSearchParams();
  const highlightedChunkId = searchParams.get('chunk');
  const { toast } = useToast();

  const [doc, setDoc] = useState<DocumentItem | null>(null);
  const [chunks, setChunks] = useState<DocumentChunkItem[]>([]);
  const [policies, setPolicies] = useState<AccessPolicy[]>([]);
  const [chunkFilter, setChunkFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Add policy state
  const [policyModalOpen, setPolicyModalOpen] = useState(false);
  const [principalType, setPrincipalType] = useState<'role' | 'workspace' | 'user'>('role');
  const [principalId, setPrincipalId] = useState('employee');
  const [accessLevel, setAccessLevel] = useState<'view' | 'download' | 'manage'>('view');
  const [effect, setEffect] = useState<'allow' | 'deny'>('allow');

  const loadDetail = useCallback(async () => {
    if (!documentId) return;
    setLoading(true);
    setError(null);
    try {
      const [detailRes, previewRes] = await Promise.all([
        apiRequest<DocumentItem>(`/documents/${documentId}`),
        apiRequest<{ document: DocumentItem; chunks: DocumentChunkItem[] }>(
          `/documents/${documentId}/preview${
            highlightedChunkId ? `?chunk_id=${encodeURIComponent(highlightedChunkId)}` : ''
          }`
        ),
      ]);
      setDoc(detailRes);
      setPolicies(detailRes.access_policies || []);
      setChunks(previewRes.chunks);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to load document details');
    } finally {
      setLoading(false);
    }
  }, [documentId, highlightedChunkId]);

  useEffect(() => {
    loadDetail();
  }, [loadDetail]);

  const handleAddPolicy = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!doc || !principalId.trim()) return;
    try {
      await apiRequest(`/documents/${doc.id}/policies`, {
        method: 'POST',
        body: JSON.stringify({
          principal_type: principalType,
          principal_id: principalId.trim(),
          access_level: accessLevel,
          effect,
        }),
      });
      setPolicyModalOpen(false);
      toast({ title: 'Access policy rule added', variant: 'success' });
      loadDetail();
    } catch (err: unknown) {
      toast({
        title: 'Could not add policy',
        description: err instanceof Error ? err.message : 'Error',
        variant: 'error',
      });
    }
  };

  const handleDeletePolicy = async (policyId: string) => {
    if (!doc) return;
    try {
      await apiRequest(`/documents/${doc.id}/policies/${policyId}`, {
        method: 'DELETE',
      });
      toast({ title: 'Access policy removed', variant: 'info' });
      loadDetail();
    } catch (err: unknown) {
      toast({
        title: 'Failed to remove policy',
        description: err instanceof Error ? err.message : 'Error',
        variant: 'error',
      });
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-80 w-full" />
      </div>
    );
  }

  if (error || !doc) {
    return <ErrorState title="Document Access Denied or Not Found" message={error || 'Not found'} />;
  }

  const filteredChunks = chunkFilter.trim()
    ? chunks.filter(
        (c) =>
          c.content.toLowerCase().includes(chunkFilter.toLowerCase()) ||
          c.location_label.toLowerCase().includes(chunkFilter.toLowerCase())
      )
    : chunks;

  return (
    <div className="space-y-6">
      {/* Header Card */}
      <Card className="p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="blue">{doc.file_type.toUpperCase()}</Badge>
              <StatusBadge status={doc.status} />
              <Badge variant="neutral">Visibility: {doc.visibility}</Badge>
              {doc.is_demo && <Badge variant="amber">DEMO DATA</Badge>}
            </div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white pt-1">
              {doc.title}
            </h1>
            {doc.description && (
              <p className="text-xs text-slate-600 dark:text-slate-300">{doc.description}</p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <Link to={`/app/documents/${doc.id}/summary`}>
              <Button variant="primary" size="sm">
                <Sparkles className="h-4 w-4" />
                Executive Summary
              </Button>
            </Link>
            {doc.can_manage && (
              <Button variant="outline" size="sm" onClick={() => setPolicyModalOpen(true)}>
                <KeyRound className="h-4 w-4" />
                Manage Access Policies
              </Button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-4 border-t border-slate-200 dark:border-slate-800 text-xs">
          <div>
            <span className="text-slate-400 block">Original Filename</span>
            <span className="font-semibold">{doc.original_filename}</span>
          </div>
          <div>
            <span className="text-slate-400 block">Size & Indexed Chunks</span>
            <span className="font-semibold">
              {formatBytes(doc.file_size_bytes)} • {doc.chunk_count} chunks
            </span>
          </div>
          <div>
            <span className="text-slate-400 block">Permitted Roles</span>
            <span className="font-semibold capitalize">{doc.allowed_roles.join(', ')}</span>
          </div>
          <div>
            <span className="text-slate-400 block">SHA-256 Checksum</span>
            <span className="font-mono text-[11px]">{doc.sha256_checksum.slice(0, 20)}...</span>
          </div>
        </div>
      </Card>

      {/* Access Policies Section */}
      <Card className="p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-blue-600" />
            <h2 className="text-sm font-bold">Explicit Access Policy Overrides</h2>
          </div>
          {doc.can_manage && (
            <Button variant="outline" size="sm" onClick={() => setPolicyModalOpen(true)}>
              <Plus className="h-3.5 w-3.5" />
              Add Policy Rule
            </Button>
          )}
        </div>
        {policies.length === 0 ? (
          <p className="text-xs text-slate-500">
            No custom access policy overrides configured. Standard {doc.visibility} visibility and
            role rules ({doc.allowed_roles.join(', ')}) apply.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {policies.map((pol) => (
              <div
                key={pol.id}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 px-3 py-1.5 text-xs"
              >
                <Badge variant={pol.effect === 'allow' ? 'emerald' : 'rose'}>
                  {pol.effect.toUpperCase()}
                </Badge>
                <span>
                  {pol.principal_type}: <strong>{pol.principal_id}</strong> ({pol.access_level})
                </span>
                {doc.can_manage && (
                  <button
                    type="button"
                    onClick={() => handleDeletePolicy(pol.id)}
                    aria-label="Remove policy"
                    className="text-rose-500 hover:text-rose-700 ml-1"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Indexed Source Chunks Viewer */}
      <Card className="p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              Extracted & Indexed Document Chunks ({filteredChunks.length})
            </h2>
            <p className="text-xs text-slate-500">
              Exact source passages with preserved page, slide, sheet, or section location labels.
            </p>
          </div>
          <div className="w-full sm:w-64">
            <Input
              placeholder="Filter passages..."
              value={chunkFilter}
              onChange={(e) => setChunkFilter(e.target.value)}
            />
          </div>
        </div>

        <div className="space-y-3">
          {filteredChunks.map((ch) => (
            <div
              key={ch.id}
              id={`chunk-${ch.id}`}
              className={`rounded-xl border p-4 transition-all ${
                ch.id === highlightedChunkId || ch.is_highlighted
                  ? 'border-blue-600 bg-blue-50/60 dark:bg-blue-950/40 ring-2 ring-blue-500/30'
                  : 'border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-900/40'
              }`}
            >
              <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-200/70 dark:border-slate-800">
                <div className="flex items-center gap-2">
                  <Badge variant="blue">{ch.location_label}</Badge>
                  {ch.id === highlightedChunkId && (
                    <Badge variant="emerald">Cited Passage</Badge>
                  )}
                </div>
                <span className="text-[11px] text-slate-400">
                  Chunk #{ch.chunk_index + 1} • ~{ch.token_count} tokens
                </span>
              </div>
              <p className="text-xs sm:text-sm text-slate-800 dark:text-slate-200 whitespace-pre-wrap leading-relaxed">
                {ch.content}
              </p>
            </div>
          ))}
        </div>
      </Card>

      {/* Add Access Policy Modal */}
      <Dialog
        open={policyModalOpen}
        onClose={() => setPolicyModalOpen(false)}
        title="Add Document Access Policy Rule"
        description="Explicit DENY rules always override ALLOW rules."
      >
        <form onSubmit={handleAddPolicy} className="space-y-4">
          <Select
            label="Principal Type"
            value={principalType}
            onChange={(e) =>
              setPrincipalType(e.target.value as 'role' | 'workspace' | 'user')
            }
            options={[
              { value: 'role', label: 'Organisational Role (admin / manager / employee)' },
              { value: 'workspace', label: 'Workspace ID' },
              { value: 'user', label: 'User ID' },
            ]}
          />
          <Input
            label="Principal Identifier"
            value={principalId}
            onChange={(e) => setPrincipalId(e.target.value)}
            placeholder="e.g., employee or manager or user UUID"
            required
          />
          <div className="grid grid-cols-2 gap-3">
            <Select
              label="Access Level"
              value={accessLevel}
              onChange={(e) =>
                setAccessLevel(e.target.value as 'view' | 'download' | 'manage')
              }
              options={[
                { value: 'view', label: 'View & Search' },
                { value: 'download', label: 'View & Download' },
                { value: 'manage', label: 'Full Manage' },
              ]}
            />
            <Select
              label="Policy Effect"
              value={effect}
              onChange={(e) => setEffect(e.target.value as 'allow' | 'deny')}
              options={[
                { value: 'allow', label: 'ALLOW' },
                { value: 'deny', label: 'DENY' },
              ]}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setPolicyModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary">
              Save Policy Rule
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}

// ============================================================================
// 4. DOCUMENT SUMMARY PAGE & SUMMARIES HUB
// ============================================================================
export function DocumentSummaryPage() {
  const { documentId } = useParams<{ documentId: string }>();
  const { toast } = useToast();

  const [docs, setDocs] = useState<DocumentItem[]>([]);
  const [selectedId, setSelectedId] = useState<string>(documentId || '');
  const [summary, setSummary] = useState<DocumentSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [regenerating, setRegenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [activeCitation, setActiveCitation] = useState<CitationItem | null>(null);

  useEffect(() => {
    apiRequest<{ items: DocumentItem[] }>('/documents?status=ready&page_size=50')
      .then((res) => {
        setDocs(res.items);
        if (!selectedId && res.items.length > 0) {
          setSelectedId(res.items[0].id);
        }
      })
      .catch(() => {});
  }, [selectedId]);

  const loadSummary = useCallback(async (targetDocId: string) => {
    if (!targetDocId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await apiRequest<DocumentSummary>(`/documents/${targetDocId}/summary`);
      setSummary(res);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to load document summary');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (documentId) setSelectedId(documentId);
  }, [documentId]);

  useEffect(() => {
    if (selectedId) loadSummary(selectedId);
  }, [selectedId, loadSummary]);

  const handleRegenerate = async () => {
    if (!selectedId) return;
    setRegenerating(true);
    try {
      const res = await apiRequest<DocumentSummary>(`/documents/${selectedId}/summary`, {
        method: 'POST',
      });
      setSummary(res);
      toast({
        title: 'Summary Regenerated',
        description: 'Synthesized fresh executive and detailed summary from indexed chunks.',
        variant: 'success',
      });
    } catch (err: unknown) {
      toast({
        title: 'Regeneration Failed',
        description: err instanceof Error ? err.message : 'Error',
        variant: 'error',
      });
    } finally {
      setRegenerating(false);
    }
  };

  const handleCopySummary = () => {
    if (!summary) return;
    const text = `${summary.document_title}\n\nExecutive Summary:\n${summary.executive_summary}\n\nMain Points:\n${summary.main_points.join('\n- ')}`;
    navigator.clipboard?.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
            AI-Generated Document Summary
          </h1>
          <p className="text-xs text-slate-500">
            Hierarchical synthesis distinguishing extracted facts, dates, thresholds, and action
            items from interpretation.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {docs.length > 0 && (
            <div className="w-64">
              <Select
                aria-label="Select document to summarise"
                value={selectedId}
                onChange={(e) => setSelectedId(e.target.value)}
                options={docs.map((d) => ({ value: d.id, label: d.title }))}
              />
            </div>
          )}
          <Button variant="outline" size="sm" onClick={handleCopySummary} disabled={!summary}>
            {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
            {copied ? 'Copied' : 'Copy Summary'}
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={handleRegenerate}
            isLoading={regenerating}
            disabled={!selectedId}
          >
            <RefreshCw className="h-4 w-4" />
            Regenerate Summary
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-4">
          <Skeleton className="h-36 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : error ? (
        <ErrorState message={error} onRetry={() => loadSummary(selectedId)} />
      ) : !summary ? (
        <EmptyState
          title="Select a Ready Document to Summarise"
          description="Upload and index a document to generate an executive summary."
        />
      ) : (
        <div className="space-y-6">
          {/* Executive Summary Card */}
          <Card className="p-6 border-blue-200 dark:border-blue-900 bg-blue-50/30 dark:bg-blue-950/20 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-blue-600" />
                <h2 className="text-base font-bold text-slate-900 dark:text-white">
                  Executive Summary — {summary.document_title}
                </h2>
              </div>
              <Badge variant="blue">
                {summary.provider_used} ({summary.model_used})
              </Badge>
            </div>
            <p className="text-sm text-slate-800 dark:text-slate-200 leading-relaxed">
              {summary.executive_summary}
            </p>
            <p className="text-[11px] text-slate-500 italic">{summary.interpretation_notes}</p>
          </Card>

          {/* Main Points & Risks/Action Items */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="p-6 space-y-3">
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-900 dark:text-white">
                Extracted Key Points
              </h3>
              <ul className="space-y-2.5 text-xs sm:text-sm text-slate-700 dark:text-slate-300">
                {summary.main_points.map((pt, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-blue-600 shrink-0" />
                    <span>{pt}</span>
                  </li>
                ))}
              </ul>
            </Card>

            <Card className="p-6 space-y-3">
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-900 dark:text-white">
                Risks, Obligations & Action Items
              </h3>
              <ul className="space-y-2.5 text-xs sm:text-sm text-slate-700 dark:text-slate-300">
                {summary.risks_and_actions.map((item, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-amber-500 shrink-0" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </Card>
          </div>

          {/* Entities, Dates, Thresholds & Decisions */}
          <Card className="p-6 space-y-4">
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-900 dark:text-white">
              Extracted Dates, Numeric Thresholds & Policy Decisions
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-4 space-y-2">
                <span className="font-bold text-slate-500 uppercase">Dates & Timelines</span>
                <div className="flex flex-wrap gap-1.5">
                  {(summary.entities.dates_and_timelines || []).map((d, i) => (
                    <Badge key={i} variant="blue">
                      {d}
                    </Badge>
                  ))}
                </div>
              </div>
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-4 space-y-2">
                <span className="font-bold text-slate-500 uppercase">Metrics & Thresholds</span>
                <div className="flex flex-wrap gap-1.5">
                  {(summary.entities.metrics_and_thresholds || []).map((m, i) => (
                    <Badge key={i} variant="emerald">
                      {m}
                    </Badge>
                  ))}
                </div>
              </div>
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-4 space-y-2">
                <span className="font-bold text-slate-500 uppercase">Key Decisions</span>
                <ul className="space-y-1 text-slate-600 dark:text-slate-300">
                  {(summary.entities.key_decisions_and_policies || []).map((dec, i) => (
                    <li key={i}>• {dec}</li>
                  ))}
                </ul>
              </div>
            </div>
          </Card>

          {/* Detailed Section-by-Section Synthesis */}
          <Card className="p-6 space-y-3">
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-900 dark:text-white">
              Detailed Section Synthesis
            </h3>
            <SafeMarkdown content={summary.detailed_summary} />
          </Card>

          {/* Supporting Source Citations */}
          <Card className="p-6 space-y-3">
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-900 dark:text-white">
              Verified Source Citations ({summary.citations.length})
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {summary.citations.map((cite) => (
                <CitationCard
                  key={cite.chunk_id}
                  citation={cite}
                  onInspect={(c) => setActiveCitation(c)}
                />
              ))}
            </div>
          </Card>
        </div>
      )}

      <SourcePreviewModal citation={activeCitation} onClose={() => setActiveCitation(null)} />
    </div>
  );
}


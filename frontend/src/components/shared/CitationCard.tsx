import React, { useState } from 'react';
import { BookOpen, ExternalLink, FileText, Lock } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { CitationItem, DocumentChunkItem, DocumentItem } from '../../types/api';
import { apiRequest } from '../../services/apiClient';
import { Badge, Button, Dialog, ErrorState, Skeleton } from '../ui/Primitives';

export function CitationCard({
  citation,
  onInspect,
}: {
  citation: CitationItem;
  onInspect?: (citation: CitationItem) => void;
}) {
  const isAccessible = citation.is_accessible !== false;

  return (
    <div className="group flex flex-col justify-between rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/60 p-3.5 transition-all hover:border-blue-400 dark:hover:border-blue-600">
      <div>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded bg-blue-600 text-[11px] font-bold text-white">
              {citation.citation_index}
            </span>
            <span className="truncate text-xs font-semibold text-slate-900 dark:text-slate-100">
              {citation.document_title}
            </span>
          </div>
          <Badge variant="blue" className="shrink-0">
            {citation.location_label}
          </Badge>
        </div>

        <p className="mt-2 line-clamp-3 text-xs text-slate-600 dark:text-slate-400 italic leading-relaxed">
          "{citation.excerpt}"
        </p>
      </div>

      <div className="mt-3 flex items-center justify-between border-t border-slate-200/70 dark:border-slate-800 pt-2.5 text-[11px]">
        <span className="text-slate-500 dark:text-slate-400 uppercase font-medium">
          {citation.file_type}
          {typeof citation.similarity_score === 'number' &&
            ` • Relevance ${(citation.similarity_score * 100).toFixed(0)}%`}
        </span>

        {isAccessible ? (
          <div className="flex items-center gap-2">
            {onInspect && (
              <button
                type="button"
                onClick={() => onInspect(citation)}
                className="inline-flex items-center gap-1 font-semibold text-blue-600 dark:text-blue-400 hover:underline"
              >
                <BookOpen className="h-3.5 w-3.5" />
                Inspect Source
              </button>
            )}
            <Link
              to={`/app/documents/${citation.document_id}?chunk=${citation.chunk_id}`}
              className="inline-flex items-center gap-1 font-medium text-slate-600 dark:text-slate-300 hover:text-blue-600"
            >
              Open
              <ExternalLink className="h-3 w-3" />
            </Link>
          </div>
        ) : (
          <span className="inline-flex items-center gap-1 text-rose-600 dark:text-rose-400 font-medium">
            <Lock className="h-3 w-3" />
            Access Restricted
          </span>
        )}
      </div>
    </div>
  );
}

export function SourcePreviewModal({
  citation,
  onClose,
}: {
  citation: CitationItem | null;
  onClose: () => void;
}) {
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [previewData, setPreviewData] = useState<{
    document: DocumentItem;
    chunks: DocumentChunkItem[];
  } | null>(null);

  React.useEffect(() => {
    if (!citation) {
      setPreviewData(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    apiRequest<{ document: DocumentItem; chunks: DocumentChunkItem[] }>(
      `/documents/${citation.document_id}/preview?chunk_id=${encodeURIComponent(citation.chunk_id)}`
    )
      .then((res) => {
        if (!cancelled) setPreviewData(res);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message || 'Unable to load source preview');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [citation]);

  if (!citation) return null;

  return (
    <Dialog
      open={Boolean(citation)}
      onClose={onClose}
      title={`Verified Source: ${citation.document_title}`}
      description={`Cited Location: ${citation.location_label} • Chunk ID: ${citation.chunk_id.slice(0, 8)}`}
      maxWidth="max-w-3xl"
    >
      {loading && (
        <div className="space-y-3 py-4">
          <Skeleton className="h-6 w-1/2" />
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
        </div>
      )}

      {error && <ErrorState title="Source Access Denied or Unavailable" message={error} />}

      {!loading && !error && previewData && (
        <div className="space-y-4">
          <div className="rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50/70 dark:bg-blue-950/40 p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-blue-700 dark:text-blue-300">
                Exact Cited Passage ({citation.location_label})
              </span>
              <Badge variant="blue">{previewData.document.file_type.toUpperCase()}</Badge>
            </div>
            <p className="mt-2 text-sm text-slate-800 dark:text-slate-100 whitespace-pre-wrap leading-relaxed">
              {citation.excerpt}
            </p>
          </div>

          <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Full Document Context ({previewData.chunks.length} indexed chunks)
            </h4>
            {previewData.chunks.map((ch) => (
              <div
                key={ch.id}
                className={`rounded-xl border p-3.5 text-xs leading-relaxed ${
                  ch.id === citation.chunk_id || ch.is_highlighted
                    ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-950/30 ring-2 ring-blue-500/20'
                    : 'border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-900/40'
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="font-semibold text-slate-900 dark:text-slate-100">
                    {ch.location_label}
                  </span>
                  <span className="text-slate-400">Chunk #{ch.chunk_index + 1}</span>
                </div>
                <p className="text-slate-700 dark:text-slate-300 whitespace-pre-wrap">{ch.content}</p>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
            <Link to={`/app/documents/${citation.document_id}`}>
              <Button variant="outline" size="sm">
                <FileText className="h-4 w-4" />
                Open Full Document View
              </Button>
            </Link>
            <Button variant="primary" size="sm" onClick={onClose}>
              Done Inspecting
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  );
}


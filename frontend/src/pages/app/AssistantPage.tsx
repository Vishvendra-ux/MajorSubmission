import React, { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  Bot,
  Check,
  Copy,
  Edit3,
  Filter,
  MessageSquarePlus,
  RefreshCw,
  Send,
  ShieldCheck,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  User as UserIcon,
} from 'lucide-react';
import { apiRequest } from '../../services/apiClient';
import { useToast } from '../../hooks/useToast';
import type {
  ChatMessageItem,
  CitationItem,
  ConversationItem,
  DocumentItem,
} from '../../types/api';
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  Dialog,
  EmptyState,
  Input,
  Select,
  Skeleton,
} from '../../components/ui/Primitives';
import { CitationCard, SourcePreviewModal } from '../../components/shared/CitationCard';
import { SafeMarkdown } from '../../components/shared/SafeMarkdown';
import { formatDateTime } from '../../utils/format';

const SUGGESTED_PROMPTS = [
  'What is our incident response SLA for critical security breaches and what encryption is required?',
  'How many days of paid annual leave and sick leave do full-time employees receive?',
  'What is the hybrid work policy and annual learning stipend amount?',
  'What are the Q3 2026 ARR and cloud infrastructure budget numbers?',
];

export function AssistantPage() {
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialConvId = searchParams.get('conversation');

  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [activeConv, setActiveConv] = useState<ConversationItem | null>(null);
  const [availableDocs, setAvailableDocs] = useState<DocumentItem[]>([]);
  const [selectedDocIds, setSelectedDocIds] = useState<string[]>([]);
  const [searchMode, setSearchMode] = useState<'hybrid' | 'semantic' | 'keyword'>('hybrid');

  const [question, setQuestion] = useState('');
  const [sending, setSending] = useState(false);
  const [loadingList, setLoadingList] = useState(true);
  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null);

  // Modals
  const [activeCitation, setActiveCitation] = useState<CitationItem | null>(null);
  const [scopeModalOpen, setScopeModalOpen] = useState(false);
  const [renameModalOpen, setRenameModalOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  // Feedback modal
  const [feedbackTarget, setFeedbackTarget] = useState<{
    messageId: string;
    rating: 'positive' | 'negative';
  } | null>(null);
  const [feedbackComment, setFeedbackComment] = useState('');
  const [feedbackCategory, setFeedbackCategory] = useState('accurate_citations');
  const [submittingFeedback, setSubmittingFeedback] = useState(false);

  const loadConversationsAndDocs = useCallback(async () => {
    setLoadingList(true);
    try {
      const [convRes, docRes] = await Promise.all([
        apiRequest<{ items: ConversationItem[] }>('/chat/conversations?page_size=50'),
        apiRequest<{ items: DocumentItem[] }>('/documents?status=ready&page_size=100'),
      ]);
      setConversations(convRes.items);
      setAvailableDocs(docRes.items);

      const targetId = initialConvId || convRes.items[0]?.id;
      if (targetId) {
        const detail = await apiRequest<ConversationItem>(`/chat/conversations/${targetId}`);
        setActiveConv(detail);
        setSelectedDocIds(detail.scoped_document_ids || []);
      }
    } catch (err: unknown) {
      toast({
        title: 'Unable to load assistant data',
        description: err instanceof Error ? err.message : 'Error',
        variant: 'error',
      });
    } finally {
      setLoadingList(false);
    }
  }, [initialConvId, toast]);

  useEffect(() => {
    loadConversationsAndDocs();
  }, [loadConversationsAndDocs]);

  const selectConversation = async (convId: string) => {
    setSearchParams({ conversation: convId });
    try {
      const detail = await apiRequest<ConversationItem>(`/chat/conversations/${convId}`);
      setActiveConv(detail);
      setSelectedDocIds(detail.scoped_document_ids || []);
    } catch (err: unknown) {
      toast({
        title: 'Could not open conversation',
        description: err instanceof Error ? err.message : 'Error',
        variant: 'error',
      });
    }
  };

  const handleNewConversation = async () => {
    try {
      const created = await apiRequest<ConversationItem>('/chat/conversations', {
        method: 'POST',
        body: JSON.stringify({
          title: 'New Knowledge Session',
          scoped_document_ids: selectedDocIds,
        }),
      });
      setConversations((prev) => [created, ...prev]);
      setActiveConv(created);
      setSearchParams({ conversation: created.id });
    } catch (err: unknown) {
      toast({
        title: 'Failed to create conversation',
        description: err instanceof Error ? err.message : 'Error',
        variant: 'error',
      });
    }
  };

  const askQuestion = async (promptText?: string) => {
    const q = (promptText ?? question).trim();
    if (!q || sending) return;
    setSending(true);
    if (!promptText) setQuestion('');

    try {
      let targetConv = activeConv;
      if (!targetConv) {
        const created = await apiRequest<ConversationItem>('/chat/conversations', {
          method: 'POST',
          body: JSON.stringify({
            title: q.slice(0, 80),
            scoped_document_ids: selectedDocIds,
            initial_question: q,
          }),
        });
        setActiveConv(created);
        setConversations((prev) => [created, ...prev]);
        setSearchParams({ conversation: created.id });
        return;
      }

      await apiRequest<{
        user_message: ChatMessageItem;
        assistant_message: ChatMessageItem;
      }>(`/chat/conversations/${targetConv.id}/messages`, {
        method: 'POST',
        body: JSON.stringify({
          question: q,
          scoped_document_ids: selectedDocIds,
          search_mode: searchMode,
        }),
      });

      const refreshed = await apiRequest<ConversationItem>(
        `/chat/conversations/${targetConv.id}`
      );
      setActiveConv(refreshed);
      setConversations((prev) =>
        prev.map((c) => (c.id === refreshed.id ? refreshed : c))
      );
    } catch (err: unknown) {
      toast({
        title: 'Assistant Request Failed',
        description: err instanceof Error ? err.message : 'Could not generate response',
        variant: 'error',
      });
    } finally {
      setSending(false);
    }
  };

  const handleRenameConversation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeConv || !newTitle.trim()) return;
    try {
      const updated = await apiRequest<ConversationItem>(
        `/chat/conversations/${activeConv.id}`,
        {
          method: 'PATCH',
          body: JSON.stringify({ title: newTitle.trim() }),
        }
      );
      setActiveConv(updated);
      setConversations((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
      setRenameModalOpen(false);
      toast({ title: 'Conversation renamed', variant: 'success' });
    } catch (err: unknown) {
      toast({
        title: 'Rename failed',
        description: err instanceof Error ? err.message : 'Error',
        variant: 'error',
      });
    }
  };

  const handleDeleteConversation = async () => {
    if (!activeConv) return;
    try {
      await apiRequest(`/chat/conversations/${activeConv.id}`, { method: 'DELETE' });
      const remaining = conversations.filter((c) => c.id !== activeConv.id);
      setConversations(remaining);
      setDeleteConfirmOpen(false);
      if (remaining.length > 0) {
        selectConversation(remaining[0].id);
      } else {
        setActiveConv(null);
        setSearchParams({});
      }
      toast({ title: 'Conversation deleted', variant: 'info' });
    } catch (err: unknown) {
      toast({
        title: 'Delete failed',
        description: err instanceof Error ? err.message : 'Error',
        variant: 'error',
      });
    }
  };

  const handleSaveScope = async () => {
    if (activeConv) {
      try {
        const updated = await apiRequest<ConversationItem>(
          `/chat/conversations/${activeConv.id}`,
          {
            method: 'PATCH',
            body: JSON.stringify({ scoped_document_ids: selectedDocIds }),
          }
        );
        setActiveConv(updated);
      } catch {
        // Ignore if not saved yet
      }
    }
    setScopeModalOpen(false);
    toast({
      title: 'Document Retrieval Scope Updated',
      description:
        selectedDocIds.length > 0
          ? `Restricted retrieval to ${selectedDocIds.length} selected document(s).`
          : 'Searching across all authorised Ready documents.',
      variant: 'info',
    });
  };

  const submitFeedback = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!feedbackTarget) return;
    setSubmittingFeedback(true);
    try {
      await apiRequest(`/chat/messages/${feedbackTarget.messageId}/feedback`, {
        method: 'POST',
        body: JSON.stringify({
          rating: feedbackTarget.rating,
          comment: feedbackComment.trim() || undefined,
          issue_category: feedbackCategory,
        }),
      });
      if (activeConv) {
        const refreshed = await apiRequest<ConversationItem>(
          `/chat/conversations/${activeConv.id}`
        );
        setActiveConv(refreshed);
      }
      setFeedbackTarget(null);
      setFeedbackComment('');
      toast({
        title: 'Feedback Recorded',
        description: 'Thank you for helping audit answer grounding quality.',
        variant: 'success',
      });
    } catch (err: unknown) {
      toast({
        title: 'Feedback Submission Notice',
        description: err instanceof Error ? err.message : 'Could not save feedback',
        variant: 'warning',
      });
    } finally {
      setSubmittingFeedback(false);
    }
  };

  const copyMessage = (msgId: string, text: string) => {
    navigator.clipboard?.writeText(text);
    setCopiedMsgId(msgId);
    setTimeout(() => setCopiedMsgId(null), 2000);
  };

  const messages = activeConv?.messages || [];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 min-h-[calc(100vh-8.5rem)]">
      {/* Left Conversation History Sidebar */}
      <Card className="lg:col-span-3 flex flex-col p-4 max-h-[82vh]">
        <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-200 dark:border-slate-800">
          <h2 className="text-sm font-bold text-slate-900 dark:text-white">Conversations</h2>
          <Button variant="primary" size="sm" onClick={handleNewConversation}>
            <MessageSquarePlus className="h-3.5 w-3.5" />
            New Chat
          </Button>
        </div>

        <div className="mt-3 flex-1 overflow-y-auto space-y-1.5 pr-1">
          {loadingList ? (
            <div className="space-y-2">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : conversations.length === 0 ? (
            <p className="py-8 text-center text-xs text-slate-400">
              No conversations yet. Ask a question to begin.
            </p>
          ) : (
            conversations.map((conv) => {
              const isSelected = activeConv?.id === conv.id;
              return (
                <button
                  key={conv.id}
                  type="button"
                  onClick={() => selectConversation(conv.id)}
                  className={`w-full text-left rounded-xl p-3 transition-colors border ${
                    isSelected
                      ? 'border-blue-600 bg-blue-50/70 dark:bg-blue-950/40 text-blue-950 dark:text-white'
                      : 'border-transparent hover:bg-slate-100 dark:hover:bg-slate-800/70'
                  }`}
                >
                  <p className="truncate text-xs font-semibold">{conv.title}</p>
                  <p className="mt-1 truncate text-[11px] text-slate-500 dark:text-slate-400">
                    {conv.last_message_preview || 'No messages yet'}
                  </p>
                </button>
              );
            })
          )}
        </div>
      </Card>

      {/* Main RAG Chat Panel */}
      <Card className="lg:col-span-9 flex flex-col max-h-[82vh] overflow-hidden">
        {/* Assistant Top Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/60 px-5 py-3.5">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Bot className="h-5 w-5 text-blue-600 shrink-0" />
              <h1 className="truncate text-sm font-bold text-slate-900 dark:text-white">
                {activeConv?.title || 'SUMIND-IQ Grounded Knowledge Assistant'}
              </h1>
              <Badge variant="emerald">
                <ShieldCheck className="h-3 w-3" />
                RAG Grounded
              </Badge>
            </div>
            <p className="mt-0.5 text-[11px] text-slate-500">
              Scope:{' '}
              <strong>
                {selectedDocIds.length === 0
                  ? `All Authorised Ready Documents (${availableDocs.length})`
                  : `${selectedDocIds.length} Selected Document(s)`}
              </strong>{' '}
              • Mode: <strong className="uppercase">{searchMode}</strong>
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Select
              aria-label="Retrieval mode"
              value={searchMode}
              onChange={(e) =>
                setSearchMode(e.target.value as 'hybrid' | 'semantic' | 'keyword')
              }
              className="h-8 text-xs py-1 w-32"
              options={[
                { value: 'hybrid', label: 'Hybrid Search' },
                { value: 'semantic', label: 'Vector Semantic' },
                { value: 'keyword', label: 'Exact Keyword' },
              ]}
            />
            <Button variant="outline" size="sm" onClick={() => setScopeModalOpen(true)}>
              <Filter className="h-3.5 w-3.5" />
              Document Scope ({selectedDocIds.length || 'All'})
            </Button>
            {activeConv && (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label="Rename conversation"
                  onClick={() => {
                    setNewTitle(activeConv.title);
                    setRenameModalOpen(true);
                  }}
                >
                  <Edit3 className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label="Delete conversation"
                  onClick={() => setDeleteConfirmOpen(true)}
                >
                  <Trash2 className="h-3.5 w-3.5 text-rose-600" />
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Messages Stream */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {messages.length === 0 ? (
            <div className="my-auto py-8 space-y-6">
              <EmptyState
                icon={Sparkles}
                title="Ask a Question Grounded in Your Authorised Documents"
                description="SUMIND-IQ retrieves relevant chunks from documents you have permission to view, validates source locations, and refuses to guess when evidence is missing."
              />
              <div className="max-w-2xl mx-auto space-y-2">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-400 text-center">
                  Suggested Grounded Questions
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {SUGGESTED_PROMPTS.map((prompt, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => askQuestion(prompt)}
                      className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/60 p-3 text-left text-xs text-slate-700 dark:text-slate-200 hover:border-blue-500 transition-colors"
                    >
                      "{prompt}"
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            messages.map((msg, index) => {
              const isUser = msg.role === 'user';
              const prevUserQuestion =
                !isUser && index > 0 && messages[index - 1]?.role === 'user'
                  ? messages[index - 1].content
                  : undefined;

              return (
                <div
                  key={msg.id}
                  className={`flex gap-3.5 ${isUser ? 'justify-end' : 'justify-start'}`}
                >
                  {!isUser && (
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white mt-1">
                      <Bot className="h-4 w-4" />
                    </div>
                  )}

                  <div
                    className={`max-w-3xl w-full rounded-2xl p-4 sm:p-5 ${
                      isUser
                        ? 'max-w-xl bg-slate-900 text-white dark:bg-blue-600'
                        : 'border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs'
                    }`}
                  >
                    {isUser ? (
                      <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                    ) : (
                      <div className="space-y-4">
                        {/* Grounding status header */}
                        <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-slate-100 dark:border-slate-800">
                          <div className="flex items-center gap-2">
                            {msg.evidence_sufficient ? (
                              <Badge variant="emerald">
                                <ShieldCheck className="h-3 w-3" />
                                Verified Evidence ({msg.citations.length} source
                                {msg.citations.length === 1 ? '' : 's'})
                              </Badge>
                            ) : (
                              <Badge variant="amber">
                                <AlertTriangle className="h-3 w-3" />
                                Insufficient Authorised Evidence
                              </Badge>
                            )}
                            {msg.retrieval_metadata?.authorised_documents_in_scope !==
                              undefined && (
                              <span className="text-[11px] text-slate-400">
                                Searched {msg.retrieval_metadata.authorised_documents_in_scope}{' '}
                                authorised doc(s)
                              </span>
                            )}
                          </div>
                          <span className="text-[11px] text-slate-400">
                            {msg.provider_used} • {msg.latency_ms}ms
                          </span>
                        </div>

                        {/* Safe Markdown Content */}
                        <SafeMarkdown content={msg.content} />

                        {/* Verified Citations Grid */}
                        {msg.citations && msg.citations.length > 0 && (
                          <div className="pt-2 space-y-2">
                            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                              Verified Source Citations (Click to Inspect Passage)
                            </p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                              {msg.citations.map((cite) => (
                                <CitationCard
                                  key={`${msg.id}-${cite.chunk_id}`}
                                  citation={cite}
                                  onInspect={(c) => setActiveCitation(c)}
                                />
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Action Bar: Copy, Retry, Thumbs Up/Down Feedback */}
                        <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-500">
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => copyMessage(msg.id, msg.content)}
                              className="inline-flex items-center gap-1 rounded-lg px-2 py-1 hover:bg-slate-100 dark:hover:bg-slate-800"
                            >
                              {copiedMsgId === msg.id ? (
                                <>
                                  <Check className="h-3.5 w-3.5 text-emerald-600" />
                                  Copied
                                </>
                              ) : (
                                <>
                                  <Copy className="h-3.5 w-3.5" />
                                  Copy Answer
                                </>
                              )}
                            </button>

                            {prevUserQuestion && (
                              <button
                                type="button"
                                onClick={() => askQuestion(prevUserQuestion)}
                                disabled={sending}
                                className="inline-flex items-center gap-1 rounded-lg px-2 py-1 hover:bg-slate-100 dark:hover:bg-slate-800"
                              >
                                <RefreshCw className="h-3.5 w-3.5" />
                                Retry
                              </button>
                            )}
                          </div>

                          <div className="flex items-center gap-2">
                            <span className="text-[11px] text-slate-400">
                              {formatDateTime(msg.created_at)}
                            </span>
                            <button
                              type="button"
                              aria-label="Rate answer helpful"
                              onClick={() =>
                                setFeedbackTarget({ messageId: msg.id, rating: 'positive' })
                              }
                              className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 ${
                                msg.user_feedback?.rating === 'positive'
                                  ? 'border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                                  : 'border-slate-200 dark:border-slate-700 hover:border-emerald-400'
                              }`}
                            >
                              <ThumbsUp className="h-3.5 w-3.5" />
                              Helpful
                            </button>
                            <button
                              type="button"
                              aria-label="Rate answer unhelpful"
                              onClick={() =>
                                setFeedbackTarget({ messageId: msg.id, rating: 'negative' })
                              }
                              className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 ${
                                msg.user_feedback?.rating === 'negative'
                                  ? 'border-rose-500 bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300'
                                  : 'border-slate-200 dark:border-slate-700 hover:border-rose-400'
                              }`}
                            >
                              <ThumbsDown className="h-3.5 w-3.5" />
                              Report Issue
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {isUser && (
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-200 mt-1">
                      <UserIcon className="h-4 w-4" />
                    </div>
                  )}
                </div>
              );
            })
          )}

          {sending && (
            <div className="flex items-start gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-600 text-white">
                <Bot className="h-4 w-4 animate-pulse" />
              </div>
              <div className="rounded-2xl border border-slate-200 dark:border-slate-800 p-4 space-y-2 w-80">
                <p className="text-xs font-semibold text-blue-600">
                  Retrieving authorised chunks & verifying citations...
                </p>
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-2/3" />
              </div>
            </div>
          )}
        </div>

        {/* Question Input Composer */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            askQuestion();
          }}
          className="border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4"
        >
          <div className="flex items-center gap-2.5">
            <input
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              disabled={sending}
              placeholder="Ask a natural-language question about your authorised documents..."
              className="flex-1 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-4 py-2.5 text-sm focus:border-blue-600 focus:outline-none"
            />
            <Button type="submit" variant="primary" isLoading={sending} disabled={!question.trim()}>
              <Send className="h-4 w-4" />
              Ask
            </Button>
          </div>
        </form>
      </Card>

      {/* Citation Source Preview Modal */}
      <SourcePreviewModal citation={activeCitation} onClose={() => setActiveCitation(null)} />

      {/* Document Scope Selector Modal */}
      <Dialog
        open={scopeModalOpen}
        onClose={() => setScopeModalOpen(false)}
        title="Select Document Scope for Retrieval"
        description="Leave all unchecked to search across all Ready documents you are permitted to access, or select specific documents."
      >
        <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
          {availableDocs.map((doc) => {
            const checked = selectedDocIds.includes(doc.id);
            return (
              <label
                key={doc.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 dark:border-slate-800 p-3 cursor-pointer hover:border-blue-500"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedDocIds((prev) => [...prev, doc.id]);
                      } else {
                        setSelectedDocIds((prev) => prev.filter((id) => id !== doc.id));
                      }
                    }}
                    className="h-4 w-4 rounded border-slate-300 text-blue-600"
                  />
                  <span className="truncate text-xs font-semibold">{doc.title}</span>
                </div>
                <Badge variant="neutral">{doc.file_type.toUpperCase()}</Badge>
              </label>
            );
          })}
        </div>
        <div className="mt-4 flex items-center justify-between pt-3 border-t border-slate-200 dark:border-slate-800">
          <Button variant="ghost" size="sm" onClick={() => setSelectedDocIds([])}>
            Reset to All Authorised ({availableDocs.length})
          </Button>
          <Button variant="primary" size="sm" onClick={handleSaveScope}>
            Apply Scope
          </Button>
        </div>
      </Dialog>

      {/* Rename Conversation Modal */}
      <Dialog
        open={renameModalOpen}
        onClose={() => setRenameModalOpen(false)}
        title="Rename Conversation"
      >
        <form onSubmit={handleRenameConversation} className="space-y-4">
          <Input
            label="Conversation Title"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            required
          />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setRenameModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary">
              Save Title
            </Button>
          </div>
        </form>
      </Dialog>

      {/* Delete Conversation Confirm */}
      <ConfirmDialog
        open={deleteConfirmOpen}
        onClose={() => setDeleteConfirmOpen(false)}
        onConfirm={handleDeleteConversation}
        title="Delete Conversation?"
        description="This will permanently delete this conversation and its message history."
        confirmLabel="Delete Conversation"
        isDanger
      />

      {/* Feedback Submission Modal */}
      <Dialog
        open={Boolean(feedbackTarget)}
        onClose={() => setFeedbackTarget(null)}
        title={
          feedbackTarget?.rating === 'positive'
            ? 'Submit Positive Answer Feedback'
            : 'Report Answer Quality or Citation Issue'
        }
        description="Your feedback is stored with model and retrieval metadata for quality auditing."
      >
        <form onSubmit={submitFeedback} className="space-y-4">
          <Select
            label="Feedback Category"
            value={feedbackCategory}
            onChange={(e) => setFeedbackCategory(e.target.value)}
            options={
              feedbackTarget?.rating === 'positive'
                ? [
                    { value: 'accurate_citations', label: 'Accurate Grounding & Citations' },
                    { value: 'complete_answer', label: 'Comprehensive Policy Synthesis' },
                  ]
                : [
                    { value: 'missing_context', label: 'Missing Relevant Document Context' },
                    { value: 'citation_precision', label: 'Citation Location Could Be More Specific' },
                    { value: 'formatting', label: 'Formatting or Clarity Issue' },
                  ]
            }
          />
          <Input
            label="Optional Written Comment"
            value={feedbackComment}
            onChange={(e) => setFeedbackComment(e.target.value)}
            placeholder="Describe what worked well or what evidence was missed..."
          />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setFeedbackTarget(null)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" isLoading={submittingFeedback}>
              Submit Feedback
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}


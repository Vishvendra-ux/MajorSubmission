import { Router } from 'express';
import { getEmbeddingProvider } from '../ai/embeddings.js';
import { generateGroundedRagResponse } from '../ai/llm.js';
import { searchAuthorisedChunks } from '../ai/vectorSearch.js';
import { getRuntimeConfig } from '../config/index.js';
import { mongoDb, newId, utcNowIso } from '../db/mongo.js';
import {
  AuthContext,
  canAccessDocument,
  getAuthorisedDocuments,
  requireAuth,
} from '../security/auth.js';
import type { ConversationDoc, MessageDoc } from '../types/models.js';
import { HttpError, paginateSequence, sanitizeUserText } from '../utils/errors.js';

export const searchRouter = Router();
export const chatRouter = Router();

// --- Semantic & Hybrid Search Routes (/api/v1/search) ---
searchRouter.post('/', requireAuth, async (req, res, next) => {
  try {
    const startTime = Date.now();
    const ctx = req.authContext!;
    const {
      query,
      search_mode = 'hybrid',
      workspace_id = null,
      file_type = null,
      owner_id = null,
      document_ids = null,
      date_from = null,
      date_to = null,
      page = 1,
      page_size = 10,
    } = req.body || {};

    if (!query || !String(query).trim()) {
      throw new HttpError(400, 'Search query cannot be empty.');
    }

    const cleanQuery = sanitizeUserText(String(query), 500);
    let authorisedDocs = getAuthorisedDocuments(ctx, {
      onlyReady: true,
      workspaceId: workspace_id,
      fileType: file_type,
      ownerId: owner_id,
      scopedDocumentIds: Array.isArray(document_ids) ? document_ids : null,
    });

    if (date_from) {
      const ts = Date.parse(String(date_from));
      if (!Number.isNaN(ts)) {
        authorisedDocs = authorisedDocs.filter((d) => Date.parse(d.created_at) >= ts);
      }
    }
    if (date_to) {
      const ts = Date.parse(String(date_to));
      if (!Number.isNaN(ts)) {
        authorisedDocs = authorisedDocs.filter((d) => Date.parse(d.created_at) <= ts);
      }
    }

    const authorisedDocIds = authorisedDocs.map((d) => d.id);
    const embedder = getEmbeddingProvider();
    const queryVec = await embedder.embedQuery(cleanQuery);

    const allRanked = await searchAuthorisedChunks({
      organisationId: ctx.organisation.id,
      authorisedDocumentIds: authorisedDocIds,
      queryText: cleanQuery,
      queryEmbedding: queryVec,
      searchMode: search_mode,
      topK: 100,
      minScore: 0.08,
    });

    const { items: pagedResults, meta: pageMeta } = paginateSequence(
      allRanked,
      Number(page),
      Number(page_size)
    );

    const wsMap = new Map(
      mongoDb.collection('workspaces').map((w) => [w.id, w.name])
    );

    const startRank = (pageMeta.page - 1) * pageMeta.page_size + 1;
    const items = pagedResults.map((r, idx) => ({
      rank: startRank + idx,
      chunk_id: r.chunk.id,
      document_id: r.document.id,
      document_title: r.document.title,
      original_filename: r.document.original_filename,
      file_type: r.document.file_type,
      visibility: r.document.visibility,
      workspace_id: r.document.workspace_id ?? null,
      workspace_name: r.document.workspace_id
        ? wsMap.get(r.document.workspace_id) ?? null
        : null,
      location_label: r.chunk.location_label,
      page_number: r.chunk.page_number ?? null,
      slide_number: r.chunk.slide_number ?? null,
      sheet_name: r.chunk.sheet_name ?? null,
      section_title: r.chunk.section_title ?? null,
      snippet: r.highlightedSnippet,
      content: r.chunk.content,
      semantic_score: r.semanticScore,
      keyword_score: r.keywordScore,
      combined_score: r.combinedScore,
      created_at: r.document.created_at,
    }));

    res.json({
      query: cleanQuery,
      search_mode,
      authorised_documents_searched: authorisedDocIds.length,
      embedding_provider: embedder.providerName,
      embedding_model: embedder.modelName,
      latency_ms: Date.now() - startTime,
      items,
      pagination: pageMeta,
    });
  } catch (err) {
    next(err);
  }
});

searchRouter.get('/suggestions', requireAuth, (req, res) => {
  const ctx = req.authContext!;
  const q = req.query.q ? String(req.query.q).trim().toLowerCase() : '';
  const authorisedDocs = getAuthorisedDocuments(ctx, { onlyReady: true });
  const docTitles = authorisedDocs.slice(0, 8).map((d) => d.title);

  const defaultPrompts = [
    'What is our incident response SLA for critical security breaches?',
    'How many days of paid annual leave and remote work are employees allowed?',
    'What are the encryption and data retention requirements in our security policy?',
    'What were the Q3 revenue, R&D expenditure, and cloud infrastructure budgets?',
    'What is the onboarding checklist and compliance training deadline for new hires?',
  ];

  if (q) {
    const filteredPrompts = defaultPrompts.filter((p) => p.toLowerCase().includes(q));
    const filteredTitles = docTitles.filter((t) => t.toLowerCase().includes(q));
    res.json({
      suggested_queries:
        filteredPrompts.length > 0 ? filteredPrompts : defaultPrompts.slice(0, 3),
      matching_documents: filteredTitles.slice(0, 5),
    });
    return;
  }

  res.json({
    suggested_queries: defaultPrompts,
    matching_documents: docTitles.slice(0, 5),
  });
});

// --- Grounded AI Knowledge Assistant Routes (/api/v1/chat) ---
function serializeMessage(msg: MessageDoc, ctx: AuthContext) {
  const verifiedCitations = (msg.citations_json || []).map((cite) => {
    const doc = mongoDb.collection('documents').find((d) => d.id === cite.document_id);
    const stillAccessible = Boolean(doc && canAccessDocument(ctx, doc, 'view'));
    return {
      ...cite,
      is_accessible: stillAccessible,
      excerpt: stillAccessible
        ? cite.excerpt
        : '[Access to this cited source has been revoked or restricted]',
    };
  });

  const userFeedback = mongoDb
    .collection('feedbacks')
    .find((f) => f.message_id === msg.id && f.user_id === ctx.user.id);

  return {
    id: msg.id,
    conversation_id: msg.conversation_id,
    role: msg.role,
    content: msg.content,
    citations: verifiedCitations,
    evidence_sufficient: msg.evidence_sufficient,
    confidence_score: msg.confidence_score,
    provider_used: msg.provider_used ?? null,
    model_used: msg.model_used ?? null,
    retrieval_metadata: msg.retrieval_metadata_json || {},
    latency_ms: msg.latency_ms,
    user_feedback: userFeedback
      ? {
          id: userFeedback.id,
          rating: userFeedback.rating,
          comment: userFeedback.comment,
          issue_category: userFeedback.issue_category,
          updated_at: userFeedback.updated_at,
        }
      : null,
    created_at: msg.created_at,
  };
}

function serializeConversation(
  conv: ConversationDoc,
  includeMessages = false,
  ctx?: AuthContext
) {
  const msgs = mongoDb
    .collection('messages')
    .filter((m) => m.conversation_id === conv.id)
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
  const lastMsg = msgs[msgs.length - 1];

  const payload: Record<string, unknown> = {
    id: conv.id,
    organisation_id: conv.organisation_id,
    user_id: conv.user_id,
    workspace_id: conv.workspace_id ?? null,
    title: conv.title,
    scoped_document_ids: conv.scoped_document_ids_json || [],
    is_archived: conv.is_archived,
    message_count: msgs.length,
    last_message_preview: lastMsg ? lastMsg.content.slice(0, 140) : null,
    created_at: conv.created_at,
    updated_at: conv.updated_at,
  };

  if (includeMessages && ctx) {
    payload.messages = msgs.map((m) => serializeMessage(m, ctx));
  }
  return payload;
}

function getOwnedConversation(ctx: AuthContext, conversationId: string): ConversationDoc {
  const conv = mongoDb.collection('conversations').find((c) => c.id === conversationId);
  if (!conv) {
    throw new HttpError(404, 'Conversation not found.');
  }
  if (
    conv.organisation_id !== ctx.organisation.id ||
    (conv.user_id !== ctx.user.id && ctx.role !== 'admin')
  ) {
    mongoDb.insert('audit_logs', {
      id: newId(),
      organisation_id: ctx.organisation.id,
      actor_user_id: ctx.user.id,
      actor_email: ctx.user.email,
      actor_role: ctx.role,
      action: 'security.conversation_access_denied',
      target_type: 'conversation',
      target_id: conversationId,
      status: 'denied',
      ip_address: ctx.ipAddress,
      user_agent: ctx.userAgent,
      metadata_json: {},
      created_at: utcNowIso(),
    });
    throw new HttpError(403, 'You do not have permission to access this conversation.');
  }
  return conv;
}

async function processQuestionInConversation(params: {
  ctx: AuthContext;
  conv: ConversationDoc;
  question: string;
  scopedDocumentIds?: string[] | null;
  searchMode?: 'hybrid' | 'semantic' | 'keyword';
}): Promise<{ userMsg: MessageDoc; assistantMsg: MessageDoc }> {
  const startTime = Date.now();
  const cleanQuestion = sanitizeUserText(params.question, 3000);
  const nowUser = utcNowIso();

  const userMsg = mongoDb.insert('messages', {
    id: newId(),
    conversation_id: params.conv.id,
    organisation_id: params.ctx.organisation.id,
    user_id: params.ctx.user.id,
    role: 'user',
    content: cleanQuestion,
    citations_json: [],
    evidence_sufficient: true,
    confidence_score: 1.0,
    provider_used: null,
    model_used: null,
    retrieval_metadata_json: {},
    latency_ms: 0,
    created_at: nowUser,
  });

  if (
    params.conv.title === 'New Knowledge Session' ||
    params.conv.title === 'Untitled Conversation'
  ) {
    mongoDb.updateById('conversations', params.conv.id, {
      title: cleanQuestion.slice(0, 90),
    });
  }

  const effectiveScope =
    params.scopedDocumentIds !== undefined && params.scopedDocumentIds !== null
      ? params.scopedDocumentIds
      : params.conv.scoped_document_ids_json?.length
        ? params.conv.scoped_document_ids_json
        : null;

  const authorisedDocs = getAuthorisedDocuments(params.ctx, {
    onlyReady: true,
    workspaceId: params.conv.workspace_id,
    scopedDocumentIds: effectiveScope,
  });
  const authorisedDocIds = authorisedDocs.map((d) => d.id);

  const priorMsgs = mongoDb
    .collection('messages')
    .filter((m) => m.conversation_id === params.conv.id && m.id !== userMsg.id)
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .slice(-4);

  let retrievalQuery = cleanQuestion;
  if (cleanQuestion.split(/\s+/).length <= 5 && priorMsgs.length > 0) {
    const prevUserQ = [...priorMsgs].reverse().find((m) => m.role === 'user');
    if (prevUserQ) {
      retrievalQuery = `${prevUserQ.content} ${cleanQuestion}`;
    }
  }

  const embedder = getEmbeddingProvider();
  const queryVec = await embedder.embedQuery(retrievalQuery);
  const cfg = getRuntimeConfig();

  const rankedChunks = await searchAuthorisedChunks({
    organisationId: params.ctx.organisation.id,
    authorisedDocumentIds: authorisedDocIds,
    queryText: retrievalQuery,
    queryEmbedding: queryVec,
    searchMode: params.searchMode || 'hybrid',
    topK: cfg.rag_top_k,
    minScore: cfg.rag_min_similarity_score * 0.6,
  });

  const genResult = await generateGroundedRagResponse({
    question: cleanQuestion,
    rankedChunks,
    conversationHistory: priorMsgs.map((m) => ({ role: m.role, content: m.content })),
  });

  const latencyMs = Date.now() - startTime;
  const nowAssistant = new Date(Date.now() + 1).toISOString();

  const assistantMsg = mongoDb.insert('messages', {
    id: newId(),
    conversation_id: params.conv.id,
    organisation_id: params.ctx.organisation.id,
    user_id: null,
    role: 'assistant',
    content: genResult.answer,
    citations_json: genResult.citations,
    evidence_sufficient: genResult.evidenceSufficient,
    confidence_score: genResult.confidenceScore,
    provider_used: genResult.providerUsed,
    model_used: genResult.modelUsed,
    retrieval_metadata_json: {
      ...genResult.retrievalMetadata,
      authorised_documents_in_scope: authorisedDocIds.length,
      scoped_document_titles: authorisedDocs.slice(0, 10).map((d) => d.title),
      search_mode: params.searchMode || 'hybrid',
    },
    latency_ms: latencyMs,
    created_at: nowAssistant,
  });

  mongoDb.updateById('conversations', params.conv.id, {
    updated_at: nowAssistant,
  });

  return { userMsg, assistantMsg };
}

chatRouter.post('/conversations', requireAuth, async (req, res, next) => {
  try {
    const ctx = req.authContext!;
    const { title, workspace_id, scoped_document_ids, initial_question } = req.body || {};

    let validScopedIds: string[] = [];
    if (Array.isArray(scoped_document_ids) && scoped_document_ids.length > 0) {
      const authDocs = getAuthorisedDocuments(ctx, {
        onlyReady: false,
        scopedDocumentIds: scoped_document_ids,
      });
      validScopedIds = authDocs.map((d) => d.id);
    }

    const cleanTitle = sanitizeUserText(
      title ||
        (initial_question ? String(initial_question).slice(0, 80) : 'New Knowledge Session'),
      200
    );

    const now = utcNowIso();
    const conv = mongoDb.insert('conversations', {
      id: newId(),
      organisation_id: ctx.organisation.id,
      user_id: ctx.user.id,
      workspace_id: workspace_id || null,
      title: cleanTitle,
      scoped_document_ids_json: validScopedIds,
      is_archived: false,
      created_at: now,
      updated_at: now,
    });

    if (initial_question && String(initial_question).trim()) {
      await processQuestionInConversation({
        ctx,
        conv,
        question: String(initial_question).trim(),
        scopedDocumentIds: validScopedIds.length > 0 ? validScopedIds : null,
        searchMode: 'hybrid',
      });
    }

    const updatedConv = mongoDb.collection('conversations').find((c) => c.id === conv.id)!;
    res.status(201).json(serializeConversation(updatedConv, true, ctx));
  } catch (err) {
    next(err);
  }
});

chatRouter.get('/conversations', requireAuth, (req, res) => {
  const ctx = req.authContext!;
  const q = req.query.q ? String(req.query.q).trim().toLowerCase() : '';
  const page = Number(req.query.page || 1);
  const pageSize = Number(req.query.page_size || 20);

  let convs = mongoDb
    .collection('conversations')
    .filter((c) => c.organisation_id === ctx.organisation.id && c.user_id === ctx.user.id)
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at));

  if (q) {
    convs = convs.filter((c) => c.title.toLowerCase().includes(q));
  }

  const { items, meta } = paginateSequence(convs, page, pageSize);
  res.json({
    items: items.map((c) => serializeConversation(c, false)),
    pagination: meta,
  });
});

chatRouter.get('/conversations/:conversationId', requireAuth, (req, res, next) => {
  try {
    const ctx = req.authContext!;
    const conv = getOwnedConversation(ctx, String(req.params.conversationId));
    res.json(serializeConversation(conv, true, ctx));
  } catch (err) {
    next(err);
  }
});

chatRouter.patch('/conversations/:conversationId', requireAuth, (req, res, next) => {
  try {
    const ctx = req.authContext!;
    const conv = getOwnedConversation(ctx, String(req.params.conversationId));
    const patch: Partial<ConversationDoc> = {};

    if (req.body.title !== undefined) {
      patch.title = sanitizeUserText(req.body.title, 200);
    }
    if (req.body.scoped_document_ids !== undefined) {
      if (Array.isArray(req.body.scoped_document_ids) && req.body.scoped_document_ids.length > 0) {
        const authDocs = getAuthorisedDocuments(ctx, {
          scopedDocumentIds: req.body.scoped_document_ids,
        });
        patch.scoped_document_ids_json = authDocs.map((d) => d.id);
      } else {
        patch.scoped_document_ids_json = [];
      }
    }
    if (req.body.is_archived !== undefined) {
      patch.is_archived = Boolean(req.body.is_archived);
    }

    const updated = mongoDb.updateById('conversations', conv.id, patch)!;
    res.json(serializeConversation(updated, true, ctx));
  } catch (err) {
    next(err);
  }
});

chatRouter.delete('/conversations/:conversationId', requireAuth, (req, res, next) => {
  try {
    const ctx = req.authContext!;
    const conv = getOwnedConversation(ctx, String(req.params.conversationId));
    mongoDb.deleteWhere('messages', (m) => m.conversation_id === conv.id);
    mongoDb.deleteWhere('feedbacks', (f) => f.conversation_id === conv.id);
    mongoDb.deleteWhere('conversations', (c) => c.id === conv.id);

    res.json({
      message: 'Conversation deleted.',
      deleted_conversation_id: conv.id,
    });
  } catch (err) {
    next(err);
  }
});

chatRouter.post(
  '/conversations/:conversationId/messages',
  requireAuth,
  async (req, res, next) => {
    try {
      const ctx = req.authContext!;
      const conv = getOwnedConversation(ctx, String(req.params.conversationId));
      const { question, scoped_document_ids, search_mode = 'hybrid' } = req.body || {};

      if (!question || !String(question).trim()) {
        throw new HttpError(400, 'Question cannot be empty.');
      }

      if (Array.isArray(scoped_document_ids) && scoped_document_ids.length > 0) {
        for (const reqDocId of scoped_document_ids) {
          const docObj = mongoDb.collection('documents').find((d) => d.id === reqDocId);
          if (!docObj || !canAccessDocument(ctx, docObj, 'view')) {
            throw new HttpError(
              403,
              'One or more selected scope documents are outside your permitted access.'
            );
          }
        }
        mongoDb.updateById('conversations', conv.id, {
          scoped_document_ids_json: scoped_document_ids,
        });
      }

      const updatedConv = mongoDb.collection('conversations').find((c) => c.id === conv.id)!;
      const { userMsg, assistantMsg } = await processQuestionInConversation({
        ctx,
        conv: updatedConv,
        question: String(question),
        scopedDocumentIds: Array.isArray(scoped_document_ids) ? scoped_document_ids : undefined,
        searchMode: search_mode,
      });

      res.status(201).json({
        conversation_id: conv.id,
        user_message: serializeMessage(userMsg, ctx),
        assistant_message: serializeMessage(assistantMsg, ctx),
      });
    } catch (err) {
      next(err);
    }
  }
);

chatRouter.post('/messages/:messageId/feedback', requireAuth, (req, res, next) => {
  try {
    const ctx = req.authContext!;
    const msgId = req.params.messageId;
    const msg = mongoDb.collection('messages').find((m) => m.id === msgId);
    if (!msg) {
      throw new HttpError(404, 'Target assistant message not found.');
    }
    if (msg.organisation_id !== ctx.organisation.id) {
      throw new HttpError(
        403,
        'Cannot submit feedback for a message outside your organisation.'
      );
    }
    if (msg.role !== 'assistant') {
      throw new HttpError(400, 'Feedback can only be submitted on assistant responses.');
    }

    const conv = getOwnedConversation(ctx, msg.conversation_id);
    const { rating, comment, issue_category } = req.body || {};
    if (!['positive', 'negative'].includes(rating)) {
      throw new HttpError(400, 'rating must be positive or negative.');
    }

    const cleanComment = comment ? sanitizeUserText(String(comment), 1500) : null;
    const existing = mongoDb
      .collection('feedbacks')
      .find((f) => f.user_id === ctx.user.id && f.message_id === msg.id);

    const now = utcNowIso();
    let fb;
    if (existing) {
      if (existing.rating === rating && (existing.comment || null) === cleanComment) {
        throw new HttpError(
          409,
          'Duplicate feedback submission: you have already recorded this exact rating for this message.'
        );
      }
      fb = mongoDb.updateById('feedbacks', existing.id, {
        rating,
        comment: cleanComment,
        issue_category: issue_category || null,
      })!;
    } else {
      fb = mongoDb.insert('feedbacks', {
        id: newId(),
        organisation_id: ctx.organisation.id,
        user_id: ctx.user.id,
        conversation_id: conv.id,
        message_id: msg.id,
        rating,
        comment: cleanComment,
        issue_category: issue_category || null,
        model_metadata_json: {
          provider_used: msg.provider_used,
          model_used: msg.model_used,
          evidence_sufficient: msg.evidence_sufficient,
          citation_count: (msg.citations_json || []).length,
        },
        created_at: now,
        updated_at: now,
      });

      mongoDb.insert('audit_logs', {
        id: newId(),
        organisation_id: ctx.organisation.id,
        actor_user_id: ctx.user.id,
        actor_email: ctx.user.email,
        actor_role: ctx.role,
        action: 'assistant.feedback_submitted',
        target_type: 'message',
        target_id: msg.id,
        status: 'success',
        ip_address: ctx.ipAddress,
        user_agent: ctx.userAgent,
        metadata_json: { rating },
        created_at: now,
      });
    }

    res.status(201).json({
      id: fb.id,
      message_id: fb.message_id,
      conversation_id: fb.conversation_id,
      rating: fb.rating,
      comment: fb.comment,
      issue_category: fb.issue_category,
      model_metadata: fb.model_metadata_json,
      created_at: fb.created_at,
      updated_at: fb.updated_at,
    });
  } catch (err) {
    next(err);
  }
});

chatRouter.get('/feedback', requireAuth, (req, res) => {
  const ctx = req.authContext!;
  const ratingFilter = req.query.rating ? String(req.query.rating) : null;
  const scope = req.query.scope ? String(req.query.scope) : 'mine';
  const page = Number(req.query.page || 1);
  const pageSize = Number(req.query.page_size || 20);

  let feedbacks = mongoDb
    .collection('feedbacks')
    .filter((f) => f.organisation_id === ctx.organisation.id);

  if (scope !== 'organisation' || !['admin', 'manager'].includes(ctx.role)) {
    feedbacks = feedbacks.filter((f) => f.user_id === ctx.user.id);
  }
  if (ratingFilter && ['positive', 'negative'].includes(ratingFilter)) {
    feedbacks = feedbacks.filter((f) => f.rating === ratingFilter);
  }

  feedbacks.sort((a, b) => b.created_at.localeCompare(a.created_at));
  const { items: paged, meta } = paginateSequence(feedbacks, page, pageSize);

  const items = paged.map((fb) => {
    const msg = mongoDb.collection('messages').find((m) => m.id === fb.message_id);
    const conv = mongoDb.collection('conversations').find((c) => c.id === fb.conversation_id);
    return {
      id: fb.id,
      rating: fb.rating,
      comment: fb.comment,
      issue_category: fb.issue_category,
      conversation_id: fb.conversation_id,
      conversation_title: conv?.title || 'Conversation',
      message_id: fb.message_id,
      answer_excerpt: (msg?.content || '').slice(0, 220),
      provider_used: msg?.provider_used || 'extractive_grounded',
      model_used: msg?.model_used || 'sumind-extractive-verifier-v1',
      created_at: fb.created_at,
      updated_at: fb.updated_at,
    };
  });

  res.json({ items, pagination: meta });
});

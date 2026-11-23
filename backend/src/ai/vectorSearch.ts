import { mongoDb } from '../db/mongo.js';
import type { DocumentChunkDoc, DocumentDoc } from '../types/models.js';
import { tokenizeForSearch } from './embeddings.js';

export interface RankedChunkResult {
  chunk: DocumentChunkDoc;
  document: DocumentDoc;
  semanticScore: number;
  keywordScore: number;
  combinedScore: number;
  highlightedSnippet: string;
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (!a || !b || a.length === 0 || b.length === 0) return 0;
  const len = Math.min(a.length, b.length);
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom > 0 ? Math.max(0, Math.min(1, dot / denom)) : 0;
}

export function computeKeywordOverlapScore(queryText: string, content: string): number {
  const qTokens = tokenizeForSearch(queryText);
  if (qTokens.length === 0) return 0;
  const cLower = content.toLowerCase();
  const cTokens = tokenizeForSearch(content);
  const cTokenSet = new Set(cTokens);

  let matched = 0;
  for (const qt of qTokens) {
    if (cTokenSet.has(qt)) {
      matched += 1;
    } else if (qt.length >= 4) {
      const stem = qt.replace(/(ing|tion|ions|ments|ment|ed|es|s)$/, '');
      if (stem.length >= 4 && cTokens.some((ct) => ct.startsWith(stem))) {
        matched += 0.8;
      }
    }
  }
  const baseRatio = matched / qTokens.length;
  // Exact phrase bonus
  const phraseBonus =
    queryText.trim().length > 4 && cLower.includes(queryText.trim().toLowerCase()) ? 0.2 : 0;
  return Math.min(1.0, Number((baseRatio + phraseBonus).toFixed(4)));
}

export function buildHighlightedSnippet(queryText: string, content: string, maxLen = 280): string {
  const qTokens = tokenizeForSearch(queryText);
  const sentences = content
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);

  let bestSentence = sentences[0] || content.slice(0, maxLen);
  let bestHits = -1;
  for (const s of sentences) {
    const lower = s.toLowerCase();
    let hits = 0;
    for (const qt of qTokens) {
      if (lower.includes(qt)) hits += 1;
    }
    if (hits > bestHits) {
      bestHits = hits;
      bestSentence = s;
    }
  }

  let snippet = bestSentence.length > maxLen ? `${bestSentence.slice(0, maxLen)}...` : bestSentence;
  for (const qt of qTokens.slice(0, 6)) {
    if (qt.length < 3) continue;
    const escaped = qt.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    snippet = snippet.replace(new RegExp(`(${escaped})`, 'gi'), '**$1**');
  }
  return snippet;
}

/**
 * Executes pre-filtered vector search across authorised document chunks using MongoDB Atlas Vector Search
 * ($vectorSearch aggregation pipeline) combined with keyword lexical scoring.
 */
export async function searchAuthorisedChunks(params: {
  organisationId: string;
  authorisedDocumentIds: string[];
  queryText: string;
  queryEmbedding: number[];
  searchMode?: 'hybrid' | 'semantic' | 'keyword';
  topK?: number;
  minScore?: number;
}): Promise<RankedChunkResult[]> {
  if (params.authorisedDocumentIds.length === 0) {
    return [];
  }

  const allowedSet = new Set(params.authorisedDocumentIds);
  const docMap = new Map<string, DocumentDoc>();
  for (const doc of mongoDb.collection('documents')) {
    if (doc.organisation_id === params.organisationId && allowedSet.has(doc.id)) {
      docMap.set(doc.id, doc);
    }
  }

  // 1. Try native MongoDB Atlas $vectorSearch pipeline first
  const atlasHits = await mongoDb.atlasVectorSearch({
    organisationId: params.organisationId,
    authorisedDocumentIds: params.authorisedDocumentIds,
    queryVector: params.queryEmbedding,
    limit: params.topK || 50,
  });

  const candidateChunks: DocumentChunkDoc[] = atlasHits
    ? atlasHits.map((h) => h.chunk)
    : mongoDb
        .collection('document_chunks')
        .filter(
          (c) =>
            c.organisation_id === params.organisationId && allowedSet.has(c.document_id)
        );

  const mode = params.searchMode || 'hybrid';
  const minThreshold = params.minScore ?? 0.08;
  const results: RankedChunkResult[] = [];

  for (const chunk of candidateChunks) {
    const doc = docMap.get(chunk.document_id);
    if (!doc) continue;

    const semScore = Number(
      cosineSimilarity(params.queryEmbedding, chunk.embedding).toFixed(4)
    );
    const kwScore = computeKeywordOverlapScore(
      params.queryText,
      `${doc.title} ${chunk.location_label} ${chunk.content}`
    );

    let combined = 0;
    if (mode === 'semantic') {
      combined = semScore;
    } else if (mode === 'keyword') {
      combined = kwScore;
    } else {
      combined = Number((semScore * 0.55 + kwScore * 0.45).toFixed(4));
    }

    if (combined >= minThreshold || kwScore > 0) {
      results.push({
        chunk,
        document: doc,
        semanticScore: semScore,
        keywordScore: kwScore,
        combinedScore: combined,
        highlightedSnippet: buildHighlightedSnippet(params.queryText, chunk.content),
      });
    }
  }

  results.sort((a, b) => b.combinedScore - a.combinedScore);
  return results.slice(0, params.topK || 50);
}

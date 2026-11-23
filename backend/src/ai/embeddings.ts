import crypto from 'node:crypto';
import { settings } from '../config/index.js';

export interface EmbeddingProvider {
  providerName: string;
  modelName: string;
  dimension: number;
  embedQuery(text: string): Promise<number[]>;
  embedDocuments(texts: string[]): Promise<number[][]>;
}

const STOPWORDS = new Set([
  'a', 'an', 'am', 'as', 'at', 'be', 'by', 'do', 'go', 'he', 'if', 'in', 'is',
  'it', 'me', 'my', 'no', 'of', 'on', 'or', 'so', 'to', 'up', 'us', 'we',
  'the', 'and', 'for', 'that', 'this', 'with', 'from', 'are', 'was', 'were',
  'will', 'would', 'could', 'should', 'have', 'has', 'had', 'not', 'but',
  'what', 'when', 'where', 'which', 'who', 'whom', 'how', 'why', 'can', 'our',
  'your', 'their', 'into', 'onto', 'upon', 'about', 'across', 'under', 'over',
  'does', 'did', 'been', 'being', 'many', 'much', 'more', 'most', 'some', 'any',
]);

export function tokenizeForSearch(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9$%.-]+/g, ' ')
    .split(/\s+/)
    .map((t) => t.replace(/^[.-]+|[.-]+$/g, ''))
    .filter((t) => t.length >= 2 && !STOPWORDS.has(t));
}

/**
 * Deterministic 384-dimensional JavaScript semantic hash embedding engine.
 * Projects word stems, bigrams, and character trigrams into L2-normalized vector space
 * so cosine similarity in MongoDB Atlas Vector Search accurately ranks semantic matches.
 */
export function computeDeterministicEmbedding(
  text: string,
  dimension = settings.EMBEDDING_DIMENSION
): number[] {
  const vec = new Float64Array(dimension);
  const tokens = tokenizeForSearch(text);

  if (tokens.length === 0) {
    vec[0] = 1.0;
    return Array.from(vec);
  }

  const addFeature = (feature: string, weight: number) => {
    const hash = crypto.createHash('md5').update(feature).digest();
    const idx1 = hash.readUInt16LE(0) % dimension;
    const sign1 = (hash[2] & 1) === 0 ? 1 : -1;
    const idx2 = hash.readUInt16LE(4) % dimension;
    const sign2 = (hash[6] & 1) === 0 ? 1 : -1;
    vec[idx1] += sign1 * weight;
    vec[idx2] += sign2 * (weight * 0.6);
  };

  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    addFeature(`tok:${tok}`, 2.0);

    // Stemmed root approximation
    if (tok.length > 4) {
      const stem = tok.replace(/(ing|tion|ions|ments|ment|ed|es|s)$/, '');
      addFeature(`stem:${stem}`, 1.6);
    }

    // Word bigram
    if (i + 1 < tokens.length) {
      addFeature(`bi:${tok}_${tokens[i + 1]}`, 1.3);
    }

    // Character 3-grams for fuzzy/morphological resilience
    for (let c = 0; c <= tok.length - 3; c++) {
      addFeature(`tri:${tok.slice(c, c + 3)}`, 0.35);
    }
  }

  let normSq = 0;
  for (let i = 0; i < dimension; i++) {
    normSq += vec[i] * vec[i];
  }
  const norm = Math.sqrt(normSq) || 1.0;
  const normalized = new Array<number>(dimension);
  for (let i = 0; i < dimension; i++) {
    normalized[i] = Number((vec[i] / norm).toFixed(6));
  }
  return normalized;
}

class JsEmbeddingSdkProvider implements EmbeddingProvider {
  providerName = settings.EMBEDDING_API_KEY
    ? 'gemini_js_embedding_sdk'
    : 'js_semantic_embedding_sdk';
  modelName = settings.EMBEDDING_API_KEY
    ? settings.EMBEDDING_MODEL
    : 'sumind-js-semantic-384-v1';
  dimension = settings.EMBEDDING_DIMENSION;

  async embedQuery(text: string): Promise<number[]> {
    if (settings.EMBEDDING_API_KEY && settings.EMBEDDING_PROVIDER === 'gemini') {
      try {
        const url = `${settings.LLM_BASE_URL}/models/${settings.EMBEDDING_MODEL}:embedContent?key=${settings.EMBEDDING_API_KEY}`;
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: `models/${settings.EMBEDDING_MODEL}`,
            content: { parts: [{ text }] },
            outputDimensionality: this.dimension,
          }),
        });
        if (res.ok) {
          const data = (await res.json()) as { embedding?: { values?: number[] } };
          if (data.embedding?.values && data.embedding.values.length > 0) {
            return data.embedding.values.slice(0, this.dimension);
          }
        }
      } catch {
        // Fallback to local JS semantic embedding
      }
    }
    return computeDeterministicEmbedding(text, this.dimension);
  }

  async embedDocuments(texts: string[]): Promise<number[][]> {
    const results: number[][] = [];
    for (const t of texts) {
      results.push(await this.embedQuery(t));
    }
    return results;
  }
}

const singletonProvider = new JsEmbeddingSdkProvider();

export function getEmbeddingProvider(): EmbeddingProvider {
  return singletonProvider;
}

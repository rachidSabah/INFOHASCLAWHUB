/**
 * ClawHub Semantic Cache
 * 
 * Caches LLM responses by embedding similarity — if a user asks something
 * semantically similar to a past query, returns the cached result instantly.
 * Uses TF-IDF-like keyword matching for fast similarity scoring without
 * requiring an embedding model.
 * 
 * Features:
 * - Semantic similarity matching (keyword-based, no external embeddings needed)
 * - Configurable similarity threshold per task type
 * - TTL-based expiration
 * - LRU eviction when full
 * - Cache statistics and monitoring
 */

// ── Types ──────────────────────────────────────────────────────────────────

export interface SemanticCacheEntry {
  id: string;
  query: string;
  normalizedQuery: string;
  keywords: Set<string>;
  response: string;
  model: string;
  providerId: string;
  taskType: string;
  confidence: number;
  createdAt: number;
  expiresAt: number;
  hitCount: number;
  tokenCount: number;
}

export interface SemanticCacheConfig {
  maxEntries: number;
  defaultTtlMs: number;
  similarityThreshold: number;  // 0-1, minimum similarity to return cached result
  maxResponseSizeBytes: number;
  taskTypeTtls: Record<string, number>;
}

export interface SemanticCacheStats {
  entries: number;
  hits: number;
  misses: number;
  evictions: number;
  hitRate: number;
  totalTokensSaved: number;
  avgSimilarity: number;
}

export interface SemanticCacheResult {
  hit: boolean;
  response?: string;
  similarity?: number;
  model?: string;
  providerId?: string;
  cachedAt?: number;
  entryId?: string;
}

// ── Config ─────────────────────────────────────────────────────────────────

export const DEFAULT_SEMANTIC_CACHE_CONFIG: SemanticCacheConfig = {
  maxEntries: 1000,
  defaultTtlMs: 30 * 60 * 1000,  // 30 minutes
  similarityThreshold: 0.75,
  maxResponseSizeBytes: 100 * 1024, // 100KB
  taskTypeTtls: {
    coding: 10 * 60 * 1000,        // 10 minutes (code changes frequently)
    debugging: 5 * 60 * 1000,      // 5 minutes
    research: 60 * 60 * 1000,      // 1 hour (facts don't change fast)
    creative: 0,                     // Never cache creative tasks
    conversation: 0,                 // Never cache conversations
    general: 20 * 60 * 1000,        // 20 minutes
    analysis: 30 * 60 * 1000,       // 30 minutes
    question_answering: 60 * 60 * 1000, // 1 hour
  },
};

// ── Keyword Extraction ─────────────────────────────────────────────────────

// Stop words to filter out from queries
const STOP_WORDS = new Set([
  "a", "an", "the", "is", "are", "was", "were", "be", "been", "being",
  "have", "has", "had", "do", "does", "did", "will", "would", "could",
  "should", "may", "might", "can", "shall", "must", "need", "dare",
  "to", "of", "in", "for", "on", "with", "at", "by", "from", "as",
  "into", "through", "during", "before", "after", "above", "below",
  "between", "out", "off", "over", "under", "again", "further",
  "then", "once", "here", "there", "when", "where", "why", "how",
  "all", "both", "each", "few", "more", "most", "other", "some",
  "such", "no", "nor", "not", "only", "own", "same", "so", "than",
  "too", "very", "just", "because", "but", "and", "or", "if", "while",
  "about", "up", "it", "its", "i", "me", "my", "we", "our", "you",
  "your", "he", "him", "his", "she", "her", "they", "them", "their",
  "this", "that", "these", "those", "what", "which", "who", "whom",
  "please", "help", "can", "show", "tell", "give", "make", "get",
]);

/**
 * Extract meaningful keywords from a query string.
 */
function extractKeywords(query: string): Set<string> {
  const normalized = query.toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  
  const words = normalized.split(" ")
    .filter(w => w.length > 2 && !STOP_WORDS.has(w));
  
  return new Set(words);
}

/**
 * Normalize a query for comparison.
 */
function normalizeQuery(query: string): string {
  return query.toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// ── Similarity Scoring ─────────────────────────────────────────────────────

/**
 * Calculate Jaccard similarity between two keyword sets.
 * Jaccard(A, B) = |A ∩ B| / |A ∪ B|
 */
function jaccardSimilarity(setA: Set<string>, setB: Set<string>): number {
  if (setA.size === 0 && setB.size === 0) return 0;
  if (setA.size === 0 || setB.size === 0) return 0;

  let intersection = 0;
  for (const item of setA) {
    if (setB.has(item)) intersection++;
  }

  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Calculate combined similarity score using Jaccard + substring matching.
 */
function calculateSimilarity(
  query1: string,
  normalizedQuery1: string,
  keywords1: Set<string>,
  query2: string,
  normalizedQuery2: string,
  keywords2: Set<string>
): number {
  // 1. Jaccard similarity on keywords (60% weight)
  const jaccard = jaccardSimilarity(keywords1, keywords2);
  
  // 2. Substring containment check (20% weight)
  let containment = 0;
  if (normalizedQuery1.includes(normalizedQuery2) || normalizedQuery2.includes(normalizedQuery1)) {
    containment = 0.8;
    // Boost for near-exact matches
    if (Math.abs(normalizedQuery1.length - normalizedQuery2.length) < 10) {
      containment = 1.0;
    }
  }
  
  // 3. Common bigram similarity (20% weight)
  const bigrams1 = getBigrams(normalizedQuery1);
  const bigrams2 = getBigrams(normalizedQuery2);
  let bigramIntersection = 0;
  for (const bg of bigrams1) {
    if (bigrams2.has(bg)) bigramIntersection++;
  }
  const bigramUnion = bigrams1.size + bigrams2.size - bigramIntersection;
  const bigramSim = bigramUnion === 0 ? 0 : bigramIntersection / bigramUnion;
  
  // Weighted combination
  return jaccard * 0.6 + containment * 0.2 + bigramSim * 0.2;
}

/**
 * Get character bigrams from a string for similarity comparison.
 */
function getBigrams(text: string): Set<string> {
  const bigrams = new Set<string>();
  const words = text.split(" ").filter(w => w.length > 2);
  for (const word of words) {
    for (let i = 0; i < word.length - 1; i++) {
      bigrams.add(word.substring(i, i + 2));
    }
  }
  return bigrams;
}

// ── Semantic Cache Class ───────────────────────────────────────────────────

class SemanticCache {
  private entries = new Map<string, SemanticCacheEntry>();
  private config: SemanticCacheConfig;
  private stats = { hits: 0, misses: 0, evictions: 0, totalTokensSaved: 0, similaritySum: 0, similarityCount: 0 };

  constructor(config?: Partial<SemanticCacheConfig>) {
    this.config = { ...DEFAULT_SEMANTIC_CACHE_CONFIG, ...config };
  }

  /**
   * Look up a query in the semantic cache.
   * Returns the best matching cached response if similarity exceeds threshold.
   */
  lookup(
    query: string,
    taskType: string = "general",
    model?: string
  ): SemanticCacheResult {
    // Check if task type is cacheable
    const ttl = this.config.taskTypeTtls[taskType] ?? this.config.defaultTtlMs;
    if (ttl === 0) {
      this.stats.misses++;
      return { hit: false };
    }

    const normalizedQuery = normalizeQuery(query);
    const keywords = extractKeywords(query);
    const now = Date.now();

    let bestMatch: SemanticCacheEntry | null = null;
    let bestSimilarity = 0;

    for (const entry of this.entries.values()) {
      // Skip expired entries
      if (now > entry.expiresAt) {
        this.entries.delete(entry.id);
        continue;
      }

      // Skip different models if specified
      if (model && entry.model !== model) continue;

      // Skip different task types (code vs creative have very different answers)
      if (entry.taskType !== taskType) continue;

      // Calculate similarity
      const similarity = calculateSimilarity(
        query, normalizedQuery, keywords,
        entry.query, entry.normalizedQuery, entry.keywords
      );

      if (similarity > bestSimilarity) {
        bestSimilarity = similarity;
        bestMatch = entry;
      }
    }

    // Check if similarity exceeds threshold
    if (bestMatch && bestSimilarity >= this.config.similarityThreshold) {
      bestMatch.hitCount++;
      this.stats.hits++;
      this.stats.totalTokensSaved += bestMatch.tokenCount;
      this.stats.similaritySum += bestSimilarity;
      this.stats.similarityCount++;

      // Move to end for LRU
      this.entries.delete(bestMatch.id);
      this.entries.set(bestMatch.id, bestMatch);

      return {
        hit: true,
        response: bestMatch.response,
        similarity: bestSimilarity,
        model: bestMatch.model,
        providerId: bestMatch.providerId,
        cachedAt: bestMatch.createdAt,
        entryId: bestMatch.id,
      };
    }

    this.stats.misses++;
    return { hit: false, similarity: bestSimilarity };
  }

  /**
   * Store a response in the semantic cache.
   */
  store(
    query: string,
    response: string,
    model: string,
    providerId: string,
    taskType: string = "general",
    confidence: number = 0.5,
    tokenCount: number = 0
  ): string | null {
    // Check if task type is cacheable
    const ttl = this.config.taskTypeTtls[taskType] ?? this.config.defaultTtlMs;
    if (ttl === 0) return null;

    // Don't cache very low confidence responses
    if (confidence < 0.3) return null;

    // Don't cache error responses
    if (response.includes('"error"') && response.length < 200) return null;

    // Don't cache very large responses
    if (response.length > this.config.maxResponseSizeBytes) return null;

    // Evict if necessary
    this.evictIfNeeded();

    const id = `sc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const now = Date.now();

    const entry: SemanticCacheEntry = {
      id,
      query,
      normalizedQuery: normalizeQuery(query),
      keywords: extractKeywords(query),
      response,
      model,
      providerId,
      taskType,
      confidence,
      createdAt: now,
      expiresAt: now + ttl,
      hitCount: 0,
      tokenCount: tokenCount || Math.ceil(response.length / 4),
    };

    this.entries.set(id, entry);
    return id;
  }

  /**
   * Invalidate cache entries matching a pattern.
   */
  invalidate(query?: string, taskType?: string): number {
    let count = 0;

    if (!query && !taskType) {
      count = this.entries.size;
      this.entries.clear();
      return count;
    }

    for (const [id, entry] of this.entries) {
      const matchesQuery = !query || entry.normalizedQuery.includes(normalizeQuery(query));
      const matchesType = !taskType || entry.taskType === taskType;
      if (matchesQuery && matchesType) {
        this.entries.delete(id);
        count++;
      }
    }

    return count;
  }

  /**
   * Evict expired and LRU entries if over capacity.
   */
  private evictIfNeeded(): void {
    // First, remove expired entries
    const now = Date.now();
    for (const [id, entry] of this.entries) {
      if (now > entry.expiresAt) {
        this.entries.delete(id);
        this.stats.evictions++;
      }
    }

    // If still over max, evict LRU (oldest entries in Map)
    while (this.entries.size >= this.config.maxEntries) {
      const firstKey = this.entries.keys().next().value;
      if (firstKey !== undefined) {
        this.entries.delete(firstKey);
        this.stats.evictions++;
      } else break;
    }
  }

  /**
   * Get cache statistics.
   */
  getStats(): SemanticCacheStats {
    const total = this.stats.hits + this.stats.misses;
    return {
      entries: this.entries.size,
      hits: this.stats.hits,
      misses: this.stats.misses,
      evictions: this.stats.evictions,
      hitRate: total > 0 ? this.stats.hits / total : 0,
      totalTokensSaved: this.stats.totalTokensSaved,
      avgSimilarity: this.stats.similarityCount > 0 
        ? this.stats.similaritySum / this.stats.similarityCount 
        : 0,
    };
  }

  /**
   * Get entries for debugging/monitoring.
   */
  getEntries(): Array<{ query: string; taskType: string; model: string; age: string; hits: number; similarity: number }> {
    const now = Date.now();
    return Array.from(this.entries.values()).map(e => ({
      query: e.query.slice(0, 100),
      taskType: e.taskType,
      model: e.model,
      age: `${((now - e.createdAt) / 1000).toFixed(0)}s`,
      hits: e.hitCount,
      similarity: 0,
    }));
  }
}

// Singleton instance
const globalSemanticCache = globalThis as unknown as { __semanticCache?: SemanticCache };
const semanticCache = globalSemanticCache.__semanticCache || new SemanticCache();
globalSemanticCache.__semanticCache = semanticCache;

// ── Exported Functions ─────────────────────────────────────────────────────

export function semanticCacheLookup(
  query: string,
  taskType: string = "general",
  model?: string
): SemanticCacheResult {
  return semanticCache.lookup(query, taskType, model);
}

export function semanticCacheStore(
  query: string,
  response: string,
  model: string,
  providerId: string,
  taskType: string = "general",
  confidence: number = 0.5,
  tokenCount: number = 0
): string | null {
  return semanticCache.store(query, response, model, providerId, taskType, confidence, tokenCount);
}

export function semanticCacheInvalidate(query?: string, taskType?: string): number {
  return semanticCache.invalidate(query, taskType);
}

export function semanticCacheStats(): SemanticCacheStats {
  return semanticCache.getStats();
}

export { semanticCache };

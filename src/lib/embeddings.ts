/**
 * Embedding Engine — Real Vector Embeddings with Local Fallback
 *
 * Supports:
 * - OpenAI text-embedding-3-small (1536 dim)
 * - Google Gemini text-embedding-004 (768 dim)
 * - Local hash-based fallback (256 dim) — always available
 *
 * The `generateEmbedding()` function tries real API first, then falls back to local.
 * The `generateRealEmbedding()` function explicitly calls a provider API.
 * The `generateLocalEmbedding()` function uses the original hash-based approach.
 */

// ── Local Hash-Based Embedding (Fallback) ──────────────────────────────────

const STOP_WORDS = new Set([
  "the", "is", "at", "which", "on", "a", "an", "and", "or", "but",
  "in", "with", "to", "for", "of", "that", "this", "it", "as", "be",
  "was", "are", "were", "been", "has", "have", "had", "do", "does",
  "did", "will", "would", "could", "should", "may", "might", "can",
  "not", "no", "so", "if", "then", "than", "too", "very", "just",
  "about", "into", "from", "by", "its", "also", "each", "all", "some",
  "any", "such", "only", "other", "new", "more", "what", "when", "where",
  "who", "how", "up", "out", "i", "me", "my", "we", "our", "you", "your",
  "he", "she", "him", "her", "they", "them", "their", "his",
]);

const LOCAL_EMBEDDING_DIM = 256;

function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));
}

/**
 * Local hash-based embedding — always available, no API required.
 * Good enough for basic similarity but not truly semantic.
 */
export function generateLocalEmbedding(text: string): number[] {
  const tokens = tokenize(text);
  const vector = new Array(LOCAL_EMBEDDING_DIM).fill(0);
  const freq = new Map<string, number>();
  for (const t of tokens) {
    freq.set(t, (freq.get(t) || 0) + 1);
  }
  if (freq.size === 0) return vector;
  const maxFreq = Math.max(...freq.values());
  for (const [word, count] of freq) {
    const idx = hashCode(word) % LOCAL_EMBEDDING_DIM;
    vector[idx] += count / maxFreq;
  }
  return vector;
}

// ── Real API Embeddings ────────────────────────────────────────────────────

export interface EmbeddingProvider {
  name: string;
  dimension: number;
  generate(text: string): Promise<number[]>;
}

/**
 * OpenAI Embedding Provider — text-embedding-3-small (1536 dim)
 */
export class OpenAIEmbeddingProvider implements EmbeddingProvider {
  name = "openai";
  dimension = 1536;
  private apiKey: string;
  private baseUrl: string;
  private model: string;

  constructor(apiKey: string, baseUrl = "https://api.openai.com/v1", model = "text-embedding-3-small") {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
    this.model = model;
  }

  async generate(text: string): Promise<number[]> {
    const response = await fetch(`${this.baseUrl}/embeddings`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        input: text.slice(0, 8192), // OpenAI embedding token limit
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`OpenAI embedding API error ${response.status}: ${errText.slice(0, 200)}`);
    }

    const data = await response.json();
    return data.data?.[0]?.embedding || [];
  }
}

/**
 * Google Gemini Embedding Provider — text-embedding-004 (768 dim)
 */
export class GeminiEmbeddingProvider implements EmbeddingProvider {
  name = "gemini";
  dimension = 768;
  private apiKey: string;
  private model: string;

  constructor(apiKey: string, model = "text-embedding-004") {
    this.apiKey = apiKey;
    this.model = model;
  }

  async generate(text: string): Promise<number[]> {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:embedContent?key=${this.apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: `models/${this.model}`,
          content: { parts: [{ text: text.slice(0, 8192) }] },
        }),
      }
    );

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Gemini embedding API error ${response.status}: ${errText.slice(0, 200)}`);
    }

    const data = await response.json();
    return data.embedding?.values || [];
  }
}

// ── Cached Provider Resolution ─────────────────────────────────────────────

let cachedProvider: EmbeddingProvider | null = null;
let cachedProviderKey: string | null = null;

/**
 * Resolve the best available embedding provider from DB settings.
 * Checks providers in order: Gemini (free tier) → OpenAI → Local fallback.
 */
async function resolveProvider(): Promise<EmbeddingProvider | null> {
  try {
    // Dynamic import to avoid circular dependency
    const { db } = await import("@/lib/db");

    // Try to find a Gemini API key first (free tier)
    const geminiProvider = await db.provider.findFirst({
      where: {
        isActive: true,
        OR: [
          { name: { contains: "gemini" } },
          { name: { contains: "google" } },
          { baseUrl: { contains: "generativelanguage.googleapis.com" } },
        ],
      },
    });

    if (geminiProvider?.apiKey) {
      const key = `gemini:${geminiProvider.apiKey}`;
      if (cachedProviderKey === key && cachedProvider) return cachedProvider;
      cachedProvider = new GeminiEmbeddingProvider(geminiProvider.apiKey);
      cachedProviderKey = key;
      return cachedProvider;
    }

    // Try OpenAI-compatible provider
    const openaiProvider = await db.provider.findFirst({
      where: {
        isActive: true,
        OR: [
          { name: { contains: "openai" } },
          { baseUrl: { contains: "api.openai.com" } },
        ],
      },
    });

    if (openaiProvider?.apiKey) {
      const baseUrl = openaiProvider.baseUrl || "https://api.openai.com/v1";
      const key = `openai:${openaiProvider.apiKey}:${baseUrl}`;
      if (cachedProviderKey === key && cachedProvider) return cachedProvider;
      cachedProvider = new OpenAIEmbeddingProvider(openaiProvider.apiKey, baseUrl);
      cachedProviderKey = key;
      return cachedProvider;
    }
  } catch {
    // DB not available — fall through to local
  }

  return null;
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Generate a real embedding via provider API (OpenAI or Gemini).
 * Throws if no provider is available.
 */
export async function generateRealEmbedding(text: string): Promise<number[]> {
  const provider = await resolveProvider();
  if (!provider) {
    throw new Error("No embedding provider available. Add a Gemini or OpenAI API key in Settings.");
  }
  return provider.generate(text);
}

/**
 * Generate an embedding using the best available method.
 * Tries real API first, falls back to local hash-based embedding.
 *
 * This is the main entry point — backward compatible with existing code
 * that imports `generateEmbedding` from this module.
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  try {
    const provider = await resolveProvider();
    if (provider) {
      const embedding = await provider.generate(text);
      if (embedding.length > 0) {
        return embedding;
      }
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.warn("[Embeddings] Real API failed, using local fallback:", message);
  }

  // Fallback to local hash-based embedding
  return generateLocalEmbedding(text);
}

/**
 * Get info about the current embedding provider (for UI display).
 */
export async function getEmbeddingProviderInfo(): Promise<{
  provider: string;
  dimension: number;
  isReal: boolean;
}> {
  try {
    const provider = await resolveProvider();
    if (provider) {
      return { provider: provider.name, dimension: provider.dimension, isReal: true };
    }
  } catch {}

  return { provider: "local-hash", dimension: LOCAL_EMBEDDING_DIM, isReal: false };
}

// ── Utility Functions (unchanged) ──────────────────────────────────────────

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export function chunkText(text: string, chunkSize = 500, overlap = 50): string[] {
  if (chunkSize <= 0 || overlap < 0 || overlap >= chunkSize) return [text];
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    chunks.push(text.slice(start, end));
    if (end >= text.length) break;
    start = end - overlap;
  }
  return chunks;
}

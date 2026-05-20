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

const EMBEDDING_DIM = 256;

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

export async function generateEmbedding(text: string): Promise<number[]> {
  const tokens = tokenize(text);
  const vector = new Array(EMBEDDING_DIM).fill(0);
  const freq = new Map<string, number>();
  for (const t of tokens) {
    freq.set(t, (freq.get(t) || 0) + 1);
  }
  if (freq.size === 0) return vector;
  const maxFreq = Math.max(...freq.values());
  for (const [word, count] of freq) {
    const idx = hashCode(word) % EMBEDDING_DIM;
    vector[idx] += count / maxFreq;
  }
  return vector;
}

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

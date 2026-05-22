interface CacheEntry {
  response: string;
  tokens: number;
  timestamp: number;
  promptHash: string;
}

const cache = new Map<string, CacheEntry>();
const CACHE_TTL = 300_000; // 5 minutes
const MAX_CACHE_SIZE = 100;

function hashPrompt(prompt: string, model: string): string {
  let hash = 0;
  const str = prompt.trim().slice(0, 500).toLowerCase() + model;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return `${model}:${Math.abs(hash)}`;
}

function cleanupCache() {
  const now = Date.now();
  const expired: string[] = [];
  for (const [key, entry] of cache) {
    if (now - entry.timestamp > CACHE_TTL) expired.push(key);
  }
  for (const key of expired) cache.delete(key);
  
  if (cache.size > MAX_CACHE_SIZE) {
    const entries = Array.from(cache.entries()).sort((a, b) => a[1].timestamp - b[1].timestamp);
    for (const [key] of entries.slice(0, entries.length - MAX_CACHE_SIZE)) {
      cache.delete(key);
    }
  }
}

export function getCachedResponse(prompt: string, model: string): CacheEntry | null {
  cleanupCache();
  const key = hashPrompt(prompt, model);
  const entry = cache.get(key);
  if (entry && Date.now() - entry.timestamp < CACHE_TTL) {
    return entry;
  }
  return null;
}

export function setCachedResponse(prompt: string, model: string, response: string, tokens: number): void {
  const key = hashPrompt(prompt, model);
  cache.set(key, { response, tokens, timestamp: Date.now(), promptHash: key });
}

export function getCacheStats() {
  cleanupCache();
  let totalTokens = 0;
  let totalEntries = 0;
  for (const entry of cache.values()) {
    totalTokens += entry.tokens;
    totalEntries++;
  }
  return {
    entries: totalEntries,
    cachedTokens: totalTokens,
    estimatedSavings: totalTokens,
    maxEntries: MAX_CACHE_SIZE,
  };
}

export function clearCache(): void {
  cache.clear();
}

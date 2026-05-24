/**
 * ClawHub Tool Result Cache — Avoids redundant tool calls
 * 
 * Caches results from expensive tools (web_fetch, web_search, etc.)
 * with configurable TTL per tool type. Uses LRU eviction when full.
 */

interface CacheEntry {
  key: string;
  result: string;
  toolName: string;
  createdAt: number;
  expiresAt: number;
  hitCount: number;
  sizeBytes: number;
}

interface CacheStats {
  hits: number;
  misses: number;
  evictions: number;
  entries: number;
  totalSizeBytes: number;
  hitRate: number;
}

// TTL per tool type (in milliseconds)
const TOOL_TTL: Record<string, number> = {
  web_fetch: 5 * 60 * 1000,      // 5 minutes
  web_search: 2 * 60 * 1000,     // 2 minutes
  http_request: 3 * 60 * 1000,   // 3 minutes
  read_file: 60 * 1000,          // 1 minute (files can change)
  list_files: 60 * 1000,         // 1 minute
  tree_view: 2 * 60 * 1000,      // 2 minutes
  grep_code: 2 * 60 * 1000,      // 2 minutes
  code_analysis: 5 * 60 * 1000,  // 5 minutes
  git_status: 30 * 1000,         // 30 seconds
  get_system_info: 30 * 1000,    // 30 seconds
  get_current_time: 0,           // Never cache time
  memory_recall: 0,              // Never cache memory
  calculator: 0,                 // Never cache math
};

const DEFAULT_TTL = 60 * 1000; // 1 minute
const MAX_ENTRIES = 500;
const MAX_TOTAL_SIZE = 50 * 1024 * 1024; // 50MB total

class ToolResultCache {
  private cache = new Map<string, CacheEntry>();
  private stats = { hits: 0, misses: 0, evictions: 0 };

  /**
   * Generate a cache key from tool name and arguments.
   * Uses a simple hash for consistency and speed.
   */
  private generateKey(toolName: string, args: Record<string, any>): string {
    const argsStr = JSON.stringify(args, Object.keys(args).sort());
    // Simple but fast hash
    let hash = 0;
    const combined = `${toolName}:${argsStr}`;
    for (let i = 0; i < combined.length; i++) {
      const char = combined.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return `${toolName}_${Math.abs(hash).toString(36)}`;
  }

  /**
   * Get TTL for a specific tool.
   */
  private getTTL(toolName: string): number {
    return TOOL_TTL[toolName] ?? DEFAULT_TTL;
  }

  /**
   * Check if a tool result is cacheable.
   */
  isCacheable(toolName: string): boolean {
    const ttl = this.getTTL(toolName);
    return ttl > 0;
  }

  /**
   * Get a cached result. Returns null if not found or expired.
   */
  get(toolName: string, args: Record<string, any>): string | null {
    const ttl = this.getTTL(toolName);
    if (ttl === 0) return null; // Non-cacheable tool

    const key = this.generateKey(toolName, args);
    const entry = this.cache.get(key);

    if (!entry) {
      this.stats.misses++;
      return null;
    }

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      this.stats.misses++;
      return null;
    }

    entry.hitCount++;
    this.stats.hits++;

    // Move to end (LRU: most recently used stays longest)
    this.cache.delete(key);
    this.cache.set(key, entry);

    return entry.result;
  }

  /**
   * Store a tool result in the cache.
   */
  set(toolName: string, args: Record<string, any>, result: string): void {
    const ttl = this.getTTL(toolName);
    if (ttl === 0) return; // Non-cacheable tool

    // Don't cache error results (they might be transient)
    try {
      const parsed = JSON.parse(result);
      if (parsed.error) return;
    } catch {}

    const key = this.generateKey(toolName, args);
    const sizeBytes = result.length * 2; // Rough UTF-16 size

    // Evict if necessary
    this.evictIfNeeded(sizeBytes);

    const entry: CacheEntry = {
      key,
      result,
      toolName,
      createdAt: Date.now(),
      expiresAt: Date.now() + ttl,
      hitCount: 0,
      sizeBytes,
    };

    // If key already exists, delete first (to move to end for LRU)
    if (this.cache.has(key)) {
      this.cache.delete(key);
    }

    this.cache.set(key, entry);
  }

  /**
   * Invalidate cache entries for a specific tool or pattern.
   */
  invalidate(toolName?: string, args?: Record<string, any>): number {
    if (toolName && args) {
      const key = this.generateKey(toolName, args);
      return this.cache.delete(key) ? 1 : 0;
    }

    if (toolName) {
      let count = 0;
      for (const [key, entry] of this.cache) {
        if (entry.toolName === toolName) {
          this.cache.delete(key);
          count++;
        }
      }
      return count;
    }

    // Clear all
    const count = this.cache.size;
    this.cache.clear();
    return count;
  }

  /**
   * Evict entries if we're at capacity.
   */
  private evictIfNeeded(incomingSize: number): void {
    // First, remove expired entries
    const now = Date.now();
    for (const [key, entry] of this.cache) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
        this.stats.evictions++;
      }
    }

    // If still over max entries, evict LRU (first entries in Map)
    while (this.cache.size >= MAX_ENTRIES) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
        this.stats.evictions++;
      } else break;
    }

    // If total size would exceed limit, evict LRU until it fits
    let totalSize = 0;
    for (const [, entry] of this.cache) {
      totalSize += entry.sizeBytes;
    }
    while (totalSize + incomingSize > MAX_TOTAL_SIZE && this.cache.size > 0) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        const entry = this.cache.get(firstKey);
        if (entry) totalSize -= entry.sizeBytes;
        this.cache.delete(firstKey);
        this.stats.evictions++;
      } else break;
    }
  }

  /**
   * Get cache statistics.
   */
  getStats(): CacheStats {
    let totalSize = 0;
    for (const [, entry] of this.cache) {
      totalSize += entry.sizeBytes;
    }
    const total = this.stats.hits + this.stats.misses;
    return {
      hits: this.stats.hits,
      misses: this.stats.misses,
      evictions: this.stats.evictions,
      entries: this.cache.size,
      totalSizeBytes: totalSize,
      hitRate: total > 0 ? this.stats.hits / total : 0,
    };
  }

  /**
   * Get cache entries for debugging/monitoring.
   */
  getEntries(): { toolName: string; key: string; age: string; hits: number; size: string }[] {
    const now = Date.now();
    return Array.from(this.cache.values()).map(e => ({
      toolName: e.toolName,
      key: e.key,
      age: `${((now - e.createdAt) / 1000).toFixed(0)}s`,
      hits: e.hitCount,
      size: `${(e.sizeBytes / 1024).toFixed(1)}KB`,
    }));
  }
}

// Singleton instance
export const toolCache = new ToolResultCache();

// Export for API route usage
export function getCachedToolResult(toolName: string, args: Record<string, any>): string | null {
  return toolCache.get(toolName, args);
}

export function setCachedToolResult(toolName: string, args: Record<string, any>, result: string): void {
  toolCache.set(toolName, args, result);
}

export function invalidateToolCache(toolName?: string, args?: Record<string, any>): number {
  return toolCache.invalidate(toolName, args);
}

export function getToolCacheStats(): CacheStats {
  return toolCache.getStats();
}

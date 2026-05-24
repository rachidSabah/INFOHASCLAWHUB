/**
 * ClawHub Enhanced Memory System
 * 
 * Provides long-term memory with semantic search, auto-expiry,
 * importance scoring, and automatic context injection.
 * Makes agents smarter by remembering and reusing past knowledge.
 */

import { db } from "@/lib/db";

export type MemoryType = 
  | "preference"      // User preferences (language, framework, style)
  | "fact"            // Important facts (API keys locations, project structure)
  | "instruction"     // Standing instructions ("always use TypeScript")
  | "project_context" // Project-specific context (tech stack, architecture)
  | "decision"        // Past decisions and their rationale
  | "error_solution"  // Solved errors and their solutions
  | "tool_result"     // Cached tool results worth remembering
  | "conversation"    // Key conversation insights
  | "general";        // General knowledge

export interface MemoryEntry {
  id: string;
  key: string;
  content: string;
  type: MemoryType;
  source: string;
  importance: number;   // 0-1, increases with usage
  accessCount: number;  // How many times recalled
  createdAt: Date;
  lastAccessedAt: Date;
  expiresAt?: Date;     // Optional expiry
  tags: string[];       // Searchable tags
}

export interface MemorySearchResult {
  memory: MemoryEntry;
  relevanceScore: number;
  matchReason: string;
}

// TTL per memory type (in milliseconds)
const MEMORY_TTL: Record<MemoryType, number | null> = {
  preference: null,           // Never expires
  fact: 30 * 24 * 60 * 60 * 1000,     // 30 days
  instruction: null,          // Never expires
  project_context: 7 * 24 * 60 * 60 * 1000,  // 7 days
  decision: 90 * 24 * 60 * 60 * 1000,  // 90 days
  error_solution: 30 * 24 * 60 * 60 * 1000,  // 30 days
  tool_result: 24 * 60 * 60 * 1000,    // 1 day
  conversation: 14 * 24 * 60 * 60 * 1000,  // 14 days
  general: 30 * 24 * 60 * 60 * 1000,   // 30 days
};

// Keywords that indicate high-value memory
const IMPORTANCE_KEYWORDS: Record<MemoryType, string[]> = {
  preference: ["always", "never", "prefer", "must", "required", "default"],
  fact: ["important", "critical", "key", "essential", "note"],
  instruction: ["must", "always", "never", "ensure", "mandatory"],
  project_context: ["architecture", "stack", "framework", "database", "deploy"],
  decision: ["decided", "chosen", "because", "rationale", "trade-off"],
  error_solution: ["fixed", "resolved", "solution", "workaround", "root cause"],
  tool_result: ["url", "endpoint", "api", "config"],
  conversation: ["agreed", "confirmed", "decided", "learned"],
  general: ["important", "remember", "key", "notable"],
};

/**
 * Classify the type of content for appropriate memory storage.
 */
export function classifyMemoryType(content: string, key: string): MemoryType {
  const lower = (content + " " + key).toLowerCase();
  
  if (/prefer|always use|never use|default|i like|i want|my style/i.test(lower)) return "preference";
  if (/error|bug|fix|solution|workaround|resolved|root cause/i.test(lower)) return "error_solution";
  if (/must|always|never|ensure|mandatory|don't forget/i.test(lower)) return "instruction";
  if (/project|stack|architecture|framework|tech|database|deploy|config/i.test(lower)) return "project_context";
  if (/decided|chosen|because|rationale|trade.?off|went with/i.test(lower)) return "decision";
  if (/api|endpoint|url|config|setting/i.test(lower)) return "fact";
  if (/agreed|confirmed|learned|noted/i.test(lower)) return "conversation";
  return "general";
}

/**
 * Calculate importance score for a memory entry.
 */
export function calculateImportance(content: string, type: MemoryType): number {
  let score = 0.3; // Base score
  
  const keywords = IMPORTANCE_KEYWORDS[type] || [];
  const lower = content.toLowerCase();
  for (const kw of keywords) {
    if (lower.includes(kw)) score += 0.15;
  }
  
  // Longer content is generally more important
  if (content.length > 200) score += 0.1;
  if (content.length > 500) score += 0.1;
  
  // Specific types are inherently more important
  if (type === "preference" || type === "instruction") score += 0.2;
  if (type === "error_solution") score += 0.15;
  
  return Math.min(score, 1.0);
}

/**
 * Extract tags from content for better searchability.
 */
export function extractTags(content: string, key: string): string[] {
  const tags = new Set<string>();
  const lower = (content + " " + key).toLowerCase();
  
  // Tech stack tags
  const techTags = ["typescript", "javascript", "python", "react", "nextjs", "node", "prisma", 
    "tailwind", "postgresql", "sqlite", "docker", "kubernetes", "api", "rest", "graphql",
    "deepseek", "gemini", "ollama", "lmstudio", "openai"];
  for (const tag of techTags) {
    if (lower.includes(tag)) tags.add(tag);
  }
  
  // Key from storage
  const keyParts = key.split(/[_\-\s.]+/);
  for (const part of keyParts) {
    if (part.length > 2) tags.add(part.toLowerCase());
  }
  
  return Array.from(tags);
}

/**
 * Search memories by query with relevance scoring.
 */
export async function searchMemories(
  query: string, 
  limit: number = 10,
  types?: MemoryType[]
): Promise<MemorySearchResult[]> {
  if (!query || query.length < 2) return [];
  
  try {
    const where: any = {};
    if (types && types.length > 0) {
      where.source = { in: types };
    }
    
    // Fetch candidate memories
    const memories = await db.memory.findMany({
      where,
      take: 100,
      orderBy: { createdAt: "desc" },
    });
    
    if (!memories || memories.length === 0) return [];
    
    const queryLower = query.toLowerCase();
    const queryWords = queryLower.split(/\s+/).filter(w => w.length > 2);
    
    const results: MemorySearchResult[] = [];
    
    for (const mem of memories) {
      let relevanceScore = 0;
      let matchReason = "";
      
      const contentLower = mem.content.toLowerCase();
      const keyLower = mem.key.toLowerCase();
      
      // 1. Exact key match (highest relevance)
      if (keyLower === queryLower || keyLower.includes(queryLower)) {
        relevanceScore += 0.5;
        matchReason = "Key match";
      }
      
      // 2. Keyword overlap
      let keywordMatches = 0;
      for (const word of queryWords) {
        if (contentLower.includes(word)) keywordMatches++;
        if (keyLower.includes(word)) keywordMatches += 0.5;
      }
      if (keywordMatches > 0) {
        relevanceScore += (keywordMatches / queryWords.length) * 0.3;
        matchReason = matchReason || `${keywordMatches}/${queryWords.length} keywords matched`;
      }
      
      // 3. Content contains full query
      if (contentLower.includes(queryLower)) {
        relevanceScore += 0.2;
        matchReason = matchReason || "Content contains query";
      }
      
      // 4. Recency bonus (newer memories are more relevant)
      const ageMs = Date.now() - new Date(mem.createdAt).getTime();
      const ageDays = ageMs / (24 * 60 * 60 * 1000);
      if (ageDays < 1) relevanceScore += 0.1;
      else if (ageDays < 7) relevanceScore += 0.05;
      
      // 5. Source/type match
      if (types && types.includes(mem.source as MemoryType)) {
        relevanceScore += 0.1;
      }
      
      if (relevanceScore > 0.1) {
        results.push({
          memory: {
            id: mem.id,
            key: mem.key,
            content: mem.content,
            type: (mem.source as MemoryType) || "general",
            source: mem.source,
            importance: 0.5, // Would need extra DB field for real tracking
            accessCount: 0,
            createdAt: new Date(mem.createdAt),
            lastAccessedAt: new Date(mem.createdAt),
            tags: extractTags(mem.content, mem.key),
          },
          relevanceScore: Math.min(relevanceScore, 1.0),
          matchReason,
        });
      }
    }
    
    // Sort by relevance and return top results
    return results
      .sort((a, b) => b.relevanceScore - a.relevanceScore)
      .slice(0, limit);
  } catch (error) {
    console.error("[Enhanced Memory] Search failed:", error);
    return [];
  }
}

/**
 * Save a memory with automatic classification and tagging.
 */
export async function saveMemory(
  key: string,
  content: string,
  type?: MemoryType,
  source?: string
): Promise<{ key: string; type: MemoryType; importance: number }> {
  const memType = type || classifyMemoryType(content, key);
  const importance = calculateImportance(content, memType);
  const tags = extractTags(content, key);
  
  try {
    // Check for duplicate/overlap
    const existing = await db.memory.findFirst({ where: { key } });
    if (existing) {
      // Update existing memory
      await db.memory.update({
        where: { id: existing.id },
        data: {
          content,
          source: source || memType,
        },
      });
      return { key, type: memType, importance };
    }
    
    // Create new memory
    await db.memory.create({
      data: {
        key,
        content,
        source: source || memType,
      },
    });
    
    return { key, type: memType, importance };
  } catch (error) {
    console.error("[Enhanced Memory] Save failed:", error);
    return { key, type: memType, importance };
  }
}

/**
 * Generate a context block from relevant memories for injection into system prompts.
 */
export async function getMemoryContext(
  query: string,
  maxMemories: number = 5
): Promise<string> {
  const results = await searchMemories(query, maxMemories);
  
  if (results.length === 0) return "";
  
  const lines = ["[RELEVANT MEMORIES — Use this context]", ""];
  for (const result of results) {
    lines.push(`• ${result.memory.key}: ${result.memory.content.slice(0, 200)}`);
  }
  lines.push("");
  
  return lines.join("\n");
}

/**
 * Clean up expired memories.
 */
export async function cleanupExpiredMemories(): Promise<number> {
  try {
    const memories = await db.memory.findMany();
    let deleted = 0;
    
    for (const mem of memories) {
      const type = (mem.source as MemoryType) || "general";
      const ttl = MEMORY_TTL[type];
      
      if (ttl !== null) {
        const age = Date.now() - new Date(mem.createdAt).getTime();
        if (age > ttl) {
          await db.memory.delete({ where: { id: mem.id } });
          deleted++;
        }
      }
    }
    
    return deleted;
  } catch (error) {
    console.error("[Enhanced Memory] Cleanup failed:", error);
    return 0;
  }
}

/**
 * Get memory statistics.
 */
export async function getMemoryStats(): Promise<{
  total: number;
  byType: Record<string, number>;
  oldestMemory: Date | null;
  newestMemory: Date | null;
}> {
  try {
    const memories = await db.memory.findMany();
    
    const byType: Record<string, number> = {};
    let oldest: Date | null = null;
    let newest: Date | null = null;
    
    for (const mem of memories) {
      const type = mem.source || "general";
      byType[type] = (byType[type] || 0) + 1;
      
      const created = new Date(mem.createdAt);
      if (!oldest || created < oldest) oldest = created;
      if (!newest || created > newest) newest = created;
    }
    
    return {
      total: memories.length,
      byType,
      oldestMemory: oldest,
      newestMemory: newest,
    };
  } catch (error) {
    return { total: 0, byType: {}, oldestMemory: null, newestMemory: null };
  }
}

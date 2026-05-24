/**
 * ClawHub Persistent Agent Memory System
 *
 * Provides long-term memory persistence for agents using SQLite via Prisma.
 * Agents can store and retrieve:
 * - Interaction patterns (what worked, what didn't)
 * - User preferences and context
 * - Task outcomes and lessons learned
 * - Domain knowledge accumulated over time
 */

import { db } from "@/lib/db";

// ── Types ──────────────────────────────────────────────────────────────────

export interface AgentMemoryEntry {
  id: string;
  agentId: string;
  category: "preference" | "lesson" | "pattern" | "context" | "fact" | "skill";
  key: string;
  value: string;
  confidence: number; // 0-1, how confident we are in this memory
  accessCount: number; // How many times this memory has been accessed
  sourceConversationId?: string;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
  expiresAt?: Date; // Optional TTL
}

export interface MemorySearchResult {
  entry: AgentMemoryEntry;
  relevance: number; // 0-1, how relevant to the query
}

// ── Core Memory Operations ──────────────────────────────────────────────────

/**
 * Store a memory for an agent
 */
export async function storeAgentMemory(
  agentId: string,
  category: AgentMemoryEntry["category"],
  key: string,
  value: string,
  options?: {
    confidence?: number;
    sourceConversationId?: string;
    tags?: string[];
    ttlHours?: number;
  }
): Promise<AgentMemoryEntry> {
  const expiresAt = options?.ttlHours
    ? new Date(Date.now() + options.ttlHours * 3600000)
    : undefined;

  // Upsert: update if same agent+category+key exists
  const existing = await db.agentMemory.findFirst({
    where: { agentId, category, key },
  });

  if (existing) {
    const updated = await db.agentMemory.update({
      where: { id: existing.id },
      data: {
        value,
        confidence: options?.confidence ?? existing.confidence,
        tags: options?.tags ? JSON.stringify(options.tags) : existing.tags,
        expiresAt: expiresAt ?? existing.expiresAt,
        updatedAt: new Date(),
      },
    });
    return prismaToMemoryEntry(updated);
  }

  const created = await db.agentMemory.create({
    data: {
      agentId,
      category,
      key,
      value,
      confidence: options?.confidence ?? 0.5,
      sourceConversationId: options?.sourceConversationId,
      tags: JSON.stringify(options?.tags || []),
      expiresAt,
    },
  });
  return prismaToMemoryEntry(created);
}

/**
 * Retrieve memories for an agent
 */
export async function getAgentMemories(
  agentId: string,
  options?: {
    category?: AgentMemoryEntry["category"];
    tags?: string[];
    limit?: number;
    minConfidence?: number;
  }
): Promise<AgentMemoryEntry[]> {
  const where: Record<string, unknown> = {
    agentId,
    OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
  };
  if (options?.category) where.category = options.category;
  if (options?.minConfidence) where.confidence = { gte: options.minConfidence };
  if (options?.tags?.length) {
    // Simple tag matching via JSON contains
    where.tags = { contains: options.tags[0] };
  }

  const entries = await db.agentMemory.findMany({
    where,
    orderBy: [{ confidence: "desc" }, { accessCount: "desc" }, { updatedAt: "desc" }],
    take: options?.limit || 50,
  });

  return entries.map(prismaToMemoryEntry);
}

/**
 * Search agent memories by relevance (keyword matching + confidence scoring)
 */
export async function searchAgentMemories(
  agentId: string,
  query: string,
  options?: {
    category?: AgentMemoryEntry["category"];
    limit?: number;
  }
): Promise<MemorySearchResult[]> {
  const memories = await getAgentMemories(agentId, {
    category: options?.category,
    limit: 100,
    minConfidence: 0.3,
  });

  const queryLower = query.toLowerCase();
  const queryWords = queryLower
    .split(/\s+/)
    .filter((w) => w.length > 2);

  const scored = memories.map((entry) => {
    let relevance = 0;
    const valueLower = entry.value.toLowerCase();
    const keyLower = entry.key.toLowerCase();

    // Key exact match (highest relevance)
    if (keyLower === queryLower) relevance += 0.5;
    else if (keyLower.includes(queryLower)) relevance += 0.3;

    // Value keyword matching
    for (const word of queryWords) {
      if (valueLower.includes(word)) relevance += 0.1;
      if (keyLower.includes(word)) relevance += 0.15;
    }

    // Tag matching
    for (const tag of entry.tags) {
      if (queryLower.includes(tag.toLowerCase())) relevance += 0.1;
    }

    // Confidence boost
    relevance *= 0.5 + entry.confidence * 0.5;

    // Recency boost (newer memories slightly preferred)
    const ageHours =
      (Date.now() - entry.updatedAt.getTime()) / 3600000;
    if (ageHours < 1) relevance *= 1.2;
    else if (ageHours < 24) relevance *= 1.1;

    return { entry, relevance: Math.min(relevance, 1) };
  });

  return scored
    .filter((r) => r.relevance > 0.1)
    .sort((a, b) => b.relevance - a.relevance)
    .slice(0, options?.limit || 10);
}

/**
 * Increment access count for a memory (tracks usage)
 */
export async function touchAgentMemory(memoryId: string): Promise<void> {
  await db.agentMemory.update({
    where: { id: memoryId },
    data: {
      accessCount: { increment: 1 },
      updatedAt: new Date(),
    },
  });
}

/**
 * Get a formatted context string from agent memories for injection into prompts
 */
export async function getAgentMemoryContext(
  agentId: string,
  currentPrompt: string,
  maxTokens: number = 1000
): Promise<string> {
  const results = await searchAgentMemories(agentId, currentPrompt, {
    limit: 10,
  });

  if (results.length === 0) return "";

  let context = "[Agent Memory Context]:\n";
  let tokenEstimate = 0;

  for (const result of results) {
    const entry = `[${result.entry.category}] ${result.entry.key}: ${result.entry.value} (confidence: ${result.entry.confidence.toFixed(2)})\n`;
    const entryTokens = entry.split(/\s+/).length; // rough token estimate
    if (tokenEstimate + entryTokens > maxTokens) break;
    context += entry;
    tokenEstimate += entryTokens;

    // Touch the memory to track usage (fire-and-forget)
    touchAgentMemory(result.entry.id).catch(() => {});
  }

  return context;
}

/**
 * Auto-extract and store memories from a conversation
 */
export async function extractAndStoreMemories(
  agentId: string,
  conversationId: string,
  userMessage: string,
  assistantResponse: string
): Promise<number> {
  let stored = 0;

  // Extract preferences ("I prefer...", "I always use...", "My favorite...")
  const preferencePatterns = [
    /i (?:prefer|like|always use|always work with|favor|choose)\s+(.+?)(?:\.|,|$)/gi,
    /my (?:favorite|preferred|default|usual)\s+(.+?)(?:is|are|would be)\s+(.+?)(?:\.|,|$)/gi,
  ];
  for (const pattern of preferencePatterns) {
    let match;
    while ((match = pattern.exec(userMessage)) !== null) {
      await storeAgentMemory(
        agentId,
        "preference",
        match[1].trim().substring(0, 100),
        match[0].trim(),
        {
          confidence: 0.7,
          sourceConversationId: conversationId,
          tags: ["auto-extracted", "preference"],
        }
      );
      stored++;
    }
  }

  // Extract facts from assistant response
  const factPatterns = [
    /(?:important|key|critical|notable|essential)\s+(?:fact|point|detail|info):\s*(.+?)(?:\.|$)/gi,
  ];
  for (const pattern of factPatterns) {
    let match;
    while ((match = pattern.exec(assistantResponse)) !== null) {
      await storeAgentMemory(
        agentId,
        "fact",
        `fact_${Date.now()}`,
        match[1].trim(),
        {
          confidence: 0.6,
          sourceConversationId: conversationId,
          tags: ["auto-extracted", "fact"],
        }
      );
      stored++;
    }
  }

  // Store lesson if there was an error that was resolved
  const lower = assistantResponse.toLowerCase();
  if (
    lower.includes("error") &&
    (lower.includes("fixed") ||
      lower.includes("resolved") ||
      lower.includes("solution"))
  ) {
    await storeAgentMemory(
      agentId,
      "lesson",
      `error_solution_${Date.now()}`,
      assistantResponse.substring(0, 500),
      {
        confidence: 0.8,
        sourceConversationId: conversationId,
        tags: ["auto-extracted", "error-resolution"],
      }
    );
    stored++;
  }

  return stored;
}

/**
 * Delete a specific agent memory by ID
 */
export async function deleteAgentMemory(memoryId: string): Promise<boolean> {
  try {
    await db.agentMemory.delete({ where: { id: memoryId } });
    return true;
  } catch {
    return false;
  }
}

/**
 * Get memory statistics for an agent
 */
export async function getAgentMemoryStats(
  agentId: string
): Promise<{
  total: number;
  byCategory: Record<string, number>;
  avgConfidence: number;
  mostAccessed: AgentMemoryEntry | null;
  recentlyUpdated: AgentMemoryEntry[];
}> {
  const memories = await db.agentMemory.findMany({
    where: { agentId },
    orderBy: { updatedAt: "desc" },
  });

  const byCategory: Record<string, number> = {};
  let totalConfidence = 0;
  let mostAccessed: AgentMemoryEntry | null = null;
  let maxAccessCount = 0;

  for (const mem of memories) {
    const entry = prismaToMemoryEntry(mem);
    byCategory[entry.category] = (byCategory[entry.category] || 0) + 1;
    totalConfidence += entry.confidence;
    if (entry.accessCount > maxAccessCount) {
      maxAccessCount = entry.accessCount;
      mostAccessed = entry;
    }
  }

  return {
    total: memories.length,
    byCategory,
    avgConfidence: memories.length > 0 ? totalConfidence / memories.length : 0,
    mostAccessed,
    recentlyUpdated: memories.slice(0, 5).map(prismaToMemoryEntry),
  };
}

/**
 * Clean up expired and low-confidence memories
 */
export async function cleanupAgentMemories(
  agentId?: string
): Promise<number> {
  const where: Record<string, unknown> = {
    OR: [
      { expiresAt: { not: null, lt: new Date() } },
      { confidence: { lt: 0.1 }, accessCount: 0 },
    ],
  };
  if (agentId) where.agentId = agentId;

  const result = await db.agentMemory.deleteMany({ where });
  return result.count;
}

// ── Helper ──────────────────────────────────────────────────────────────────

function prismaToMemoryEntry(row: any): AgentMemoryEntry {
  return {
    id: row.id as string,
    agentId: row.agentId as string,
    category: row.category as AgentMemoryEntry['category'],
    key: row.key as string,
    value: row.value as string,
    confidence: Number(row.confidence),
    accessCount: Number(row.accessCount),
    sourceConversationId: (row.sourceConversationId as string) || undefined,
    tags: (() => {
      try {
        return JSON.parse((row.tags as string) || "[]");
      } catch {
        return [];
      }
    })(),
    createdAt: new Date(row.createdAt),
    updatedAt: new Date(row.updatedAt),
    expiresAt: row.expiresAt ? new Date(row.expiresAt) : undefined,
  };
}

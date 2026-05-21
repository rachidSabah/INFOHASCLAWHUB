/**
 * Universal Context Memory Engine
 *
 * A production-grade vector memory engine providing:
 * - Semantic retrieval with cosine similarity
 * - Memory compression and deduplication
 * - Priority weighting and context aging
 * - Cross-session continuity
 * - Memory linking (episodic, semantic, procedural, project, agent, session types)
 * - Memory summarization
 */

import { db } from "@/lib/db";
import { generateEmbedding, cosineSimilarity } from "@/lib/embeddings";

// ── Type Definitions ──────────────────────────────────────────────────────────

export type MemoryType =
  | "episodic"
  | "semantic"
  | "procedural"
  | "project"
  | "agent"
  | "session";

export type MemoryCategory =
  | "conversation"
  | "code"
  | "workflow"
  | "preference"
  | "error"
  | "success"
  | "research";

export interface StoreMemoryParams {
  type: MemoryType;
  category: MemoryCategory;
  content: string;
  summary?: string;
  sourceId?: string;
  sourceType?: string;
  projectId?: string;
  agentId?: string;
  tags?: string[];
  priority?: number;
  ttlHours?: number;
}

export interface SearchMemoryParams {
  query: string;
  types?: MemoryType[];
  categories?: MemoryCategory[];
  projectId?: string;
  agentId?: string;
  limit?: number;
  threshold?: number;
}

export interface RelevantContextParams {
  query: string;
  maxTokens?: number;
  types?: MemoryType[];
  projectId?: string;
  agentId?: string;
}

export interface CompressOptions {
  olderThanDays?: number;
  minAccessCount?: number;
  dryRun?: boolean;
}

export interface CompressResult {
  compressed: number;
  deduplicated: number;
  freedBytes: number;
}

export interface MemoryStats {
  totalMemories: number;
  byType: Record<string, number>;
  byCategory: Record<string, number>;
  avgPriority: number;
  totalLinks: number;
  oldestMemory: Date | null;
}

export interface ScoredMemory {
  id: string;
  type: string;
  category: string;
  content: string;
  summary: string | null;
  sourceId: string | null;
  sourceType: string | null;
  projectId: string | null;
  agentId: string | null;
  tags: string;
  priority: number;
  accessCount: number;
  relevanceScore: number | null;
  expiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  score: number;
}

// ── Internal Chat API Helper ──────────────────────────────────────────────────

/**
 * Calls the internal Gemini chat API and accumulates the SSE streaming response.
 * Returns the full text response.
 */
async function callInternalChatAPI(
  prompt: string,
  model: string = "gemini-2.5-flash"
): Promise<string> {
  const chatUrl = "http://localhost:3000/api/gemini/chat";
  const res = await fetch(chatUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt,
      model,
      conversationHistory: [],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(
      `Chat API error ${res.status}: ${errText.slice(0, 200)}`
    );
  }

  const reader = res.body?.getReader();
  if (!reader) {
    throw new Error("No response body from chat API");
  }

  const decoder = new TextDecoder();
  let accumulated = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const text = decoder.decode(value, { stream: true });
    const lines = text.split("\n");
    for (const line of lines) {
      if (line.startsWith("data: ")) {
        try {
          const data = JSON.parse(line.slice(6));
          if (data.type === "chunk") {
            accumulated += data.content || "";
          }
        } catch {
          // Ignore malformed SSE lines
        }
      }
    }
  }

  return accumulated;
}

// ── Singleton Pattern ─────────────────────────────────────────────────────────

const globalMemory = globalThis as unknown as {
  __universalMemory?: UniversalMemoryEngine;
};

// ── UniversalMemoryEngine ─────────────────────────────────────────────────────

export class UniversalMemoryEngine {
  /**
   * Get the singleton instance of the UniversalMemoryEngine.
   */
  static getInstance(): UniversalMemoryEngine {
    if (!globalMemory.__universalMemory) {
      globalMemory.__universalMemory = new UniversalMemoryEngine();
    }
    return globalMemory.__universalMemory;
  }

  // ── Store ──────────────────────────────────────────────────────────────────

  /**
   * Store a memory with automatic embedding generation.
   * Supports optional TTL (time-to-live) in hours.
   */
  async store(params: StoreMemoryParams) {
    try {
      const embedding = await generateEmbedding(params.content);
      const embeddingJson = JSON.stringify(embedding);

      const expiresAt =
        params.ttlHours != null && params.ttlHours > 0
          ? new Date(Date.now() + params.ttlHours * 60 * 60 * 1000)
          : null;

      const tags = params.tags ?? [];

      const memory = await db.contextMemory.create({
        data: {
          type: params.type,
          category: params.category,
          content: params.content,
          summary: params.summary ?? null,
          embedding: embeddingJson,
          sourceId: params.sourceId ?? null,
          sourceType: params.sourceType ?? null,
          projectId: params.projectId ?? null,
          agentId: params.agentId ?? null,
          tags: JSON.stringify(tags),
          priority: params.priority ?? 0,
          accessCount: 0,
          relevanceScore: null,
          expiresAt,
        },
      });

      return memory;
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Unknown error storing memory";
      console.error("[UniversalMemory] store failed:", message);
      throw error;
    }
  }

  // ── Search ─────────────────────────────────────────────────────────────────

  /**
   * Semantic search across all memories.
   * Loads all embeddings into memory and computes cosine similarity.
   * For SQLite scale this is perfectly fine.
   */
  async search(params: SearchMemoryParams): Promise<ScoredMemory[]> {
    try {
      const {
        query,
        types,
        categories,
        projectId,
        agentId,
        limit = 20,
        threshold = 0.3,
      } = params;

      if (!query.trim()) return [];

      // Generate the query embedding
      const queryEmbedding = await generateEmbedding(query);

      // Build where filter
      const where: Record<string, unknown> = {};
      if (types && types.length > 0) {
        where.type = { in: types };
      }
      if (categories && categories.length > 0) {
        where.category = { in: categories };
      }
      if (projectId) {
        where.projectId = projectId;
      }
      if (agentId) {
        where.agentId = agentId;
      }

      // Load matching memories with embeddings
      const memories = await db.contextMemory.findMany({
        where: {
          ...where,
          embedding: { not: null },
          // Exclude expired memories
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        },
      });

      // Score each memory by cosine similarity
      const scored: ScoredMemory[] = [];

      for (const memory of memories) {
        if (!memory.embedding) continue;

        try {
          const memEmbedding: number[] = JSON.parse(memory.embedding);
          const similarity = cosineSimilarity(queryEmbedding, memEmbedding);

          if (similarity >= threshold) {
            // Boost score by priority and access count
            const priorityBoost = memory.priority * 0.02;
            const accessBoost = Math.min(memory.accessCount * 0.005, 0.1);
            // Age penalty: newer memories get a slight boost
            const ageMs = Date.now() - new Date(memory.createdAt).getTime();
            const ageDays = ageMs / (1000 * 60 * 60 * 24);
            const agePenalty = Math.min(ageDays * 0.002, 0.1);

            const finalScore =
              similarity + priorityBoost + accessBoost - agePenalty;

            scored.push({
              ...memory,
              score: finalScore,
            });
          }
        } catch {
          // Skip memories with corrupted embeddings
          continue;
        }
      }

      // Sort by score descending, take top `limit`
      scored.sort((a, b) => b.score - a.score);

      // Increment access count for returned memories (fire-and-forget)
      const topResults = scored.slice(0, limit);
      for (const mem of topResults) {
        db.contextMemory
          .update({
            where: { id: mem.id },
            data: { accessCount: { increment: 1 } },
          })
          .catch(() => {
            // Non-critical: ignore access count update failures
          });
      }

      return topResults;
    } catch (error: unknown) {
      const message =
        error instanceof Error
          ? error.message
          : "Unknown error searching memories";
      console.error("[UniversalMemory] search failed:", message);
      return [];
    }
  }

  // ── Get Relevant Context ───────────────────────────────────────────────────

  /**
   * Get relevant context for a conversation/task as a sliding window string.
   * Respects maxTokens (estimated at ~4 chars per token).
   */
  async getRelevantContext(params: RelevantContextParams): Promise<string> {
    try {
      const {
        query,
        maxTokens = 2000,
        types,
        projectId,
        agentId,
      } = params;

      const maxChars = maxTokens * 4;

      const results = await this.search({
        query,
        types,
        projectId,
        agentId,
        limit: 50,
        threshold: 0.2,
      });

      if (results.length === 0) return "";

      const contextLines: string[] = [];
      let totalChars = 0;

      for (const memory of results) {
        const displayText = memory.summary ?? memory.content;
        const header = `[${memory.type}/${memory.category}]`;
        const line = `${header} ${displayText}`;

        if (totalChars + line.length > maxChars) {
          // Try to fit a truncated version
          const remaining = maxChars - totalChars;
          if (remaining > 50) {
            const truncated = line.slice(0, remaining - 3) + "...";
            contextLines.push(truncated);
            totalChars += truncated.length;
          }
          break;
        }

        contextLines.push(line);
        totalChars += line.length;
      }

      return contextLines.join("\n");
    } catch (error: unknown) {
      const message =
        error instanceof Error
          ? error.message
          : "Unknown error getting relevant context";
      console.error("[UniversalMemory] getRelevantContext failed:", message);
      return "";
    }
  }

  // ── Link ───────────────────────────────────────────────────────────────────

  /**
   * Link two memories together with a relation type and optional strength.
   */
  async link(
    sourceId: string,
    targetId: string,
    relationType: string,
    strength: number = 1.0
  ) {
    try {
      // Verify both memories exist
      const [source, target] = await Promise.all([
        db.contextMemory.findUnique({ where: { id: sourceId } }),
        db.contextMemory.findUnique({ where: { id: targetId } }),
      ]);

      if (!source) {
        throw new Error(`Source memory not found: ${sourceId}`);
      }
      if (!target) {
        throw new Error(`Target memory not found: ${targetId}`);
      }

      const clampedStrength = Math.max(0, Math.min(1, strength));

      const link = await db.memoryLink.create({
        data: {
          sourceId,
          targetId,
          relationType,
          strength: clampedStrength,
        },
      });

      return link;
    } catch (error: unknown) {
      const message =
        error instanceof Error
          ? error.message
          : "Unknown error linking memories";
      console.error("[UniversalMemory] link failed:", message);
      throw error;
    }
  }

  // ── Compress ───────────────────────────────────────────────────────────────

  /**
   * Compress old memories by summarizing and deduplicating.
   * Groups similar memories (>0.9 similarity) and merges them.
   */
  async compress(
    options: CompressOptions = {}
  ): Promise<CompressResult> {
    const {
      olderThanDays = 30,
      minAccessCount = 0,
      dryRun = false,
    } = options;

    const result: CompressResult = {
      compressed: 0,
      deduplicated: 0,
      freedBytes: 0,
    };

    try {
      const cutoffDate = new Date(
        Date.now() - olderThanDays * 24 * 60 * 60 * 1000
      );

      // Fetch old memories with low access count
      const oldMemories = await db.contextMemory.findMany({
        where: {
          createdAt: { lt: cutoffDate },
          accessCount: { lte: minAccessCount },
        },
        orderBy: { createdAt: "asc" },
      });

      if (oldMemories.length === 0) return result;

      // Parse embeddings and compute similarity groups
      const embeddingMap = new Map<string, number[]>();
      for (const memory of oldMemories) {
        if (memory.embedding) {
          try {
            embeddingMap.set(memory.id, JSON.parse(memory.embedding));
          } catch {
            // Skip corrupted embeddings
          }
        }
      }

      // Group similar memories using union-find approach
      const groups: Set<string>[] = [];
      const assignedToGroup = new Map<string, number>();

      for (let i = 0; i < oldMemories.length; i++) {
        const memA = oldMemories[i];
        const embA = embeddingMap.get(memA.id);

        if (assignedToGroup.has(memA.id)) continue;

        const group = new Set<string>();
        group.add(memA.id);

        if (embA) {
          for (let j = i + 1; j < oldMemories.length; j++) {
            const memB = oldMemories[j];
            if (assignedToGroup.has(memB.id)) continue;

            const embB = embeddingMap.get(memB.id);
            if (!embB) continue;

            const similarity = cosineSimilarity(embA, embB);
            if (similarity > 0.9) {
              group.add(memB.id);
            }
          }
        }

        const groupIndex = groups.length;
        groups.push(group);
        for (const id of Array.from(group)) {
          assignedToGroup.set(id, groupIndex);
        }
      }

      // Process groups with more than one member (deduplicate)
      for (const group of groups) {
        if (group.size <= 1) continue;

        const groupMemories = oldMemories.filter((m) => group.has(m.id));
        if (groupMemories.length <= 1) continue;

        // Calculate total content size for freed bytes tracking
        const totalContentBytes = groupMemories.reduce(
          (sum, m) => sum + m.content.length + (m.embedding?.length ?? 0),
          0
        );

        // Merge: use the highest-priority memory as base, combine content
        const sortedByPriority = [...groupMemories].sort(
          (a, b) => b.priority - a.priority || b.accessCount - a.accessCount
        );

        const baseMemory = sortedByPriority[0];
        const mergedContent = groupMemories
          .map((m) => m.content)
          .join("\n---\n");

        // Generate merged embedding
        const mergedEmbedding = await generateEmbedding(mergedContent);

        // Try to summarize the merged content
        let mergedSummary: string | null = null;
        try {
          mergedSummary = await callInternalChatAPI(
            `Summarize the following memories into a single concise summary that captures all key information. Be brief but comprehensive:\n\n${mergedContent.slice(0, 2000)}`
          );
        } catch {
          // Fallback: use the base memory's summary or a truncated version
          mergedSummary =
            baseMemory.summary ?? mergedContent.slice(0, 200) + "...";
        }

        if (!dryRun) {
          // Update the base memory with merged content
          await db.contextMemory.update({
            where: { id: baseMemory.id },
            data: {
              content: mergedContent,
              summary: mergedSummary,
              embedding: JSON.stringify(mergedEmbedding),
              priority: Math.max(...groupMemories.map((m) => m.priority)),
              accessCount: Math.max(...groupMemories.map((m) => m.accessCount)),
            },
          });

          // Re-link any links from merged memories to the base memory
          const idsToDelete = groupMemories
            .filter((m) => m.id !== baseMemory.id)
            .map((m) => m.id);

          // Update links pointing to deleted memories
          for (const delId of idsToDelete) {
            await db.memoryLink
              .updateMany({
                where: { sourceId: delId },
                data: { sourceId: baseMemory.id },
              })
              .catch(() => {});

            await db.memoryLink
              .updateMany({
                where: { targetId: delId },
                data: { targetId: baseMemory.id },
              })
              .catch(() => {});
          }

          // Delete the duplicate memories
          await db.contextMemory.deleteMany({
            where: { id: { in: idsToDelete } },
          });
        }

        result.deduplicated += groupMemories.length - 1;
        result.freedBytes += totalContentBytes - mergedContent.length;
      }

      // Compress singleton old memories (generate summaries)
      for (const group of groups) {
        if (group.size !== 1) continue;

        const memory = oldMemories.find((m) => group.has(m.id));
        if (!memory) continue;

        // Only compress if no summary exists and content is long
        if (memory.summary || memory.content.length < 200) continue;

        let summary: string | null = null;
        try {
          summary = await callInternalChatAPI(
            `Summarize this memory concisely while preserving key information:\n\n${memory.content.slice(0, 2000)}`
          );
        } catch {
          // Fallback: use a truncated version
          summary = memory.content.slice(0, 150) + "...";
        }

        const contentBefore = memory.content.length;
        const contentAfter = summary.length + memory.content.length;

        if (!dryRun) {
          await db.contextMemory.update({
            where: { id: memory.id },
            data: { summary },
          });
        }

        result.compressed += 1;
        // In compression, we add a summary but keep the full content
        // Freed bytes = embedding savings if we later remove full content
        result.freedBytes += Math.max(0, contentBefore - summary.length);
      }

      return result;
    } catch (error: unknown) {
      const message =
        error instanceof Error
          ? error.message
          : "Unknown error compressing memories";
      console.error("[UniversalMemory] compress failed:", message);
      return result;
    }
  }

  // ── Summarize ──────────────────────────────────────────────────────────────

  /**
   * Summarize a set of memories by their IDs.
   * Uses the internal chat API to generate a comprehensive summary.
   */
  async summarize(memoryIds: string[]): Promise<string> {
    try {
      if (memoryIds.length === 0) return "";

      const memories = await db.contextMemory.findMany({
        where: { id: { in: memoryIds } },
        orderBy: { createdAt: "asc" },
      });

      if (memories.length === 0) return "";

      const combinedContent = memories
        .map(
          (m) =>
            `[${m.type}/${m.category}] (priority: ${m.priority}):\n${m.summary ?? m.content}`
        )
        .join("\n\n");

      // If the combined content is small enough, return it directly
      if (combinedContent.length < 100) return combinedContent;

      const summary = await callInternalChatAPI(
        `Summarize the following memory entries into a coherent, concise summary. Preserve key facts, relationships, and any important context:\n\n${combinedContent.slice(0, 4000)}`
      );

      return summary || combinedContent.slice(0, 500) + "...";
    } catch (error: unknown) {
      const message =
        error instanceof Error
          ? error.message
          : "Unknown error summarizing memories";
      console.error("[UniversalMemory] summarize failed:", message);
      // Fallback: return concatenated content
      try {
        const memories = await db.contextMemory.findMany({
          where: { id: { in: memoryIds } },
        });
        return memories
          .map((m) => m.summary ?? m.content)
          .join("; ")
          .slice(0, 500);
      } catch {
        return "";
      }
    }
  }

  // ── Ingest Conversation ────────────────────────────────────────────────────

  /**
   * Auto-extract and store key facts from a conversation as episodic memories.
   * Returns the number of memories stored.
   */
  async ingestConversation(
    conversationId: string,
    messages: Array<{ role: string; content: string }>
  ): Promise<number> {
    try {
      if (messages.length === 0) return 0;

      // Build a condensed version of the conversation
      const conversationText = messages
        .slice(-20) // Last 20 messages to keep it manageable
        .map((m) => `${m.role}: ${m.content}`)
        .join("\n");

      // Use the chat API to extract key facts
      let facts: string[] = [];
      try {
        const extractionResult = await callInternalChatAPI(
          `Extract the key facts, decisions, preferences, and important information from this conversation. Return each fact as a separate bullet point. Only extract genuinely important or memorable information, not trivial greetings or acknowledgments.\n\nConversation:\n${conversationText.slice(0, 3000)}\n\nReturn the facts as a JSON array of strings, e.g. ["fact1", "fact2", ...]. If no important facts, return [].`
        );

        // Try to parse the JSON array from the response
        const jsonMatch = extractionResult.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          if (Array.isArray(parsed)) {
            facts = parsed.filter(
              (f: unknown) => typeof f === "string" && f.trim().length > 0
            );
          }
        }
      } catch {
        // Fallback: extract simple facts by splitting on user messages
        facts = messages
          .filter((m) => m.role === "user" && m.content.trim().length > 10)
          .map((m) => m.content.trim().slice(0, 200));
      }

      if (facts.length === 0) return 0;

      // Limit the number of facts to store (avoid flooding)
      const factsToStore = facts.slice(0, 10);

      // Determine the best category for each fact
      let storedCount = 0;

      for (const fact of factsToStore) {
        try {
          // Simple heuristic for categorization
          const lowerFact = fact.toLowerCase();
          let category: MemoryCategory = "conversation";
          let type: MemoryType = "episodic";

          if (
            lowerFact.includes("error") ||
            lowerFact.includes("bug") ||
            lowerFact.includes("fail")
          ) {
            category = "error";
          } else if (
            lowerFact.includes("success") ||
            lowerFact.includes("works") ||
            lowerFact.includes("fixed")
          ) {
            category = "success";
          } else if (
            lowerFact.includes("prefer") ||
            lowerFact.includes("always") ||
            lowerFact.includes("never") ||
            lowerFact.includes("like")
          ) {
            category = "preference";
            type = "semantic";
          } else if (
            lowerFact.includes("function") ||
            lowerFact.includes("class") ||
            lowerFact.includes("api") ||
            lowerFact.includes("code")
          ) {
            category = "code";
          } else if (
            lowerFact.includes("step") ||
            lowerFact.includes("process") ||
            lowerFact.includes("workflow")
          ) {
            category = "workflow";
            type = "procedural";
          } else if (
            lowerFact.includes("research") ||
            lowerFact.includes("found") ||
            lowerFact.includes("discovered")
          ) {
            category = "research";
          }

          await this.store({
            type,
            category,
            content: fact,
            sourceId: conversationId,
            sourceType: "conversation",
            priority: category === "error" || category === "preference" ? 5 : 2,
            tags: ["auto-ingested", conversationId],
            ttlHours: 720, // 30 days default TTL for ingested memories
          });

          storedCount++;
        } catch {
          // Skip individual fact storage failures
          continue;
        }
      }

      return storedCount;
    } catch (error: unknown) {
      const message =
        error instanceof Error
          ? error.message
          : "Unknown error ingesting conversation";
      console.error("[UniversalMemory] ingestConversation failed:", message);
      return 0;
    }
  }

  // ── Prune ──────────────────────────────────────────────────────────────────

  /**
   * Age out expired memories. Deletes all memories where expiresAt < now.
   * Returns the number of deleted memories.
   */
  async prune(): Promise<number> {
    try {
      const now = new Date();

      // First, delete memory links that reference memories about to be pruned
      const expiredMemories = await db.contextMemory.findMany({
        where: { expiresAt: { lt: now } },
        select: { id: true },
      });

      if (expiredMemories.length === 0) return 0;

      const expiredIds = expiredMemories.map((m) => m.id);

      // Delete links referencing expired memories
      await db.memoryLink.deleteMany({
        where: {
          OR: [
            { sourceId: { in: expiredIds } },
            { targetId: { in: expiredIds } },
          ],
        },
      });

      // Delete the expired memories
      const deleted = await db.contextMemory.deleteMany({
        where: { expiresAt: { lt: now } },
      });

      return deleted.count;
    } catch (error: unknown) {
      const message =
        error instanceof Error
          ? error.message
          : "Unknown error pruning memories";
      console.error("[UniversalMemory] prune failed:", message);
      return 0;
    }
  }

  // ── Get Stats ──────────────────────────────────────────────────────────────

  /**
   * Get comprehensive statistics about the memory store.
   */
  async getStats(): Promise<MemoryStats> {
    try {
      const [
        totalMemories,
        memoriesByType,
        memoriesByCategory,
        totalLinks,
        oldestMemory,
      ] = await Promise.all([
        db.contextMemory.count(),
        db.contextMemory.groupBy({ by: ["type"], _count: true }),
        db.contextMemory.groupBy({ by: ["category"], _count: true }),
        db.memoryLink.count(),
        db.contextMemory.findFirst({
          orderBy: { createdAt: "asc" },
          select: { createdAt: true },
        }),
      ]);

      // Aggregate priority
      const priorityAgg = await db.contextMemory.aggregate({
        _avg: { priority: true },
      });

      const byType: Record<string, number> = {};
      for (const entry of memoriesByType) {
        byType[entry.type] = entry._count;
      }

      const byCategory: Record<string, number> = {};
      for (const entry of memoriesByCategory) {
        byCategory[entry.category] = entry._count;
      }

      return {
        totalMemories,
        byType,
        byCategory,
        avgPriority: priorityAgg._avg.priority ?? 0,
        totalLinks,
        oldestMemory: oldestMemory?.createdAt ?? null,
      };
    } catch (error: unknown) {
      const message =
        error instanceof Error
          ? error.message
          : "Unknown error getting memory stats";
      console.error("[UniversalMemory] getStats failed:", message);
      return {
        totalMemories: 0,
        byType: {},
        byCategory: {},
        avgPriority: 0,
        totalLinks: 0,
        oldestMemory: null,
      };
    }
  }
}

// ── Singleton accessor ────────────────────────────────────────────────────────

/**
 * Returns the singleton UniversalMemoryEngine instance.
 */
export function getUniversalMemory(): UniversalMemoryEngine {
  return UniversalMemoryEngine.getInstance();
}

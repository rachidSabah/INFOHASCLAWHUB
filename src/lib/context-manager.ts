/**
 * Context Window Manager
 *
 * Tracks token usage per conversation in real-time, provides visual
 * context window usage, auto-summarizes old messages when approaching
 * limits, and allows pinning/unpinning messages.
 */

import { db } from "@/lib/db";

// ── Types ──────────────────────────────────────────────────────────────────

export interface ContextUsage {
  used: number;
  max: number;
  percentage: number;
  shouldCompress: boolean;
  pinnedCount: number;
  messageCount: number;
  compressionRatio: number;
}

export interface ConversationCostBreakdown {
  conversationId: string;
  totalTokens: number;
  promptTokens: number;
  completionTokens: number;
  estimatedCostUsd: number;
  messageCount: number;
  byModel: Record<string, { tokens: number; cost: number; count: number }>;
}

// ── Cost estimates per 1K tokens (approximate) ─────────────────────────────

const MODEL_COSTS: Record<string, { prompt: number; completion: number }> = {
  "gemini-3.1-pro": { prompt: 0.00125, completion: 0.005 },
  "gemini-3-flash": { prompt: 0.000075, completion: 0.0003 },
  "gemini-2.5-pro": { prompt: 0.00125, completion: 0.005 },
  "gemini-2.5-flash": { prompt: 0.000075, completion: 0.0003 },
  "gemini-2.0-flash": { prompt: 0.000075, completion: 0.0003 },
  "gemini-1.5-pro": { prompt: 0.00125, completion: 0.005 },
  "gemini-1.5-flash": { prompt: 0.000075, completion: 0.0003 },
  "gpt-4o": { prompt: 0.0025, completion: 0.01 },
  "gpt-4o-mini": { prompt: 0.00015, completion: 0.0006 },
  "claude-3.5-sonnet": { prompt: 0.003, completion: 0.015 },
};

const DEFAULT_COST = { prompt: 0.0005, completion: 0.002 };

// ── Singleton ──────────────────────────────────────────────────────────────

const globalCtx = globalThis as unknown as { __contextManager?: ContextManagerEngine };

export class ContextManagerEngine {
  private tokenBuffer: Map<string, number> = new Map(); // conversationId → unflushed tokens

  static getInstance(): ContextManagerEngine {
    if (!globalCtx.__contextManager) {
      globalCtx.__contextManager = new ContextManagerEngine();
    }
    return globalCtx.__contextManager;
  }

  // ── Estimate Tokens ────────────────────────────────────────────────────

  /**
   * Estimate token count from text.
   * Uses 4 chars ≈ 1 token heuristic (good for English + code).
   * For CJK text, uses 2 chars ≈ 1 token.
   */
  estimateTokens(text: string): number {
    if (!text) return 0;
    // Count CJK characters
    const cjkChars = (text.match(/[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af]/g) || []).length;
    const latinChars = text.length - cjkChars;
    return Math.ceil(cjkChars / 2 + latinChars / 4);
  }

  // ── Track Message ──────────────────────────────────────────────────────

  /**
   * Track token usage for a new message in a conversation.
   * Buffers tokens and periodically flushes to DB.
   */
  async trackMessage(conversationId: string, messageId: string, tokens: number): Promise<void> {
    // Buffer tokens
    const current = this.tokenBuffer.get(conversationId) || 0;
    this.tokenBuffer.set(conversationId, current + tokens);

    // Record in TokenUsageRecord
    try {
      await db.tokenUsageRecord.create({
        data: {
          conversationId,
          model: "unknown",
          promptTokens: tokens,
          completionTokens: 0,
          totalTokens: tokens,
          costUsd: 0,
        },
      });
    } catch {
      // Non-critical
    }

    // Update context window state
    try {
      const state = await db.contextWindowState.upsert({
        where: { conversationId },
        create: { conversationId, usedTokens: tokens },
        update: { usedTokens: { increment: tokens }, lastCompressedAt: new Date() },
      });

      // Auto-compress check
      const percentage = state.usedTokens / state.maxTokens;
      if (percentage > 0.8) {
        // Will be handled by the UI / API calling autoCompress
      }
    } catch {
      // Non-critical
    }
  }

  // ── Track Streaming Tokens ─────────────────────────────────────────────

  /**
   * Track tokens during streaming in real-time.
   * Called incrementally as chunks arrive.
   */
  async trackStreamingTokens(
    conversationId: string,
    chunk: string,
    model: string
  ): Promise<number> {
    const tokens = this.estimateTokens(chunk);

    // Buffer
    const current = this.tokenBuffer.get(conversationId) || 0;
    this.tokenBuffer.set(conversationId, current + tokens);

    // Update context state (fire-and-forget)
    db.contextWindowState.upsert({
      where: { conversationId },
      create: { conversationId, usedTokens: tokens },
      update: { usedTokens: { increment: tokens }, lastCompressedAt: new Date() },
    }).catch(() => {});

    return tokens;
  }

  // ── Get Context Usage ──────────────────────────────────────────────────

  /**
   * Get the current context window usage for a conversation.
   */
  async getContextUsage(conversationId: string): Promise<ContextUsage> {
    try {
      const state = await db.contextWindowState.upsert({
        where: { conversationId },
        create: { conversationId },
        update: {},
      });

      const buffered = this.tokenBuffer.get(conversationId) || 0;
      const used = state.usedTokens + buffered;
      const pinnedMessageIds = JSON.parse(state.pinnedMessageIds || "[]") as string[];

      return {
        used,
        max: state.maxTokens,
        percentage: Math.min((used / state.maxTokens) * 100, 100),
        shouldCompress: used / state.maxTokens > 0.8,
        pinnedCount: pinnedMessageIds.length,
        messageCount: 0,
        compressionRatio: state.compressionRatio,
      };
    } catch {
      return { used: 0, max: 128000, percentage: 0, shouldCompress: false, pinnedCount: 0, messageCount: 0, compressionRatio: 1.0 };
    }
  }

  // ── Pin/Unpin Messages ─────────────────────────────────────────────────

  async pinMessage(conversationId: string, messageId: string): Promise<void> {
    try {
      const state = await db.contextWindowState.upsert({
        where: { conversationId },
        create: { conversationId, pinnedMessageIds: JSON.stringify([messageId]) },
        update: {},
      });

      const pinned = JSON.parse(state.pinnedMessageIds || "[]") as string[];
      if (!pinned.includes(messageId)) {
        pinned.push(messageId);
        await db.contextWindowState.update({
          where: { conversationId },
          data: { pinnedMessageIds: JSON.stringify(pinned) },
        });
      }
    } catch {
      // Non-critical
    }
  }

  async unpinMessage(conversationId: string, messageId: string): Promise<void> {
    try {
      const state = await db.contextWindowState.findUnique({ where: { conversationId } });
      if (!state) return;

      const pinned = JSON.parse(state.pinnedMessageIds || "[]") as string[];
      const updated = pinned.filter((id: string) => id !== messageId);
      await db.contextWindowState.update({
        where: { conversationId },
        data: { pinnedMessageIds: JSON.stringify(updated) },
      });
    } catch {
      // Non-critical
    }
  }

  // ── Auto Compress ──────────────────────────────────────────────────────

  /**
   * Auto-summarize old messages when context window is getting full.
   * Returns the compressed summary text.
   */
  async autoCompress(
    conversationId: string,
    messages: Array<{ id: string; role: string; content: string }>
  ): Promise<{ summary: string; compressedCount: number; savedTokens: number }> {
    try {
      const state = await db.contextWindowState.upsert({
        where: { conversationId },
        create: { conversationId },
        update: {},
      });

      const pinned = new Set(JSON.parse(state.pinnedMessageIds || "[]") as string[]);

      // Find messages to compress (skip pinned and already summarized)
      const toCompress = messages.filter(
        (m) => !pinned.has(m.id) && m.id !== state.summarizedUpTo
      );

      if (toCompress.length < 3) {
        return { summary: state.summaryText || "", compressedCount: 0, savedTokens: 0 };
      }

      // Compress first 70% of messages (keep recent ones intact)
      const cutoff = Math.floor(toCompress.length * 0.7);
      const oldMessages = toCompress.slice(0, cutoff);

      if (oldMessages.length === 0) {
        return { summary: state.summaryText || "", compressedCount: 0, savedTokens: 0 };
      }

      // Build text for summarization
      const conversationText = oldMessages
        .map((m) => `${m.role}: ${m.content.slice(0, 500)}`)
        .join("\n");

      let summary = state.summaryText || "";

      try {
        const res = await fetch("http://localhost:3000/api/gemini/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt: `Summarize the following conversation segment concisely, preserving all key facts, decisions, code references, and important details. Be thorough but brief:\n\n${conversationText.slice(0, 6000)}`,
            model: "gemini-2.5-flash",
            conversationHistory: [],
          }),
        });

        if (res.ok) {
          const reader = res.body?.getReader();
          if (reader) {
            const decoder = new TextDecoder();
            let accumulated = "";
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              const text = decoder.decode(value, { stream: true });
              for (const line of text.split("\n")) {
                if (line.startsWith("data: ")) {
                  try {
                    const data = JSON.parse(line.slice(6));
                    if (data.type === "chunk") accumulated += data.content || "";
                  } catch {}
                }
              }
            }
            if (accumulated.trim()) summary = accumulated;
          }
        }
      } catch {
        // Fallback: create a simple summary
        summary = oldMessages
          .map((m) => `${m.role}: ${m.content.slice(0, 100)}`)
          .join("; ");
      }

      // Calculate savings
      const originalTokens = oldMessages.reduce(
        (sum, m) => sum + this.estimateTokens(m.content),
        0
      );
      const summaryTokens = this.estimateTokens(summary);
      const savedTokens = Math.max(0, originalTokens - summaryTokens);

      // Update DB
      const lastCompressedId = oldMessages[oldMessages.length - 1].id;
      const newTotalTokens = Math.max(0, state.usedTokens - savedTokens);

      await db.contextWindowState.update({
        where: { conversationId },
        data: {
          summarizedUpTo: lastCompressedId,
          summaryText: summary,
          usedTokens: newTotalTokens,
          compressionRatio: summaryTokens / Math.max(1, originalTokens),
          lastCompressedAt: new Date(),
        },
      });

      // Clear buffer
      this.tokenBuffer.delete(conversationId);

      return { summary, compressedCount: oldMessages.length, savedTokens };
    } catch {
      return { summary: "", compressedCount: 0, savedTokens: 0 };
    }
  }

  // ── Get Conversation Cost Breakdown ────────────────────────────────────

  /**
   * Get detailed cost breakdown for a conversation.
   */
  async getConversationCostBreakdown(conversationId: string): Promise<ConversationCostBreakdown> {
    const breakdown: ConversationCostBreakdown = {
      conversationId,
      totalTokens: 0,
      promptTokens: 0,
      completionTokens: 0,
      estimatedCostUsd: 0,
      messageCount: 0,
      byModel: {},
    };

    try {
      // Get messages
      const messages = await db.message.findMany({
        where: { conversationId },
        select: { id: true, role: true, content: true, metadata: true },
      });

      breakdown.messageCount = messages.length;

      for (const msg of messages) {
        let model = "unknown";
        let msgTokens = { prompt: 0, completion: 0, total: 0 };

        try {
          const meta = msg.metadata ? JSON.parse(msg.metadata) : null;
          if (meta?.model) model = meta.model;
          if (meta?.tokens) msgTokens = meta.tokens;
        } catch {}

        // Estimate if not in metadata
        if (msgTokens.total === 0) {
          const estimated = this.estimateTokens(msg.content);
          if (msg.role === "user") {
            msgTokens.prompt = estimated;
          } else {
            msgTokens.completion = estimated;
          }
          msgTokens.total = estimated;
        }

        breakdown.totalTokens += msgTokens.total;
        breakdown.promptTokens += msgTokens.prompt;
        breakdown.completionTokens += msgTokens.completion;

        // Cost calculation
        const costConfig = MODEL_COSTS[model] || DEFAULT_COST;
        const cost =
          (msgTokens.prompt / 1000) * costConfig.prompt +
          (msgTokens.completion / 1000) * costConfig.completion;

        breakdown.estimatedCostUsd += cost;

        // Per-model breakdown
        if (!breakdown.byModel[model]) {
          breakdown.byModel[model] = { tokens: 0, cost: 0, count: 0 };
        }
        breakdown.byModel[model].tokens += msgTokens.total;
        breakdown.byModel[model].cost += cost;
        breakdown.byModel[model].count += 1;
      }
    } catch {
      // Return partial data
    }

    return breakdown;
  }

  // ── Set Max Tokens ─────────────────────────────────────────────────────

  async setMaxTokens(conversationId: string, maxTokens: number): Promise<void> {
    await db.contextWindowState.upsert({
      where: { conversationId },
      create: { conversationId, maxTokens },
      update: { maxTokens },
    });
  }
}

export function getContextManager(): ContextManagerEngine {
  return ContextManagerEngine.getInstance();
}

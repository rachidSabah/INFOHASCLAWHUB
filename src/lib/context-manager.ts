/**
 * Context Window Manager
 *
 * Tracks token usage per conversation in real-time, provides visual
 * context window usage, auto-summarizes old messages when approaching
 * limits, and allows pinning/unpinning messages.
 *
 * Enhanced with:
 * - Automatic context window estimation based on model type
 * - Smart message truncation that preserves important context (system > recent > tool results > older)
 * - Conversation summarization when approaching context limits
 * - Priority-based context retention
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

export type MessagePriority = "system" | "critical" | "recent" | "tool_result" | "older";

export interface PrioritizedMessage {
  id: string;
  role: string;
  content: string;
  priority: MessagePriority;
  tokenCount: number;
  metadata?: any;
}

export interface SmartTruncationResult {
  messages: any[];
  totalTokens: number;
  removedCount: number;
  savedTokens: number;
  summary?: string;
}

// ── Model context window sizes ────────────────────────────────────────────

const MODEL_CONTEXT_WINDOWS: Record<string, number> = {
  // Gemini models
  "gemini-3.1-pro": 2_000_000,
  "gemini-3-flash": 1_000_000,
  "gemini-2.5-pro": 1_000_000,
  "gemini-2.5-flash": 1_000_000,
  "gemini-2.0-flash": 1_000_000,
  "gemini-2.0-flash-lite": 1_000_000,
  "gemini-1.5-pro": 2_000_000,
  "gemini-1.5-flash": 1_000_000,
  // OpenAI models
  "gpt-4o": 128_000,
  "gpt-4o-mini": 128_000,
  "gpt-4-turbo": 128_000,
  "gpt-4": 8_192,
  "gpt-3.5-turbo": 16_385,
  "o1": 200_000,
  "o1-mini": 128_000,
  "o3-mini": 200_000,
  // Anthropic models
  "claude-3.5-sonnet": 200_000,
  "claude-3-opus": 200_000,
  "claude-3-haiku": 200_000,
  // DeepSeek models
  "deepseek-chat": 64_000,
  "deepseek-reasoner": 64_000,
  "deepseek-coder": 16_384,
  // Qwen models
  "qwen2.5-72b-instruct": 131_072,
  "qwen2.5-7b-instruct": 131_072,
};

const DEFAULT_CONTEXT_WINDOW = 128_000;

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

  // ── Context Window Estimation ──────────────────────────────────────────

  /**
   * Get the context window size for a specific model.
   * Falls back to fuzzy matching for model name variants.
   */
  getContextWindowSize(model: string): number {
    // Exact match
    if (MODEL_CONTEXT_WINDOWS[model]) return MODEL_CONTEXT_WINDOWS[model];
    // Fuzzy match: check if model name contains a known model key
    const modelLower = model.toLowerCase();
    for (const [key, size] of Object.entries(MODEL_CONTEXT_WINDOWS)) {
      if (modelLower.includes(key.toLowerCase())) return size;
    }
    // Default
    return DEFAULT_CONTEXT_WINDOW;
  }

  /**
   * Get the maximum tokens that should be used for prompt (leaving room for completion).
   * Typically 70-80% of the context window.
   */
  getMaxPromptTokens(model: string, reservedForCompletion: number = 4096): number {
    const windowSize = this.getContextWindowSize(model);
    return Math.floor(windowSize * 0.75) - reservedForCompletion;
  }

  // ── Priority-Based Message Classification ─────────────────────────────

  /**
   * Classify messages by priority for context retention.
   * Priority order: system > critical > recent > tool_result > older
   */
  classifyMessages(
    messages: Array<{ id: string; role: string; content: string; metadata?: any }>,
    currentPrompt?: string
  ): PrioritizedMessage[] {
    const now = Date.now();
    const messageCount = messages.length;

    return messages.map((msg, index) => {
      const tokenCount = this.estimateTokens(msg.content);
      let priority: MessagePriority;

      // System messages are always highest priority
      if (msg.role === "system") {
        priority = "system";
      }
      // Pinned messages are critical
      else if (msg.metadata?.pinned) {
        priority = "critical";
      }
      // Recent messages (last 4) are high priority
      else if (index >= messageCount - 4) {
        priority = "recent";
      }
      // Tool results are medium priority (contain factual data)
      else if (msg.role === "tool" || msg.content.includes("Tool:") || msg.content.includes("⚙️")) {
        priority = "tool_result";
      }
      // Older messages are lowest priority
      else {
        priority = "older";
      }

      return {
        id: msg.id,
        role: msg.role,
        content: msg.content,
        priority,
        tokenCount,
        metadata: msg.metadata,
      };
    });
  }

  // ── Smart Truncation ──────────────────────────────────────────────────

  /**
   * Intelligently truncate conversation history to fit within token limits.
   * Preserves important context using priority-based retention:
   * 1. Always keep system messages
   * 2. Always keep critical (pinned) messages
   * 3. Keep the most recent messages
   * 4. Keep tool result messages if space allows
   * 5. Summarize older messages if needed
   */
  smartTruncate(
    messages: Array<{ id: string; role: string; content: string; metadata?: any }>,
    model: string,
    systemPromptTokens: number = 0,
    reservedForCompletion: number = 4096
  ): SmartTruncationResult {
    const maxTokens = this.getMaxPromptTokens(model, reservedForCompletion) - systemPromptTokens;
    const prioritized = this.classifyMessages(messages);

    // Calculate total tokens
    const totalTokens = prioritized.reduce((sum, m) => sum + m.tokenCount, 0);

    // If we're within budget, return as-is
    if (totalTokens <= maxTokens) {
      return {
        messages: messages.map(m => ({ role: m.role, content: m.content, ...(m.metadata?.reasoning_content ? { reasoning_content: m.metadata.reasoning_content } : {}) })),
        totalTokens,
        removedCount: 0,
        savedTokens: 0,
      };
    }

    // Priority retention: keep messages in order of priority
    const priorityOrder: MessagePriority[] = ["system", "critical", "recent", "tool_result", "older"];
    const kept: PrioritizedMessage[] = [];
    const removed: PrioritizedMessage[] = [];
    let usedTokens = 0;

    // First pass: always keep system and critical messages
    for (const priority of priorityOrder) {
      const msgsOfPriority = prioritized.filter(m => m.priority === priority);
      for (const msg of msgsOfPriority) {
        if (priority === "system" || priority === "critical") {
          kept.push(msg);
          usedTokens += msg.tokenCount;
        }
      }
    }

    // Second pass: add recent messages
    const recentMsgs = prioritized.filter(m => m.priority === "recent");
    for (const msg of recentMsgs) {
      if (usedTokens + msg.tokenCount <= maxTokens) {
        kept.push(msg);
        usedTokens += msg.tokenCount;
      } else {
        removed.push(msg);
      }
    }

    // Third pass: add tool results if space allows
    const toolMsgs = prioritized.filter(m => m.priority === "tool_result");
    for (const msg of toolMsgs) {
      if (usedTokens + msg.tokenCount <= maxTokens) {
        kept.push(msg);
        usedTokens += msg.tokenCount;
      } else {
        removed.push(msg);
      }
    }

    // Fourth pass: add older messages if space allows
    const olderMsgs = prioritized.filter(m => m.priority === "older");
    for (const msg of olderMsgs) {
      if (usedTokens + msg.tokenCount <= maxTokens) {
        kept.push(msg);
        usedTokens += msg.tokenCount;
      } else {
        removed.push(msg);
      }
    }

    // Sort kept messages back to original order
    const originalOrder = new Map(messages.map((m, i) => [m.id, i]));
    kept.sort((a, b) => (originalOrder.get(a.id) ?? 0) - (originalOrder.get(b.id) ?? 0));

    // Create summary of removed messages
    let summary: string | undefined;
    if (removed.length > 0) {
      const summaryText = removed
        .slice(0, 10) // Summarize at most 10 removed messages
        .map(m => `${m.role}: ${m.content.slice(0, 200)}`)
        .join("\n");
      summary = `[Earlier conversation summary]: ${summaryText.slice(0, 2000)}`;
    }

    return {
      messages: kept.map(m => ({
        role: m.role,
        content: m.content,
        ...(m.metadata?.reasoning_content ? { reasoning_content: m.metadata.reasoning_content } : {}),
      })),
      totalTokens: usedTokens,
      removedCount: removed.length,
      savedTokens: totalTokens - usedTokens,
      summary,
    };
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

  // ── Adaptive Token Management ──────────────────────────────────────────

  /**
   * Dynamically allocate context budget based on task type and conversation state.
   * Different task types need different ratios of prompt vs completion tokens.
   *
   * Returns a budget allocation that can be used to configure the LLM call.
   */
  getAdaptiveTokenBudget(
    model: string,
    taskType: string,
    conversationLength: number,
    hasToolCalls: boolean
  ): {
    maxPromptTokens: number;
    maxCompletionTokens: number;
    reservedForTools: number;
    compressionThreshold: number;
    strategy: string;
  } {
    const contextWindow = this.getContextWindowSize(model);
    
    // Task-specific allocation profiles
    const profiles: Record<string, {
      promptRatio: number;     // fraction of context for prompt
      completionRatio: number; // fraction of context for completion
      toolReserve: number;     // tokens reserved for tool results
      compressionAt: number;   // trigger compression at this usage %
    }> = {
      // Coding tasks: need lots of context for code, moderate completion
      coding: { promptRatio: 0.75, completionRatio: 0.20, toolReserve: 1024, compressionAt: 0.80 },
      // Research tasks: need lots of context for source material, moderate completion
      research: { promptRatio: 0.70, completionRatio: 0.25, toolReserve: 2048, compressionAt: 0.85 },
      // Creative tasks: less context needed, more completion space
      creative: { promptRatio: 0.50, completionRatio: 0.45, toolReserve: 512, compressionAt: 0.90 },
      // Analysis tasks: balanced context + completion
      analysis: { promptRatio: 0.65, completionRatio: 0.30, toolReserve: 1536, compressionAt: 0.82 },
      // Conversation: mostly completion, minimal context
      conversation: { promptRatio: 0.55, completionRatio: 0.40, toolReserve: 256, compressionAt: 0.88 },
      // Debugging: needs lots of context for code + error messages
      debugging: { promptRatio: 0.80, completionRatio: 0.15, toolReserve: 2048, compressionAt: 0.75 },
    };

    const profile = profiles[taskType] || profiles.conversation;

    // Adjust for conversation length — longer conversations need more compression
    let promptRatio = profile.promptRatio;
    let compressionAt = profile.compressionAt;
    if (conversationLength > 20) {
      promptRatio -= 0.05; // Less prompt space for very long conversations
      compressionAt -= 0.05;
    }
    if (conversationLength > 50) {
      promptRatio -= 0.05;
      compressionAt -= 0.05;
    }

    // Adjust for tool usage — tools need buffer space
    const toolReserve = hasToolCalls ? profile.toolReserve * 2 : profile.toolReserve;

    const maxPromptTokens = Math.floor(contextWindow * promptRatio) - toolReserve;
    const maxCompletionTokens = Math.floor(contextWindow * profile.completionRatio);

    // Determine strategy name
    let strategy = "standard";
    if (conversationLength > 20) strategy = "compressed";
    if (conversationLength > 50) strategy = "aggressive-compression";
    if (hasToolCalls) strategy += "+tools";

    return {
      maxPromptTokens: Math.max(maxPromptTokens, 4096),
      maxCompletionTokens: Math.max(maxCompletionTokens, 2048),
      reservedForTools: toolReserve,
      compressionThreshold: Math.max(compressionAt, 0.60),
      strategy,
    };
  }

  /**
   * Get an optimized context configuration for a specific conversation and model.
   * Combines usage data with adaptive budget to provide actionable recommendations.
   */
  async getOptimizedContextConfig(
    conversationId: string,
    model: string,
    taskType: string
  ): Promise<{
    budget: ReturnType<ContextManagerEngine['getAdaptiveTokenBudget']>;
    usage: ContextUsage;
    recommendations: string[];
    shouldCompressNow: boolean;
  }> {
    const usage = await this.getContextUsage(conversationId);
    const messages = await db.message.findMany({
      where: { conversationId },
      select: { id: true },
    });
    const hasTools = await db.message.count({
      where: { conversationId, role: "tool" },
    }).then(c => c > 0);

    const budget = this.getAdaptiveTokenBudget(model, taskType, messages.length, hasTools);
    
    const recommendations: string[] = [];
    const usagePercent = usage.percentage / 100;

    if (usagePercent > budget.compressionThreshold) {
      recommendations.push(`Context usage at ${usage.percentage.toFixed(1)}% — exceeds compression threshold of ${(budget.compressionThreshold * 100).toFixed(0)}%. Run auto-compress.`);
    }
    if (usage.pinnedCount > 5) {
      recommendations.push(`${usage.pinnedCount} pinned messages may be consuming too much context. Consider unpinning older messages.`);
    }
    if (messages.length > 30 && usage.compressionRatio > 0.8) {
      recommendations.push("Conversation is long with low compression ratio. Aggressive summarization recommended.");
    }
    if (budget.strategy.includes("tools")) {
      recommendations.push(`Tool usage detected. ${budget.reservedForTools} tokens reserved for tool results.`);
    }

    return {
      budget,
      usage,
      recommendations,
      shouldCompressNow: usagePercent > budget.compressionThreshold,
    };
  }
}

export function getContextManager(): ContextManagerEngine {
  return ContextManagerEngine.getInstance();
}

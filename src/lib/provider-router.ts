import { db } from "@/lib/db";

// ── Types ──

export interface RoutingDecision {
  provider: string;
  model: string;
  estimatedLatency: number;
  estimatedCost: number;
  qualityEstimate: number;
  privacyLevel: string;
  reasoning: string;
  alternatives: Array<{
    provider: string;
    model: string;
    reason: string;
  }>;
}

export interface RoutingPreferences {
  prioritizeLatency?: boolean;
  prioritizeCost?: boolean;
  prioritizeQuality?: boolean;
  prioritizePrivacy?: boolean;
  maxLatency?: number;
  maxCost?: number;
  minQuality?: number;
  requireLocal?: boolean;
}

// ── Default provider configurations ──

const DEFAULT_PROVIDERS: Array<{
  provider: string;
  model: string;
  taskType: string;
  avgLatency: number;
  avgTokensPerSec: number;
  successRate: number;
  costPer1kTokens: number;
  contextLength: number;
  qualityScore: number;
  privacyLevel: string;
}> = [
  { provider: "zai", model: "auto", taskType: "chat", avgLatency: 800, avgTokensPerSec: 45, successRate: 0.95, costPer1kTokens: 0, contextLength: 128000, qualityScore: 0.85, privacyLevel: "cloud" },
  { provider: "zai", model: "gemini-2.5-pro", taskType: "code", avgLatency: 1200, avgTokensPerSec: 35, successRate: 0.92, costPer1kTokens: 0, contextLength: 1000000, qualityScore: 0.92, privacyLevel: "cloud" },
  { provider: "zai", model: "gemini-2.5-flash", taskType: "quick", avgLatency: 400, avgTokensPerSec: 80, successRate: 0.97, costPer1kTokens: 0, contextLength: 1000000, qualityScore: 0.80, privacyLevel: "cloud" },
  { provider: "zai", model: "gemini-2.5-flash", taskType: "chat", avgLatency: 500, avgTokensPerSec: 75, successRate: 0.96, costPer1kTokens: 0, contextLength: 1000000, qualityScore: 0.82, privacyLevel: "cloud" },
  { provider: "zai", model: "gemini-3.1-pro", taskType: "reasoning", avgLatency: 2000, avgTokensPerSec: 25, successRate: 0.90, costPer1kTokens: 0, contextLength: 128000, qualityScore: 0.95, privacyLevel: "cloud" },
  { provider: "openai", model: "gpt-4o", taskType: "code", avgLatency: 1500, avgTokensPerSec: 30, successRate: 0.93, costPer1kTokens: 0.005, contextLength: 128000, qualityScore: 0.93, privacyLevel: "cloud" },
  { provider: "anthropic", model: "claude-sonnet-4", taskType: "code", avgLatency: 1300, avgTokensPerSec: 35, successRate: 0.94, costPer1kTokens: 0.003, contextLength: 200000, qualityScore: 0.94, privacyLevel: "cloud" },
  { provider: "local", model: "lmstudio", taskType: "chat", avgLatency: 2000, avgTokensPerSec: 15, successRate: 0.80, costPer1kTokens: 0, contextLength: 32000, qualityScore: 0.65, privacyLevel: "local" },
  { provider: "local", model: "lmstudio", taskType: "code", avgLatency: 2500, avgTokensPerSec: 12, successRate: 0.75, costPer1kTokens: 0, contextLength: 32000, qualityScore: 0.60, privacyLevel: "local" },
  { provider: "deepseek", model: "deepseek-chat", taskType: "code", avgLatency: 900, avgTokensPerSec: 40, successRate: 0.91, costPer1kTokens: 0.00014, contextLength: 64000, qualityScore: 0.88, privacyLevel: "cloud" },
  { provider: "groq", model: "llama-3.3-70b", taskType: "quick", avgLatency: 150, avgTokensPerSec: 250, successRate: 0.95, costPer1kTokens: 0.00059, contextLength: 128000, qualityScore: 0.75, privacyLevel: "cloud" },
];

// ── Singleton ──

const globalRouter = globalThis as unknown as { __hybridProviderRouter?: HybridProviderRouter };

export class HybridProviderRouter {
  private routingHistory: Array<{
    provider: string;
    model: string;
    taskType: string;
    latency: number;
    success: boolean;
    timestamp: number;
  }> = [];

  static getInstance(): HybridProviderRouter {
    if (!globalRouter.__hybridProviderRouter) {
      globalRouter.__hybridProviderRouter = new HybridProviderRouter();
    }
    return globalRouter.__hybridProviderRouter;
  }

  // ── Route a request to the best provider ──

  async route(params: {
    taskType: string;
    prompt: string;
    preferences?: RoutingPreferences;
  }): Promise<RoutingDecision> {
    const { taskType, preferences = {} } = params;

    try {
      // Load provider scores from DB
      let scores = await db.providerScore.findMany({
        where: { taskType },
        orderBy: { qualityScore: "desc" },
      });

      // If no DB entries, use defaults
      if (scores.length === 0) {
        const defaults = DEFAULT_PROVIDERS.filter((p) => p.taskType === taskType);
        if (defaults.length > 0) {
          scores = defaults.map((d) => ({
            id: "default",
            providerName: d.provider,
            modelId: d.model,
            taskType: d.taskType,
            avgLatency: d.avgLatency,
            avgTokensPerSec: d.avgTokensPerSec,
            successRate: d.successRate,
            costPer1kTokens: d.costPer1kTokens,
            contextLength: d.contextLength,
            qualityScore: d.qualityScore,
            privacyLevel: d.privacyLevel,
            lastEvaluated: new Date(),
            sampleSize: 0,
            createdAt: new Date(),
            updatedAt: new Date(),
          }));
        }
      }

      // If still empty, try broader match
      if (scores.length === 0) {
        const allDefaults = DEFAULT_PROVIDERS.filter(
          (p) => p.taskType === "chat" || p.taskType === taskType
        );
        scores = allDefaults.map((d) => ({
          id: "default",
          providerName: d.provider,
          modelId: d.model,
          taskType: d.taskType,
          avgLatency: d.avgLatency,
          avgTokensPerSec: d.avgTokensPerSec,
          successRate: d.successRate,
          costPer1kTokens: d.costPer1kTokens,
          contextLength: d.contextLength,
          qualityScore: d.qualityScore,
          privacyLevel: d.privacyLevel,
          lastEvaluated: new Date(),
          sampleSize: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        }));
      }

      // Apply filters
      let candidates = [...scores];

      if (preferences.requireLocal) {
        candidates = candidates.filter((c) => c.privacyLevel === "local");
      }

      if (preferences.maxLatency) {
        candidates = candidates.filter((c) => c.avgLatency <= preferences.maxLatency!);
      }

      if (preferences.maxCost) {
        candidates = candidates.filter((c) => c.costPer1kTokens <= preferences.maxCost!);
      }

      if (preferences.minQuality) {
        candidates = candidates.filter((c) => c.qualityScore >= preferences.minQuality!);
      }

      // Fallback to all if filters removed everything
      if (candidates.length === 0) {
        candidates = [...scores];
      }

      // Compute composite scores
      const maxLatency = Math.max(...candidates.map((c) => c.avgLatency), 1);
      const maxCost = Math.max(...candidates.map((c) => c.costPer1kTokens), 0.001);

      const scored = candidates.map((c) => {
        let wQuality = 0.4;
        let wSuccess = 0.3;
        let wLatency = 0.2;
        let wCost = 0.1;

        // Adjust weights based on preferences
        if (preferences.prioritizeLatency) { wLatency = 0.4; wQuality = 0.2; wSuccess = 0.2; wCost = 0.2; }
        if (preferences.prioritizeCost) { wCost = 0.4; wQuality = 0.2; wSuccess = 0.2; wLatency = 0.2; }
        if (preferences.prioritizeQuality) { wQuality = 0.5; wSuccess = 0.25; wLatency = 0.15; wCost = 0.1; }
        if (preferences.prioritizePrivacy) {
          const privacyBonus = c.privacyLevel === "local" ? 0.3 : c.privacyLevel === "hybrid" ? 0.15 : 0;
          return {
            ...c,
            compositeScore:
              c.qualityScore * wQuality +
              c.successRate * wSuccess +
              (1 - c.avgLatency / maxLatency) * wLatency +
              (1 - c.costPer1kTokens / maxCost) * wCost +
              privacyBonus,
          };
        }

        return {
          ...c,
          compositeScore:
            c.qualityScore * wQuality +
            c.successRate * wSuccess +
            (1 - c.avgLatency / maxLatency) * wLatency +
            (1 - c.costPer1kTokens / maxCost) * wCost,
        };
      });

      // Sort by composite score
      scored.sort((a, b) => b.compositeScore - a.compositeScore);

      const best = scored[0];
      const alternatives = scored.slice(1, 4).map((s) => ({
        provider: s.providerName,
        model: s.modelId,
        reason: `Score: ${s.compositeScore.toFixed(3)} | Latency: ${s.avgLatency}ms | Quality: ${(s.qualityScore * 100).toFixed(0)}%`,
      }));

      const reasoning = `Selected ${best.providerName}/${best.modelId} with composite score ${best.compositeScore.toFixed(3)}. ` +
        `Quality: ${(best.qualityScore * 100).toFixed(0)}%, Latency: ${best.avgLatency}ms, ` +
        `Success: ${(best.successRate * 100).toFixed(0)}%, Cost: $${best.costPer1kTokens.toFixed(4)}/1k tokens, ` +
        `Privacy: ${best.privacyLevel}`;

      return {
        provider: best.providerName,
        model: best.modelId,
        estimatedLatency: best.avgLatency,
        estimatedCost: best.costPer1kTokens,
        qualityEstimate: best.qualityScore,
        privacyLevel: best.privacyLevel,
        reasoning,
        alternatives,
      };
    } catch (error: unknown) {
      // Fallback to default
      return {
        provider: "zai",
        model: "gemini-2.5-flash",
        estimatedLatency: 500,
        estimatedCost: 0,
        qualityEstimate: 0.82,
        privacyLevel: "cloud",
        reasoning: "Fallback to default due to routing error: " + (error instanceof Error ? error.message : "unknown"),
        alternatives: [],
      };
    }
  }

  // ── Record execution result ──

  async recordExecution(params: {
    provider: string;
    model: string;
    taskType: string;
    latency: number;
    tokensPerSec?: number;
    success: boolean;
    tokensUsed?: number;
    cost?: number;
    qualityScore?: number;
  }): Promise<void> {
    const { provider, model, taskType, latency, tokensPerSec, success, qualityScore } = params;

    this.routingHistory.push({
      provider,
      model,
      taskType,
      latency,
      success,
      timestamp: Date.now(),
    });

    try {
      const existing = await db.providerScore.findUnique({
        where: {
          providerName_modelId_taskType: {
            providerName: provider,
            modelId: model,
            taskType,
          },
        },
      });

      if (existing) {
        const alpha = 0.3; // EMA smoothing factor
        const newLatency = existing.avgLatency * (1 - alpha) + latency * alpha;
        const newSuccessRate = existing.successRate * (1 - alpha) + (success ? 1 : 0) * alpha;
        const newTokensPerSec = tokensPerSec
          ? existing.avgTokensPerSec * (1 - alpha) + tokensPerSec * alpha
          : existing.avgTokensPerSec;
        const newQuality = qualityScore
          ? existing.qualityScore * (1 - alpha) + qualityScore * alpha
          : existing.qualityScore;

        await db.providerScore.update({
          where: { id: existing.id },
          data: {
            avgLatency: newLatency,
            avgTokensPerSec: newTokensPerSec,
            successRate: newSuccessRate,
            qualityScore: newQuality,
            sampleSize: existing.sampleSize + 1,
            lastEvaluated: new Date(),
          },
        });
      } else {
        await db.providerScore.create({
          data: {
            providerName: provider,
            modelId: model,
            taskType,
            avgLatency: latency,
            avgTokensPerSec: tokensPerSec || 0,
            successRate: success ? 1 : 0,
            costPer1kTokens: params.cost || 0,
            contextLength: 0,
            qualityScore: qualityScore || (success ? 0.7 : 0.3),
            privacyLevel: "cloud",
            sampleSize: 1,
          },
        });
      }
    } catch (error: unknown) {
      console.error("[ProviderRouter] Failed to record execution:", error instanceof Error ? error.message : "unknown");
    }
  }

  // ── Get all provider scores ──

  async getScores(taskType?: string): Promise<Array<{
    id: string;
    providerName: string;
    modelId: string;
    taskType: string;
    avgLatency: number;
    avgTokensPerSec: number;
    successRate: number;
    costPer1kTokens: number;
    contextLength: number;
    qualityScore: number;
    privacyLevel: string;
    lastEvaluated: Date;
    sampleSize: number;
  }>> {
    try {
      return await db.providerScore.findMany({
        where: taskType ? { taskType } : undefined,
        orderBy: { qualityScore: "desc" },
      });
    } catch (error: unknown) {
      console.error("[ProviderRouter] Failed to get scores:", error instanceof Error ? error.message : "unknown");
      return [];
    }
  }

  // ── Evaluate a provider ──

  async evaluateProvider(params: {
    provider: string;
    model: string;
    taskType: string;
    testPrompts?: string[];
  }): Promise<{
    avgLatency: number;
    avgTokensPerSec: number;
    successRate: number;
    qualityScore: number;
  }> {
    const { provider, model, taskType, testPrompts } = params;
    const prompts = testPrompts || [
      "Write a function that reverses a string",
      "Explain the concept of closures in JavaScript",
      "Create a REST API endpoint for user authentication",
    ];

    const results: Array<{ latency: number; success: boolean; quality: number }> = [];

    for (const prompt of prompts) {
      const start = Date.now();
      try {
        const res = await fetch("http://localhost:3000/api/gemini/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt: `[Evaluation] ${prompt}`,
            model,
            conversationHistory: [],
          }),
        });

        const elapsed = Date.now() - start;

        if (res.ok) {
          const reader = res.body?.getReader();
          let accumulated = "";
          if (reader) {
            const decoder = new TextDecoder();
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              const text = decoder.decode(value, { stream: true });
              const lines = text.split("\n");
              for (const line of lines) {
                if (line.startsWith("data: ")) {
                  try {
                    const data = JSON.parse(line.slice(6));
                    if (data.type === "chunk") accumulated += data.content || "";
                  } catch { /* skip */ }
                }
              }
            }
          }

          results.push({
            latency: elapsed,
            success: true,
            quality: accumulated.length > 50 ? 0.8 : 0.4,
          });
        } else {
          results.push({ latency: elapsed, success: false, quality: 0 });
        }
      } catch {
        results.push({ latency: Date.now() - start, success: false, quality: 0 });
      }
    }

    const avgLatency = results.reduce((s, r) => s + r.latency, 0) / results.length;
    const successRate = results.filter((r) => r.success).length / results.length;
    const qualityScore = results.reduce((s, r) => s + r.quality, 0) / results.length;

    return { avgLatency, avgTokensPerSec: 0, successRate, qualityScore };
  }

  // ── Get routing stats ──

  async getRoutingStats(): Promise<{
    totalRoutes: number;
    byProvider: Record<string, number>;
    byTaskType: Record<string, number>;
    avgLatency: number;
    avgSuccessRate: number;
  }> {
    const history = this.routingHistory;
    const byProvider: Record<string, number> = {};
    const byTaskType: Record<string, number> = {};

    for (const h of history) {
      byProvider[h.provider] = (byProvider[h.provider] || 0) + 1;
      byTaskType[h.taskType] = (byTaskType[h.taskType] || 0) + 1;
    }

    return {
      totalRoutes: history.length,
      byProvider,
      byTaskType,
      avgLatency: history.length > 0 ? history.reduce((s, h) => s + h.latency, 0) / history.length : 0,
      avgSuccessRate: history.length > 0 ? history.filter((h) => h.success).length / history.length : 0,
    };
  }

  // ── Speculative multi-provider execution (race) ──

  async raceExecution(params: {
    prompt: string;
    taskType: string;
    providers: Array<{ provider: string; model: string }>;
    timeout?: number;
  }): Promise<{
    winner: { provider: string; model: string; result: string; latency: number };
    others: Array<{ provider: string; model: string; latency: number; status: string }>;
  }> {
    const { prompt, providers, timeout = 30000 } = params;
    const results: Array<{
      provider: string;
      model: string;
      result: string;
      latency: number;
      status: string;
    }> = [];

    // Fire all requests in parallel
    const promises = providers.map(async (p) => {
      const start = Date.now();
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeout);

        const res = await fetch("http://localhost:3000/api/gemini/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt, model: p.model, conversationHistory: [] }),
          signal: controller.signal,
        });

        clearTimeout(timer);

        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const reader = res.body?.getReader();
        let accumulated = "";
        if (reader) {
          const decoder = new TextDecoder();
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const text = decoder.decode(value, { stream: true });
            for (const line of text.split("\n")) {
              if (line.startsWith("data: ")) {
                try {
                  const data = JSON.parse(line.slice(6));
                  if (data.type === "chunk") accumulated += data.content || "";
                } catch { /* skip */ }
              }
            }
          }
        }

        return {
          provider: p.provider,
          model: p.model,
          result: accumulated,
          latency: Date.now() - start,
          status: "completed" as string,
        };
      } catch (error: unknown) {
        return {
          provider: p.provider,
          model: p.model,
          result: "",
          latency: Date.now() - start,
          status: error instanceof Error && error.name === "AbortError" ? "timeout" : "error",
        };
      }
    });

    // Wait for all to complete
    const allResults = await Promise.allSettled(promises);
    for (const r of allResults) {
      if (r.status === "fulfilled") results.push(r.value);
    }

    // Find winner (first completed with non-empty result)
    const winner = results.find((r) => r.status === "completed" && r.result.length > 0) || results[0];
    const others = results.filter((r) => r !== winner);

    return {
      winner: winner
        ? { provider: winner.provider, model: winner.model, result: winner.result, latency: winner.latency }
        : { provider: "none", model: "none", result: "", latency: 0 },
      others: others.map((o) => ({
        provider: o.provider,
        model: o.model,
        latency: o.latency,
        status: o.status,
      })),
    };
  }
}

export function getHybridProviderRouter(): HybridProviderRouter {
  return HybridProviderRouter.getInstance();
}

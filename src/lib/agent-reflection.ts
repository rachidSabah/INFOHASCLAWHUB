import { db } from "@/lib/db";
import { countTokens, estimateCost } from "@/lib/tokens";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ReflectionOptions {
  /** Enable or disable the reflection loop. When disabled, returns the initial response directly. */
  enabled?: boolean;
  /** Maximum number of reflection rounds (1 = critique + refine once, 2 = two rounds, etc.) */
  maxRounds?: number;
  /** How strict the critique should be: "lenient" | "moderate" | "strict" */
  strictness?: "lenient" | "moderate" | "strict";
  /** Model to use for LLM calls. Defaults to "gemini-2.5-flash" */
  model?: string;
  /** Optional agent ID to look up system prompt context */
  agentId?: string;
}

interface ReflectionRoundResult {
  round: number;
  initialResponse: string;
  critique: string;
  refinedResponse: string;
  latencyMs: number;
  tokensUsed: number;
  cost: number;
}

interface ReflectAndRefineResult {
  originalPrompt: string;
  finalResponse: string;
  rounds: ReflectionRoundResult[];
  totalLatencyMs: number;
  totalTokensUsed: number;
  totalCost: number;
  improved: boolean; // Whether refinement improved over initial response
  improvementScore: number; // 0-1 how much improvement was detected
  metadata: {
    model: string;
    strictness: string;
    roundsCompleted: number;
    maxRounds: number;
  };
}

interface CritiqueResult {
  critique: string;
  strengths: string[];
  weaknesses: string[];
  suggestions: string[];
  severityScore: number; // 0-1, how severe the issues are
  latencyMs: number;
  tokensUsed: number;
  cost: number;
}

interface RefineResult {
  refinedResponse: string;
  changesSummary: string;
  latencyMs: number;
  tokensUsed: number;
  cost: number;
}

interface ReflectionStats {
  totalReflections: number;
  avgRoundsCompleted: number;
  improvementRate: number; // What fraction of reflections led to improvement
  avgImprovementScore: number;
  avgLatencyMs: number;
  avgTokensUsed: number;
  avgCostPerReflection: number;
  strictnessBreakdown: Record<string, { count: number; improvementRate: number }>;
  recentTrend: "improving" | "stable" | "declining";
}

// ---------------------------------------------------------------------------
// Default Options
// ---------------------------------------------------------------------------

const DEFAULT_OPTIONS: Required<Omit<ReflectionOptions, "agentId">> = {
  enabled: true,
  maxRounds: 1,
  strictness: "moderate",
  model: "gemini-2.5-flash",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Call the internal Gemini chat API and return the full accumulated text
 * along with token and cost tracking.
 */
async function callChatAPI(
  prompt: string,
  model: string = "gemini-2.5-flash",
  systemPrompt?: string,
): Promise<{ text: string; tokensUsed: number; cost: number }> {
  const response = await fetch("http://localhost:3000/api/gemini/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt,
      model,
      conversationHistory: [],
      systemPrompt: systemPrompt || undefined,
    }),
  });

  if (!response.ok) {
    throw new Error(
      `Chat API returned ${response.status}: ${await response.text().catch(() => "unknown error")}`,
    );
  }

  const body = response.body;
  if (!body) throw new Error("Chat API returned empty body");

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let accumulated = "";
  let buffer = "";
  let tokensUsed = 0;
  let cost = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith("data: ")) continue;
      const payload = trimmed.slice(6);

      try {
        const data = JSON.parse(payload);

        if (data.type === "chunk" && typeof data.content === "string") {
          accumulated += data.content;
        } else if (data.type === "done") {
          if (data.tokens) {
            tokensUsed = data.tokens.total || 0;
          }
          if (data.cost !== undefined) {
            cost = data.cost;
          }
        } else if (data.type === "error") {
          throw new Error(data.error || "Chat API stream error");
        }
      } catch (err: unknown) {
        if (
          err instanceof Error &&
          err.message !== "Unexpected end of JSON input"
        ) {
          throw err;
        }
      }
    }
  }

  // Estimate tokens if not provided by stream
  if (tokensUsed === 0) {
    const promptTokens = countTokens(prompt);
    const completionTokens = countTokens(accumulated);
    tokensUsed = promptTokens + completionTokens;
    const costResult = estimateCost(model, promptTokens, completionTokens);
    cost = costResult.cost;
  }

  return { text: accumulated, tokensUsed, cost };
}

/**
 * Safely parse a JSON string, returning `null` on failure.
 */
function safeJsonParse<T>(value: string | null | undefined): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

/**
 * Build a strictness-appropriate critique prompt.
 */
function buildCritiquePrompt(
  originalPrompt: string,
  response: string,
  strictness: "lenient" | "moderate" | "strict",
): string {
  const strictnessInstructions: Record<string, string> = {
    lenient:
      "Focus only on major issues that significantly affect the quality of the response. Be forgiving of minor imperfections. A response should only be criticized if there is a clear, significant problem.",
    moderate:
      "Evaluate the response fairly, noting both strengths and weaknesses. Point out significant issues and areas that could be improved, while acknowledging what was done well.",
    strict:
      "Be extremely thorough and critical. Evaluate every aspect of the response rigorously. Point out even minor issues, imprecisions, or areas that could be marginally improved. Hold the response to the highest standard.",
  };

  return `You are a self-critique engine for an AI assistant. Your job is to critically evaluate the AI's response to a prompt and identify specific, actionable improvements.

ORIGINAL PROMPT:
${originalPrompt.slice(0, 3000)}

AI RESPONSE TO CRITIQUE:
${response.slice(0, 4000)}

STRICTNESS LEVEL: ${strictness}
${strictnessInstructions[strictness]}

Analyze the response and provide:
1. Strengths: What the response did well
2. Weaknesses: Specific issues that need improvement
3. Suggestions: Concrete, actionable changes that would improve the response
4. Severity: How serious the issues are overall

Respond with ONLY a JSON object with this exact structure (no markdown, no explanation):
{
  "critique": "<overall critique summary, 2-4 sentences>",
  "strengths": ["<strength 1>", "<strength 2>"],
  "weaknesses": ["<weakness 1>", "<weakness 2>"],
  "suggestions": ["<suggestion 1>", "<suggestion 2>"],
  "severityScore": <number between 0 and 1, where 0 = no issues, 1 = severe issues>
}`;
}

/**
 * Build a refinement prompt based on the critique.
 */
function buildRefinePrompt(
  originalPrompt: string,
  response: string,
  critique: CritiqueResult,
): string {
  const weaknessesText =
    critique.weaknesses.length > 0
      ? critique.weaknesses.map((w, i) => `${i + 1}. ${w}`).join("\n")
      : "No significant weaknesses identified.";

  const suggestionsText =
    critique.suggestions.length > 0
      ? critique.suggestions.map((s, i) => `${i + 1}. ${s}`).join("\n")
      : "No specific suggestions — the response is already strong.";

  return `You are an AI assistant refining your own previous response based on self-critique. Improve the response by addressing the identified weaknesses and implementing the suggestions.

ORIGINAL PROMPT:
${originalPrompt.slice(0, 3000)}

YOUR PREVIOUS RESPONSE:
${response.slice(0, 4000)}

SELF-CRITIQUE SUMMARY:
${critique.critique}

IDENTIFIED WEAKNESSES:
${weaknessesText}

SUGGESTED IMPROVEMENTS:
${suggestionsText}

Now produce an improved version of your response that:
1. Addresses all identified weaknesses
2. Implements the suggested improvements
3. Maintains the strengths of the original response
4. Remains focused on the original prompt

Provide your improved response directly — do not include any meta-commentary about changes made. Respond as if this is your first and only response to the prompt.`;
}

/**
 * Quick quality estimation to compare two responses without a full scoring pass.
 * Returns a 0-1 estimate of improvement (positive = improvement).
 */
function estimateImprovement(
  originalPrompt: string,
  originalResponse: string,
  refinedResponse: string,
): number {
  // Heuristic-based quick comparison:
  // - Longer response that addresses the prompt more thoroughly is usually better
  // - But excessively long responses without substance are not
  const promptLen = originalPrompt.length;
  const origLen = originalResponse.length;
  const refinedLen = refinedResponse.length;

  // Length-based signal: modest expansion suggests more thoroughness
  const lengthRatio = refinedLen / Math.max(origLen, 1);
  let lengthSignal = 0;
  if (lengthRatio > 1.1 && lengthRatio < 3.0) {
    lengthSignal = Math.min((lengthRatio - 1) * 0.3, 0.3);
  } else if (lengthRatio < 0.5) {
    lengthSignal = -0.2; // Significantly shorter might be worse
  }

  // Structure signal: refined responses often have better structure
  const origHasStructure =
    originalResponse.includes("1.") ||
    originalResponse.includes("- ") ||
    originalResponse.includes("##");
  const refinedHasStructure =
    refinedResponse.includes("1.") ||
    refinedResponse.includes("- ") ||
    refinedResponse.includes("##");
  const structureSignal = refinedHasStructure && !origHasStructure ? 0.1 : 0;

  // Prompt keyword coverage: refined should cover more prompt terms
  const promptWords = originalPrompt
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 4);
  const origCoverage =
    promptWords.filter((w) => originalResponse.toLowerCase().includes(w))
      .length / Math.max(promptWords.length, 1);
  const refinedCoverage =
    promptWords.filter((w) => refinedResponse.toLowerCase().includes(w))
      .length / Math.max(promptWords.length, 1);
  const coverageSignal = (refinedCoverage - origCoverage) * 0.3;

  return Math.max(
    -0.5,
    Math.min(1, lengthSignal + structureSignal + coverageSignal + 0.1),
  ); // +0.1 baseline assumption that reflection helps
}

/**
 * Compute a simple moving-average trend from an array of numeric scores.
 */
function computeTrend(
  scores: number[],
  windowSize = 5,
): "improving" | "stable" | "declining" {
  if (scores.length < windowSize * 2) return "stable";

  const older = scores.slice(0, -windowSize);
  const newer = scores.slice(-windowSize);
  const avgOlder = older.reduce((a, b) => a + b, 0) / older.length;
  const avgNewer = newer.reduce((a, b) => a + b, 0) / newer.length;
  const delta = avgNewer - avgOlder;

  if (delta > 0.05) return "improving";
  if (delta < -0.05) return "declining";
  return "stable";
}

// ---------------------------------------------------------------------------
// AgentReflectionEngine
// ---------------------------------------------------------------------------

class AgentReflectionEngine {
  // -----------------------------------------------------------------------
  // reflectAndRefine — full self-reflection loop
  // -----------------------------------------------------------------------

  async reflectAndRefine(
    prompt: string,
    model: string = "gemini-2.5-flash",
    options?: ReflectionOptions,
  ): Promise<ReflectAndRefineResult> {
    const opts: Required<Omit<ReflectionOptions, "agentId">> & {
      agentId?: string;
    } = {
      ...DEFAULT_OPTIONS,
      ...options,
    };

    // If reflection is disabled, just generate the initial response
    if (!opts.enabled) {
      const startTime = Date.now();
      const agentPrefix = await this.getAgentPrefix(opts.agentId);
      const { text, tokensUsed, cost } = await callChatAPI(
        `${agentPrefix}${prompt}`,
        model,
      );
      const latencyMs = Date.now() - startTime;

      // Record as an experience without reflection
      await this.recordReflectionExperience({
        agentId: opts.agentId,
        prompt,
        initialResponse: text,
        finalResponse: text,
        rounds: [],
        totalLatencyMs: latencyMs,
        totalTokensUsed: tokensUsed,
        totalCost: cost,
        improved: false,
        improvementScore: 0,
        model,
        strictness: opts.strictness,
        reflectionEnabled: false,
      });

      return {
        originalPrompt: prompt,
        finalResponse: text,
        rounds: [],
        totalLatencyMs: latencyMs,
        totalTokensUsed: tokensUsed,
        totalCost: cost,
        improved: false,
        improvementScore: 0,
        metadata: {
          model,
          strictness: opts.strictness,
          roundsCompleted: 0,
          maxRounds: opts.maxRounds,
        },
      };
    }

    // Step 1: Generate initial response
    const overallStartTime = Date.now();
    const agentPrefix = await this.getAgentPrefix(opts.agentId);
    const { text: initialResponse, tokensUsed: initialTokens, cost: initialCost } =
      await callChatAPI(`${agentPrefix}${prompt}`, model);

    let currentResponse = initialResponse;
    let totalTokensUsed = initialTokens;
    let totalCost = initialCost;
    const rounds: ReflectionRoundResult[] = [];

    // Step 2-3: Reflection loop (critique → refine for each round)
    for (let round = 1; round <= opts.maxRounds; round++) {
      const roundStartTime = Date.now();

      // Step 2: Critique the current response
      const critiqueResult = await this.critique(
        prompt,
        currentResponse,
        model,
        opts.strictness,
      );

      totalTokensUsed += critiqueResult.tokensUsed;
      totalCost += critiqueResult.cost;

      // If severity is very low, no need to refine further
      if (critiqueResult.severityScore < 0.1 && opts.strictness !== "strict") {
        break;
      }

      // Step 3: Refine based on critique
      const refineResult = await this.refine(
        prompt,
        currentResponse,
        critiqueResult,
        model,
      );

      totalTokensUsed += refineResult.tokensUsed;
      totalCost += refineResult.cost;

      const roundLatencyMs = Date.now() - roundStartTime;

      rounds.push({
        round,
        initialResponse: currentResponse,
        critique: critiqueResult.critique,
        refinedResponse: refineResult.refinedResponse,
        latencyMs: roundLatencyMs,
        tokensUsed: critiqueResult.tokensUsed + refineResult.tokensUsed,
        cost: critiqueResult.cost + refineResult.cost,
      });

      currentResponse = refineResult.refinedResponse;

      // If refinement didn't change much, stop early
      if (
        currentResponse.trim() === rounds[rounds.length - 1].initialResponse.trim()
      ) {
        break;
      }
    }

    const totalLatencyMs = Date.now() - overallStartTime;

    // Step 4: Assess improvement
    const improvementScore = estimateImprovement(
      prompt,
      initialResponse,
      currentResponse,
    );
    const improved = improvementScore > 0.05;

    // Record the reflection experience
    await this.recordReflectionExperience({
      agentId: opts.agentId,
      prompt,
      initialResponse,
      finalResponse: currentResponse,
      rounds,
      totalLatencyMs,
      totalTokensUsed,
      totalCost,
      improved,
      improvementScore,
      model,
      strictness: opts.strictness,
      reflectionEnabled: true,
    });

    return {
      originalPrompt: prompt,
      finalResponse: currentResponse,
      rounds,
      totalLatencyMs,
      totalTokensUsed,
      totalCost,
      improved,
      improvementScore: Math.round(improvementScore * 1000) / 1000,
      metadata: {
        model,
        strictness: opts.strictness,
        roundsCompleted: rounds.length,
        maxRounds: opts.maxRounds,
      },
    };
  }

  // -----------------------------------------------------------------------
  // critique — generate self-critique of a response
  // -----------------------------------------------------------------------

  async critique(
    originalPrompt: string,
    response: string,
    model: string = "gemini-2.5-flash",
    strictness: "lenient" | "moderate" | "strict" = "moderate",
  ): Promise<CritiqueResult> {
    const defaultResult: CritiqueResult = {
      critique: "Critique generation failed.",
      strengths: [],
      weaknesses: [],
      suggestions: [],
      severityScore: 0.3,
      latencyMs: 0,
      tokensUsed: 0,
      cost: 0,
    };

    try {
      const startTime = Date.now();
      const critiquePrompt = buildCritiquePrompt(
        originalPrompt,
        response,
        strictness,
      );
      const { text, tokensUsed, cost } = await callChatAPI(
        critiquePrompt,
        model,
      );
      const latencyMs = Date.now() - startTime;

      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return { ...defaultResult, latencyMs, tokensUsed, cost };
      }

      const parsed = safeJsonParse<{
        critique?: string;
        strengths?: string[];
        weaknesses?: string[];
        suggestions?: string[];
        severityScore?: number;
      }>(jsonMatch[0]);

      if (!parsed) {
        return { ...defaultResult, latencyMs, tokensUsed, cost };
      }

      return {
        critique:
          typeof parsed.critique === "string"
            ? parsed.critique
            : "No critique provided.",
        strengths: Array.isArray(parsed.strengths)
          ? parsed.strengths.filter((s: unknown) => typeof s === "string")
          : [],
        weaknesses: Array.isArray(parsed.weaknesses)
          ? parsed.weaknesses.filter((w: unknown) => typeof w === "string")
          : [],
        suggestions: Array.isArray(parsed.suggestions)
          ? parsed.suggestions.filter((s: unknown) => typeof s === "string")
          : [],
        severityScore:
          typeof parsed.severityScore === "number"
            ? Math.max(0, Math.min(1, parsed.severityScore))
            : 0.3,
        latencyMs,
        tokensUsed,
        cost,
      };
    } catch (err: unknown) {
      console.error(
        "[AgentReflection] critique error:",
        err instanceof Error ? err.message : err,
      );
      return defaultResult;
    }
  }

  // -----------------------------------------------------------------------
  // refine — refine a response based on critique
  // -----------------------------------------------------------------------

  async refine(
    originalPrompt: string,
    response: string,
    critiqueResult: CritiqueResult,
    model: string = "gemini-2.5-flash",
  ): Promise<RefineResult> {
    const defaultResult: RefineResult = {
      refinedResponse: response,
      changesSummary: "Refinement failed, returning original response.",
      latencyMs: 0,
      tokensUsed: 0,
      cost: 0,
    };

    try {
      const startTime = Date.now();
      const refinePrompt = buildRefinePrompt(
        originalPrompt,
        response,
        critiqueResult,
      );
      const { text, tokensUsed, cost } = await callChatAPI(
        refinePrompt,
        model,
      );
      const latencyMs = Date.now() - startTime;

      const refinedResponse = text.trim() || response;

      // Summarize changes
      const changesSummary =
        critiqueResult.suggestions.length > 0
          ? `Addressed ${critiqueResult.suggestions.length} suggestion(s): ${critiqueResult.suggestions.slice(0, 3).join("; ")}`
          : "Refined response based on self-critique.";

      return {
        refinedResponse,
        changesSummary,
        latencyMs,
        tokensUsed,
        cost,
      };
    } catch (err: unknown) {
      console.error(
        "[AgentReflection] refine error:",
        err instanceof Error ? err.message : err,
      );
      return defaultResult;
    }
  }

  // -----------------------------------------------------------------------
  // getReflectionStats — how often reflection improved results
  // -----------------------------------------------------------------------

  async getReflectionStats(): Promise<ReflectionStats> {
    const defaultStats: ReflectionStats = {
      totalReflections: 0,
      avgRoundsCompleted: 0,
      improvementRate: 0,
      avgImprovementScore: 0,
      avgLatencyMs: 0,
      avgTokensUsed: 0,
      avgCostPerReflection: 0,
      strictnessBreakdown: {},
      recentTrend: "stable",
    };

    try {
      // Query all experiences that have reflection metadata in learnings
      const experiences = await db.agentExperience.findMany({
        where: {
          taskType: "reflection",
        },
        orderBy: { createdAt: "desc" },
        take: 500,
      });

      if (experiences.length === 0) {
        return defaultStats;
      }

      const totalReflections = experiences.length;
      let totalRounds = 0;
      let improvements = 0;
      let totalImprovementScore = 0;
      let totalLatencyMs = 0;
      let totalTokensUsed = 0;
      let totalCost = 0;
      const strictnessMap: Record<
        string,
        { count: number; improvements: number }
      > = {};
      const improvementScores: number[] = [];

      for (const exp of experiences) {
        const meta = safeJsonParse<{
          roundsCompleted?: number;
          improved?: boolean;
          improvementScore?: number;
          totalLatencyMs?: number;
          totalTokensUsed?: number;
          totalCost?: number;
          strictness?: string;
          reflectionEnabled?: boolean;
        }>(exp.learnings);

        if (!meta) continue;

        totalRounds += meta.roundsCompleted || 0;

        if (meta.improved) {
          improvements++;
        }

        const impScore = meta.improvementScore ?? 0;
        totalImprovementScore += impScore;
        improvementScores.push(impScore);

        totalLatencyMs += meta.totalLatencyMs || 0;
        totalTokensUsed += meta.totalTokensUsed || 0;
        totalCost += meta.totalCost || 0;

        const strictness = meta.strictness || "moderate";
        const entry = strictnessMap[strictness] || {
          count: 0,
          improvements: 0,
        };
        entry.count++;
        if (meta.improved) entry.improvements++;
        strictnessMap[strictness] = entry;
      }

      // Build strictness breakdown
      const strictnessBreakdown: Record<
        string,
        { count: number; improvementRate: number }
      > = {};
      for (const [key, val] of Object.entries(strictnessMap)) {
        strictnessBreakdown[key] = {
          count: val.count,
          improvementRate:
            val.count > 0
              ? Math.round((val.improvements / val.count) * 1000) / 1000
              : 0,
        };
      }

      // Compute recent trend
      const recentTrend = computeTrend(improvementScores.reverse());

      return {
        totalReflections,
        avgRoundsCompleted:
          totalReflections > 0
            ? Math.round((totalRounds / totalReflections) * 100) / 100
            : 0,
        improvementRate:
          totalReflections > 0
            ? Math.round((improvements / totalReflections) * 1000) / 1000
            : 0,
        avgImprovementScore:
          totalReflections > 0
            ? Math.round((totalImprovementScore / totalReflections) * 1000) /
              1000
            : 0,
        avgLatencyMs:
          totalReflections > 0
            ? Math.round(totalLatencyMs / totalReflections)
            : 0,
        avgTokensUsed:
          totalReflections > 0
            ? Math.round(totalTokensUsed / totalReflections)
            : 0,
        avgCostPerReflection:
          totalReflections > 0
            ? Math.round((totalCost / totalReflections) * 10000) / 10000
            : 0,
        strictnessBreakdown,
        recentTrend,
      };
    } catch (err: unknown) {
      console.error(
        "[AgentReflection] getReflectionStats error:",
        err instanceof Error ? err.message : err,
      );
      return defaultStats;
    }
  }

  // -----------------------------------------------------------------------
  // Private: record reflection experience
  // -----------------------------------------------------------------------

  private async recordReflectionExperience(params: {
    agentId?: string;
    prompt: string;
    initialResponse: string;
    finalResponse: string;
    rounds: ReflectionRoundResult[];
    totalLatencyMs: number;
    totalTokensUsed: number;
    totalCost: number;
    improved: boolean;
    improvementScore: number;
    model: string;
    strictness: string;
    reflectionEnabled: boolean;
  }): Promise<void> {
    try {
      const learningsData = {
        roundsCompleted: params.rounds.length,
        improved: params.improved,
        improvementScore: params.improvementScore,
        totalLatencyMs: params.totalLatencyMs,
        totalTokensUsed: params.totalTokensUsed,
        totalCost: params.totalCost,
        strictness: params.strictness,
        reflectionEnabled: params.reflectionEnabled,
        rounds: params.rounds.map((r) => ({
          round: r.round,
          critiqueLength: r.critique.length,
          latencyMs: r.latencyMs,
          tokensUsed: r.tokensUsed,
          cost: r.cost,
        })),
      };

      await db.agentExperience.create({
        data: {
          agentId: params.agentId || "reflection-engine",
          taskType: "reflection",
          prompt: params.prompt.slice(0, 2000),
          strategy: `reflect-${params.strictness}-r${params.rounds.length}`,
          outcome: params.improved ? "success" : "partial",
          score: 0.5 + params.improvementScore * 0.5, // Map to 0.5-1.0 range
          duration: params.totalLatencyMs,
          tokensUsed: params.totalTokensUsed,
          resultSnippet: params.finalResponse.slice(0, 500),
          learnings: JSON.stringify(learningsData),
          improvedPrompt: params.improved
            ? params.finalResponse.slice(0, 1000)
            : null,
        },
      });
    } catch (err: unknown) {
      console.error(
        "[AgentReflection] Failed to record reflection experience:",
        err instanceof Error ? err.message : err,
      );
    }
  }

  // -----------------------------------------------------------------------
  // Private: get agent prefix for context
  // -----------------------------------------------------------------------

  private async getAgentPrefix(agentId?: string): Promise<string> {
    if (!agentId) return "";

    try {
      const agent = await db.agent.findUnique({ where: { id: agentId } });
      if (agent) {
        return `[You are ${agent.name} — ${agent.role}]\n\n`;
      }
    } catch (err: unknown) {
      console.error(
        "[AgentReflection] Failed to look up agent:",
        err instanceof Error ? err.message : err,
      );
    }

    return "";
  }
}

// ---------------------------------------------------------------------------
// Singleton via globalThis (prevents multiple instances in dev with hot reload)
// ---------------------------------------------------------------------------

const GLOBAL_KEY = "__agentReflectionEngine__" as const;

interface GlobalWithEngine {
  [GLOBAL_KEY]?: AgentReflectionEngine;
}

const g = globalThis as unknown as GlobalWithEngine;

function getAgentReflectionEngine(): AgentReflectionEngine {
  if (!g[GLOBAL_KEY]) {
    g[GLOBAL_KEY] = new AgentReflectionEngine();
  }
  return g[GLOBAL_KEY];
}

export {
  AgentReflectionEngine,
  getAgentReflectionEngine,
  // Export types for consumer use
  type ReflectionOptions,
  type ReflectionRoundResult,
  type ReflectAndRefineResult,
  type CritiqueResult,
  type RefineResult,
  type ReflectionStats,
};

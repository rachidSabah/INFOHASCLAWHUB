import { db } from "@/lib/db";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RecordExperienceParams {
  agentId: string;
  taskType: string;
  prompt: string;
  strategy: string;
  outcome: "success" | "partial" | "failure";
  score: number;
  duration?: number;
  tokensUsed?: number;
  resultSnippet?: string;
}

interface GetBestTemplateParams {
  taskType: string;
  agentRole?: string;
}

interface OptimizePromptParams {
  taskType: string;
  agentRole?: string;
  currentPrompt: string;
}

interface RecommendStrategyParams {
  taskType: string;
  agentId?: string;
  constraints?: {
    maxLatency?: number;
    maxCost?: number;
    minQuality?: number;
  };
}

interface RecommendStrategyResult {
  strategy: string;
  model: string;
  confidence: number;
  reasoning: string;
}

interface ReflectParams {
  agentId?: string;
  since?: Date;
  minExperiences?: number;
}

interface ReflectPattern {
  pattern: string;
  frequency: number;
  impact: number;
}

interface ReflectSuggestion {
  type: string;
  description: string;
  priority: string;
}

interface ReflectResult {
  patterns: ReflectPattern[];
  suggestions: ReflectSuggestion[];
  overallTrend: "improving" | "stable" | "declining";
}

interface EvolveTemplatesResult {
  created: number;
  updated: number;
  deprecated: number;
}

interface AgentMetricsResult {
  totalExecutions: number;
  successRate: number;
  avgScore: number;
  avgDuration: number;
  bestStrategies: Array<{
    strategy: string;
    successRate: number;
    avgScore: number;
  }>;
  recentTrend: "improving" | "stable" | "declining";
  learnings: string[];
}

interface AutoScoreParams {
  prompt: string;
  result: string;
  taskType: string;
}

interface AutoScoreResult {
  score: number;
  feedback: string;
  suggestions: string[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Call the internal Gemini chat API and return the full accumulated text.
 * The API returns SSE so we need to consume the stream and collect chunks.
 */
async function callChatAPI(prompt: string): Promise<string> {
  const response = await fetch("http://localhost:3000/api/gemini/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt,
      model: "gemini-2.5-flash",
      conversationHistory: [],
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
        } else if (data.type === "error") {
          throw new Error(data.error || "Chat API stream error");
        }
        // type "done" / "tool_call" / "tool_result" – nothing to accumulate
      } catch (err: unknown) {
        // Non-JSON line – skip silently unless it's our own thrown error
        if (err instanceof Error && err.message !== "Unexpected end of JSON input") {
          throw err;
        }
      }
    }
  }

  return accumulated;
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
 * Compute a simple moving-average trend from an array of numeric scores.
 * Returns "improving" if the recent average is meaningfully higher than the
 * older average, "declining" if lower, otherwise "stable".
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
// SelfImprovingEngine
// ---------------------------------------------------------------------------

class SelfImprovingEngine {
  // -----------------------------------------------------------------------
  // recordExperience
  // -----------------------------------------------------------------------

  async recordExperience(params: RecordExperienceParams) {
    try {
      const experience = await db.agentExperience.create({
        data: {
          agentId: params.agentId,
          taskType: params.taskType,
          prompt: params.prompt,
          strategy: params.strategy,
          outcome: params.outcome,
          score: params.score,
          duration: params.duration ?? null,
          tokensUsed: params.tokensUsed ?? null,
          resultSnippet: params.resultSnippet ?? null,
        },
      });

      // Increment the usage count on the matching template (if any)
      try {
        const template = await db.promptTemplate.findFirst({
          where: {
            taskType: params.taskType,
            isActive: true,
          },
          orderBy: { score: "desc" },
        });

        if (template) {
          const newUsageCount = template.usageCount + 1;
          const newSuccessRate =
            (template.successRate * template.usageCount +
              (params.outcome === "success" ? 1 : 0)) /
            newUsageCount;
          const newScore =
            (template.score * template.usageCount + params.score) /
            newUsageCount;

          await db.promptTemplate.update({
            where: { id: template.id },
            data: {
              usageCount: newUsageCount,
              successRate: newSuccessRate,
              score: newScore,
              updatedAt: new Date(),
            },
          });
        }
      } catch (err: unknown) {
        console.error(
          "[SelfImproving] Failed to update template stats:",
          err instanceof Error ? err.message : err,
        );
      }

      return experience;
    } catch (err: unknown) {
      console.error(
        "[SelfImproving] recordExperience error:",
        err instanceof Error ? err.message : err,
      );
      throw err;
    }
  }

  // -----------------------------------------------------------------------
  // getBestTemplate
  // -----------------------------------------------------------------------

  async getBestTemplate(params: GetBestTemplateParams) {
    try {
      const where: Record<string, unknown> = {
        taskType: params.taskType,
        isActive: true,
      };

      if (params.agentRole) {
        where.agentRole = params.agentRole;
      }

      const templates = await db.promptTemplate.findMany({
        where,
        orderBy: [{ score: "desc" }, { usageCount: "desc" }],
        take: 1,
      });

      return templates.length > 0 ? templates[0] : null;
    } catch (err: unknown) {
      console.error(
        "[SelfImproving] getBestTemplate error:",
        err instanceof Error ? err.message : err,
      );
      return null;
    }
  }

  // -----------------------------------------------------------------------
  // optimizePrompt
  // -----------------------------------------------------------------------

  async optimizePrompt(params: OptimizePromptParams): Promise<string> {
    try {
      // 1. Gather successful and failed experiences for this task type
      const [successes, failures] = await Promise.all([
        db.agentExperience.findMany({
          where: {
            taskType: params.taskType,
            outcome: "success",
            score: { gte: 0.7 },
          },
          orderBy: { score: "desc" },
          take: 5,
        }),
        db.agentExperience.findMany({
          where: {
            taskType: params.taskType,
            outcome: "failure",
            score: { lt: 0.4 },
          },
          orderBy: { score: "asc" },
          take: 5,
        }),
      ]);

      // 2. Gather the best existing template
      const bestTemplate = await this.getBestTemplate({
        taskType: params.taskType,
        agentRole: params.agentRole,
      });

      // 3. Build a meta-prompt asking the LLM to improve the current prompt
      const successExamples =
        successes.length > 0
          ? successes
              .map(
                (e, i) =>
                  `Success #${i + 1} (score ${e.score.toFixed(2)}):\nPrompt: ${e.prompt.slice(0, 500)}\n${e.improvedPrompt ? `Improved: ${e.improvedPrompt.slice(0, 500)}` : ""}`,
              )
              .join("\n\n")
          : "No high-scoring examples available.";

      const failureExamples =
        failures.length > 0
          ? failures
              .map(
                (f, i) =>
                  `Failure #${i + 1} (score ${f.score.toFixed(2)}):\nPrompt: ${f.prompt.slice(0, 500)}`,
              )
              .join("\n\n")
          : "No low-scoring examples available.";

      const templateSection = bestTemplate
        ? `Current best template (score ${bestTemplate.score.toFixed(2)}, v${bestTemplate.version}):\n${bestTemplate.template.slice(0, 1000)}`
        : "No existing template for this task type.";

      const metaPrompt = `You are a prompt optimization expert. Improve the given prompt based on historical execution data.

TASK TYPE: ${params.taskType}
${params.agentRole ? `AGENT ROLE: ${params.agentRole}` : ""}

CURRENT PROMPT TO OPTIMIZE:
${params.currentPrompt}

${templateSection}

SUCCESSFUL PAST EXECUTIONS (learn from these):
${successExamples}

FAILED PAST EXECUTIONS (avoid these patterns):
${failureExamples}

Based on the above, produce an improved version of the CURRENT PROMPT. The improved prompt should:
1. Incorporate patterns from successful executions
2. Avoid patterns that led to failures
3. Be specific and actionable
4. Include any relevant context or constraints

Respond with ONLY the improved prompt text, no explanations or formatting.`;

      const improved = await callChatAPI(metaPrompt);
      return improved.trim() || params.currentPrompt;
    } catch (err: unknown) {
      console.error(
        "[SelfImproving] optimizePrompt error:",
        err instanceof Error ? err.message : err,
      );
      // Graceful fallback – return the original prompt unchanged
      return params.currentPrompt;
    }
  }

  // -----------------------------------------------------------------------
  // recommendStrategy
  // -----------------------------------------------------------------------

  async recommendStrategy(
    params: RecommendStrategyParams,
  ): Promise<RecommendStrategyResult> {
    try {
      const where: Record<string, unknown> = { taskType: params.taskType };

      const experiences = await db.agentExperience.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: 100,
      });

      // If there are no historical experiences, return a reasonable default
      if (experiences.length === 0) {
        return {
          strategy: "standard",
          model: "gemini-2.5-flash",
          confidence: 0.3,
          reasoning:
            "No historical data available for this task type. Recommending default strategy.",
        };
      }

      // Group experiences by strategy
      const strategyMap = new Map<
        string,
        {
          scores: number[];
          durations: number[];
          tokens: number[];
          successes: number;
          total: number;
        }
      >();

      for (const exp of experiences) {
        const key = exp.strategy;
        const entry = strategyMap.get(key) || {
          scores: [],
          durations: [],
          tokens: [],
          successes: 0,
          total: 0,
        };
        entry.scores.push(exp.score);
        if (exp.duration != null) entry.durations.push(exp.duration);
        if (exp.tokensUsed != null) entry.tokens.push(exp.tokensUsed);
        if (exp.outcome === "success") entry.successes++;
        entry.total++;
        strategyMap.set(key, entry);
      }

      // Score each strategy based on quality, success rate, and constraints
      let bestStrategy = "";
      let bestScore = -Infinity;
      let bestEntry = strategyMap.values().next().value as {
        scores: number[];
        durations: number[];
        tokens: number[];
        successes: number;
        total: number;
      };

      strategyMap.forEach((entry, strategy) => {
        const avgScore =
          entry.scores.reduce((a, b) => a + b, 0) / entry.scores.length;
        const successRate = entry.successes / entry.total;
        const avgDuration =
          entry.durations.length > 0
            ? entry.durations.reduce((a, b) => a + b, 0) /
              entry.durations.length
            : 0;
        const avgTokens =
          entry.tokens.length > 0
            ? entry.tokens.reduce((a, b) => a + b, 0) / entry.tokens.length
            : 0;

        // Weighted scoring
        let compositeScore = avgScore * 0.5 + successRate * 0.3;

        // Apply constraint penalties
        if (params.constraints?.maxLatency && avgDuration > 0) {
          if (avgDuration > params.constraints.maxLatency) {
            compositeScore -= 0.2;
          }
        }
        if (params.constraints?.maxCost && avgTokens > 0) {
          // Rough cost estimate: tokens * $0.00001
          const estimatedCost = avgTokens * 0.00001;
          if (estimatedCost > params.constraints.maxCost) {
            compositeScore -= 0.2;
          }
        }
        if (params.constraints?.minQuality) {
          if (avgScore < params.constraints.minQuality) {
            compositeScore -= 0.3;
          }
        }

        // Bonus for larger sample sizes (more reliable)
        compositeScore += Math.min(entry.total / 50, 0.2);

        if (compositeScore > bestScore) {
          bestScore = compositeScore;
          bestStrategy = strategy;
          bestEntry = entry;
        }
      });

      // Determine the best model from the strategy name (many strategies encode the model)
      // Common patterns: "gemini-2.5-flash", "gpt-4", "claude-3-opus", etc.
      const modelMatch = bestStrategy.match(
        /(?:gemini|gpt|claude|llama|mistral|deepseek)[-_]?[\d.]*-?[\w]*/i,
      );
      const model = modelMatch ? modelMatch[0] : "gemini-2.5-flash";

      const avgScore =
        bestEntry.scores.reduce((a, b) => a + b, 0) /
        bestEntry.scores.length;
      const successRate = bestEntry.successes / bestEntry.total;
      const confidence = Math.min(
        0.95,
        avgScore * 0.4 +
          successRate * 0.3 +
          Math.min(bestEntry.total / 30, 1) * 0.3,
      );

      const avgDuration =
        bestEntry.durations.length > 0
          ? Math.round(
              bestEntry.durations.reduce((a, b) => a + b, 0) /
                bestEntry.durations.length,
            )
          : null;

      const constraintNotes: string[] = [];
      if (params.constraints?.maxLatency && avgDuration) {
        constraintNotes.push(
          avgDuration <= params.constraints.maxLatency
            ? `Meets latency constraint (${avgDuration}ms <= ${params.constraints.maxLatency}ms)`
            : `Exceeds latency constraint (${avgDuration}ms > ${params.constraints.maxLatency}ms)`,
        );
      }
      if (params.constraints?.minQuality) {
        constraintNotes.push(
          avgScore >= params.constraints.minQuality
            ? `Meets quality threshold (${avgScore.toFixed(2)} >= ${params.constraints.minQuality})`
            : `Below quality threshold (${avgScore.toFixed(2)} < ${params.constraints.minQuality})`,
        );
      }

      const reasoning = [
        `Strategy "${bestStrategy}" has avg score ${avgScore.toFixed(2)} and ${(successRate * 100).toFixed(0)}% success rate over ${bestEntry.total} executions.`,
        constraintNotes.length > 0
          ? constraintNotes.join("; ")
          : "No specific constraints applied.",
      ].join(" ");

      return {
        strategy: bestStrategy,
        model,
        confidence: Math.round(confidence * 100) / 100,
        reasoning,
      };
    } catch (err: unknown) {
      console.error(
        "[SelfImproving] recommendStrategy error:",
        err instanceof Error ? err.message : err,
      );
      return {
        strategy: "standard",
        model: "gemini-2.5-flash",
        confidence: 0.1,
        reasoning: `Error analyzing historical data: ${err instanceof Error ? err.message : "unknown"}`,
      };
    }
  }

  // -----------------------------------------------------------------------
  // reflect
  // -----------------------------------------------------------------------

  async reflect(params: ReflectParams): Promise<ReflectResult> {
    const defaultResult: ReflectResult = {
      patterns: [],
      suggestions: [],
      overallTrend: "stable",
    };

    try {
      const since = params.since ?? new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const minExperiences = params.minExperiences ?? 5;

      const where: Record<string, unknown> = {
        createdAt: { gte: since },
      };
      if (params.agentId) {
        where.agentId = params.agentId;
      }

      const experiences = await db.agentExperience.findMany({
        where,
        orderBy: { createdAt: "asc" },
        take: 200,
      });

      if (experiences.length < minExperiences) {
        return defaultResult;
      }

      // Compute overall trend from chronological scores
      const chronologicalScores = experiences.map((e) => e.score);
      const overallTrend = computeTrend(chronologicalScores);

      // Analyse patterns locally before consulting the LLM
      const localPatterns: ReflectPattern[] = [];

      // Pattern: Repeated failures for specific task types
      const failuresByType = new Map<string, number>();
      for (const exp of experiences) {
        if (exp.outcome === "failure") {
          failuresByType.set(
            exp.taskType,
            (failuresByType.get(exp.taskType) || 0) + 1,
          );
        }
      }
      failuresByType.forEach((count, taskType) => {
        if (count >= 2) {
          const relevantScores = experiences
            .filter((e) => e.taskType === taskType && e.outcome === "failure")
            .map((e) => e.score);
          const avgImpact =
            relevantScores.reduce((a, b) => a + b, 0) / relevantScores.length;
          localPatterns.push({
            pattern: `Repeated failures on task type "${taskType}" (${count} failures)`,
            frequency: count,
            impact: Math.round((1 - avgImpact) * 100) / 100,
          });
        }
      });

      // Pattern: High-performing strategies
      const strategyScores = new Map<
        string,
        { total: number; successes: number; scores: number[] }
      >();
      for (const exp of experiences) {
        const entry = strategyScores.get(exp.strategy) || {
          total: 0,
          successes: 0,
          scores: [],
        };
        entry.total++;
        entry.scores.push(exp.score);
        if (exp.outcome === "success") entry.successes++;
        strategyScores.set(exp.strategy, entry);
      }
      strategyScores.forEach((data, strategy) => {
        const avgScore =
          data.scores.reduce((a, b) => a + b, 0) / data.scores.length;
        if (avgScore >= 0.8 && data.total >= 3) {
          localPatterns.push({
            pattern: `Consistently high performance with strategy "${strategy}" (avg score ${avgScore.toFixed(2)})`,
            frequency: data.total,
            impact: Math.round(avgScore * 100) / 100,
          });
        }
      });

      // Pattern: Duration outliers
      const durations = experiences
        .filter((e) => e.duration != null)
        .map((e) => e.duration!);
      if (durations.length >= 5) {
        const avgDuration =
          durations.reduce((a, b) => a + b, 0) / durations.length;
        const slowExperiences = experiences.filter(
          (e) => e.duration != null && e.duration > avgDuration * 2,
        );
        if (slowExperiences.length >= 2) {
          localPatterns.push({
            pattern: `${slowExperiences.length} executions took >2x the average duration (${Math.round(avgDuration)}ms)`,
            frequency: slowExperiences.length,
            impact: 0.5,
          });
        }
      }

      // Use the LLM for deeper pattern analysis and suggestions
      let suggestions: ReflectSuggestion[] = [];

      try {
        const summaryForLLM = experiences
          .slice(-30)
          .map(
            (e) =>
              `- [${e.taskType}] strategy="${e.strategy}" outcome=${e.outcome} score=${e.score.toFixed(2)}${e.learnings ? ` learnings="${e.learnings.slice(0, 200)}"` : ""}`,
          )
          .join("\n");

        const reflectPrompt = `Analyze these recent agent execution experiences and identify patterns and provide actionable suggestions.

EXPERIENCES (most recent 30):
${summaryForLLM}

OVERALL TREND: ${overallTrend}

LOCAL PATTERNS ALREADY DETECTED:
${localPatterns.map((p) => `- ${p.pattern}`).join("\n") || "None detected locally."}

Respond with ONLY a JSON object with this exact structure (no markdown, no explanation):
{
  "suggestions": [
    {"type": "prompt_improvement" | "strategy_change" | "model_switch" | "process_fix", "description": "string", "priority": "high" | "medium" | "low"}
  ]
}`;

        const llmResponse = await callChatAPI(reflectPrompt);
        const jsonMatch = llmResponse.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = safeJsonParse<{
            suggestions?: ReflectSuggestion[];
          }>(jsonMatch[0]);
          if (parsed?.suggestions && Array.isArray(parsed.suggestions)) {
            suggestions = parsed.suggestions.filter(
              (s) =>
                s.type &&
                s.description &&
                ["high", "medium", "low"].includes(s.priority),
            );
          }
        }
      } catch (err: unknown) {
        console.error(
          "[SelfImproving] reflect LLM call failed:",
          err instanceof Error ? err.message : err,
        );
      }

      // Add default suggestions if none returned
      if (suggestions.length === 0 && localPatterns.length > 0) {
        const hasFailurePattern = localPatterns.some((p) =>
          p.pattern.includes("failures"),
        );
        if (hasFailurePattern) {
          suggestions.push({
            type: "prompt_improvement",
            description:
              "Review and refine prompts for task types with repeated failures",
            priority: "high",
          });
        }
        const hasSlowPattern = localPatterns.some((p) =>
          p.pattern.includes("duration"),
        );
        if (hasSlowPattern) {
          suggestions.push({
            type: "strategy_change",
            description:
              "Investigate slower-than-expected executions and consider alternative strategies",
            priority: "medium",
          });
        }
      }

      return {
        patterns: localPatterns.sort((a, b) => b.impact - a.impact),
        suggestions: suggestions.sort((a, b) => {
          const order = { high: 0, medium: 1, low: 2 };
          return order[a.priority as keyof typeof order] - order[b.priority as keyof typeof order];
        }),
        overallTrend,
      };
    } catch (err: unknown) {
      console.error(
        "[SelfImproving] reflect error:",
        err instanceof Error ? err.message : err,
      );
      return defaultResult;
    }
  }

  // -----------------------------------------------------------------------
  // evolveTemplates
  // -----------------------------------------------------------------------

  async evolveTemplates(): Promise<EvolveTemplatesResult> {
    const result: EvolveTemplatesResult = { created: 0, updated: 0, deprecated: 0 };

    try {
      // 1. Get all active task types from experiences
      const taskTypes = await db.agentExperience.findMany({
        where: {},
        select: { taskType: true },
        distinct: ["taskType"],
      });

      for (const { taskType } of taskTypes) {
        // Get successful experiences for this task type
        const successes = await db.agentExperience.findMany({
          where: {
            taskType,
            outcome: "success",
            score: { gte: 0.7 },
          },
          orderBy: { score: "desc" },
          take: 20,
        });

        // Get failing experiences for this task type
        const failures = await db.agentExperience.findMany({
          where: {
            taskType,
            outcome: "failure",
            score: { lt: 0.4 },
          },
          orderBy: { score: "asc" },
          take: 10,
        });

        // Get existing templates for this task type
        const existingTemplates = await db.promptTemplate.findMany({
          where: { taskType, isActive: true },
          orderBy: { score: "desc" },
        });

        // 2. Deprecate consistently failing templates
        for (const template of existingTemplates) {
          if (template.usageCount >= 5 && template.successRate < 0.3) {
            await db.promptTemplate.update({
              where: { id: template.id },
              data: {
                isActive: false,
                updatedAt: new Date(),
              },
            });
            result.deprecated++;
          }
        }

        // 3. Create new templates from consistently successful prompts
        if (successes.length >= 3) {
          // Group successful prompts by similarity (simple: by strategy)
          const strategyGroups = new Map<
            string,
            typeof successes
          >();
          for (const exp of successes) {
            const group = strategyGroups.get(exp.strategy) || [];
            group.push(exp);
            strategyGroups.set(exp.strategy, group);
          }

          const strategyGroupEntries = Array.from(strategyGroups.entries());
          for (let gi = 0; gi < strategyGroupEntries.length; gi++) {
            const [strategy, group] = strategyGroupEntries[gi];
            // Only create a template if we have enough consistent successes
            if (group.length < 3) continue;

            const avgScore =
              group.reduce((acc, e) => acc + e.score, 0) / group.length;
            const successRate = group.length / successes.length;

            // Check if there's already an active template for this strategy
            const existingForStrategy = existingTemplates.find(
              (t) =>
                t.template.slice(0, 100) ===
                group[0].prompt.slice(0, 100),
            );

            if (existingForStrategy) {
              // Update the existing template's score
              const newVersion = existingForStrategy.version + 1;
              await db.promptTemplate.update({
                where: { id: existingForStrategy.id },
                data: {
                  version: newVersion,
                  score: avgScore,
                  successRate,
                  updatedAt: new Date(),
                },
              });
              result.updated++;
            } else {
              // Create a new template from the best prompt in this group
              const bestExp = group.sort((a, b) => b.score - a.score)[0];
              const templateText = bestExp.improvedPrompt || bestExp.prompt;

              // Use the LLM to refine the template
              let refinedTemplate = templateText;
              try {
                const refinementPrompt = `You are a prompt template designer. Convert the following successful prompt into a reusable template. Replace specific values with placeholders like {{variable_name}}. Keep the structure and style that made it successful.

ORIGINAL PROMPT:
${templateText}

TASK TYPE: ${taskType}
AVERAGE SCORE: ${avgScore.toFixed(2)}

Respond with ONLY the template text, no explanations.`;

                refinedTemplate = await callChatAPI(refinementPrompt);
                refinedTemplate = refinedTemplate.trim() || templateText;
              } catch (err: unknown) {
                console.error(
                  "[SelfImproving] Template refinement failed:",
                  err instanceof Error ? err.message : err,
                );
              }

              await db.promptTemplate.create({
                data: {
                  taskType,
                  template: refinedTemplate,
                  version: 1,
                  score: avgScore,
                  usageCount: 0,
                  successRate,
                  isActive: true,
                },
              });
              result.created++;
            }
          }
        }

        // 4. Update scores for templates based on recent performance
        for (const template of existingTemplates.filter((t) => t.isActive)) {
          const recentExperiences = await db.agentExperience.findMany({
            where: {
              taskType,
              outcome: "success",
              score: { gte: 0.5 },
              createdAt: {
                gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
              },
            },
            orderBy: { createdAt: "desc" },
            take: 20,
          });

          if (recentExperiences.length > 0) {
            const recentAvg =
              recentExperiences.reduce((a, e) => a + e.score, 0) /
              recentExperiences.length;

            // Blend: 70% recent performance + 30% historical score
            const blendedScore =
              recentAvg * 0.3 + template.score * 0.7;

            if (Math.abs(blendedScore - template.score) > 0.01) {
              await db.promptTemplate.update({
                where: { id: template.id },
                data: {
                  score: Math.round(blendedScore * 100) / 100,
                  updatedAt: new Date(),
                },
              });
              result.updated++;
            }
          }
        }

        // 5. Store learnings from failures on successful experiences
        for (const exp of successes) {
          if (!exp.learnings && exp.resultSnippet) {
            try {
              const learningPrompt = `Extract concise, actionable learnings from this successful execution that could help future attempts.

TASK TYPE: ${exp.taskType}
STRATEGY: ${exp.strategy}
SCORE: ${exp.score.toFixed(2)}
PROMPT (first 300 chars): ${exp.prompt.slice(0, 300)}
RESULT (first 500 chars): ${exp.resultSnippet?.slice(0, 500) || "N/A"}

Respond with ONLY a JSON array of strings, each being a concise learning. Example: ["Use specific examples in the prompt", "Breaking down complex tasks improves accuracy"]. No explanations.`;

              const llmResponse = await callChatAPI(learningPrompt);
              const jsonMatch = llmResponse.match(/\[[\s\S]*\]/);
              if (jsonMatch) {
                const learnings = safeJsonParse<string[]>(jsonMatch[0]);
                if (learnings && Array.isArray(learnings) && learnings.length > 0) {
                  await db.agentExperience.update({
                    where: { id: exp.id },
                    data: {
                      learnings: JSON.stringify(learnings),
                    },
                  });
                }
              }
            } catch (err: unknown) {
              console.error(
                "[SelfImproving] Learning extraction failed for experience:",
                err instanceof Error ? err.message : err,
              );
            }
          }
        }
      }

      return result;
    } catch (err: unknown) {
      console.error(
        "[SelfImproving] evolveTemplates error:",
        err instanceof Error ? err.message : err,
      );
      return result;
    }
  }

  // -----------------------------------------------------------------------
  // getAgentMetrics
  // -----------------------------------------------------------------------

  async getAgentMetrics(agentId: string): Promise<AgentMetricsResult> {
    const defaultResult: AgentMetricsResult = {
      totalExecutions: 0,
      successRate: 0,
      avgScore: 0,
      avgDuration: 0,
      bestStrategies: [],
      recentTrend: "stable",
      learnings: [],
    };

    try {
      const experiences = await db.agentExperience.findMany({
        where: { agentId },
        orderBy: { createdAt: "desc" },
        take: 500,
      });

      if (experiences.length === 0) {
        return defaultResult;
      }

      // Total executions
      const totalExecutions = experiences.length;

      // Success rate
      const successCount = experiences.filter(
        (e) => e.outcome === "success",
      ).length;
      const successRate = successCount / totalExecutions;

      // Average score
      const avgScore =
        experiences.reduce((acc, e) => acc + e.score, 0) / totalExecutions;

      // Average duration
      const withDuration = experiences.filter((e) => e.duration != null);
      const avgDuration =
        withDuration.length > 0
          ? withDuration.reduce((acc, e) => acc + (e.duration ?? 0), 0) /
            withDuration.length
          : 0;

      // Best strategies
      const strategyMap = new Map<
        string,
        { scores: number[]; successes: number; total: number }
      >();
      for (const exp of experiences) {
        const entry = strategyMap.get(exp.strategy) || {
          scores: [],
          successes: 0,
          total: 0,
        };
        entry.scores.push(exp.score);
        if (exp.outcome === "success") entry.successes++;
        entry.total++;
        strategyMap.set(exp.strategy, entry);
      }

      const bestStrategies = Array.from(strategyMap.entries())
        .map(([strategy, data]) => ({
          strategy,
          successRate: data.successes / data.total,
          avgScore:
            data.scores.reduce((a, b) => a + b, 0) / data.scores.length,
        }))
        .sort((a, b) => b.avgScore - a.avgScore)
        .slice(0, 5);

      // Recent trend (use chronological order)
      const chronologicalScores = [...experiences]
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
        .map((e) => e.score);
      const recentTrend = computeTrend(chronologicalScores);

      // Collected learnings
      const learnings: string[] = [];
      for (const exp of experiences) {
        if (exp.learnings) {
          const parsed = safeJsonParse<string[]>(exp.learnings);
          if (parsed && Array.isArray(parsed)) {
            learnings.push(...parsed);
          }
        }
      }
      // Deduplicate
      const seen = new Set<string>();
      const uniqueLearnings = learnings.filter((l) => {
        if (seen.has(l)) return false;
        seen.add(l);
        return true;
      }).slice(0, 20);

      return {
        totalExecutions,
        successRate: Math.round(successRate * 100) / 100,
        avgScore: Math.round(avgScore * 100) / 100,
        avgDuration: Math.round(avgDuration),
        bestStrategies: bestStrategies.map((s) => ({
          ...s,
          successRate: Math.round(s.successRate * 100) / 100,
          avgScore: Math.round(s.avgScore * 100) / 100,
        })),
        recentTrend,
        learnings: uniqueLearnings,
      };
    } catch (err: unknown) {
      console.error(
        "[SelfImproving] getAgentMetrics error:",
        err instanceof Error ? err.message : err,
      );
      return defaultResult;
    }
  }

  // -----------------------------------------------------------------------
  // autoScore
  // -----------------------------------------------------------------------

  async autoScore(params: AutoScoreParams): Promise<AutoScoreResult> {
    const defaultResult: AutoScoreResult = {
      score: 0.5,
      feedback: "Auto-scoring failed, using default score.",
      suggestions: [],
    };

    try {
      const scoringPrompt = `You are an expert evaluator for AI-generated results. Score the following result based on the prompt and task type.

TASK TYPE: ${params.taskType}

ORIGINAL PROMPT:
${params.prompt.slice(0, 2000)}

RESULT TO EVALUATE:
${params.result.slice(0, 3000)}

Evaluate the result on a scale of 0 to 1 where:
- 0.0-0.2: Completely irrelevant or wrong
- 0.2-0.4: Partially relevant but significant issues
- 0.4-0.6: Adequate but could be much better
- 0.6-0.8: Good quality with minor issues
- 0.8-1.0: Excellent, fully addresses the prompt

Respond with ONLY a JSON object with this exact structure (no markdown, no explanation):
{
  "score": <number between 0 and 1>,
  "feedback": "<brief explanation of the score>",
  "suggestions": ["<suggestion 1>", "<suggestion 2>"]
}`;

      const llmResponse = await callChatAPI(scoringPrompt);
      const jsonMatch = llmResponse.match(/\{[\s\S]*\}/);

      if (jsonMatch) {
        const parsed = safeJsonParse<{
          score?: number;
          feedback?: string;
          suggestions?: string[];
        }>(jsonMatch[0]);

        if (parsed) {
          return {
            score:
              typeof parsed.score === "number"
                ? Math.max(0, Math.min(1, Math.round(parsed.score * 100) / 100))
                : 0.5,
            feedback:
              typeof parsed.feedback === "string"
                ? parsed.feedback
                : "No feedback provided.",
            suggestions: Array.isArray(parsed.suggestions)
              ? parsed.suggestions.filter(
                  (s: unknown) => typeof s === "string",
                ) as string[]
              : [],
          };
        }
      }

      return defaultResult;
    } catch (err: unknown) {
      console.error(
        "[SelfImproving] autoScore error:",
        err instanceof Error ? err.message : err,
      );
      return defaultResult;
    }
  }
}

// ---------------------------------------------------------------------------
// Singleton via globalThis (prevents multiple instances in dev with hot reload)
// ---------------------------------------------------------------------------

const GLOBAL_KEY = "__selfImprovingEngine__" as const;

interface GlobalWithEngine {
  [GLOBAL_KEY]?: SelfImprovingEngine;
}

const g = globalThis as unknown as GlobalWithEngine;

function getSelfImprovingEngine(): SelfImprovingEngine {
  if (!g[GLOBAL_KEY]) {
    g[GLOBAL_KEY] = new SelfImprovingEngine();
  }
  return g[GLOBAL_KEY];
}

export { SelfImprovingEngine, getSelfImprovingEngine };

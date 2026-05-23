/**
 * Self-Improving Prompt Optimization
 *
 * Tracks which prompt patterns lead to better responses,
 * A/B tests system prompt variations, auto-optimizes
 * the system prompt based on response quality scores,
 * and stores optimization results in the database.
 */

import { db } from "@/lib/db";

// ── Types ──────────────────────────────────────────────────────────────────

export interface PromptVariation {
  id: string;
  name: string;
  systemPromptAddition: string;
  category: "cot" | "planning" | "reflection" | "tool_guidance" | "quality" | "custom";
  createdAt: Date;
}

export interface OptimizationResult {
  variationId: string;
  averageQualityScore: number;
  sampleCount: number;
  improvementOverBaseline: number;
  bestForTaskTypes: string[];
}

export interface PromptPatternStats {
  pattern: string;
  successCount: number;
  failureCount: number;
  averageScore: number;
  sampleCount: number;
}

// ── Prompt Variations Library ─────────────────────────────────────────────

const PROMPT_VARIATIONS: PromptVariation[] = [
  {
    id: "baseline",
    name: "Baseline (No Addition)",
    systemPromptAddition: "",
    category: "custom",
    createdAt: new Date(),
  },
  {
    id: "cot-step-by-step",
    name: "Step-by-Step CoT",
    systemPromptAddition: `\n[REASONING APPROACH]
Before responding, think through the problem step by step:
1. What is the user actually asking?
2. What information do I need?
3. What's the best approach to solve this?
4. What tools should I use?
5. How can I verify my answer is correct?
Show your reasoning process explicitly.`,
    category: "cot",
    createdAt: new Date(),
  },
  {
    id: "cot-structured",
    name: "Structured Analysis",
    systemPromptAddition: `\n[REASONING APPROACH]
Use this structured analysis framework:
- ANALYZE: Break down the request into components
- PLAN: Determine the best sequence of actions
- EXECUTE: Carry out the plan using appropriate tools
- VERIFY: Check the results against the original request
- REFINE: Improve the answer if needed`,
    category: "cot",
    createdAt: new Date(),
  },
  {
    id: "planning-ahead",
    name: "Planning Ahead",
    systemPromptAddition: `\n[TASK PLANNING]
Before starting any multi-step task:
1. Create a brief plan with numbered steps
2. Identify dependencies between steps
3. Determine which steps can be parallelized
4. Set success criteria for each step
5. After completing all steps, verify the overall result meets the user's needs`,
    category: "planning",
    createdAt: new Date(),
  },
  {
    id: "reflection-after-tools",
    name: "Post-Tool Reflection",
    systemPromptAddition: `\n[AFTER EACH TOOL USE]
Reflect on the tool result before proceeding:
- Did the tool return what I expected?
- Is the result complete and accurate?
- Do I need to try a different approach?
- What's the next most efficient step?
Never just summarize tool results — always analyze and act on them.`,
    category: "reflection",
    createdAt: new Date(),
  },
  {
    id: "tool-strategy",
    name: "Smart Tool Strategy",
    systemPromptAddition: `\n[TOOL STRATEGY]
Choose tools strategically:
- Use tree_view/list_files BEFORE read_file to find the right files
- Use grep_code BEFORE read_file for large codebases
- Use web_search BEFORE web_fetch when you don't know the exact URL
- Batch independent tool calls in a single response
- After a tool error, try an ALTERNATIVE tool before giving up
- Summarize large tool results to save context tokens`,
    category: "tool_guidance",
    createdAt: new Date(),
  },
  {
    id: "quality-gate",
    name: "Quality Gate",
    systemPromptAddition: `\n[QUALITY STANDARDS]
Before delivering your final response, verify:
- Does it fully address the original request?
- Is it detailed enough for an expert audience?
- Are code examples complete and runnable?
- Are there any claims that need verification?
- Would you accept this as a thorough answer?
If any check fails, improve the response before sending.`,
    category: "quality",
    createdAt: new Date(),
  },
];

// ── In-Memory Stats Tracking ──────────────────────────────────────────────

const patternStats = new Map<string, { successCount: number; failureCount: number; totalScore: number; sampleCount: number }>();

// ── Core Functions ────────────────────────────────────────────────────────

/**
 * Get the best prompt variation for a given task type and complexity.
 * Uses historical performance data if available.
 */
export function getBestPromptVariation(
  taskType: string,
  complexity: "simple" | "moderate" | "complex" | "critical"
): PromptVariation {
  // For simple tasks, use baseline
  if (complexity === "simple") {
    return PROMPT_VARIATIONS[0]; // baseline
  }

  // For complex/critical tasks, prefer structured approaches
  const preferredCategories: string[] = [];
  if (complexity === "critical") {
    preferredCategories.push("planning", "cot", "quality", "reflection");
  } else if (complexity === "complex") {
    preferredCategories.push("cot", "planning", "tool_guidance");
  } else {
    preferredCategories.push("tool_guidance", "cot");
  }

  // Check historical performance for the best variation in preferred categories
  let bestVariation: PromptVariation | null = null;
  let bestScore = -1;

  for (const category of preferredCategories) {
    const variations = PROMPT_VARIATIONS.filter(v => v.category === category);
    for (const variation of variations) {
      const stats = patternStats.get(variation.id);
      if (stats && stats.sampleCount >= 3) {
        const avgScore = stats.totalScore / stats.sampleCount;
        if (avgScore > bestScore) {
          bestScore = avgScore;
          bestVariation = variation;
        }
      }
    }
  }

  // If we found a historically good variation, use it
  if (bestVariation && bestScore > 60) {
    return bestVariation;
  }

  // Otherwise, return a default based on complexity
  const defaultMap: Record<string, string> = {
    moderate: "cot-step-by-step",
    complex: "cot-structured",
    critical: "planning-ahead",
  };

  const defaultId = defaultMap[complexity] || "cot-step-by-step";
  return PROMPT_VARIATIONS.find(v => v.id === defaultId) || PROMPT_VARIATIONS[0];
}

/**
 * Get a prompt variation by its ID.
 */
export function getPromptVariationById(id: string): PromptVariation | undefined {
  return PROMPT_VARIATIONS.find(v => v.id === id);
}

/**
 * Get all available prompt variations.
 */
export function getAllPromptVariations(): PromptVariation[] {
  return [...PROMPT_VARIATIONS];
}

/**
 * Record the result of using a specific prompt variation.
 * This builds the historical performance data used for optimization.
 */
export function recordPromptResult(
  variationId: string,
  qualityScore: number,
  success: boolean
): void {
  const existing = patternStats.get(variationId) || {
    successCount: 0,
    failureCount: 0,
    totalScore: 0,
    sampleCount: 0,
  };

  existing.sampleCount++;
  existing.totalScore += qualityScore;
  if (success) {
    existing.successCount++;
  } else {
    existing.failureCount++;
  }

  patternStats.set(variationId, existing);

  // Persist to database asynchronously
  persistResult(variationId, qualityScore, success).catch(() => {});
}

/**
 * Get optimization statistics for all prompt variations.
 */
export function getOptimizationStats(): PromptPatternStats[] {
  const stats: PromptPatternStats[] = [];

  for (const variation of PROMPT_VARIATIONS) {
    const data = patternStats.get(variation.id);
    stats.push({
      pattern: variation.name,
      successCount: data?.successCount || 0,
      failureCount: data?.failureCount || 0,
      averageScore: data?.sampleCount ? data.totalScore / data.sampleCount : 0,
      sampleCount: data?.sampleCount || 0,
    });
  }

  return stats.sort((a, b) => b.averageScore - a.averageScore);
}

/**
 * Generate an optimized system prompt by combining the best variations
 * for the given task parameters.
 */
export function generateOptimizedPrompt(
  basePrompt: string,
  taskType: string,
  complexity: "simple" | "moderate" | "complex" | "critical"
): { prompt: string; variationId: string; variationName: string } {
  const variation = getBestPromptVariation(taskType, complexity);
  const optimizedPrompt = basePrompt + variation.systemPromptAddition;

  return {
    prompt: optimizedPrompt,
    variationId: variation.id,
    variationName: variation.name,
  };
}

/**
 * A/B test a prompt variation: randomly select between baseline and variation.
 * Returns which variant was chosen for tracking purposes.
 */
export function abTestPrompt(
  basePrompt: string,
  variationId: string,
  testProbability: number = 0.3
): { prompt: string; isVariation: boolean; trackingId: string } {
  const isVariation = Math.random() < testProbability;
  const variation = PROMPT_VARIATIONS.find(v => v.id === variationId);
  const trackingId = `ab_${variationId}_${Date.now()}`;

  if (isVariation && variation) {
    return {
      prompt: basePrompt + variation.systemPromptAddition,
      isVariation: true,
      trackingId,
    };
  }

  return {
    prompt: basePrompt,
    isVariation: false,
    trackingId,
  };
}

// ── Persistence (in-memory with optional DB fallback) ────────────────────

/**
 * Persist optimization result.
 * Uses in-memory storage. If the Memory model exists in the DB, also persists there.
 */
async function persistResult(
  variationId: string,
  qualityScore: number,
  success: boolean
): Promise<void> {
  try {
    // Use the Memory model as a key-value store since promptOptimization doesn't exist
    const key = `prompt_opt:${variationId}`;
    const existing = await db.memory.findFirst({ where: { key } });
    if (existing) {
      const prev = JSON.parse(existing.content || '{}');
      await db.memory.update({
        where: { id: existing.id },
        data: {
          content: JSON.stringify({
            totalScore: (prev.totalScore || 0) + qualityScore,
            sampleCount: (prev.sampleCount || 0) + 1,
            successCount: (prev.successCount || 0) + (success ? 1 : 0),
            lastTestedAt: new Date().toISOString(),
          }),
        },
      });
    } else {
      await db.memory.create({
        data: {
          key,
          content: JSON.stringify({
            totalScore: qualityScore,
            sampleCount: 1,
            successCount: success ? 1 : 0,
            lastTestedAt: new Date().toISOString(),
          }),
          source: "prompt_optimizer",
        },
      });
    }
  } catch {
    // Non-critical — DB might not be accessible
  }
}

/**
 * Load historical optimization stats from the database on startup.
 */
export async function loadOptimizationHistory(): Promise<void> {
  try {
    const records = await db.memory.findMany({
      where: { key: { startsWith: "prompt_opt:" } },
    });
    for (const record of records) {
      const variationId = record.key.replace("prompt_opt:", "");
      const data = JSON.parse(record.content || '{}');
      patternStats.set(variationId, {
        successCount: data.successCount || 0,
        failureCount: (data.sampleCount || 0) - (data.successCount || 0),
        totalScore: data.totalScore || 0,
        sampleCount: data.sampleCount || 0,
      });
    }
  } catch {
    // Non-critical — DB might not be accessible
  }
}

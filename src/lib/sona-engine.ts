import { db } from './db';

// ============================================================
// Types
// ============================================================

export type PatternType = 'trajectory' | 'reasoning' | 'strategy' | 'feedback' | 'optimization';
export type Outcome = 'success' | 'partial' | 'failure';

export interface TrajectoryContext {
  taskType: string;
  environment?: string;
  constraints?: string[];
  previousSteps?: string[];
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface NeuralWeights {
  [dimension: string]: number;
}

export interface Adaptation {
  timestamp: string;
  dimension: string;
  previousWeight: number;
  newWeight: number;
  reason: string;
}

export interface SONAPatternResult {
  id: string;
  patternType: PatternType;
  agentId: string | null;
  taskType: string;
  inputContext: TrajectoryContext;
  action: string;
  outcome: Outcome;
  score: number;
  neuralWeights: NeuralWeights;
  reasoning: string | null;
  adaptations: Adaptation[];
  usageCount: number;
  successCount: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ReasoningEntryResult {
  id: string;
  agentId: string | null;
  taskType: string;
  question: string;
  reasoning: string;
  conclusion: string;
  confidence: number;
  model: string | null;
  validated: boolean;
  tags: string[];
  createdAt: Date;
}

export interface StrategyRecommendation {
  patternId: string;
  action: string;
  confidence: number;
  reasoning: string;
  neuralWeights: NeuralWeights;
  successRate: number;
  sampleSize: number;
  alternativeActions: Array<{
    action: string;
    confidence: number;
    successRate: number;
  }>;
}

export interface LearningCurvePoint {
  timestamp: string;
  score: number;
  taskType: string;
  outcome: Outcome;
  usageCount: number;
}

export interface LearningCurveResult {
  agentId: string;
  totalPatterns: number;
  avgScore: number;
  trend: 'improving' | 'stable' | 'declining';
  dataPoints: LearningCurvePoint[];
  topTaskTypes: Array<{
    taskType: string;
    avgScore: number;
    count: number;
  }>;
  strongestDimensions: Array<{
    dimension: string;
    weight: number;
  }>;
}

export interface TopStrategyResult {
  patternId: string;
  taskType: string;
  action: string;
  score: number;
  successRate: number;
  usageCount: number;
  reasoning: string | null;
}

export interface SimilarPatternResult {
  patternId: string;
  patternType: PatternType;
  taskType: string;
  action: string;
  outcome: Outcome;
  score: number;
  similarity: number;
  inputContext: TrajectoryContext;
}

// ============================================================
// Helpers
// ============================================================

function parseJsonSafe<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

/**
 * Compute cosine similarity between two weight vectors.
 * Handles sparse vectors by only considering shared keys.
 */
function cosineSimilarity(a: NeuralWeights, b: NeuralWeights): number {
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  const sharedKeys = keysA.filter(k => k in b);

  if (sharedKeys.length === 0) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (const key of sharedKeys) {
    dotProduct += a[key] * b[key];
    normA += a[key] * a[key];
    normB += b[key] * b[key];
  }

  // Also include non-shared keys in norms
  for (const key of keysA) {
    if (!(key in b)) normA += a[key] * a[key];
  }
  for (const key of keysB) {
    if (!(key in a)) normB += b[key] * b[key];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) return 0;

  return dotProduct / denominator;
}

/**
 * Compute context similarity between two contexts.
 * Uses a simple Jaccard-like approach on stringified keys/values.
 */
function contextSimilarity(a: TrajectoryContext, b: TrajectoryContext): number {
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  const allKeys = Array.from(new Set([...keysA, ...keysB]));

  if (allKeys.length === 0) return 0;

  let matches = 0;
  for (const key of allKeys) {
    const valA = JSON.stringify(a[key]);
    const valB = JSON.stringify(b[key]);
    if (valA === valB) {
      matches++;
    } else if (key === 'taskType' && a.taskType === b.taskType) {
      // taskType match is weighted more heavily
      matches += 0.5;
    }
  }

  return matches / allKeys.length;
}

/**
 * Adapt neural weights based on a new score using a learning rate.
 * Weights are adjusted proportionally to the delta between the new
 * score and the current average.
 */
function adaptNeuralWeights(
  currentWeights: NeuralWeights,
  newScore: number,
  learningRate: number = 0.1
): { weights: NeuralWeights; adaptations: Adaptation[] } {
  const adaptations: Adaptation[] = [];
  const weights = { ...currentWeights };

  // Determine which dimensions to strengthen/weaken
  const delta = newScore - 0.5; // Positive = good, negative = bad

  for (const dimension of Object.keys(weights)) {
    const previousWeight = weights[dimension];
    // Move weight in the direction of the outcome
    const adjustment = learningRate * delta * (1 - Math.abs(previousWeight));
    const newWeight = Math.max(-1, Math.min(1, previousWeight + adjustment));
    weights[dimension] = Math.round(newWeight * 10000) / 10000;

    if (Math.abs(newWeight - previousWeight) > 0.0001) {
      adaptations.push({
        timestamp: new Date().toISOString(),
        dimension,
        previousWeight: Math.round(previousWeight * 10000) / 10000,
        newWeight: weights[dimension],
        reason: `Score ${newScore.toFixed(2)} ${delta >= 0 ? 'strengthened' : 'weakened'} dimension`,
      });
    }
  }

  return { weights, adaptations };
}

/**
 * Compute a moving-average trend from a series of scores.
 */
function computeTrend(scores: number[], windowSize = 5): 'improving' | 'stable' | 'declining' {
  if (scores.length < windowSize * 2) return 'stable';

  const older = scores.slice(0, -windowSize);
  const newer = scores.slice(-windowSize);
  const avgOlder = older.reduce((a, b) => a + b, 0) / older.length;
  const avgNewer = newer.reduce((a, b) => a + b, 0) / newer.length;
  const delta = avgNewer - avgOlder;

  if (delta > 0.05) return 'improving';
  if (delta < -0.05) return 'declining';
  return 'stable';
}

/**
 * Generate default neural weights for a new pattern based on context keys.
 */
function generateDefaultWeights(context: TrajectoryContext): NeuralWeights {
  const weights: NeuralWeights = {};
  const keys = Object.keys(context);

  for (const key of keys) {
    // Initialize with small random-like values based on key hash
    let hash = 0;
    for (let i = 0; i < key.length; i++) {
      hash = ((hash << 5) - hash + key.charCodeAt(i)) | 0;
    }
    weights[key] = (Math.abs(hash) % 100) / 1000; // 0.0 - 0.1
  }

  // Always include some standard dimensions
  weights.confidence = 0.5;
  weights.complexity = 0.5;
  weights.novelty = 0.5;

  return weights;
}

// ============================================================
// Exported Functions
// ============================================================

/**
 * Record a trajectory — an agent's path through a task with context,
 * action, outcome, and score. This is the primary learning input.
 */
export async function recordTrajectory(
  agentId: string,
  taskType: string,
  context: TrajectoryContext,
  action: string,
  outcome: Outcome,
  score: number
): Promise<SONAPatternResult> {
  try {
    const clampedScore = Math.max(0, Math.min(1, score));
    const inputContext = { ...context, taskType };
    const neuralWeights = generateDefaultWeights(context);

    // Adapt weights based on the initial outcome
    const { weights: adaptedWeights, adaptations } = adaptNeuralWeights(
      neuralWeights,
      clampedScore,
      0.15 // Higher learning rate for initial trajectory
    );

    const pattern = await db.sONAPattern.create({
      data: {
        patternType: 'trajectory',
        agentId,
        taskType,
        inputContext: JSON.stringify(inputContext),
        action,
        outcome,
        score: clampedScore,
        neuralWeights: JSON.stringify(adaptedWeights),
        reasoning: null,
        adaptations: JSON.stringify(adaptations),
        usageCount: 1,
        successCount: outcome === 'success' ? 1 : 0,
        isActive: true,
      },
    });

    return {
      id: pattern.id,
      patternType: pattern.patternType as PatternType,
      agentId: pattern.agentId,
      taskType: pattern.taskType,
      inputContext: parseJsonSafe<TrajectoryContext>(pattern.inputContext, { taskType: pattern.taskType }),
      action: pattern.action,
      outcome: pattern.outcome as Outcome,
      score: pattern.score,
      neuralWeights: parseJsonSafe<NeuralWeights>(pattern.neuralWeights, {}),
      reasoning: pattern.reasoning,
      adaptations: parseJsonSafe<Adaptation[]>(pattern.adaptations, []),
      usageCount: pattern.usageCount,
      successCount: pattern.successCount,
      isActive: pattern.isActive,
      createdAt: pattern.createdAt,
      updatedAt: pattern.updatedAt,
    };
  } catch (err: unknown) {
    console.error(
      '[SONAEngine] recordTrajectory error:',
      err instanceof Error ? err.message : err
    );
    throw err;
  }
}

/**
 * Store a chain-of-thought reasoning entry. This builds the reasoning
 * bank that SONA uses to understand why decisions were made.
 */
export async function storeReasoning(
  agentId: string,
  taskType: string,
  question: string,
  reasoning: string,
  conclusion: string,
  confidence: number,
  model?: string
): Promise<ReasoningEntryResult> {
  try {
    const clampedConfidence = Math.max(0, Math.min(1, confidence));

    // Auto-generate tags from the reasoning content
    const tags = extractTags(reasoning + ' ' + conclusion + ' ' + question);

    const entry = await db.reasoningEntry.create({
      data: {
        agentId,
        taskType,
        question,
        reasoning,
        conclusion,
        confidence: clampedConfidence,
        model: model ?? null,
        validated: false,
        tags: JSON.stringify(tags),
      },
    });

    // Also create a pattern entry linking to this reasoning
    try {
      await db.sONAPattern.create({
        data: {
          patternType: 'reasoning',
          agentId,
          taskType,
          inputContext: JSON.stringify({ question, taskType }),
          action: conclusion,
          outcome: clampedConfidence >= 0.7 ? 'success' : clampedConfidence >= 0.4 ? 'partial' : 'failure',
          score: clampedConfidence,
          neuralWeights: JSON.stringify({ confidence: clampedConfidence, complexity: 0.5 }),
          reasoning,
          adaptations: '[]',
          usageCount: 1,
          successCount: clampedConfidence >= 0.7 ? 1 : 0,
          isActive: true,
        },
      });
    } catch {
      // Non-critical: pattern creation for reasoning is supplementary
    }

    return {
      id: entry.id,
      agentId: entry.agentId,
      taskType: entry.taskType,
      question: entry.question,
      reasoning: entry.reasoning,
      conclusion: entry.conclusion,
      confidence: entry.confidence,
      model: entry.model,
      validated: entry.validated,
      tags: parseJsonSafe<string[]>(entry.tags, []),
      createdAt: entry.createdAt,
    };
  } catch (err: unknown) {
    console.error(
      '[SONAEngine] storeReasoning error:',
      err instanceof Error ? err.message : err
    );
    throw err;
  }
}

/**
 * Find similar patterns to a given task type and context.
 * Uses a combination of task type matching, context similarity,
 * and neural weight cosine similarity.
 */
export async function findSimilarPatterns(
  taskType: string,
  context: TrajectoryContext,
  limit: number = 10
): Promise<SimilarPatternResult[]> {
  try {
    // Fetch candidate patterns of the same task type (or all if too few)
    let candidates = await db.sONAPattern.findMany({
      where: {
        taskType,
        isActive: true,
      },
      orderBy: { score: 'desc' },
      take: limit * 5, // Over-fetch for filtering
    });

    // If too few, broaden search
    if (candidates.length < limit) {
      const additional = await db.sONAPattern.findMany({
        where: {
          isActive: true,
          taskType: { not: taskType },
        },
        orderBy: { score: 'desc' },
        take: limit * 2,
      });
      candidates = [...candidates, ...additional];
    }

    const results: SimilarPatternResult[] = [];

    for (const pattern of candidates) {
      const patternContext = parseJsonSafe<TrajectoryContext>(pattern.inputContext, { taskType: pattern.taskType });
      const patternWeights = parseJsonSafe<NeuralWeights>(pattern.neuralWeights, {});

      // Compute composite similarity
      const contextSim = contextSimilarity(context, patternContext);
      const weightSim = cosineSimilarity(
        generateDefaultWeights(context),
        patternWeights
      );
      const taskTypeBonus = pattern.taskType === taskType ? 0.3 : 0;

      const similarity = contextSim * 0.4 + weightSim * 0.3 + taskTypeBonus + pattern.score * 0.1;

      if (similarity > 0.1) {
        results.push({
          patternId: pattern.id,
          patternType: pattern.patternType as PatternType,
          taskType: pattern.taskType,
          action: pattern.action,
          outcome: pattern.outcome as Outcome,
          score: pattern.score,
          similarity: Math.round(similarity * 100) / 100,
          inputContext: patternContext,
        });
      }
    }

    return results
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit);
  } catch (err: unknown) {
    console.error(
      '[SONAEngine] findSimilarPatterns error:',
      err instanceof Error ? err.message : err
    );
    return [];
  }
}

/**
 * Adapt the neural weights of a pattern based on a new score.
 * This is the core learning mechanism that adjusts the pattern's
 * internal representation.
 */
export async function adaptWeights(
  patternId: string,
  newScore: number
): Promise<SONAPatternResult> {
  try {
    const pattern = await db.sONAPattern.findUnique({ where: { id: patternId } });
    if (!pattern) throw new Error(`Pattern not found: ${patternId}`);

    const clampedScore = Math.max(0, Math.min(1, newScore));
    const currentWeights = parseJsonSafe<NeuralWeights>(pattern.neuralWeights, {});
    const currentAdaptations = parseJsonSafe<Adaptation[]>(pattern.adaptations, []);

    // Adapt weights
    const { weights: newWeights, adaptations } = adaptNeuralWeights(
      currentWeights,
      clampedScore,
      0.1
    );

    // Merge adaptations
    const allAdaptations = [...currentAdaptations, ...adaptations];

    // Update score (exponential moving average)
    const alpha = 0.3;
    const blendedScore = alpha * clampedScore + (1 - alpha) * pattern.score;

    // Update success count
    const successIncrement = clampedScore >= 0.7 ? 1 : 0;

    const updated = await db.sONAPattern.update({
      where: { id: patternId },
      data: {
        neuralWeights: JSON.stringify(newWeights),
        adaptations: JSON.stringify(allAdaptations),
        score: Math.round(blendedScore * 10000) / 10000,
        usageCount: pattern.usageCount + 1,
        successCount: pattern.successCount + successIncrement,
      },
    });

    return {
      id: updated.id,
      patternType: updated.patternType as PatternType,
      agentId: updated.agentId,
      taskType: updated.taskType,
      inputContext: parseJsonSafe<TrajectoryContext>(updated.inputContext, { taskType: updated.taskType }),
      action: updated.action,
      outcome: updated.outcome as Outcome,
      score: updated.score,
      neuralWeights: parseJsonSafe<NeuralWeights>(updated.neuralWeights, {}),
      reasoning: updated.reasoning,
      adaptations: parseJsonSafe<Adaptation[]>(updated.adaptations, []),
      usageCount: updated.usageCount,
      successCount: updated.successCount,
      isActive: updated.isActive,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    };
  } catch (err: unknown) {
    console.error(
      '[SONAEngine] adaptWeights error:',
      err instanceof Error ? err.message : err
    );
    throw err;
  }
}

/**
 * Get a strategy recommendation for a given task type and context.
 * Analyzes historical patterns to suggest the best action.
 */
export async function getStrategyRecommendation(
  taskType: string,
  context: TrajectoryContext
): Promise<StrategyRecommendation> {
  try {
    // Find similar patterns
    const similar = await findSimilarPatterns(taskType, context, 50);

    if (similar.length === 0) {
      return {
        patternId: '',
        action: 'explore',
        confidence: 0.1,
        reasoning: 'No historical patterns found for this task type and context. Recommend exploration.',
        neuralWeights: {},
        successRate: 0,
        sampleSize: 0,
        alternativeActions: [],
      };
    }

    // Group by action and aggregate scores
    const actionMap = new Map<string, {
      scores: number[];
      successRate: number;
      totalUsage: number;
      patternId: string;
      weights: NeuralWeights;
      reasoning: string | null;
    }>();

    for (const pat of similar) {
      const key = pat.action;
      const existing = actionMap.get(key);

      if (existing) {
        existing.scores.push(pat.score * pat.similarity); // Weighted by similarity
        existing.totalUsage += 1;
      } else {
        // Fetch full pattern for weights and reasoning
        const fullPattern = await db.sONAPattern.findUnique({ where: { id: pat.patternId } });
        const weights = fullPattern
          ? parseJsonSafe<NeuralWeights>(fullPattern.neuralWeights, {})
          : {};

        actionMap.set(key, {
          scores: [pat.score * pat.similarity],
          successRate: pat.score >= 0.7 ? 1 : 0,
          totalUsage: 1,
          patternId: pat.patternId,
          weights,
          reasoning: fullPattern?.reasoning ?? null,
        });
      }
    }

    // Rank actions by weighted average score
    const ranked = Array.from(actionMap.entries())
      .map(([action, data]) => {
        const avgScore = data.scores.reduce((a, b) => a + b, 0) / data.scores.length;
        const confidence = Math.min(0.95, avgScore * 0.6 + Math.min(data.totalUsage / 10, 1) * 0.4);
        return { action, ...data, avgScore, confidence };
      })
      .sort((a, b) => b.avgScore - a.avgScore);

    const best = ranked[0];
    const alternatives = ranked.slice(1, 4).map(r => ({
      action: r.action,
      confidence: Math.round(r.confidence * 100) / 100,
      successRate: Math.round(r.avgScore * 100) / 100,
    }));

    return {
      patternId: best.patternId,
      action: best.action,
      confidence: Math.round(best.confidence * 100) / 100,
      reasoning: best.reasoning ?? `Based on ${best.totalUsage} similar pattern(s) with avg score ${best.avgScore.toFixed(2)}`,
      neuralWeights: best.weights,
      successRate: Math.round(best.avgScore * 100) / 100,
      sampleSize: best.totalUsage,
      alternativeActions: alternatives,
    };
  } catch (err: unknown) {
    console.error(
      '[SONAEngine] getStrategyRecommendation error:',
      err instanceof Error ? err.message : err
    );
    return {
      patternId: '',
      action: 'explore',
      confidence: 0.1,
      reasoning: `Error computing recommendation: ${err instanceof Error ? err.message : 'unknown'}`,
      neuralWeights: {},
      successRate: 0,
      sampleSize: 0,
      alternativeActions: [],
    };
  }
}

/**
 * Validate a reasoning entry against an actual outcome.
 * Updates the entry's validation status and adjusts confidence.
 */
export async function validateReasoning(
  entryId: string,
  actualOutcome: Outcome
): Promise<ReasoningEntryResult | null> {
  try {
    const entry = await db.reasoningEntry.findUnique({ where: { id: entryId } });
    if (!entry) return null;

    // Adjust confidence based on whether the reasoning predicted correctly
    const predictedSuccess = entry.confidence >= 0.7;
    const actualSuccess = actualOutcome === 'success';
    let adjustedConfidence = entry.confidence;

    if (predictedSuccess && actualSuccess) {
      // Correct prediction: boost confidence slightly
      adjustedConfidence = Math.min(1, entry.confidence + 0.05);
    } else if (predictedSuccess && !actualSuccess) {
      // Wrong prediction: reduce confidence
      adjustedConfidence = Math.max(0, entry.confidence - 0.15);
    } else if (!predictedSuccess && actualSuccess) {
      // Underestimated: slight increase
      adjustedConfidence = Math.min(1, entry.confidence + 0.1);
    }
    // If predicted failure and actual failure, confidence stays (correct pessimism)

    const updated = await db.reasoningEntry.update({
      where: { id: entryId },
      data: {
        validated: true,
        confidence: Math.round(adjustedConfidence * 10000) / 10000,
      },
    });

    // Also update the associated SONA pattern if one exists
    try {
      const associatedPattern = await db.sONAPattern.findFirst({
        where: {
          patternType: 'reasoning',
          agentId: entry.agentId,
          taskType: entry.taskType,
          action: entry.conclusion,
        },
      });

      if (associatedPattern) {
        const newScore = actualOutcome === 'success' ? 0.9 : actualOutcome === 'partial' ? 0.5 : 0.1;
        await adaptWeights(associatedPattern.id, newScore);
      }
    } catch {
      // Non-critical: pattern update is supplementary
    }

    return {
      id: updated.id,
      agentId: updated.agentId,
      taskType: updated.taskType,
      question: updated.question,
      reasoning: updated.reasoning,
      conclusion: updated.conclusion,
      confidence: updated.confidence,
      model: updated.model,
      validated: updated.validated,
      tags: parseJsonSafe<string[]>(updated.tags, []),
      createdAt: updated.createdAt,
    };
  } catch (err: unknown) {
    console.error(
      '[SONAEngine] validateReasoning error:',
      err instanceof Error ? err.message : err
    );
    return null;
  }
}

/**
 * Get an agent's learning curve over time. Returns chronological
 * data points showing how the agent's performance has evolved.
 */
export async function getAgentLearningCurve(
  agentId: string
): Promise<LearningCurveResult> {
  const defaultResult: LearningCurveResult = {
    agentId,
    totalPatterns: 0,
    avgScore: 0,
    trend: 'stable',
    dataPoints: [],
    topTaskTypes: [],
    strongestDimensions: [],
  };

  try {
    const patterns = await db.sONAPattern.findMany({
      where: { agentId },
      orderBy: { createdAt: 'asc' },
      take: 500,
    });

    if (patterns.length === 0) return defaultResult;

    // Compute data points
    const dataPoints: LearningCurvePoint[] = patterns.map((p, index) => ({
      timestamp: p.createdAt.toISOString(),
      score: p.score,
      taskType: p.taskType,
      outcome: p.outcome as Outcome,
      usageCount: index + 1,
    }));

    // Compute overall stats
    const totalPatterns = patterns.length;
    const avgScore = patterns.reduce((sum, p) => sum + p.score, 0) / totalPatterns;

    // Compute trend
    const scores = patterns.map(p => p.score);
    const trend = computeTrend(scores);

    // Top task types
    const taskTypeMap = new Map<string, { scores: number[]; count: number }>();
    for (const p of patterns) {
      const entry = taskTypeMap.get(p.taskType) ?? { scores: [], count: 0 };
      entry.scores.push(p.score);
      entry.count++;
      taskTypeMap.set(p.taskType, entry);
    }

    const topTaskTypes = Array.from(taskTypeMap.entries())
      .map(([taskType, data]) => ({
        taskType,
        avgScore: Math.round((data.scores.reduce((a, b) => a + b, 0) / data.scores.length) * 100) / 100,
        count: data.count,
      }))
      .sort((a, b) => b.avgScore - a.avgScore)
      .slice(0, 10);

    // Strongest neural weight dimensions (aggregate across all patterns)
    const dimensionScores = new Map<string, number[]>();
    for (const p of patterns) {
      const weights = parseJsonSafe<NeuralWeights>(p.neuralWeights, {});
      for (const [dim, val] of Object.entries(weights)) {
        const scores = dimensionScores.get(dim) ?? [];
        scores.push(val);
        dimensionScores.set(dim, scores);
      }
    }

    const strongestDimensions = Array.from(dimensionScores.entries())
      .map(([dimension, values]) => ({
        dimension,
        weight: Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10000) / 10000,
      }))
      .sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight))
      .slice(0, 10);

    return {
      agentId,
      totalPatterns,
      avgScore: Math.round(avgScore * 100) / 100,
      trend,
      dataPoints,
      topTaskTypes,
      strongestDimensions,
    };
  } catch (err: unknown) {
    console.error(
      '[SONAEngine] getAgentLearningCurve error:',
      err instanceof Error ? err.message : err
    );
    return defaultResult;
  }
}

/**
 * Get top performing strategies across all patterns, optionally
 * filtered by task type.
 */
export async function getTopStrategies(
  taskType: string,
  limit: number = 10
): Promise<TopStrategyResult[]> {
  try {
    const patterns = await db.sONAPattern.findMany({
      where: {
        taskType,
        isActive: true,
        patternType: { in: ['trajectory', 'strategy', 'optimization'] },
      },
      orderBy: { score: 'desc' },
      take: limit * 3, // Over-fetch to group by action
    });

    // Group by action
    const actionMap = new Map<string, {
      patternId: string;
      scores: number[];
      successCount: number;
      totalCount: number;
      reasoning: string | null;
    }>();

    for (const p of patterns) {
      const key = p.action;
      const existing = actionMap.get(key);

      if (existing) {
        existing.scores.push(p.score);
        existing.successCount += p.successCount;
        existing.totalCount += p.usageCount;
      } else {
        actionMap.set(key, {
          patternId: p.id,
          scores: [p.score],
          successCount: p.successCount,
          totalCount: p.usageCount,
          reasoning: p.reasoning,
        });
      }
    }

    return Array.from(actionMap.entries())
      .map(([action, data]) => ({
        patternId: data.patternId,
        taskType,
        action,
        score: Math.round((data.scores.reduce((a, b) => a + b, 0) / data.scores.length) * 100) / 100,
        successRate: data.totalCount > 0
          ? Math.round((data.successCount / data.totalCount) * 100) / 100
          : 0,
        usageCount: data.totalCount,
        reasoning: data.reasoning,
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  } catch (err: unknown) {
    console.error(
      '[SONAEngine] getTopStrategies error:',
      err instanceof Error ? err.message : err
    );
    return [];
  }
}

/**
 * Evolve a pattern by applying new adaptations. This enables
 * strategies to mutate and improve over time.
 */
export async function evolvePattern(
  patternId: string,
  adaptations: Array<{
    dimension: string;
    delta: number;
    reason: string;
  }>
): Promise<SONAPatternResult> {
  try {
    const pattern = await db.sONAPattern.findUnique({ where: { id: patternId } });
    if (!pattern) throw new Error(`Pattern not found: ${patternId}`);

    const currentWeights = parseJsonSafe<NeuralWeights>(pattern.neuralWeights, {});
    const currentAdaptations = parseJsonSafe<Adaptation[]>(pattern.adaptations, []);

    // Apply each adaptation
    const newAdaptations: Adaptation[] = [];
    for (const adapt of adaptations) {
      const previousWeight = currentWeights[adapt.dimension] ?? 0.5;
      const newWeight = Math.max(-1, Math.min(1, previousWeight + adapt.delta));
      currentWeights[adapt.dimension] = Math.round(newWeight * 10000) / 10000;

      newAdaptations.push({
        timestamp: new Date().toISOString(),
        dimension: adapt.dimension,
        previousWeight: Math.round(previousWeight * 10000) / 10000,
        newWeight: currentWeights[adapt.dimension],
        reason: adapt.reason,
      });
    }

    // Recalculate score based on adapted weights
    const weightValues = Object.values(currentWeights);
    const avgWeight = weightValues.length > 0
      ? weightValues.reduce((a, b) => a + b, 0) / weightValues.length
      : 0.5;
    const newScore = Math.max(0, Math.min(1, pattern.score * 0.7 + avgWeight * 0.3));

    // Change pattern type to 'optimization' if it was a trajectory
    const newPatternType: string = pattern.patternType === 'trajectory'
      ? 'optimization'
      : pattern.patternType;

    const updated = await db.sONAPattern.update({
      where: { id: patternId },
      data: {
        patternType: newPatternType,
        neuralWeights: JSON.stringify(currentWeights),
        adaptations: JSON.stringify([...currentAdaptations, ...newAdaptations]),
        score: Math.round(newScore * 10000) / 10000,
      },
    });

    return {
      id: updated.id,
      patternType: updated.patternType as PatternType,
      agentId: updated.agentId,
      taskType: updated.taskType,
      inputContext: parseJsonSafe<TrajectoryContext>(updated.inputContext, { taskType: updated.taskType }),
      action: updated.action,
      outcome: updated.outcome as Outcome,
      score: updated.score,
      neuralWeights: parseJsonSafe<NeuralWeights>(updated.neuralWeights, {}),
      reasoning: updated.reasoning,
      adaptations: parseJsonSafe<Adaptation[]>(updated.adaptations, []),
      usageCount: updated.usageCount,
      successCount: updated.successCount,
      isActive: updated.isActive,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    };
  } catch (err: unknown) {
    console.error(
      '[SONAEngine] evolvePattern error:',
      err instanceof Error ? err.message : err
    );
    throw err;
  }
}

// ============================================================
// Internal Helpers
// ============================================================

/**
 * Extract meaningful tags from text content.
 * Simple keyword extraction using common NLP-like heuristics.
 */
function extractTags(text: string): string[] {
  const tags: string[] = [];

  // Common task-related keywords
  const keywords = [
    'debug', 'refactor', 'optimize', 'test', 'deploy', 'review',
    'security', 'performance', 'architecture', 'design', 'implement',
    'analyze', 'research', 'document', 'monitor', 'scale', 'migrate',
    'integrate', 'configure', 'validate', 'benchmark', 'simulate',
    'plan', 'coordinate', 'schedule', 'automate', 'encrypt',
    'cache', 'index', 'query', 'transform', 'parse', 'compile',
    'render', 'stream', 'batch', 'parallel', 'sequential', 'async',
  ];

  const lowerText = text.toLowerCase();

  for (const keyword of keywords) {
    if (lowerText.includes(keyword)) {
      tags.push(keyword);
    }
  }

  // Extract task types that appear in the text
  const taskTypePattern = /\b(code_gen|debug|review|deploy|research|general|analysis|creative|reasoning|embedding|chat)\b/gi;
  let match: RegExpExecArray | null;
  while ((match = taskTypePattern.exec(text)) !== null) {
    if (!tags.includes(match[1].toLowerCase())) {
      tags.push(match[1].toLowerCase());
    }
  }

  return Array.from(new Set(tags)).slice(0, 10);
}

import { db } from "@/lib/db";
import { countTokens, estimateCost } from "@/lib/tokens";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BenchmarkTest {
  id: string;
  prompt: string;
  expectedOutput: string;
  rubric: ScoringRubric;
  difficulty: "easy" | "medium" | "hard";
}

interface ScoringRubric {
  criteria: ScoringCriterion[];
  weights: Record<string, number>; // criterion name → weight (0-1, sum = 1)
}

interface ScoringCriterion {
  name: string;
  description: string;
  maxPoints: number;
}

interface RunBenchmarkResult {
  benchmarkId: string;
  benchmarkName: string;
  agentId: string;
  totalTests: number;
  completedTests: number;
  results: TestResult[];
  aggregateScore: number;
  totalLatencyMs: number;
  totalTokensUsed: number;
  totalCost: number;
}

interface TestResult {
  testId: string;
  testName: string;
  prompt: string;
  response: string;
  score: number;
  maxScore: number;
  rubric: ScoringRubric;
  latencyMs: number;
  tokensUsed: number;
  cost: number;
  error?: string;
}

interface AgentPerformanceMetrics {
  agentId: string;
  totalEvaluations: number;
  avgScore: number;
  maxScore: number;
  minScore: number;
  avgLatencyMs: number;
  totalTokensUsed: number;
  totalCost: number;
  categoryBreakdown: Record<
    string,
    {
      count: number;
      avgScore: number;
      avgLatencyMs: number;
    }
  >;
  recentTrend: "improving" | "stable" | "declining";
  scoreHistory: Array<{ date: string; score: number }>;
}

interface LeaderboardEntry {
  agentId: string;
  agentName: string;
  totalEvaluations: number;
  avgScore: number;
  avgLatencyMs: number;
  totalCost: number;
  categoryScores: Record<string, number>;
  rank: number;
}

interface ScoreResponseResult {
  score: number;
  criterionScores: Record<string, number>;
  feedback: string;
}

// ---------------------------------------------------------------------------
// Built-in Benchmarks
// ---------------------------------------------------------------------------

const BUILT_IN_BENCHMARKS: Array<{
  name: string;
  category: string;
  description: string;
  tests: BenchmarkTest[];
}> = [
  {
    name: "coding",
    category: "coding",
    description:
      "Evaluates an agent's ability to write correct, efficient, and idiomatic code.",
    tests: [
      {
        id: "coding-reverse-linked-list",
        prompt: "Write a function that reverses a singly linked list. Provide the complete implementation with a Node class and the reverse function. Include type annotations and a brief explanation of the approach.",
        expectedOutput:
          "A correct implementation of linked list reversal using either iterative or recursive approach with O(n) time and O(1) space (iterative) or O(n) space (recursive). Should include Node class, reverse function, type annotations, and explanation.",
        rubric: {
          criteria: [
            { name: "correctness", description: "Algorithm correctly reverses the list", maxPoints: 40 },
            { name: "efficiency", description: "Uses appropriate time/space complexity", maxPoints: 20 },
            { name: "codeQuality", description: "Clean, readable, well-structured code", maxPoints: 20 },
            { name: "completeness", description: "Includes Node class, function, types, explanation", maxPoints: 20 },
          ],
          weights: { correctness: 0.4, efficiency: 0.2, codeQuality: 0.2, completeness: 0.2 },
        },
        difficulty: "medium",
      },
      {
        id: "coding-binary-search",
        prompt: "Implement binary search for a sorted array of integers. Handle edge cases like empty arrays, single elements, and elements not found. Include unit tests.",
        expectedOutput:
          "A correct binary search implementation with O(log n) time complexity, proper edge case handling, and basic unit tests covering typical, boundary, and error cases.",
        rubric: {
          criteria: [
            { name: "correctness", description: "Algorithm correctly finds target or reports absence", maxPoints: 35 },
            { name: "edgeCases", description: "Handles empty array, single element, not found", maxPoints: 25 },
            { name: "tests", description: "Includes meaningful unit tests", maxPoints: 25 },
            { name: "codeQuality", description: "Clean, idiomatic code with good variable names", maxPoints: 15 },
          ],
          weights: { correctness: 0.35, edgeCases: 0.25, tests: 0.25, codeQuality: 0.15 },
        },
        difficulty: "easy",
      },
      {
        id: "coding-rest-api",
        prompt: "Create a REST API endpoint for a todo application using Express.js. The endpoint should support CRUD operations (GET, POST, PUT, DELETE) with proper validation, error handling, and status codes. Include middleware for request validation.",
        expectedOutput:
          "Complete Express.js route implementation with all CRUD operations, input validation middleware, proper HTTP status codes, error handling, and clean route organization.",
        rubric: {
          criteria: [
            { name: "crudComplete", description: "All CRUD operations implemented correctly", maxPoints: 30 },
            { name: "validation", description: "Input validation middleware with proper checks", maxPoints: 25 },
            { name: "errorHandling", description: "Proper error handling with correct status codes", maxPoints: 25 },
            { name: "codeStructure", description: "Clean, well-organized, follows best practices", maxPoints: 20 },
          ],
          weights: { crudComplete: 0.3, validation: 0.25, errorHandling: 0.25, codeStructure: 0.2 },
        },
        difficulty: "hard",
      },
    ],
  },
  {
    name: "reasoning",
    category: "reasoning",
    description:
      "Evaluates an agent's logical reasoning and critical thinking capabilities.",
    tests: [
      {
        id: "reasoning-logic-puzzle",
        prompt: "Solve this logic puzzle: Three boxes are labeled 'Apples', 'Oranges', and 'Mixed'. All labels are wrong. You can pick one fruit from one box (without looking inside). How do you determine the correct labels for all three boxes? Explain your reasoning step by step.",
        expectedOutput:
          "Correct solution: Pick from the 'Mixed' box. Since all labels are wrong, 'Mixed' must contain only one type. If you get an apple, 'Mixed' is actually 'Apples'. Then 'Oranges' can't be oranges (wrong label) and can't be apples (found), so it's 'Mixed'. 'Apples' must be 'Oranges'. Similar logic if you get an orange. Full step-by-step reasoning required.",
        rubric: {
          criteria: [
            { name: "solution", description: "Arrives at the correct solution", maxPoints: 40 },
            { name: "reasoning", description: "Clear, logical step-by-step reasoning", maxPoints: 35 },
            { name: "completeness", description: "Considers all cases and explains fully", maxPoints: 25 },
          ],
          weights: { solution: 0.4, reasoning: 0.35, completeness: 0.25 },
        },
        difficulty: "medium",
      },
      {
        id: "reasoning-argument-flaw",
        prompt: "What's wrong with this argument? 'All birds can fly. Penguins are birds. Therefore, penguins can fly.' Identify the logical fallacy, explain why the argument fails, and suggest how to fix the premise to make the argument valid.",
        expectedOutput:
          "Identifies the false universal premise ('All birds can fly' is incorrect — some birds like penguins, ostriches, and kiwis are flightless). Explains that the argument uses a categorical syllogism with a false major premise. Suggests fixing to 'Most birds can fly' or 'All birds except flightless species can fly' to make it logically sound.",
        rubric: {
          criteria: [
            { name: "fallacyIdentified", description: "Correctly identifies the false premise/fallacy", maxPoints: 35 },
            { name: "explanation", description: "Clearly explains why the argument fails", maxPoints: 35 },
            { name: "fix", description: "Provides a reasonable fix to the premise", maxPoints: 30 },
          ],
          weights: { fallacyIdentified: 0.35, explanation: 0.35, fix: 0.3 },
        },
        difficulty: "easy",
      },
    ],
  },
  {
    name: "creative",
    category: "creative",
    description:
      "Evaluates an agent's creative writing and communication skills.",
    tests: [
      {
        id: "creative-haiku",
        prompt: "Write a haiku about coding. It must follow the traditional 5-7-5 syllable structure. The haiku should capture a genuine insight about the programming experience.",
        expectedOutput:
          "A haiku with exactly 5-7-5 syllable structure that meaningfully connects coding/programming with a deeper insight or observation. Should be evocative and genuine, not cliché.",
        rubric: {
          criteria: [
            { name: "structure", description: "Follows 5-7-5 syllable structure correctly", maxPoints: 35 },
            { name: "insight", description: "Captures a genuine, non-cliché insight about coding", maxPoints: 35 },
            { name: "imagery", description: "Uses evocative, memorable language", maxPoints: 30 },
          ],
          weights: { structure: 0.35, insight: 0.35, imagery: 0.3 },
        },
        difficulty: "easy",
      },
      {
        id: "creative-explain-quantum",
        prompt: "Explain quantum computing to a 5-year-old. Use simple analogies, relatable examples, and language a young child would understand. Avoid jargon completely. Make it engaging and fun.",
        expectedOutput:
          "An explanation using simple analogies (like flipping coins, magic boxes, or playground games) that a 5-year-old could understand. No technical jargon. Engaging, fun tone with relatable examples from a child's world.",
        rubric: {
          criteria: [
            { name: "simplicity", description: "Language and concepts appropriate for a 5-year-old", maxPoints: 35 },
            { name: "analogies", description: "Creative, relatable analogies that illuminate the concept", maxPoints: 30 },
            { name: "accuracy", description: "Core concept is accurate despite simplification", maxPoints: 20 },
            { name: "engagement", description: "Fun, engaging tone that holds a child's attention", maxPoints: 15 },
          ],
          weights: { simplicity: 0.35, analogies: 0.3, accuracy: 0.2, engagement: 0.15 },
        },
        difficulty: "medium",
      },
    ],
  },
  {
    name: "analysis",
    category: "analysis",
    description:
      "Evaluates an agent's ability to analyze data and reason about trade-offs.",
    tests: [
      {
        id: "analysis-data-pattern",
        prompt: "Analyze this data pattern: A SaaS company's monthly revenue over 12 months: $10K, $12K, $15K, $18K, $22K, $28K, $35K, $44K, $55K, $69K, $86K, $107K. Identify the growth pattern, predict the next 3 months, discuss potential risks, and recommend strategies to sustain growth.",
        expectedOutput:
          "Identifies exponential/compounding growth pattern (roughly 25-35% monthly growth). Makes reasonable projections for next 3 months using the growth rate. Discusses risks like market saturation, customer churn, scaling challenges. Recommends strategies like expanding market segments, improving retention, operational scaling.",
        rubric: {
          criteria: [
            { name: "patternIdentification", description: "Correctly identifies the growth pattern", maxPoints: 30 },
            { name: "prediction", description: "Reasonable projections based on identified pattern", maxPoints: 25 },
            { name: "riskAnalysis", description: "Thoughtful discussion of potential risks", maxPoints: 25 },
            { name: "recommendations", description: "Actionable, realistic growth strategies", maxPoints: 20 },
          ],
          weights: { patternIdentification: 0.3, prediction: 0.25, riskAnalysis: 0.25, recommendations: 0.2 },
        },
        difficulty: "medium",
      },
      {
        id: "analysis-microservices-tradeoffs",
        prompt: "What are the trade-offs of microservices vs. monolithic architecture? Provide a balanced analysis considering team size, project stage, scalability needs, operational complexity, and when each approach is most appropriate. Include concrete examples.",
        expectedOutput:
          "Balanced analysis covering: microservices benefits (independent deployment, scaling, team autonomy) and costs (operational complexity, network latency, distributed system challenges); monolith benefits (simplicity, easier debugging, faster initial development) and costs (scaling bottlenecks, deployment coupling). Should discuss when each is appropriate based on team size, project stage, and requirements. Include real-world examples.",
        rubric: {
          criteria: [
            { name: "balance", description: "Presents both sides fairly without bias", maxPoints: 25 },
            { name: "depth", description: "Covers multiple dimensions (team, stage, scale, ops)", maxPoints: 30 },
            { name: "practicality", description: "Provides concrete, actionable guidance and examples", maxPoints: 25 },
            { name: "nuance", description: "Acknowledges context-dependence and gray areas", maxPoints: 20 },
          ],
          weights: { balance: 0.25, depth: 0.3, practicality: 0.25, nuance: 0.2 },
        },
        difficulty: "hard",
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Call the internal Gemini chat API and return the full accumulated text.
 * The API returns SSE so we need to consume the stream and collect chunks.
 */
async function callChatAPI(
  prompt: string,
  model: string = "gemini-2.5-flash",
): Promise<{ text: string; tokensUsed: number; cost: number }> {
  const startTime = Date.now();

  const response = await fetch("http://localhost:3000/api/gemini/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt,
      model,
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
          // Extract token and cost info from the done event
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

  // If we didn't get token info from the stream, estimate it
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
// AgentEvaluationEngine
// ---------------------------------------------------------------------------

class AgentEvaluationEngine {
  // -----------------------------------------------------------------------
  // seedBenchmarks
  // -----------------------------------------------------------------------

  async seedBenchmarks(): Promise<{ created: number; updated: number }> {
    let created = 0;
    let updated = 0;

    for (const benchmark of BUILT_IN_BENCHMARKS) {
      try {
        const existing = await db.evaluationBenchmark.findUnique({
          where: { name: benchmark.name },
        });

        if (existing) {
          await db.evaluationBenchmark.update({
            where: { id: existing.id },
            data: {
              category: benchmark.category,
              description: benchmark.description,
              tests: JSON.stringify(benchmark.tests),
              version: existing.version + 1,
              updatedAt: new Date(),
            },
          });
          updated++;
        } else {
          await db.evaluationBenchmark.create({
            data: {
              name: benchmark.name,
              category: benchmark.category,
              description: benchmark.description,
              tests: JSON.stringify(benchmark.tests),
            },
          });
          created++;
        }
      } catch (err: unknown) {
        console.error(
          `[AgentEval] Failed to seed benchmark "${benchmark.name}":`,
          err instanceof Error ? err.message : err,
        );
      }
    }

    console.log(
      `[AgentEval] Seed complete: ${created} created, ${updated} updated`,
    );
    return { created, updated };
  }

  // -----------------------------------------------------------------------
  // runBenchmark
  // -----------------------------------------------------------------------

  async runBenchmark(
    agentId: string,
    benchmarkId: string,
    model: string = "gemini-2.5-flash",
  ): Promise<RunBenchmarkResult> {
    const benchmark = await db.evaluationBenchmark.findUnique({
      where: { id: benchmarkId },
    });

    if (!benchmark) {
      throw new Error(`Benchmark not found: ${benchmarkId}`);
    }

    const tests = safeJsonParse<BenchmarkTest[]>(benchmark.tests);
    if (!tests || !Array.isArray(tests)) {
      throw new Error(`Invalid test data in benchmark: ${benchmarkId}`);
    }

    // Look up the agent for its system prompt
    const agent = await db.agent.findUnique({ where: { id: agentId } });
    if (!agent) {
      throw new Error(`Agent not found: ${agentId}`);
    }

    const results: TestResult[] = [];
    let totalLatencyMs = 0;
    let totalTokensUsed = 0;
    let totalCost = 0;

    for (const test of tests) {
      try {
        const testResult = await this.runSingleTest(agentId, test, model);
        results.push(testResult);
        totalLatencyMs += testResult.latencyMs;
        totalTokensUsed += testResult.tokensUsed;
        totalCost += testResult.cost;
      } catch (err: unknown) {
        const errorMessage =
          err instanceof Error ? err.message : "Unknown error";
        console.error(
          `[AgentEval] Test "${test.id}" failed for agent ${agentId}:`,
          errorMessage,
        );
        results.push({
          testId: test.id,
          testName: test.id,
          prompt: test.prompt,
          response: "",
          score: 0,
          maxScore: 1,
          rubric: test.rubric,
          latencyMs: 0,
          tokensUsed: 0,
          cost: 0,
          error: errorMessage,
        });
      }
    }

    const completedTests = results.filter((r) => !r.error).length;
    const aggregateScore =
      completedTests > 0
        ? results.reduce((sum, r) => sum + r.score, 0) / results.length
        : 0;

    return {
      benchmarkId: benchmark.id,
      benchmarkName: benchmark.name,
      agentId,
      totalTests: tests.length,
      completedTests,
      results,
      aggregateScore: Math.round(aggregateScore * 1000) / 1000,
      totalLatencyMs,
      totalTokensUsed,
      totalCost: Math.round(totalCost * 10000) / 10000,
    };
  }

  // -----------------------------------------------------------------------
  // runSingleTest
  // -----------------------------------------------------------------------

  async runSingleTest(
    agentId: string,
    test: BenchmarkTest,
    model: string = "gemini-2.5-flash",
  ): Promise<TestResult> {
    const startTime = Date.now();

    // Get agent system prompt to prepend
    const agent = await db.agent.findUnique({ where: { id: agentId } });
    const systemPrefix = agent?.systemPrompt
      ? `[You are acting as: ${agent.name} — ${agent.role}]\n\n`
      : "";

    const fullPrompt = `${systemPrefix}${test.prompt}`;

    const { text, tokensUsed, cost } = await callChatAPI(fullPrompt, model);
    const latencyMs = Date.now() - startTime;

    // Score the response
    const scoringResult = await this.scoreResponse(
      text,
      test.expectedOutput,
      test.rubric,
      test.prompt,
    );

    // Store the evaluation result in the database
    // Maps to existing AgentEvaluation schema fields:
    //   testCategory ← benchmark category, actualOutput ← response,
    //   expectedOutput ← rubric JSON, costUsd ← cost,
    //   passed ← score threshold, notes ← metadata JSON
    try {
      await db.agentEvaluation.create({
        data: {
          agentId,
          testName: test.id,
          testCategory: test.difficulty, // Use difficulty as category proxy
          prompt: test.prompt,
          expectedOutput: JSON.stringify(test.rubric), // Store rubric as expected output
          actualOutput: text.slice(0, 5000), // Cap stored response length
          score: scoringResult.score,
          latencyMs,
          tokensUsed,
          costUsd: cost,
          model,
          passed: scoringResult.score >= 0.6,
          notes: JSON.stringify({
            benchmarkId: test.id,
            criterionScores: scoringResult.criterionScores,
            feedback: scoringResult.feedback,
            difficulty: test.difficulty,
          }),
        },
      });
    } catch (err: unknown) {
      console.error(
        `[AgentEval] Failed to store evaluation result:`,
        err instanceof Error ? err.message : err,
      );
    }

    return {
      testId: test.id,
      testName: test.id,
      prompt: test.prompt,
      response: text,
      score: scoringResult.score,
      maxScore: 1,
      rubric: test.rubric,
      latencyMs,
      tokensUsed,
      cost,
    };
  }

  // -----------------------------------------------------------------------
  // scoreResponse
  // -----------------------------------------------------------------------

  async scoreResponse(
    actual: string,
    expected: string,
    rubric: ScoringRubric,
    originalPrompt?: string,
  ): Promise<ScoreResponseResult> {
    // Default result if LLM scoring fails
    const defaultResult: ScoreResponseResult = {
      score: 0.5,
      criterionScores: {},
      feedback: "Scoring failed, using default score.",
    };

    try {
      const criteriaDescription = rubric.criteria
        .map(
          (c) =>
            `- "${c.name}" (max ${c.maxPoints} pts): ${c.description}`,
        )
        .join("\n");

      const weightsDescription = Object.entries(rubric.weights)
        .map(([k, v]) => `${k}: ${(v * 100).toFixed(0)}%`)
        .join(", ");

      const scoringPrompt = `You are an expert evaluator for AI agent responses. Score the following response based on the rubric criteria.

${originalPrompt ? `ORIGINAL PROMPT:\n${originalPrompt.slice(0, 2000)}\n` : ""}
EXPECTED OUTPUT (what an ideal response looks like):
${expected.slice(0, 2000)}

ACTUAL RESPONSE TO EVALUATE:
${actual.slice(0, 3000)}

SCORING RUBRIC:
${criteriaDescription}

WEIGHTS: ${weightsDescription}

For each criterion, assign a score from 0 to the max points. Then compute the weighted final score (0-1).

Respond with ONLY a JSON object with this exact structure (no markdown, no explanation):
{
  "criterionScores": { ${rubric.criteria.map((c) => `"${c.name}": <score 0-${c.maxPoints}>`).join(", ")} },
  "score": <weighted final score between 0 and 1>,
  "feedback": "<brief explanation of the scoring>"
}`;

      const { text: llmResponse } = await callChatAPI(scoringPrompt);
      const jsonMatch = llmResponse.match(/\{[\s\S]*\}/);

      if (jsonMatch) {
        const parsed = safeJsonParse<{
          criterionScores?: Record<string, number>;
          score?: number;
          feedback?: string;
        }>(jsonMatch[0]);

        if (parsed) {
          // Validate and normalize criterion scores
          const criterionScores: Record<string, number> = {};
          for (const criterion of rubric.criteria) {
            const rawScore = parsed.criterionScores?.[criterion.name];
            criterionScores[criterion.name] =
              typeof rawScore === "number"
                ? Math.max(0, Math.min(criterion.maxPoints, rawScore))
                : 0;
          }

          // Compute the weighted score ourselves for accuracy
          let computedScore = 0;
          for (const criterion of rubric.criteria) {
            const normalized =
              criterionScores[criterion.name] / criterion.maxPoints;
            const weight = rubric.weights[criterion.name] || 0;
            computedScore += normalized * weight;
          }

          return {
            score: Math.max(0, Math.min(1, Math.round(computedScore * 1000) / 1000)),
            criterionScores,
            feedback:
              typeof parsed.feedback === "string"
                ? parsed.feedback
                : "No feedback provided.",
          };
        }
      }

      return defaultResult;
    } catch (err: unknown) {
      console.error(
        "[AgentEval] scoreResponse error:",
        err instanceof Error ? err.message : err,
      );
      return defaultResult;
    }
  }

  // -----------------------------------------------------------------------
  // getAgentPerformance
  // -----------------------------------------------------------------------

  async getAgentPerformance(
    agentId: string,
  ): Promise<AgentPerformanceMetrics> {
    const defaultMetrics: AgentPerformanceMetrics = {
      agentId,
      totalEvaluations: 0,
      avgScore: 0,
      maxScore: 0,
      minScore: 0,
      avgLatencyMs: 0,
      totalTokensUsed: 0,
      totalCost: 0,
      categoryBreakdown: {},
      recentTrend: "stable",
      scoreHistory: [],
    };

    try {
      const evaluations = await db.agentEvaluation.findMany({
        where: { agentId },
        orderBy: { createdAt: "desc" },
        take: 500,
      });

      if (evaluations.length === 0) {
        return defaultMetrics;
      }

      const totalEvaluations = evaluations.length;
      const scores = evaluations.map((e) => e.score);
      const avgScore =
        scores.reduce((a, b) => a + b, 0) / totalEvaluations;
      const maxScore = Math.max(...scores);
      const minScore = Math.min(...scores);

      const withLatency = evaluations.filter((e) => e.latencyMs != null);
      const avgLatencyMs =
        withLatency.length > 0
          ? withLatency.reduce((a, e) => a + (e.latencyMs ?? 0), 0) /
            withLatency.length
          : 0;

      const totalTokensUsed = evaluations.reduce(
        (a, e) => a + (e.tokensUsed ?? 0),
        0,
      );
      const totalCost = evaluations.reduce(
        (a, e) => a + (e.costUsd ?? 0),
        0,
      );

      // Category breakdown — use testCategory directly from evaluations
      const categoryBreakdown: Record<
        string,
        { count: number; avgScore: number; avgLatencyMs: number }
      > = {};

      // Also check notes for benchmark category info
      const benchmarkTestNames = [
        ...new Set(evaluations.map((e) => e.testName)),
      ];
      const benchmarks = await db.evaluationBenchmark.findMany();
      const benchmarkCategoryMap = new Map(
        benchmarks.map((b) => [b.category, b.category]),
      );

      for (const evaluation of evaluations) {
        // Try to get category from notes first, then from testCategory
        const notesData = safeJsonParse<{ benchmarkId?: string }>(evaluation.notes);
        const category =
          evaluation.testCategory || "unknown";
        const entry = categoryBreakdown[category] || {
          count: 0,
          avgScore: 0,
          avgLatencyMs: 0,
        };
        entry.count++;
        entry.avgScore += evaluation.score;
        entry.avgLatencyMs += evaluation.latencyMs ?? 0;
        categoryBreakdown[category] = entry;
      }

      // Normalize averages
      for (const cat of Object.keys(categoryBreakdown)) {
        const entry = categoryBreakdown[cat];
        entry.avgScore = Math.round((entry.avgScore / entry.count) * 1000) / 1000;
        entry.avgLatencyMs = Math.round(entry.avgLatencyMs / entry.count);
      }

      // Recent trend
      const chronologicalScores = [...evaluations]
        .sort(
          (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
        )
        .map((e) => e.score);
      const recentTrend = computeTrend(chronologicalScores);

      // Score history (last 30 data points, grouped by date)
      const scoreHistoryMap = new Map<string, { total: number; count: number }>();
      for (const evaluation of evaluations.slice(0, 30).reverse()) {
        const date = evaluation.createdAt.toISOString().split("T")[0];
        const entry = scoreHistoryMap.get(date) || { total: 0, count: 0 };
        entry.total += evaluation.score;
        entry.count++;
        scoreHistoryMap.set(date, entry);
      }

      const scoreHistory = Array.from(scoreHistoryMap.entries()).map(
        ([date, { total, count }]) => ({
          date,
          score: Math.round((total / count) * 1000) / 1000,
        }),
      );

      return {
        agentId,
        totalEvaluations,
        avgScore: Math.round(avgScore * 1000) / 1000,
        maxScore: Math.round(maxScore * 1000) / 1000,
        minScore: Math.round(minScore * 1000) / 1000,
        avgLatencyMs: Math.round(avgLatencyMs),
        totalTokensUsed,
        totalCost: Math.round(totalCost * 10000) / 10000,
        categoryBreakdown,
        recentTrend,
        scoreHistory,
      };
    } catch (err: unknown) {
      console.error(
        "[AgentEval] getAgentPerformance error:",
        err instanceof Error ? err.message : err,
      );
      return defaultMetrics;
    }
  }

  // -----------------------------------------------------------------------
  // getLeaderboard
  // -----------------------------------------------------------------------

  async getLeaderboard(): Promise<LeaderboardEntry[]> {
    try {
      // Get all evaluations grouped by agent
      const evaluations = await db.agentEvaluation.findMany({
        orderBy: { createdAt: "desc" },
        take: 2000,
      });

      if (evaluations.length === 0) {
        return [];
      }

      // Get all agents for name lookup
      const agentIds = [...new Set(evaluations.map((e) => e.agentId))];
      const agents = await db.agent.findMany({
        where: { id: { in: agentIds } },
      });
      const agentNameMap = new Map(agents.map((a) => [a.id, a.name]));

      // Get benchmark categories — use testCategory from evaluations
      const benchmarkCategoryMap = new Map(
        (await db.evaluationBenchmark.findMany()).map((b) => [b.category, b.category]),
      );

      // Group by agent
      const agentMap = new Map<
        string,
        {
          evaluations: typeof evaluations;
          categoryScores: Record<string, { total: number; count: number }>;
        }
      >();

      for (const evaluation of evaluations) {
        const entry = agentMap.get(evaluation.agentId) || {
          evaluations: [],
          categoryScores: {},
        };

        entry.evaluations.push(evaluation);

        // Track category scores
        const category = evaluation.testCategory || "unknown";
        const catEntry = entry.categoryScores[category] || {
          total: 0,
          count: 0,
        };
        catEntry.total += evaluation.score;
        catEntry.count++;
        entry.categoryScores[category] = catEntry;

        agentMap.set(evaluation.agentId, entry);
      }

      // Build leaderboard entries
      const entries: LeaderboardEntry[] = Array.from(agentMap.entries()).map(
        ([agentId, data]) => {
          const totalEvaluations = data.evaluations.length;
          const avgScore =
            data.evaluations.reduce((a, e) => a + e.score, 0) /
            totalEvaluations;
          const avgLatencyMs =
            data.evaluations.filter((e) => e.latencyMs != null).length > 0
              ? data.evaluations
                  .filter((e) => e.latencyMs != null)
                  .reduce((a, e) => a + (e.latencyMs ?? 0), 0) /
                data.evaluations.filter((e) => e.latencyMs != null).length
              : 0;
          const totalCost = data.evaluations.reduce(
            (a, e) => a + (e.costUsd ?? 0),
            0,
          );

          const categoryScores: Record<string, number> = {};
          for (const [cat, val] of Object.entries(data.categoryScores)) {
            categoryScores[cat] =
              Math.round((val.total / val.count) * 1000) / 1000;
          }

          return {
            agentId,
            agentName: agentNameMap.get(agentId) || "Unknown Agent",
            totalEvaluations,
            avgScore: Math.round(avgScore * 1000) / 1000,
            avgLatencyMs: Math.round(avgLatencyMs),
            totalCost: Math.round(totalCost * 10000) / 10000,
            categoryScores,
            rank: 0, // Will be set below
          };
        },
      );

      // Sort by average score descending and assign ranks
      entries.sort((a, b) => b.avgScore - a.avgScore);
      entries.forEach((entry, index) => {
        entry.rank = index + 1;
      });

      return entries;
    } catch (err: unknown) {
      console.error(
        "[AgentEval] getLeaderboard error:",
        err instanceof Error ? err.message : err,
      );
      return [];
    }
  }
}

// ---------------------------------------------------------------------------
// Singleton via globalThis (prevents multiple instances in dev with hot reload)
// ---------------------------------------------------------------------------

const GLOBAL_KEY = "__agentEvaluationEngine__" as const;

interface GlobalWithEngine {
  [GLOBAL_KEY]?: AgentEvaluationEngine;
}

const g = globalThis as unknown as GlobalWithEngine;

function getAgentEvaluationEngine(): AgentEvaluationEngine {
  if (!g[GLOBAL_KEY]) {
    g[GLOBAL_KEY] = new AgentEvaluationEngine();
  }
  return g[GLOBAL_KEY];
}

export {
  AgentEvaluationEngine,
  getAgentEvaluationEngine,
  // Export types for consumer use
  type BenchmarkTest,
  type ScoringRubric,
  type ScoringCriterion,
  type RunBenchmarkResult,
  type TestResult,
  type AgentPerformanceMetrics,
  type LeaderboardEntry,
  type ScoreResponseResult,
};

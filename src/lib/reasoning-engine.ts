/**
 * ClawHub Reasoning Engine — Chain-of-Thought, Self-Reflection, and Planning
 * 
 * This module gives ALL models (even small ones) structured reasoning capabilities
 * similar to Claude Code and o1-style thinking. It works by:
 * 
 * 1. Chain-of-Thought (CoT): Injecting structured thinking prompts that force
 *    models to reason step-by-step before acting
 * 2. Self-Reflection: After each tool call, the model evaluates its own progress
 *    and decides whether to continue, adjust, or complete
 * 3. Planning: Decomposing complex tasks into ordered sub-tasks with dependencies
 * 4. Quality Scoring: Evaluating response completeness and accuracy
 */

// ============================================================
// TYPES
// ============================================================

export interface ReasoningStep {
  type: "analyze" | "plan" | "execute" | "verify" | "reflect" | "decide";
  content: string;
  confidence: number; // 0-1
  timestamp: number;
}

export interface TaskPlan {
  id: string;
  goal: string;
  subtasks: SubTask[];
  status: "planning" | "executing" | "verifying" | "completed" | "failed";
  createdAt: number;
  completedAt?: number;
}

export interface SubTask {
  id: string;
  description: string;
  tool?: string;
  dependencies: string[]; // IDs of subtasks that must complete first
  status: "pending" | "in_progress" | "completed" | "failed" | "skipped";
  result?: string;
  retryCount: number;
  maxRetries: number;
}

export interface ReflectionResult {
  progress: number; // 0-1
  isOnTrack: boolean;
  issues: string[];
  nextAction: "continue" | "adjust" | "restart" | "complete";
  adjustedApproach?: string;
  confidenceScore: number; // 0-1
}

export interface QualityScore {
  completeness: number; // 0-1
  accuracy: number; // 0-1
  relevance: number; // 0-1
  depth: number; // 0-1
  overall: number; // 0-1
  suggestions: string[];
}

export interface ThinkingConfig {
  enabled: boolean;
  style: "minimal" | "standard" | "deep" | "agentic";
  maxThinkingTokens: number;
  autoReflect: boolean;
  autoPlan: boolean;
  qualityCheck: boolean;
}

// ============================================================
// DEFAULT CONFIG
// ============================================================

export const DEFAULT_THINKING_CONFIG: ThinkingConfig = {
  enabled: true,
  style: "agentic",
  maxThinkingTokens: 4096,
  autoReflect: true,
  autoPlan: true,
  qualityCheck: true,
};

// ============================================================
// CHAIN-OF-THOUGHT SYSTEM
// ============================================================

/**
 * Generates a CoT system prompt addition based on task complexity.
 * This forces ALL models to think before acting — even models without
 * native thinking capabilities benefit from structured prompting.
 */
export function generateCoTPrompt(taskComplexity: "simple" | "moderate" | "complex" | "critical"): string {
  const baseCoT = `
[STRUCTURED THINKING — MANDATORY]
Before responding or using any tool, you MUST follow this reasoning process:

THINK | First, reason about the task:
- What is the user REALLY asking for? (intent, not just words)
- What information do I already have? What do I need?
- What are the constraints and success criteria?
- What could go wrong? What are the edge cases?

PLAN | Then, plan your approach:
- What tools should I use? In what order?
- Are there independent sub-tasks I can parallelize?
- What's my fallback if the primary approach fails?

EXECUTE | Then act with precision:
- Call the RIGHT tool with the RIGHT parameters
- After each result, evaluate: Did this get me closer to the goal?
- If a tool fails, immediately try an alternative — NEVER give up on the first attempt

VERIFY | Before giving the final answer:
- Did I fully address the user's request?
- Is my answer accurate, complete, and actionable?
- Would a expert in this domain accept this as a thorough answer?
`;

  const complexityAdditions: Record<string, string> = {
    simple: `
For this simple task: Think briefly, then act decisively. No need for elaborate planning.`,
    
    moderate: `
For this moderate task: Plan 2-3 steps ahead. Consider at least one alternative approach in case the first fails.`,
    
    complex: `
For this complex task: You MUST explicitly list your plan with numbered steps before executing.
Break the task into 3-5 sub-tasks. After each sub-task, reflect on progress and adjust if needed.
Use at least 2 different tools/approaches to cross-verify critical information.

**Planning Template (MANDATORY for complex tasks):**
Plan:
1. [First step with tool name] → Expected outcome: ...
2. [Second step with tool name] → Expected outcome: ...
3. [Third step with tool name] → Expected outcome: ...
4. [Verification step] → How I'll confirm success: ...
5. [Fallback approach] → If step X fails, I'll instead: ...`,
    
    critical: `
For this CRITICAL task: You MUST follow the FULL agentic reasoning protocol:

1. **Deep Analysis**: Identify ALL stakeholders, requirements, constraints, risks
2. **Multi-Path Planning**: Create Plan A, Plan B, and Plan C before starting
3. **Parallel Execution**: Execute independent sub-tasks simultaneously
4. **Cross-Verification**: Use multiple tools/sources to verify every critical fact
5. **Self-Review**: After completion, critique your own work. Would you accept this if you were the user?
6. **Improvement**: If your self-review finds gaps, fix them immediately

**Critical Task Planning Template:**
## Analysis
- Core intent: ...
- Success criteria: ...
- Risks: ...
- Edge cases: ...

## Plan A (Primary)
1. ... → Tool: ... → Expected: ...
2. ... → Tool: ... → Expected: ...

## Plan B (Fallback)
1. ... → Tool: ... → Expected: ...

## Verification
- Cross-check method: ...
- Quality threshold: ...

## Execution Log
- Step 1: [status] [result summary]
- Step 2: [status] [result summary]
...`,
  };

  return baseCoT + (complexityAdditions[taskComplexity] || "");
}

/**
 * Analyzes a user prompt and determines its complexity level.
 */
export function assessTaskComplexity(prompt: string, historyLength: number): "simple" | "moderate" | "complex" | "critical" {
  const lower = prompt.toLowerCase();
  let score = 0;

  // Length-based signals
  if (prompt.length > 500) score += 1;
  if (prompt.length > 1500) score += 1;
  if (prompt.length > 3000) score += 1;

  // Multi-step indicators
  const multiStepWords = ["and then", "also", "after that", "next", "finally", "additionally", "furthermore", "as well as", "multiple", "several"];
  for (const w of multiStepWords) {
    if (lower.includes(w)) score += 1;
  }

  // Complex task indicators
  const complexWords = ["build", "create", "design", "implement", "develop", "architect", "refactor", "migrate", "integrate", "deploy", "analyze", "compare", "optimize", "debug", "troubleshoot", "redesign", "rewrite"];
  for (const w of complexWords) {
    if (lower.includes(w)) score += 1;
  }

  // Critical task indicators
  const criticalWords = ["production", "critical", "urgent", "security", "vulnerability", "data loss", "down", "broken", "emergency", "compliance", "audit"];
  for (const w of criticalWords) {
    if (lower.includes(w)) score += 2;
  }

  // Code-related complexity
  if (/code|script|function|class|component|api|database|server/i.test(lower)) score += 1;

  // Multi-file or multi-system indicators
  if (/entire|all|every|whole|comprehensive|complete|full/i.test(lower)) score += 1;

  // Long conversation context adds complexity
  if (historyLength > 6) score += 1;
  if (historyLength > 12) score += 1;

  if (score >= 8) return "critical";
  if (score >= 5) return "complex";
  if (score >= 2) return "moderate";
  return "simple";
}

// ============================================================
// SELF-REFLECTION SYSTEM
// ============================================================

/**
 * Generates a reflection prompt that the model uses to evaluate its own progress.
 * This is sent after tool execution results to force self-evaluation.
 */
export function generateReflectionPrompt(
  originalTask: string,
  toolsExecuted: string[],
  resultsSummary: string,
  iteration: number,
  maxIterations: number
): string {
  return `
[SELF-REFLECTION — Evaluate Your Progress]
Original task: "${originalTask.substring(0, 200)}"
Iteration: ${iteration}/${maxIterations}
Tools used so far: ${toolsExecuted.join(", ") || "none"}
Latest results: ${resultsSummary.substring(0, 500)}

You MUST honestly evaluate:
1. **Progress**: Am I closer to completing the task than before?
2. **Quality**: Are the results accurate and useful?
3. **Gaps**: What information or actions are still missing?
4. **Direction**: Should I continue the current approach or try something different?

DECISION: Based on your reflection, choose one:
- CONTINUE: The current approach is working. Execute the next step.
- ADJUST: The approach needs modification. Describe the new approach and execute it.
- COMPLETE: The task is fully done. Provide the final comprehensive answer.
- ESCALATE: This task requires capabilities I don't have. Be specific about what's needed.

IMPORTANT: NEVER say "I cannot" or "I'm unable" without first trying at least 2 alternative approaches.
If a tool failed, you MUST try a different tool or different parameters before giving up.`;
}

/**
 * Scores the quality of a completed response.
 */
export function scoreResponseQuality(
  originalPrompt: string,
  response: string,
  toolCallsCount: number,
  hadErrors: boolean
): QualityScore {
  const suggestions: string[] = [];
  
  // Completeness: Does the response address the original prompt?
  let completeness = 0.5;
  const promptKeywords = originalPrompt.toLowerCase().split(/\s+/).filter(w => w.length > 3);
  const responseLower = response.toLowerCase();
  const matchedKeywords = promptKeywords.filter(w => responseLower.includes(w));
  completeness = Math.min(1, 0.3 + (matchedKeywords.length / Math.max(promptKeywords.length, 1)) * 0.7);
  if (response.length < 100) { completeness *= 0.5; suggestions.push("Response is too short — provide more detail"); }
  if (response.length > 500) completeness = Math.min(1, completeness + 0.1);

  // Accuracy: Were there tool errors? Did tools succeed?
  let accuracy = 0.7;
  if (hadErrors) { accuracy -= 0.2; suggestions.push("Some tools failed — verify results with alternative approaches"); }
  if (toolCallsCount > 0 && !hadErrors) accuracy = Math.min(1, accuracy + 0.2);
  if (toolCallsCount === 0 && /analyze|check|review|search|find|fetch/i.test(originalPrompt)) {
    accuracy -= 0.2;
    suggestions.push("Task required tool use but none were called — use available tools to gather information");
  }

  // Relevance: Is the response on-topic?
  let relevance = 0.8;
  if (response.includes("I cannot") || response.includes("I'm unable") || response.includes("I apologize")) {
    relevance -= 0.3;
    suggestions.push("Avoid giving up — try alternative approaches before saying you can't help");
  }

  // Depth: Is the response thorough?
  let depth = 0.4;
  if (response.length > 300) depth += 0.1;
  if (response.length > 1000) depth += 0.1;
  if (response.length > 3000) depth += 0.1;
  if (toolCallsCount >= 2) depth += 0.15;
  if (toolCallsCount >= 4) depth += 0.1;
  if (response.includes("```")) depth += 0.05; // Has code examples
  if (/step|first|second|third|finally/i.test(response)) depth += 0.05; // Structured
  if (depth < 0.6) suggestions.push("Provide more depth — include examples, step-by-step guidance, and evidence");

  const overall = (completeness * 0.3 + accuracy * 0.3 + relevance * 0.2 + depth * 0.2);

  return {
    completeness: Math.round(completeness * 100) / 100,
    accuracy: Math.round(accuracy * 100) / 100,
    relevance: Math.round(relevance * 100) / 100,
    depth: Math.round(depth * 100) / 100,
    overall: Math.round(overall * 100) / 100,
    suggestions,
  };
}

// ============================================================
// PLANNING SYSTEM
// ============================================================

let planCounter = 0;

/**
 * Creates a structured plan from a complex task description.
 */
export function createTaskPlan(goal: string, estimatedSubtasks: number): TaskPlan {
  planCounter++;
  const subtasks: SubTask[] = [];
  
  for (let i = 0; i < estimatedSubtasks; i++) {
    subtasks.push({
      id: `st_${planCounter}_${i + 1}`,
      description: `Sub-task ${i + 1}: (to be determined by agent)`,
      dependencies: i > 0 ? [`st_${planCounter}_${i}`] : [],
      status: "pending",
      retryCount: 0,
      maxRetries: 2,
    });
  }

  return {
    id: `plan_${planCounter}`,
    goal,
    subtasks,
    status: "planning",
    createdAt: Date.now(),
  };
}

/**
 * Generates a planning prompt that forces the model to create a structured plan.
 */
export function generatePlanningPrompt(task: string, availableTools: string[]): string {
  return `
[TASK PLANNING — MANDATORY FOR COMPLEX TASKS]
You must plan this task before executing. Break it into sub-tasks and identify dependencies.

Available tools: ${availableTools.join(", ")}

**Planning Format (fill in completely):**

## Goal
${task}

## Sub-tasks
| # | Description | Tool(s) | Depends On | Expected Result |
|---|-------------|---------|------------|-----------------|
| 1 | ... | ... | - | ... |
| 2 | ... | ... | #1 | ... |
| 3 | ... | ... | #1, #2 | ... |

## Parallel Opportunities
- Sub-tasks that can run simultaneously: ...

## Risk Assessment
- What could fail: ...
- Fallback for each risk: ...

## Success Criteria
- Task is complete when: ...

After planning, EXECUTE the plan step by step. Start with sub-task #1.
If a sub-task fails, try the fallback approach before moving on.`;
}

// ============================================================
// EXTENDED THINKING TOKENS
// ============================================================

/**
 * Generates a thinking budget configuration based on model capabilities.
 * This enables o1-style extended thinking for models that support it,
 * and simulated thinking for models that don't.
 */
export function getThinkingBudget(model: string, taskComplexity: string): {
  thinkingTokens: number;
  useNativeThinking: boolean;
  thinkingPrompt: string;
} {
  // Models with native thinking/reasoning capabilities
  const nativeThinkingModels = [
    "deepseek-r1", "deepseek-reasoner", "deepseek-r1-", 
    "o1", "o1-mini", "o1-preview", "o3", "o3-mini",
    "qwq", "qwen-qwq", "marco-o1",
    "gemini-2.5-pro", "gemini-2.5-flash",
    "claude-3.5-sonnet", "claude-3.7-sonnet", "claude-4",
  ];
  
  const modelName = model.toLowerCase();
  const useNativeThinking = nativeThinkingModels.some(m => modelName.includes(m.toLowerCase()));
  
  // Token budgets by complexity
  const tokenBudgets: Record<string, number> = {
    simple: 1024,
    moderate: 2048,
    complex: 4096,
    critical: 8192,
  };
  
  const thinkingTokens = tokenBudgets[taskComplexity] || 2048;
  
  // For models WITHOUT native thinking, we simulate it with a structured prompt
  const thinkingPrompt = useNativeThinking ? "" : `
[EXTENDED THINKING — Think step-by-step before responding]
Take your time. Think deeply about this problem. Consider multiple perspectives.
Work through the problem methodically:
1. What is the core question?
2. What do I know? What do I need to find out?
3. What's the best approach? Are there alternatives?
4. What could go wrong? How do I handle edge cases?
5. What's my conclusion? How confident am I?

Write your thinking process, then provide your answer.
`;

  return { thinkingTokens, useNativeThinking, thinkingPrompt };
}

// ============================================================
// TOOL LEARNING SYSTEM
// ============================================================

interface ToolPerformanceRecord {
  toolName: string;
  taskType: string;
  successRate: number;
  avgResultQuality: number;
  usageCount: number;
  lastUsed: number;
}

const toolPerformanceDB: Map<string, ToolPerformanceRecord> = new Map();

/**
 * Records tool performance for learning which tools work best for which tasks.
 */
export function recordToolPerformance(
  toolName: string,
  taskType: string,
  success: boolean,
  resultQuality: number // 0-1
): void {
  const key = `${toolName}:${taskType}`;
  const existing = toolPerformanceDB.get(key);
  
  if (existing) {
    existing.usageCount++;
    existing.successRate = existing.successRate * 0.8 + (success ? 1 : 0) * 0.2;
    existing.avgResultQuality = existing.avgResultQuality * 0.8 + resultQuality * 0.2;
    existing.lastUsed = Date.now();
  } else {
    toolPerformanceDB.set(key, {
      toolName,
      taskType,
      successRate: success ? 1 : 0,
      avgResultQuality: resultQuality,
      usageCount: 1,
      lastUsed: Date.now(),
    });
  }
}

/**
 * Gets tool recommendations based on learned performance for a task type.
 */
export function getToolRecommendations(taskType: string): { tool: string; score: number }[] {
  const recommendations: { tool: string; score: number }[] = [];
  
  for (const [, record] of toolPerformanceDB) {
    if (record.taskType === taskType || record.usageCount >= 3) {
      const score = record.successRate * 0.5 + record.avgResultQuality * 0.3 + 
                     Math.min(record.usageCount / 10, 1) * 0.2;
      recommendations.push({ tool: record.toolName, score });
    }
  }
  
  return recommendations.sort((a, b) => b.score - a.score).slice(0, 5);
}

/**
 * Gets all tool performance data for analytics.
 */
export function getToolPerformanceStats(): ToolPerformanceRecord[] {
  return Array.from(toolPerformanceDB.values());
}

// ============================================================
// CONTEXT COMPRESSION
// ============================================================

/**
 * Compresses conversation history by summarizing old turns while keeping recent ones intact.
 * This prevents context window overflow while maintaining conversation continuity.
 */
export function compressConversationHistory(
  history: { role: string; content: string; reasoning_content?: string }[],
  maxRecentTurns: number = 4,
  maxSummaryLength: number = 500
): { compressed: any[]; summary: string; tokensSaved: number } {
  if (history.length <= maxRecentTurns) {
    return { compressed: history, summary: "", tokensSaved: 0 };
  }

  const oldTurns = history.slice(0, history.length - maxRecentTurns);
  const recentTurns = history.slice(history.length - maxRecentTurns);

  // Create a summary of old turns
  const summaryParts: string[] = [];
  let currentRole = "";
  let currentContent = "";

  for (const turn of oldTurns) {
    if (turn.role !== currentRole) {
      if (currentContent) {
        summaryParts.push(`${currentRole}: ${currentContent.slice(0, 200)}`);
      }
      currentRole = turn.role;
      currentContent = turn.content;
    } else {
      currentContent += " " + turn.content;
    }
  }
  if (currentContent) {
    summaryParts.push(`${currentRole}: ${currentContent.slice(0, 200)}`);
  }

  const summary = summaryParts.join("\n").slice(0, maxSummaryLength);
  
  // Estimate tokens saved (rough: 1 token ≈ 4 chars)
  const oldChars = oldTurns.reduce((sum, t) => sum + t.content.length, 0);
  const tokensSaved = Math.max(0, Math.floor((oldChars - summary.length) / 4));

  const compressed = [
    ...(summary ? [{ role: "system" as const, content: `[Earlier conversation summary]: ${summary}` }] : []),
    ...recentTurns,
  ];

  return { compressed, summary, tokensSaved };
}

// ============================================================
// MULTI-MODEL ORCHESTRATION
// ============================================================

export interface ModelCapability {
  name: string;
  strengths: string[];  // e.g., ["coding", "reasoning", "creative"]
  contextWindow: number;
  supportsToolCalling: boolean;
  supportsThinking: boolean;
  costPer1kTokens: number;
  speed: "fast" | "medium" | "slow";
}

/**
 * Known model capabilities for intelligent routing.
 */
export const MODEL_CAPABILITIES: Record<string, ModelCapability> = {
  "deepseek-r1": { name: "deepseek-r1", strengths: ["reasoning", "math", "coding", "analysis"], contextWindow: 64000, supportsToolCalling: true, supportsThinking: true, costPer1kTokens: 0.0014, speed: "medium" },
  "deepseek-chat": { name: "deepseek-chat", strengths: ["coding", "general", "analysis"], contextWindow: 64000, supportsToolCalling: true, supportsThinking: false, costPer1kTokens: 0.0014, speed: "fast" },
  "deepseek-coder": { name: "deepseek-coder", strengths: ["coding", "debugging", "refactoring"], contextWindow: 64000, supportsToolCalling: true, supportsThinking: false, costPer1kTokens: 0.0014, speed: "fast" },
  "qwen2.5-coder": { name: "qwen2.5-coder", strengths: ["coding", "reasoning"], contextWindow: 128000, supportsToolCalling: true, supportsThinking: false, costPer1kTokens: 0.002, speed: "fast" },
  "qwq": { name: "qwq", strengths: ["reasoning", "math", "analysis"], contextWindow: 32000, supportsToolCalling: false, supportsThinking: true, costPer1kTokens: 0.002, speed: "medium" },
  "gemini-2.5-pro": { name: "gemini-2.5-pro", strengths: ["reasoning", "coding", "multimodal", "long-context"], contextWindow: 1000000, supportsToolCalling: true, supportsThinking: true, costPer1kTokens: 0.007, speed: "medium" },
  "gemini-2.5-flash": { name: "gemini-2.5-flash", strengths: ["fast-response", "general", "coding"], contextWindow: 1000000, supportsToolCalling: true, supportsThinking: false, costPer1kTokens: 0.0007, speed: "fast" },
  "gemini-2.0-flash": { name: "gemini-2.0-flash", strengths: ["fast-response", "general", "tool-use"], contextWindow: 1000000, supportsToolCalling: true, supportsThinking: false, costPer1kTokens: 0.0005, speed: "fast" },
  "llama-3.1": { name: "llama-3.1", strengths: ["general", "coding", "reasoning"], contextWindow: 128000, supportsToolCalling: true, supportsThinking: false, costPer1kTokens: 0.001, speed: "fast" },
  "mistral-large": { name: "mistral-large", strengths: ["coding", "reasoning", "multilingual"], contextWindow: 128000, supportsToolCalling: true, supportsThinking: false, costPer1kTokens: 0.004, speed: "medium" },
  "codestral": { name: "codestral", strengths: ["coding", "code-review", "debugging"], contextWindow: 32000, supportsToolCalling: true, supportsThinking: false, costPer1kTokens: 0.002, speed: "fast" },
  "claude-3.5-sonnet": { name: "claude-3.5-sonnet", strengths: ["coding", "reasoning", "analysis", "creative"], contextWindow: 200000, supportsToolCalling: true, supportsThinking: true, costPer1kTokens: 0.015, speed: "medium" },
};

/**
 * Selects the best model for a given task based on capabilities.
 */
export function selectBestModel(
  taskType: string,
  availableModels: string[],
  priority: "speed" | "quality" | "cost" = "quality"
): string {
  const taskStrengthMap: Record<string, string[]> = {
    coding: ["coding", "debugging", "refactoring"],
    reasoning: ["reasoning", "math", "analysis"],
    research: ["general", "reasoning"],
    creative: ["creative", "reasoning"],
    analysis: ["analysis", "reasoning"],
  };

  const requiredStrengths = taskStrengthMap[taskType] || ["general"];
  
  let bestModel = availableModels[0];
  let bestScore = -1;

  for (const model of availableModels) {
    const modelLower = model.toLowerCase();
    const caps = Object.entries(MODEL_CAPABILITIES).find(([key]) => modelLower.includes(key));
    
    if (!caps) continue;
    const [, cap] = caps;
    
    // Calculate match score
    const strengthMatch = requiredStrengths.filter(s => cap.strengths.includes(s)).length / requiredStrengths.length;
    let score = strengthMatch * 0.5;
    
    // Apply priority weighting
    if (priority === "speed" && cap.speed === "fast") score += 0.3;
    if (priority === "quality" && cap.supportsThinking) score += 0.3;
    if (priority === "cost") score -= cap.costPer1kTokens * 10;
    
    // Tool calling is important for agentic tasks
    if (cap.supportsToolCalling) score += 0.2;
    
    if (score > bestScore) {
      bestScore = score;
      bestModel = model;
    }
  }

  return bestModel;
}

// ============================================================
// ADAPTIVE ITERATION LIMITS
// ============================================================

/**
 * Calculates the optimal max iterations for the agent loop based on task complexity.
 * Simple tasks get fewer iterations (faster), complex tasks get more (thorough).
 */
export function getAdaptiveMaxIterations(
  taskComplexity: "simple" | "moderate" | "complex" | "critical",
  toolsUsedCount: number,
  hasErrors: boolean
): number {
  const baseIterations: Record<string, number> = {
    simple: 5,
    moderate: 10,
    complex: 15,
    critical: 20,
  };
  
  let maxIter = baseIterations[taskComplexity] || 10;
  
  // If we've already used many tools and no errors, we're making good progress
  // — allow more iterations to complete complex multi-step tasks
  if (toolsUsedCount >= 4 && !hasErrors) maxIter += 3;
  
  // If we have errors, we need more attempts to try alternatives
  if (hasErrors) maxIter += 2;
  
  // Cap at 25 to prevent infinite loops
  return Math.min(maxIter, 25);
}

// ============================================================
// TOOL RESULT SUMMARIZATION
// ============================================================

/**
 * Summarizes a tool result to fit within a token budget.
 * Keeps the most important information while reducing token usage.
 */
export function summarizeToolResult(
  toolName: string,
  result: string,
  maxTokens: number = 2000
): string {
  // Rough token estimate: 1 token ≈ 4 characters
  const maxChars = maxTokens * 4;
  
  if (result.length <= maxChars) return result;
  
  try {
    const parsed = JSON.parse(result);
    
    // Tool-specific summarization strategies
    switch (toolName) {
      case "web_fetch": {
        // Keep title, description, and first N chars of content
        const summary: any = {
          url: parsed.url,
          title: parsed.title,
          description: parsed.description,
          contentLength: parsed.contentLength,
          fetched: parsed.fetched,
        };
        if (parsed.textContent) {
          summary.textContent = parsed.textContent.substring(0, maxChars - 500);
          summary.truncated = true;
        }
        if (parsed.indicators) summary.indicators = parsed.indicators;
        return JSON.stringify(summary);
      }
      
      case "web_search": {
        // Keep top 5 results with truncated snippets
        const results = (parsed.results || []).slice(0, 5).map((r: any) => ({
          name: r.name,
          url: r.url,
          snippet: r.snippet?.substring(0, 200),
        }));
        return JSON.stringify({ query: parsed.query, results, source: parsed.source, truncated: true });
      }
      
      case "grep_code": {
        // Keep first 20 results
        const results = (parsed.results || []).slice(0, 20);
        return JSON.stringify({ ...parsed, results, truncated: true });
      }
      
      case "tree_view": {
        // Truncate tree string
        if (parsed.tree && parsed.tree.length > maxChars) {
          return JSON.stringify({
            ...parsed,
            tree: parsed.tree.substring(0, maxChars - 200) + "\n... (truncated)",
            truncated: true,
          });
        }
        return result;
      }
      
      case "read_file": {
        // Truncate file content
        if (parsed.content && parsed.content.length > maxChars - 200) {
          return JSON.stringify({
            path: parsed.path,
            content: parsed.content.substring(0, maxChars - 200),
            truncated: true,
            totalLength: parsed.content.length,
          });
        }
        return result;
      }
      
      default: {
        // Generic: truncate the JSON string
        const truncated = result.substring(0, maxChars);
        try {
          // Try to return valid JSON
          const partial = JSON.parse(truncated + (truncated.endsWith("}") ? "" : "}"));
          return JSON.stringify({ ...partial, truncated: true });
        } catch {
          return truncated + "\n... [result truncated to save tokens]";
        }
      }
    }
  } catch {
    // Not JSON — just truncate the string
    return result.substring(0, maxChars) + (result.length > maxChars ? "\n... [result truncated]" : "");
  }
}

// ============================================================
// ENHANCED TASK DECOMPOSITION
// ============================================================

/**
 * Analyzes a task and decomposes it into groups of sub-tasks that can be
 * executed in parallel. This enables the agent to be more efficient by
 * running independent tool calls simultaneously.
 */
export interface TaskDecomposition {
  groups: SubTaskGroup[];
  totalSteps: number;
  estimatedIterations: number;
  parallelizable: boolean;
}

export interface SubTaskGroup {
  id: number;
  description: string;
  tools: string[];
  dependsOn: number[]; // IDs of groups that must complete first
  canParallelize: boolean;
}

export function decomposeTask(
  prompt: string,
  availableTools: string[]
): TaskDecomposition {
  const lower = prompt.toLowerCase();
  const groups: SubTaskGroup[] = [];
  let groupIdx = 0;
  
  // Detect web research tasks
  if (/research|investigate|find (?:out|information)|look up|search|analyze (?:website|url|page)/i.test(lower)) {
    groups.push({
      id: groupIdx++,
      description: "Gather information from web",
      tools: ["web_search", "web_fetch", "http_request"],
      dependsOn: [],
      canParallelize: true,
    });
    groups.push({
      id: groupIdx++,
      description: "Analyze and synthesize findings",
      tools: [],
      dependsOn: [0],
      canParallelize: false,
    });
  }
  
  // Detect code analysis tasks
  if (/analyze|review|debug|fix|refactor|improve|optimize/i.test(lower)) {
    if (/file|code|function|class|component|module/i.test(lower)) {
      groups.push({
        id: groupIdx++,
        description: "Read and understand code structure",
        tools: ["tree_view", "read_file", "grep_code", "code_analysis"],
        dependsOn: groups.length > 0 ? [groups.length - 1] : [],
        canParallelize: true,
      });
      groups.push({
        id: groupIdx++,
        description: "Identify issues and propose fixes",
        tools: [],
        dependsOn: [groups.length - 1],
        canParallelize: false,
      });
    }
  }
  
  // Detect multi-step creation tasks
  if (/build|create|develop|implement|write|generate/i.test(lower)) {
    groups.push({
      id: groupIdx++,
      description: "Plan and gather requirements",
      tools: ["web_search", "web_fetch", "read_file"],
      dependsOn: groups.length > 0 ? [groups.length - 1] : [],
      canParallelize: true,
    });
    groups.push({
      id: groupIdx++,
      description: "Create implementation",
      tools: ["write_file", "search_replace"],
      dependsOn: [groups.length - 1],
      canParallelize: false,
    });
    groups.push({
      id: groupIdx++,
      description: "Verify implementation",
      tools: ["read_file", "code_analysis", "grep_code"],
      dependsOn: [groups.length - 1],
      canParallelize: true,
    });
  }
  
  // Default: single group
  if (groups.length === 0) {
    groups.push({
      id: 0,
      description: "Execute task",
      tools: availableTools,
      dependsOn: [],
      canParallelize: true,
    });
  }
  
  const totalSteps = groups.length;
  const parallelGroups = groups.filter(g => g.canParallelize).length;
  const estimatedIterations = totalSteps - Math.floor(parallelGroups / 2);
  
  return {
    groups,
    totalSteps,
    estimatedIterations: Math.max(estimatedIterations, 2),
    parallelizable: parallelGroups > 1,
  };
}

// ============================================================
// PROMPT OPTIMIZATION FOR EFFICIENCY
// ============================================================

/**
 * Optimizes a user prompt to be more effective for LLM processing.
 * Adds structure, removes redundancy, and enhances clarity.
 */
export function optimizePromptForAgent(prompt: string): {
  optimizedPrompt: string;
  optimizations: string[];
} {
  const optimizations: string[] = [];
  let optimized = prompt;
  
  // 1. If prompt is very short, expand it to be more specific
  if (prompt.length < 20) {
    optimized = `${prompt}\n\nPlease provide a comprehensive and detailed response. Include step-by-step explanations and examples where appropriate.`;
    optimizations.push("Expanded short prompt for better results");
  }
  
  // 2. Add output format specification if the user asks for analysis
  if (/analyze|review|compare|evaluate/i.test(prompt) && !/format|structure|layout/i.test(prompt)) {
    optimized += "\n\n[Format your response with clear sections: Summary, Key Findings, Detailed Analysis, and Recommendations]";
    optimizations.push("Added structured output format");
  }
  
  // 3. Add verification instruction for code tasks
  if (/write|create|build|implement|code|function/i.test(prompt) && !/verif|test|check/i.test(prompt)) {
    optimized += "\n\n[After writing code, verify it by reading it back and checking for syntax errors]";
    optimizations.push("Added self-verification instruction");
  }
  
  // 4. For web research tasks, add multi-source instruction
  if (/search|find|research|look up/i.test(prompt) && !/multiple|several|various/i.test(prompt)) {
    optimized += "\n\n[Use multiple search queries and cross-reference information from different sources]";
    optimizations.push("Added multi-source verification instruction");
  }
  
  return { optimizedPrompt: optimized, optimizations };
}

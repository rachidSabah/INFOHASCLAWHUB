/**
 * ClawHub Intelligent Model Router
 * 
 * Automatically selects the best AI model for each task based on:
 * 1. Task type and complexity
 * 2. Model capabilities (reasoning, coding, speed, context window)
 * 3. Cost efficiency
 * 4. Historical performance
 * 
 * This makes every agent smarter by routing to the model that's
 * best suited for the specific task at hand.
 */

export interface ModelProfile {
  id: string;
  name: string;
  provider: string;
  strengths: string[];
  weaknesses: string[];
  contextWindow: number;
  supportsToolCalling: boolean;
  supportsThinking: boolean;
  supportsVision: boolean;
  speed: "fast" | "medium" | "slow";
  costTier: "free" | "low" | "medium" | "high";
  maxTokens: number;
  preferredFor: string[];
  avoidFor: string[];
}

export interface RoutingDecision {
  selectedModel: string;
  reasoning: string;
  alternatives: string[];
  confidence: number;
  taskType: TaskType;
  complexity: "simple" | "moderate" | "complex" | "critical";
}

export type TaskType = 
  | "coding" | "debugging" | "code_review" | "refactoring"
  | "reasoning" | "math" | "logic" | "analysis"
  | "research" | "web_search" | "fact_check"
  | "creative" | "writing" | "brainstorming"
  | "data_analysis" | "visualization" | "statistics"
  | "system_admin" | "file_operations" | "deployment"
  | "conversation" | "general" | "question_answering";

/**
 * Known model profiles with their capabilities.
 * Updated regularly as new models are released.
 */
export const MODEL_PROFILES: Record<string, ModelProfile> = {
  "deepseek-r1": {
    id: "deepseek-r1", name: "DeepSeek R1", provider: "deepseek",
    strengths: ["reasoning", "math", "logic", "analysis", "coding"],
    weaknesses: ["speed", "creative_writing"],
    contextWindow: 64000, supportsToolCalling: true, supportsThinking: true, supportsVision: false,
    speed: "slow", costTier: "low", maxTokens: 8192,
    preferredFor: ["reasoning", "math", "complex_analysis", "debugging"],
    avoidFor: ["creative_writing", "fast_response"],
  },
  "deepseek-chat": {
    id: "deepseek-chat", name: "DeepSeek Chat", provider: "deepseek",
    strengths: ["coding", "general", "analysis", "reasoning"],
    weaknesses: ["creative"],
    contextWindow: 64000, supportsToolCalling: true, supportsThinking: false, supportsVision: false,
    speed: "fast", costTier: "low", maxTokens: 8192,
    preferredFor: ["coding", "debugging", "general", "analysis"],
    avoidFor: ["creative_writing"],
  },
  "deepseek-coder": {
    id: "deepseek-coder", name: "DeepSeek Coder", provider: "deepseek",
    strengths: ["coding", "debugging", "refactoring", "code_review"],
    weaknesses: ["creative", "general_knowledge"],
    contextWindow: 64000, supportsToolCalling: true, supportsThinking: false, supportsVision: false,
    speed: "fast", costTier: "low", maxTokens: 8192,
    preferredFor: ["coding", "debugging", "code_review", "refactoring"],
    avoidFor: ["creative", "research"],
  },
  "gemini-2.5-pro": {
    id: "gemini-2.5-pro", name: "Gemini 2.5 Pro", provider: "google",
    strengths: ["reasoning", "coding", "multimodal", "long_context", "analysis", "creative"],
    weaknesses: ["cost"],
    contextWindow: 1000000, supportsToolCalling: true, supportsThinking: true, supportsVision: true,
    speed: "medium", costTier: "medium", maxTokens: 16384,
    preferredFor: ["reasoning", "analysis", "coding", "research", "long_context"],
    avoidFor: ["fast_response"],
  },
  "gemini-2.5-flash": {
    id: "gemini-2.5-flash", name: "Gemini 2.5 Flash", provider: "google",
    strengths: ["fast_response", "coding", "general", "tool_use"],
    weaknesses: ["deep_reasoning"],
    contextWindow: 1000000, supportsToolCalling: true, supportsThinking: false, supportsVision: true,
    speed: "fast", costTier: "low", maxTokens: 8192,
    preferredFor: ["coding", "general", "fast_response", "tool_use"],
    avoidFor: ["complex_reasoning"],
  },
  "gemini-2.0-flash": {
    id: "gemini-2.0-flash", name: "Gemini 2.0 Flash", provider: "google",
    strengths: ["fast_response", "general", "tool_use"],
    weaknesses: ["reasoning", "coding"],
    contextWindow: 1000000, supportsToolCalling: true, supportsThinking: false, supportsVision: true,
    speed: "fast", costTier: "free", maxTokens: 8192,
    preferredFor: ["general", "conversation", "question_answering"],
    avoidFor: ["complex_reasoning", "coding"],
  },
  "qwen2.5-coder": {
    id: "qwen2.5-coder", name: "Qwen 2.5 Coder", provider: "qwen",
    strengths: ["coding", "reasoning", "debugging"],
    weaknesses: ["creative", "multimodal"],
    contextWindow: 128000, supportsToolCalling: true, supportsThinking: false, supportsVision: false,
    speed: "fast", costTier: "low", maxTokens: 8192,
    preferredFor: ["coding", "debugging", "refactoring"],
    avoidFor: ["creative", "research"],
  },
  "qwq": {
    id: "qwq", name: "QwQ", provider: "qwen",
    strengths: ["reasoning", "math", "logic"],
    weaknesses: ["tool_calling", "speed"],
    contextWindow: 32000, supportsToolCalling: false, supportsThinking: true, supportsVision: false,
    speed: "slow", costTier: "low", maxTokens: 8192,
    preferredFor: ["reasoning", "math", "logic", "analysis"],
    avoidFor: ["tool_use", "fast_response"],
  },
  "llama-3.1": {
    id: "llama-3.1", name: "Llama 3.1", provider: "meta",
    strengths: ["general", "coding", "reasoning"],
    weaknesses: ["long_context"],
    contextWindow: 128000, supportsToolCalling: true, supportsThinking: false, supportsVision: false,
    speed: "fast", costTier: "free", maxTokens: 4096,
    preferredFor: ["general", "coding", "conversation"],
    avoidFor: ["complex_reasoning"],
  },
  "mistral-large": {
    id: "mistral-large", name: "Mistral Large", provider: "mistral",
    strengths: ["coding", "reasoning", "multilingual"],
    weaknesses: ["cost"],
    contextWindow: 128000, supportsToolCalling: true, supportsThinking: false, supportsVision: false,
    speed: "medium", costTier: "medium", maxTokens: 8192,
    preferredFor: ["coding", "reasoning", "multilingual"],
    avoidFor: ["fast_response", "vision"],
  },
  "codestral": {
    id: "codestral", name: "Codestral", provider: "mistral",
    strengths: ["coding", "code_review", "debugging"],
    weaknesses: ["general", "creative"],
    contextWindow: 32000, supportsToolCalling: true, supportsThinking: false, supportsVision: false,
    speed: "fast", costTier: "low", maxTokens: 8192,
    preferredFor: ["coding", "code_review", "debugging"],
    avoidFor: ["creative", "research"],
  },
};

/**
 * Task type detection patterns.
 * Each pattern maps keywords to a task type.
 */
const TASK_PATTERNS: Array<{ patterns: RegExp[]; type: TaskType; weight: number }> = [
  { patterns: [/code|program|script|function|class|component|api|implement|develop/i], type: "coding", weight: 3 },
  { patterns: [/debug|fix|error|bug|issue|broken|crash|exception|traceback/i], type: "debugging", weight: 4 },
  { patterns: [/review|audit|check code|code quality|lint|smell/i], type: "code_review", weight: 4 },
  { patterns: [/refactor|clean|improve|optimize|simplify|restructure/i], type: "refactoring", weight: 4 },
  { patterns: [/reason|think|logic|deduce|infer|prove|derive/i], type: "reasoning", weight: 3 },
  { patterns: [/math|calcul|equation|formula|solve|integrate|deriv/i], type: "math", weight: 4 },
  { patterns: [/analyz|evaluate|assess|compare|contrast|critiqu/i], type: "analysis", weight: 2 },
  { patterns: [/research|investigate|study|explore|find out|look up/i], type: "research", weight: 3 },
  { patterns: [/search|web|google|bing|duckduckgo/i], type: "web_search", weight: 2 },
  { patterns: [/fact.?check|verify|confirm|validate|truth/i], type: "fact_check", weight: 4 },
  { patterns: [/write|creat|compos|draft|story|poem|essay/i], type: "creative", weight: 3 },
  { patterns: [/brainstorm|ideate|suggest|propose|idea/i], type: "brainstorming", weight: 3 },
  { patterns: [/data|csv|excel|chart|graph|visualiz|dashboard/i], type: "data_analysis", weight: 3 },
  { patterns: [/deploy|server|docker|kubernetes|ci.?cd|infra/i], type: "deployment", weight: 3 },
  { patterns: [/file|directory|folder|path|read|write|move/i], type: "file_operations", weight: 2 },
  { patterns: [/explain|what is|how does|tell me|describe/i], type: "question_answering", weight: 1 },
];

/**
 * Detect the task type from a user prompt.
 */
export function detectTaskType(prompt: string): TaskType {
  const scores: Record<string, number> = {};
  
  for (const { patterns, type, weight } of TASK_PATTERNS) {
    for (const pattern of patterns) {
      if (pattern.test(prompt)) {
        scores[type] = (scores[type] || 0) + weight;
      }
    }
  }
  
  let bestType: TaskType = "general";
  let bestScore = 0;
  
  for (const [type, score] of Object.entries(scores)) {
    if (score > bestScore) {
      bestScore = score;
      bestType = type as TaskType;
    }
  }
  
  return bestType;
}

/**
 * Score a model's suitability for a given task type.
 */
function scoreModelForTask(model: ModelProfile, taskType: TaskType): number {
  let score = 0;
  
  // Direct strength match
  const strengthMap: Record<TaskType, string[]> = {
    coding: ["coding", "reasoning"],
    debugging: ["coding", "reasoning", "debugging"],
    code_review: ["coding", "code_review", "reasoning"],
    refactoring: ["coding", "refactoring", "reasoning"],
    reasoning: ["reasoning", "logic", "analysis"],
    math: ["math", "reasoning", "logic"],
    logic: ["logic", "reasoning"],
    analysis: ["analysis", "reasoning"],
    research: ["general", "reasoning", "research"],
    web_search: ["general", "tool_use"],
    fact_check: ["reasoning", "analysis"],
    creative: ["creative", "reasoning"],
    writing: ["creative", "writing"],
    brainstorming: ["creative", "reasoning"],
    data_analysis: ["analysis", "coding", "reasoning"],
    visualization: ["coding", "analysis"],
    statistics: ["math", "reasoning", "analysis"],
    system_admin: ["coding", "general"],
    file_operations: ["general", "tool_use"],
    deployment: ["coding", "general", "deployment"],
    conversation: ["general", "creative"],
    general: ["general"],
    question_answering: ["general", "reasoning"],
  };
  
  const requiredStrengths = strengthMap[taskType] || ["general"];
  
  for (const strength of requiredStrengths) {
    if (model.strengths.includes(strength)) score += 3;
    if (model.preferredFor.includes(strength)) score += 2;
  }
  
  // Penalize weaknesses
  for (const weakness of model.weaknesses) {
    if (requiredStrengths.some(s => weakness.includes(s))) score -= 2;
  }
  for (const avoid of model.avoidFor) {
    if (requiredStrengths.some(s => avoid.includes(s))) score -= 3;
  }
  
  // Tool calling is critical for agentic tasks
  if (model.supportsToolCalling) score += 2;
  
  // Thinking capability helps with complex tasks
  if (model.supportsThinking && ["reasoning", "math", "analysis", "debugging", "code_review"].includes(taskType)) {
    score += 3;
  }
  
  // Long context helps with code-heavy tasks
  if (["coding", "debugging", "code_review", "refactoring", "data_analysis"].includes(taskType)) {
    if (model.contextWindow >= 128000) score += 1;
  }
  
  return score;
}

/**
 * Route a prompt to the best available model.
 */
export function routeToBestModel(
  prompt: string,
  availableModels: string[],
  priority: "speed" | "quality" | "cost" = "quality"
): RoutingDecision {
  const taskType = detectTaskType(prompt);
  
  // Determine complexity
  let complexity: "simple" | "moderate" | "complex" | "critical" = "moderate";
  if (prompt.length < 50) complexity = "simple";
  else if (prompt.length > 500 && /complex|comprehensive|detailed|thorough/i.test(prompt)) complexity = "complex";
  else if (/critical|urgent|production|security/i.test(prompt)) complexity = "critical";
  
  // Score each available model
  const modelScores: { model: string; score: number; profile?: ModelProfile }[] = [];
  
  for (const modelId of availableModels) {
    const modelLower = modelId.toLowerCase();
    
    // Find matching profile
    let profile: ModelProfile | undefined;
    for (const [profileKey, profileValue] of Object.entries(MODEL_PROFILES)) {
      if (modelLower.includes(profileKey) || profileKey.includes(modelLower.split("/").pop() || "")) {
        profile = profileValue;
        break;
      }
    }
    
    if (profile) {
      let score = scoreModelForTask(profile, taskType);
      
      // Apply priority weighting
      if (priority === "speed") {
        if (profile.speed === "fast") score += 3;
        if (profile.speed === "slow") score -= 2;
      } else if (priority === "cost") {
        if (profile.costTier === "free") score += 3;
        if (profile.costTier === "low") score += 2;
        if (profile.costTier === "high") score -= 2;
      } else { // quality
        if (profile.supportsThinking) score += 2;
        if (profile.contextWindow >= 128000) score += 1;
      }
      
      modelScores.push({ model: modelId, score, profile });
    } else {
      // Unknown model — give neutral score
      modelScores.push({ model: modelId, score: 0 });
    }
  }
  
  // Sort by score descending
  modelScores.sort((a, b) => b.score - a.score);
  
  const best = modelScores[0];
  const alternatives = modelScores.slice(1, 3).map(m => m.model);
  
  const reasoning = best.profile
    ? `${best.profile.name} selected: strong in ${best.profile.strengths.slice(0, 3).join(", ")} — ideal for ${taskType} tasks`
    : `Model ${best.model} selected as best available for ${taskType} tasks`;
  
  return {
    selectedModel: best.model,
    reasoning,
    alternatives,
    confidence: Math.min(best.score / 15, 1),
    taskType,
    complexity,
  };
}

/**
 * Get a system prompt addition that's optimized for the detected task type.
 */
export function getTaskSpecificPromptEnhancement(taskType: TaskType): string {
  const enhancements: Record<TaskType, string> = {
    coding: `[CODING EXPERT MODE] Write production-quality code with proper error handling, type safety, and documentation. Follow SOLID principles. After writing code, verify it compiles/has no syntax errors.`,
    debugging: `[DEBUGGING EXPERT MODE] Approach bugs systematically: 1) Reproduce the issue, 2) Identify the root cause, 3) Propose a fix, 4) Verify the fix works. Use read_file and grep_code to trace through code paths.`,
    code_review: `[CODE REVIEW MODE] Review code for: correctness, security, performance, maintainability, and best practices. Provide specific line-by-line feedback with concrete improvement suggestions.`,
    refactoring: `[REFACTORING MODE] Improve code quality while preserving behavior. Focus on: reducing complexity, eliminating duplication, improving naming, and enhancing readability. Use search_replace for targeted edits.`,
    reasoning: `[DEEP REASONING MODE] Think step-by-step. Show your reasoning chain explicitly. Consider multiple hypotheses. Use logical deduction. Verify conclusions with evidence.`,
    math: `[MATHEMATICAL MODE] Show all work step-by-step. Use the calculator tool for verification. Provide exact answers first, then decimal approximations. State assumptions clearly.`,
    logic: `[LOGICAL REASONING MODE] Use formal logic when possible. Identify premises and conclusions. Check for logical fallacies. Consider counter-examples.`,
    analysis: `[ANALYSIS MODE] Break down the problem into components. Analyze each component independently. Synthesize findings into a coherent conclusion. Support claims with evidence.`,
    research: `[RESEARCH MODE] Use web_search and web_fetch to gather information from multiple sources. Cross-reference findings. Distinguish between facts and opinions. Provide citations/URLs.`,
    web_search: `[WEB SEARCH MODE] Use web_search with specific, targeted queries. If first search doesn't yield results, try different keywords. Use web_fetch to get detailed page content.`,
    fact_check: `[FACT-CHECKING MODE] Verify claims using multiple sources. Look for primary sources. Flag unverified claims. Provide confidence levels for each finding.`,
    creative: `[CREATIVE MODE] Be imaginative and original. Generate multiple alternatives. Think outside the box. Provide vivid, engaging content.`,
    writing: `[WRITING MODE] Write clearly and engagingly. Adapt tone to the audience. Use strong verbs and specific nouns. Structure content for readability.`,
    brainstorming: `[BRAINSTORMING MODE] Generate many diverse ideas without judgment first. Then evaluate and rank them. Consider unconventional approaches. Build on ideas synergistically.`,
    data_analysis: `[DATA ANALYSIS MODE] Approach data systematically. Identify patterns, outliers, and trends. Use appropriate statistical methods. Visualize data when possible.`,
    visualization: `[VISUALIZATION MODE] Choose the right chart type for the data. Design for clarity and insight. Use appropriate color schemes. Label axes and legends clearly.`,
    statistics: `[STATISTICS MODE] Use proper statistical methods. State assumptions. Report confidence intervals. Distinguish between statistical and practical significance.`,
    system_admin: `[SYSTEM ADMIN MODE] Be careful with system operations. Check current state before making changes. Have rollback plans. Document all changes.`,
    file_operations: `[FILE OPERATIONS MODE] Read before writing. Use search_replace for targeted edits. Create backups for important files. Verify file paths before operations.`,
    deployment: `[DEPLOYMENT MODE] Plan deployment steps carefully. Test before deploying. Have rollback strategy. Monitor after deployment.`,
    conversation: `[CONVERSATION MODE] Be helpful, friendly, and concise. Engage naturally. Ask clarifying questions when needed.`,
    general: `[GENERAL MODE] Be thorough and helpful. Use tools when they would improve your answer. Provide examples and explanations.`,
    question_answering: `[Q&A MODE] Answer directly and accurately. Provide context and explanations. Use tools to verify uncertain facts. Cite sources when possible.`,
  };
  
  return enhancements[taskType] || enhancements.general;
}

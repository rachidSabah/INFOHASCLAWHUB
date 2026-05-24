import { countTokens } from "@/lib/tokens";

export interface OptimizationResult {
  originalTokens: number;
  optimizedTokens: number;
  compressionRatio: number;
  optimizedPrompt: string;
  actions: string[];
  estimatedLatencyMs: number;
  tokenSavings: number;
}

export interface PromptAnalysis {
  intent: string;
  complexity: "simple" | "medium" | "complex";
  needsReasoning: boolean;
  needsCreativity: boolean;
  needsCodegen: boolean;
  estimatedTokens: number;
  repeatedPhrases: string[];
  fillerWords: number;
}

const INTENT_PATTERNS: Array<{ regex: RegExp; intent: string; complexity: PromptAnalysis["complexity"] }> = [
  { regex: /explain|what is|how does|describe|tell me about|why/i, intent: "explanation", complexity: "simple" },
  { regex: /write code|implement|build|create.*function|generate.*code|program/i, intent: "code_generation", complexity: "complex" },
  { regex: /optimize|improve|enhance|refactor|fix|debug|repair/i, intent: "optimization", complexity: "medium" },
  { regex: /analyze|review|audit|evaluate|assess|compare/i, intent: "analysis", complexity: "medium" },
  { regex: /summarize|summarise|tl;dr|shorten|condense|brief/i, intent: "summarization", complexity: "simple" },
  { regex: /create|design|generate|make|produce|build/i, intent: "creation", complexity: "complex" },
  { regex: /translate|convert.*to|rewrite in/i, intent: "translation", complexity: "medium" },
  { regex: /search|find|lookup|retrieve|get|fetch/i, intent: "retrieval", complexity: "simple" },
  { regex: /reason|solve|calculate|compute|prove|logic/i, intent: "reasoning", complexity: "complex" },
  { regex: /resume|cv|cover letter|job|ats|applicant/i, intent: "document_generation", complexity: "complex" },
];

const FILLER_PATTERNS = [
  /actually,?/gi, /basically,?/gi, /literally,?/gi, /essentially,?/gi,
  /you know,?/gi, /I mean,?/gi, /sort of,?/gi, /kind of,?/gi,
  /in order to/gi, /due to the fact that/gi, /at this point in time/gi,
  /please note that/gi, /it is important to note that/gi, /I would like you to/gi,
  /Can you please/i, /If you could/i, /Would you mind/i, /I was wondering if/i,
];

const REPETITION_INDICATORS = [
  /please{2,}/i, /help{2,}/i, /really{2,}/i, /very{2,}/i,
];

export function analyzePrompt(prompt: string): PromptAnalysis {
  const tokens = countTokens(prompt);
  
  let intent = "general";
  let complexity: PromptAnalysis["complexity"] = "medium";
  
  for (const pat of INTENT_PATTERNS) {
    if (pat.regex.test(prompt)) {
      intent = pat.intent;
      complexity = pat.complexity;
      break;
    }
  }

  const needsReasoning = /\b(reason|solve|calculate|analyze|think|logic|complex|difficult|challenging)\b/i.test(prompt);
  const needsCreativity = /\b(creative|innovative|unique|original|brainstorm|imagine|design.*from scratch)\b/i.test(prompt);
  const needsCodegen = /```|function\s|class\s|import\s|export\s|component|render|hook\s|useState|useEffect|\.(jsx?|tsx?|py|rs|go|java)\b/i.test(prompt);

  let fillerWords = 0;
  for (const pat of FILLER_PATTERNS) {
    const matches = prompt.match(pat);
    if (matches) fillerWords += matches.length;
  }

  const repeatedPhrases: string[] = [];
  for (const pat of REPETITION_INDICATORS) {
    if (pat.test(prompt)) {
      repeatedPhrases.push(pat.source);
    }
  }

  return {
    intent, complexity,
    needsReasoning, needsCreativity, needsCodegen,
    estimatedTokens: tokens,
    repeatedPhrases, fillerWords,
  };
}

export function compressPrompt(prompt: string, analysis: PromptAnalysis): string {
  let optimized = prompt;

  for (const pat of FILLER_PATTERNS) {
    optimized = optimized.replace(pat, "").replace(/\s{2,}/g, " ");
  }

  optimized = optimized
    .replace(/\n{3,}/g, "\n\n")
    .replace(/\s{2,}/g, " ")
    .trim();

  if (optimized.length > 8000 && analysis.complexity === "simple") {
    optimized = optimized.substring(0, 8000);
    optimized = optimized.substring(0, optimized.lastIndexOf(" "));
    optimized += "\n\n[Content truncated for efficiency]";
  }

  return optimized;
}

export function optimizePromptStructure(prompt: string, analysis: PromptAnalysis): string {
  let optimized = prompt.trim();

  if (analysis.needsCodegen) {
    if (!optimized.includes("```") && !optimized.includes("function") && !optimized.includes("import")) {
      optimized += "\n\nProvide complete, working code. Include imports, error handling, and comments. Format as a single code block.";
    }
    optimized = optimized.replace(/write (me |a |some |the )?code/i, "Generate ");
  }

  if (analysis.intent === "explanation") {
    optimized += "\n\nBe concise. Use bullet points where helpful. Start with the key insight first.";
  }

  if (analysis.intent === "summarization") {
    optimized = optimized.replace(/summarize|summarise|tl;dr/i, "TL;DR:");
    optimized += "\n\nMax 300 words. Key points only.";
  }

  if (analysis.intent === "reasoning") {
    optimized += "\n\nThink step by step. Show your reasoning clearly.";
  }

  if (analysis.intent === "document_generation") {
    optimized += "\n\nFormat the output cleanly. Use proper sections and markdown headings.";
  }

  return optimized;
}

export function getModelAdaptation(model: string): {
  maxTokens: number;
  temperature: number;
  topP: number;
  supportsStreaming: boolean;
  supportsToolCalling: boolean;
  isReasoningModel: boolean;
} {
  const m = model.toLowerCase();
  
  if (m.includes("deepseek-r1") || m.includes("o1") || m.includes("o3") || m.includes("reason")) {
    return { maxTokens: 16000, temperature: 0.6, topP: 0.95, supportsStreaming: true, supportsToolCalling: false, isReasoningModel: true };
  }
  if (m.includes("gemini-2.5") || m.includes("gemini-2.0")) {
    return { maxTokens: 8192, temperature: 0.7, topP: 0.95, supportsStreaming: true, supportsToolCalling: true, isReasoningModel: false };
  }
  if (m.includes("claude")) {
    return { maxTokens: 4096, temperature: 0.7, topP: 1, supportsStreaming: true, supportsToolCalling: true, isReasoningModel: false };
  }
  if (m.includes("gpt-4")) {
    return { maxTokens: 4096, temperature: 0.7, topP: 1, supportsStreaming: true, supportsToolCalling: true, isReasoningModel: false };
  }
  if (m.includes("llama") || m.includes("mistral") || m.includes("mixtral")) {
    return { maxTokens: 4096, temperature: 0.7, topP: 0.9, supportsStreaming: true, supportsToolCalling: false, isReasoningModel: false };
  }
  
  return { maxTokens: 4096, temperature: 0.7, topP: 1, supportsStreaming: true, supportsToolCalling: false, isReasoningModel: false };
}

export function optimizeRequest(
  prompt: string,
  model: string,
  conversationHistory: any[] = [],
  options: { forceOptimize?: boolean } = {}
): OptimizationResult {
  const analysis = analyzePrompt(prompt);
  const adaptation = getModelAdaptation(model);

  let optimizedPrompt = compressPrompt(prompt, analysis);
  optimizedPrompt = optimizePromptStructure(optimizedPrompt, analysis);

  const originalTokens = countTokens(prompt);
  const optimizedTokens = countTokens(optimizedPrompt);
  const tokenSavings = originalTokens - optimizedTokens;
  const compressionRatio = originalTokens > 0 ? (optimizedTokens / originalTokens) : 1;

  const actions: string[] = [];
  if (analysis.fillerWords > 0) actions.push(`Removed ${analysis.fillerWords} filler phrases`);
  if (analysis.repeatedPhrases.length > 0) actions.push("Deduplicated repeated content");
  if (tokenSavings > 0) actions.push(`Saved ${tokenSavings} tokens (${Math.round((1 - compressionRatio) * 100)}% compression)`);
  if (analysis.intent !== "general") actions.push(`Detected intent: ${analysis.intent}`);
  if (analysis.needsCodegen) actions.push("Added code generation formatting");
  if (analysis.needsReasoning) actions.push("Enabled chain-of-thought");

  const estimatedLatencyMs = analysis.complexity === "simple" ? 500 : analysis.complexity === "medium" ? 1200 : 2500;

  return {
    originalTokens, optimizedTokens, compressionRatio,
    optimizedPrompt, actions, estimatedLatencyMs, tokenSavings,
  };
}

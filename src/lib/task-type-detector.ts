// ============================================================
// Task Type Detector — Classify Prompts for Intelligent Routing
// Determines the optimal model for a given user prompt by
// combining keyword matching, pattern detection, and LLM-based
// classification for ambiguous cases.
// ============================================================

import { db } from '@/lib/db';

// ── Types ────────────────────────────────────────────────────

export type TaskType = 'coding' | 'reasoning' | 'creative' | 'analysis' | 'quick' | 'embedding';

export interface TaskDetectionResult {
  type: TaskType;
  confidence: number; // 0-1
  suggestedModel: string;
  reasoning: string;
  method: 'keyword' | 'pattern' | 'llm' | 'cached';
}

export interface RoutingPreference {
  taskType: TaskType;
  modelId: string;
  priority: number;
  fallbackIds: string[];
  updatedAt: number;
}

// ── Model Mapping ────────────────────────────────────────────

const DEFAULT_MODEL_MAP: Record<TaskType, { primary: string; fallbacks: string[] }> = {
  coding: {
    primary: 'gemini-2.5-pro',
    fallbacks: ['gemini-2.5-flash', 'deepseek-chat', 'claude-sonnet-4'],
  },
  reasoning: {
    primary: 'gemini-3.1-pro',
    fallbacks: ['gemini-2.5-pro', 'deepseek-reasoner', 'gpt-4o'],
  },
  creative: {
    primary: 'gemini-2.5-pro',
    fallbacks: ['gemini-2.5-flash', 'gemini-3.1-pro'],
  },
  analysis: {
    primary: 'gemini-2.5-pro',
    fallbacks: ['gemini-2.5-flash', 'gemini-3.1-pro'],
  },
  quick: {
    primary: 'gemini-2.5-flash',
    fallbacks: ['gemini-2.0-flash', 'llama-3.3-70b'],
  },
  embedding: {
    primary: 'text-embedding-004',
    fallbacks: ['text-embedding-3-small'],
  },
};

// ── Keyword Sets ─────────────────────────────────────────────

const CODING_KEYWORDS = new Set([
  'code', 'function', 'class', 'method', 'variable', 'import', 'export',
  'debug', 'fix', 'bug', 'error', 'exception', 'stacktrace', 'traceback',
  'refactor', 'optimize', 'compile', 'build', 'deploy', 'test', 'unit test',
  'api', 'endpoint', 'route', 'middleware', 'component', 'hook', 'render',
  'state', 'props', 'event', 'listener', 'async', 'await', 'promise',
  'database', 'query', 'migration', 'schema', 'model', 'controller',
  'typescript', 'javascript', 'python', 'rust', 'golang', 'java', 'c++',
  'react', 'vue', 'angular', 'nextjs', 'svelte', 'express', 'fastapi',
  'prisma', 'sql', 'nosql', 'redis', 'docker', 'kubernetes', 'ci/cd',
  'git', 'commit', 'branch', 'merge', 'pull request', 'lint', 'format',
  'algorithm', 'data structure', 'binary tree', 'hash map', 'linked list',
  'regex', 'pattern', 'parse', 'serialize', 'deserialize',
  'implement', 'interface', 'abstract', 'generic', 'type', 'interface',
  'module', 'package', 'dependency', 'npm', 'pip', 'cargo',
  'write a', 'create a', 'build a', 'make a', 'add a',
  'how to code', 'code for', 'script', 'snippet', 'boilerplate',
]);

const REASONING_KEYWORDS = new Set([
  'prove', 'proof', 'logic', 'logical', 'reason', 'reasoning', 'deduce',
  'infer', 'inference', 'syllogism', 'paradox', 'fallacy', 'argument',
  'contradiction', 'contrapositive', 'implication', 'necessary', 'sufficient',
  'math', 'mathematics', 'calculus', 'algebra', 'geometry', 'topology',
  'theorem', 'lemma', 'corollary', 'conjecture', 'hypothesis',
  'solve', 'equation', 'formula', 'derivative', 'integral', 'matrix',
  'probability', 'statistics', 'bayesian', 'stochastic', 'optimization',
  'puzzle', 'riddle', 'brain teaser', 'sudoku', 'chess',
  'what if', 'suppose', 'assume', 'given that', 'premise',
  'analytical', 'rigorous', 'formal', 'axiom',
  'first principles', 'break down', 'step by step',
]);

const CREATIVE_KEYWORDS = new Set([
  'write', 'story', 'poem', 'poetry', 'novel', 'fiction', 'creative',
  'imagine', 'invent', 'brainstorm', 'idea', 'ideas', 'suggest',
  'compose', 'lyrics', 'song', 'script', 'screenplay', 'dialogue',
  'character', 'plot', 'narrative', 'setting', 'worldbuilding',
  'blog', 'article', 'essay', 'opinion', 'editorial', 'review',
  'marketing', 'copy', 'slogan', 'tagline', 'headline', 'pitch',
  'design', 'mockup', 'wireframe', 'prototype', 'visual',
  'name', 'rename', 'brand', 'logo', 'color scheme', 'palette',
  'funny', 'humor', 'joke', 'witty', 'clever',
  'metaphor', 'simile', 'analogy', 'vivid', 'descriptive',
  'inspire', 'inspiration', 'muse', 'muse',
  'tell me a', 'create a story', 'write me',
]);

const ANALYSIS_KEYWORDS = new Set([
  'analyze', 'analysis', 'compare', 'comparison', 'contrast', 'evaluate',
  'assess', 'review', 'critique', 'critically', 'examine',
  'summarize', 'summary', 'overview', 'synthesize', 'synthesis',
  'data', 'dataset', 'statistics', 'trend', 'insights', 'report',
  'chart', 'graph', 'visualization', 'dashboard', 'metric', 'kpi',
  'benchmark', 'performance', 'measurement', 'quantify',
  'pros and cons', 'advantages', 'disadvantages', 'trade-offs',
  'swot', 'pestel', 'porter', 'framework', 'methodology',
  'interpret', 'interpretation', 'implication', 'significance',
  'correlation', 'causation', 'regression', 'prediction',
  'explain', 'why did', 'what caused', 'what led to',
  'deep dive', 'breakdown', 'deconstruct',
]);

const QUICK_KEYWORDS = new Set([
  'what is', 'what are', 'who is', 'who are', 'when did', 'where is',
  'define', 'definition', 'meaning of', 'meaning',
  'how many', 'how much', 'how old', 'how far',
  'is it', 'does it', 'can you', 'will it',
  'simple', 'briefly', 'quickly', 'short', 'tl;dr', 'tl dr',
  'yes or no', 'true or false', 'correct',
  'lookup', 'check', 'verify', 'confirm',
  'convert', 'calculate', 'translate',
  'list', 'enumerate', 'name the',
]);

const EMBEDDING_KEYWORDS = new Set([
  'embedding', 'embeddings', 'vector', 'vectors', 'vectorize',
  'vectorize', 'semantic search', 'similarity', 'cosine',
  'embed this', 'generate embedding', 'vector representation',
  'text vector', 'encode text', 'feature extraction',
]);

// ── Pattern Sets (Regex) ─────────────────────────────────────

const CODING_PATTERNS: Array<{ pattern: RegExp; weight: number }> = [
  { pattern: /```[\s\S]*?```/g, weight: 0.9 }, // Code blocks
  { pattern: /\b(function|class|def|fn|pub|private|protected)\s+\w+/g, weight: 0.85 },
  { pattern: /\b(import|from|require|use|include)\s+['"]/g, weight: 0.8 },
  { pattern: /\b(const|let|var|type|interface|enum)\s+\w+/g, weight: 0.75 },
  { pattern: /\b(return|throw|try|catch|finally|await|async)\b/g, weight: 0.7 },
  { pattern: /[{}()\[\];]/g, weight: 0.3 }, // Code-like punctuation
  { pattern: /\b(if|else|for|while|switch|match)\s*[\(\{]/g, weight: 0.7 },
  { pattern: /=>|===|!==|&&|\|\||\?\?|\.\.\./g, weight: 0.65 },
  { pattern: /\bconsole\.(log|error|warn|info)\b/g, weight: 0.8 },
  { pattern: /\b(print|println|System\.out)\b/g, weight: 0.75 },
  { pattern: /\.map\(|\.filter\(|\.reduce\(|\.forEach\(/g, weight: 0.8 },
  { pattern: /\b(SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP)\b/gi, weight: 0.85 },
  { pattern: /<\w+[^>]*>[\s\S]*?<\/\w+>/g, weight: 0.6 }, // HTML/JSX
  { pattern: /\b(git|npm|yarn|pip|cargo|brew)\s+\w+/g, weight: 0.8 },
];

const REASONING_PATTERNS: Array<{ pattern: RegExp; weight: number }> = [
  { pattern: /\b(prove|proof|therefore|thus|hence|qed)\b/gi, weight: 0.85 },
  { pattern: /\b(if and only if|iff|⇔|⟺)\b/g, weight: 0.9 },
  { pattern: /\b(∀|∃|∈|⊂|∪|∩|¬|∧|∨|→|⇒)\b/g, weight: 0.9 }, // Math/logic symbols
  { pattern: /\b(therefore|because|since|given|assume|suppose|let)\b/gi, weight: 0.7 },
  { pattern: /\d+\s*[+\-*/^=]\s*\d+/g, weight: 0.6 }, // Math expressions
  { pattern: /\b(solve for|find x|compute|derive)\b/gi, weight: 0.8 },
  { pattern: /\b(contradiction|contrapositive|induction|recursion)\b/gi, weight: 0.85 },
  { pattern: /\b(premise|conclusion|syllogism|valid|sound)\b/gi, weight: 0.85 },
];

const CREATIVE_PATTERNS: Array<{ pattern: RegExp; weight: number }> = [
  { pattern: /\b(write (me |us )?(a |the )?(story|poem|song|script|letter|essay|blog|article))\b/gi, weight: 0.9 },
  { pattern: /\b(once upon a time|in a (far|distant|magical) land)\b/gi, weight: 0.85 },
  { pattern: /\b(brainstorm|come up with|think of|imagine a|invent a|create a)\b/gi, weight: 0.7 },
  { pattern: /\b(name (for|this)|rename|suggest (names|titles|ideas))\b/gi, weight: 0.75 },
  { pattern: /[""''].*?[""'']/g, weight: 0.3 }, // Creative quotes
];

const ANALYSIS_PATTERNS: Array<{ pattern: RegExp; weight: number }> = [
  { pattern: /\b(compare (and |& )?contrast)\b/gi, weight: 0.9 },
  { pattern: /\b(pros (and|&) cons|advantages (and|&) disadvantages)\b/gi, weight: 0.85 },
  { pattern: /\b(analyze|analyse|evaluate|assess|review|critique)\b/gi, weight: 0.8 },
  { pattern: /\b(summarize|summarise|overview|key points|takeaway)\b/gi, weight: 0.75 },
  { pattern: /\b(SWOT|PESTEL|porter's|five forces)\b/gi, weight: 0.85 },
  { pattern: /\b(trend|insight|pattern|correlation|causation)\b/gi, weight: 0.7 },
];

const EMBEDDING_PATTERNS: Array<{ pattern: RegExp; weight: number }> = [
  { pattern: /\b(generate|create|compute|get)\s+(an?\s+)?embedding\b/gi, weight: 0.95 },
  { pattern: /\bembedding(s)?\b/gi, weight: 0.7 },
  { pattern: /\bvector(ize|ization|s)?\b/gi, weight: 0.65 },
  { pattern: /\bsemantic\s+search\b/gi, weight: 0.6 },
  { pattern: /\bcosine\s+similarity\b/gi, weight: 0.6 },
];

// ── LLM Classification Prompt ────────────────────────────────

const LLM_CLASSIFICATION_PROMPT = `You are a prompt classifier. Classify the following user prompt into exactly ONE of these categories:

- "coding": Code generation, debugging, refactoring, programming tasks
- "reasoning": Logic puzzles, math problems, formal reasoning, proofs
- "creative": Writing, storytelling, brainstorming, content creation
- "analysis": Data analysis, summarization, comparison, evaluation
- "quick": Simple factual questions, lookups, definitions, short answers
- "embedding": Embedding/vector generation requests

USER PROMPT: """{PROMPT}"""

Respond with ONLY a JSON object:
{
  "type": "coding|reasoning|creative|analysis|quick|embedding",
  "confidence": 0.0-1.0,
  "reasoning": "brief explanation of why this category was chosen"
}`;

// ── Cache ────────────────────────────────────────────────────

interface CacheEntry {
  result: TaskDetectionResult;
  timestamp: number;
}

const MAX_CACHE_SIZE = 500;
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

// ============================================================
// TaskTypeDetector — Singleton
// ============================================================

class TaskTypeDetector {
  private cache: Map<string, CacheEntry> = new Map();
  private routingPreferences: Map<TaskType, RoutingPreference> = new Map();
  private preferencesLoaded = false;
  private preferencesLoadPromise: Promise<void> | null = null;

  // ----------------------------------------------------------
  // Detect the task type of a prompt
  // ----------------------------------------------------------
  async detectTaskType(prompt: string): Promise<TaskDetectionResult> {
    const normalizedPrompt = prompt.trim().toLowerCase();

    // Check cache first
    const cached = this.checkCache(normalizedPrompt);
    if (cached) {
      return { ...cached, method: 'cached' };
    }

    // Stage 1: Keyword matching (fast, no API call)
    const keywordResult = this.keywordClassification(normalizedPrompt);
    if (keywordResult.confidence >= 0.8) {
      this.addToCache(normalizedPrompt, keywordResult);
      return keywordResult;
    }

    // Stage 2: Pattern detection (regex)
    const patternResult = this.patternClassification(prompt);
    if (patternResult.confidence >= 0.75) {
      this.addToCache(normalizedPrompt, patternResult);
      return patternResult;
    }

    // Stage 3: Combine keyword + pattern signals
    const combinedResult = this.combineClassifications(keywordResult, patternResult);
    if (combinedResult.confidence >= 0.7) {
      this.addToCache(normalizedPrompt, combinedResult);
      return combinedResult;
    }

    // Stage 4: LLM-based classification (for ambiguous cases)
    const llmResult = await this.llmClassification(prompt);
    this.addToCache(normalizedPrompt, llmResult);
    return llmResult;
  }

  // ----------------------------------------------------------
  // Get the best model for a task type
  // ----------------------------------------------------------
  async getModelForTaskType(type: TaskType): Promise<string> {
    // Load preferences from DB if not already loaded
    await this.ensurePreferencesLoaded();

    // Check for user preference
    const preference = this.routingPreferences.get(type);
    if (preference) {
      return preference.modelId;
    }

    // Check DB for ModelRoute entries
    try {
      const dbRoute = await db.modelRoute.findFirst({
        where: { taskType: type, isEnabled: true },
        orderBy: { priority: 'desc' },
      });
      if (dbRoute) {
        return dbRoute.modelId;
      }
    } catch {
      // DB not available; use defaults
    }

    // Fall back to default model map
    return DEFAULT_MODEL_MAP[type].primary;
  }

  // ----------------------------------------------------------
  // Get fallback model IDs for a task type
  // ----------------------------------------------------------
  async getFallbackModels(type: TaskType): Promise<string[]> {
    await this.ensurePreferencesLoaded();

    // Check for user preference fallbacks
    const preference = this.routingPreferences.get(type);
    if (preference && preference.fallbackIds.length > 0) {
      return preference.fallbackIds;
    }

    // Check DB for fallback routes
    try {
      const dbRoutes = await db.modelRoute.findMany({
        where: { taskType: type, isEnabled: true },
        orderBy: { priority: 'desc' },
        take: 4,
      });
      if (dbRoutes.length > 1) {
        // First route is primary; rest are fallbacks
        const fallbacks = dbRoutes.slice(1).map((r) => r.modelId);
        // Also parse fallbackIds from the primary route
        const primary = dbRoutes[0];
        try {
          const parsedFallbacks = JSON.parse(primary.fallbackIds) as string[];
          if (Array.isArray(parsedFallbacks) && parsedFallbacks.length > 0) {
            return [...new Set([...parsedFallbacks, ...fallbacks])];
          }
        } catch {
          // fallbackIds not valid JSON
        }
        return fallbacks;
      }
    } catch {
      // DB not available
    }

    return DEFAULT_MODEL_MAP[type].fallbacks;
  }

  // ----------------------------------------------------------
  // Update routing preference (learn from user preferences)
  // ----------------------------------------------------------
  async updateRoutingPreference(type: TaskType, modelId: string): Promise<void> {
    await this.ensurePreferencesLoaded();

    const existing = this.routingPreferences.get(type);
    const newPreference: RoutingPreference = {
      taskType: type,
      modelId,
      priority: (existing?.priority ?? 0) + 1,
      fallbackIds: existing?.fallbackIds ?? DEFAULT_MODEL_MAP[type].fallbacks,
      updatedAt: Date.now(),
    };

    // If the old model becomes a fallback
    if (existing && existing.modelId !== modelId) {
      if (!newPreference.fallbackIds.includes(existing.modelId)) {
        newPreference.fallbackIds = [existing.modelId, ...newPreference.fallbackIds].slice(0, 4);
      }
    }

    this.routingPreferences.set(type, newPreference);

    // Persist to DB
    try {
      const existingDb = await db.modelRoute.findFirst({
        where: { taskType: type, isEnabled: true },
        orderBy: { priority: 'desc' },
      });

      if (existingDb) {
        // Update existing route
        await db.modelRoute.update({
          where: { id: existingDb.id },
          data: {
            modelId,
            priority: newPreference.priority,
            fallbackIds: JSON.stringify(newPreference.fallbackIds),
          },
        });
      } else {
        // Create new route
        await db.modelRoute.create({
          data: {
            name: `auto-${type}-route`,
            taskType: type,
            modelId,
            priority: newPreference.priority,
            fallbackIds: JSON.stringify(newPreference.fallbackIds),
          },
        });
      }
    } catch (dbError: unknown) {
      console.warn('[TaskTypeDetector] DB persist failed:', dbError instanceof Error ? dbError.message : dbError);
    }
  }

  // ----------------------------------------------------------
  // Private: Keyword-based classification
  // ----------------------------------------------------------
  private keywordClassification(prompt: string): TaskDetectionResult {
    const words = prompt
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 1);

    // Create bigrams for multi-word keywords
    const bigrams: string[] = [];
    for (let i = 0; i < words.length - 1; i++) {
      bigrams.push(`${words[i]} ${words[i + 1]}`);
    }

    const allTokens = [...words, ...bigrams];

    const scores: Record<TaskType, number> = {
      coding: 0,
      reasoning: 0,
      creative: 0,
      analysis: 0,
      quick: 0,
      embedding: 0,
    };

    const keywordSets: Record<TaskType, Set<string>> = {
      coding: CODING_KEYWORDS,
      reasoning: REASONING_KEYWORDS,
      creative: CREATIVE_KEYWORDS,
      analysis: ANALYSIS_KEYWORDS,
      quick: QUICK_KEYWORDS,
      embedding: EMBEDDING_KEYWORDS,
    };

    for (const token of allTokens) {
      for (const [type, keywordSet] of Object.entries(keywordSets)) {
        if (keywordSet.has(token)) {
          scores[type as TaskType] += 1;
        }
      }
    }

    // Normalize by keyword set size to avoid bias toward larger sets
    const setSizes: Record<TaskType, number> = {
      coding: CODING_KEYWORDS.size,
      reasoning: REASONING_KEYWORDS.size,
      creative: CREATIVE_KEYWORDS.size,
      analysis: ANALYSIS_KEYWORDS.size,
      quick: QUICK_KEYWORDS.size,
      embedding: EMBEDDING_KEYWORDS.size,
    };

    for (const type of Object.keys(scores) as TaskType[]) {
      scores[type] = scores[type] / Math.max(1, setSizes[type]) * 10;
    }

    // Find the top type
    const sortedTypes = (Object.keys(scores) as TaskType[]).sort(
      (a, b) => scores[b] - scores[a]
    );

    const topType = sortedTypes[0];
    const topScore = scores[topType];
    const secondScore = scores[sortedTypes[1]];

    // Confidence based on gap between top and second
    const gap = topScore - secondScore;
    const confidence = topScore > 0
      ? Math.min(0.95, 0.5 + gap * 0.5 + Math.min(0.3, topScore * 0.1))
      : 0.2;

    return {
      type: topScore > 0 ? topType : 'quick',
      confidence: Math.max(0.1, Math.min(0.95, confidence)),
      suggestedModel: DEFAULT_MODEL_MAP[topScore > 0 ? topType : 'quick'].primary,
      reasoning: topScore > 0
        ? `Keyword match: ${topType} (score: ${topScore.toFixed(2)}, gap: ${gap.toFixed(2)})`
        : 'No strong keyword match; defaulting to quick',
      method: 'keyword',
    };
  }

  // ----------------------------------------------------------
  // Private: Pattern-based classification
  // ----------------------------------------------------------
  private patternClassification(prompt: string): TaskDetectionResult {
    const scores: Record<TaskType, number> = {
      coding: 0,
      reasoning: 0,
      creative: 0,
      analysis: 0,
      quick: 0,
      embedding: 0,
    };

    const patternSets: Record<TaskType, Array<{ pattern: RegExp; weight: number }>> = {
      coding: CODING_PATTERNS,
      reasoning: REASONING_PATTERNS,
      creative: CREATIVE_PATTERNS,
      analysis: ANALYSIS_PATTERNS,
      quick: [], // No specific patterns for quick — it's the fallback
      embedding: EMBEDDING_PATTERNS,
    };

    for (const [type, patterns] of Object.entries(patternSets)) {
      for (const { pattern, weight } of patterns) {
        const matches = prompt.match(pattern);
        if (matches && matches.length > 0) {
          scores[type as TaskType] += weight * Math.min(matches.length, 3);
        }
      }
    }

    const sortedTypes = (Object.keys(scores) as TaskType[]).sort(
      (a, b) => scores[b] - scores[a]
    );

    const topType = sortedTypes[0];
    const topScore = scores[topType];

    // Confidence based on score magnitude
    const confidence = topScore > 0
      ? Math.min(0.95, 0.4 + Math.min(0.55, topScore * 0.15))
      : 0.1;

    return {
      type: topScore > 0 ? topType : 'quick',
      confidence: Math.max(0.1, confidence),
      suggestedModel: DEFAULT_MODEL_MAP[topScore > 0 ? topType : 'quick'].primary,
      reasoning: topScore > 0
        ? `Pattern match: ${topType} (score: ${topScore.toFixed(2)})`
        : 'No pattern matches; defaulting to quick',
      method: 'pattern',
    };
  }

  // ----------------------------------------------------------
  // Private: Combine keyword + pattern results
  // ----------------------------------------------------------
  private combineClassifications(
    keywordResult: TaskDetectionResult,
    patternResult: TaskDetectionResult
  ): TaskDetectionResult {
    // If both agree, high confidence
    if (keywordResult.type === patternResult.type) {
      const confidence = Math.min(0.95, Math.max(keywordResult.confidence, patternResult.confidence) + 0.15);
      return {
        type: keywordResult.type,
        confidence,
        suggestedModel: DEFAULT_MODEL_MAP[keywordResult.type].primary,
        reasoning: `Both keyword and pattern agree: ${keywordResult.type}`,
        method: 'keyword', // Combined — keyword took part
      };
    }

    // If they disagree, use the one with higher confidence
    const winner = keywordResult.confidence >= patternResult.confidence
      ? keywordResult
      : patternResult;

    const loser = winner === keywordResult ? patternResult : keywordResult;

    // Reduce confidence slightly due to disagreement
    const confidence = Math.max(0.3, winner.confidence - 0.15);

    return {
      type: winner.type,
      confidence,
      suggestedModel: DEFAULT_MODEL_MAP[winner.type].primary,
      reasoning: `Disagreement between keyword (${keywordResult.type}) and pattern (${patternResult.type}); using ${winner.method} (${winner.type})`,
      method: winner.method,
    };
  }

  // ----------------------------------------------------------
  // Private: LLM-based classification
  // ----------------------------------------------------------
  private async llmClassification(prompt: string): Promise<TaskDetectionResult> {
    const classificationPrompt = LLM_CLASSIFICATION_PROMPT.replace('{PROMPT}', prompt);

    try {
      const response = await fetch('http://localhost:3000/api/gemini/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: classificationPrompt,
          model: 'gemini-2.0-flash',
          conversationHistory: [],
        }),
      });

      if (!response.ok) {
        throw new Error(`Chat API returned ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No readable stream');

      const decoder = new TextDecoder();
      let fullText = '';
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed === 'data: [DONE]') continue;
          if (trimmed.startsWith('data: ')) {
            try {
              const data = JSON.parse(trimmed.slice(6));
              if (data.type === 'chunk' && data.content) {
                fullText += data.content;
              }
            } catch {
              // Ignore malformed SSE
            }
          }
        }
      }

      // Parse the JSON response
      const jsonMatch = fullText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        const type = this.validateTaskType(parsed.type);
        const confidence = typeof parsed.confidence === 'number'
          ? Math.max(0, Math.min(1, parsed.confidence))
          : 0.6;
        const reasoning = typeof parsed.reasoning === 'string'
          ? parsed.reasoning
          : 'LLM classification';

        return {
          type,
          confidence,
          suggestedModel: DEFAULT_MODEL_MAP[type].primary,
          reasoning,
          method: 'llm',
        };
      }
    } catch (error: unknown) {
      console.error('[TaskTypeDetector] LLM classification failed:', error instanceof Error ? error.message : error);
    }

    // Fallback: return quick with low confidence
    return {
      type: 'quick',
      confidence: 0.3,
      suggestedModel: DEFAULT_MODEL_MAP.quick.primary,
      reasoning: 'LLM classification unavailable; defaulting to quick',
      method: 'llm',
    };
  }

  // ----------------------------------------------------------
  // Private: Validate task type string
  // ----------------------------------------------------------
  private validateTaskType(value: unknown): TaskType {
    const validTypes: TaskType[] = ['coding', 'reasoning', 'creative', 'analysis', 'quick', 'embedding'];
    if (typeof value === 'string' && validTypes.includes(value as TaskType)) {
      return value as TaskType;
    }
    return 'quick';
  }

  // ----------------------------------------------------------
  // Private: Cache management
  // ----------------------------------------------------------
  private checkCache(normalizedPrompt: string): TaskDetectionResult | null {
    const entry = this.cache.get(normalizedPrompt);
    if (entry && Date.now() - entry.timestamp < CACHE_TTL_MS) {
      return entry.result;
    }
    if (entry) {
      this.cache.delete(normalizedPrompt);
    }
    return null;
  }

  private addToCache(normalizedPrompt: string, result: TaskDetectionResult): void {
    // Evict oldest entries if cache is full
    if (this.cache.size >= MAX_CACHE_SIZE) {
      const oldest = this.cache.keys().next().value;
      if (oldest) this.cache.delete(oldest);
    }

    this.cache.set(normalizedPrompt, {
      result,
      timestamp: Date.now(),
    });
  }

  // ----------------------------------------------------------
  // Private: Load routing preferences from DB
  // ----------------------------------------------------------
  private async ensurePreferencesLoaded(): Promise<void> {
    if (this.preferencesLoaded) return;

    if (this.preferencesLoadPromise) {
      await this.preferencesLoadPromise;
      return;
    }

    this.preferencesLoadPromise = this.loadPreferencesFromDb();
    await this.preferencesLoadPromise;
  }

  private async loadPreferencesFromDb(): Promise<void> {
    try {
      const routes = await db.modelRoute.findMany({
        where: { isEnabled: true },
        orderBy: { priority: 'desc' },
      });

      for (const route of routes) {
        const taskType = this.validateTaskType(route.taskType);
        let fallbackIds: string[] = [];
        try {
          fallbackIds = JSON.parse(route.fallbackIds) as string[];
          if (!Array.isArray(fallbackIds)) fallbackIds = [];
        } catch {
          fallbackIds = [];
        }

        // Only keep the highest-priority route per task type
        const existing = this.routingPreferences.get(taskType);
        if (!existing || route.priority > existing.priority) {
          this.routingPreferences.set(taskType, {
            taskType,
            modelId: route.modelId,
            priority: route.priority,
            fallbackIds,
            updatedAt: route.updatedAt.getTime(),
          });
        }
      }
    } catch (dbError: unknown) {
      console.warn('[TaskTypeDetector] DB preferences load failed:', dbError instanceof Error ? dbError.message : dbError);
    }

    this.preferencesLoaded = true;
  }

  // ----------------------------------------------------------
  // Utility: Get all current routing preferences
  // ----------------------------------------------------------
  getRoutingPreferences(): Map<TaskType, RoutingPreference> {
    return new Map(this.routingPreferences);
  }

  // ----------------------------------------------------------
  // Utility: Get cache stats
  // ----------------------------------------------------------
  getCacheStats(): { size: number; maxSize: number; hitRate: number } {
    return {
      size: this.cache.size,
      maxSize: MAX_CACHE_SIZE,
      hitRate: 0, // Would need counter tracking for real hit rate
    };
  }

  // ----------------------------------------------------------
  // Utility: Clear cache
  // ----------------------------------------------------------
  clearCache(): void {
    this.cache.clear();
  }

  // ----------------------------------------------------------
  // Utility: Reset preferences (force reload from DB)
  // ----------------------------------------------------------
  resetPreferences(): void {
    this.routingPreferences.clear();
    this.preferencesLoaded = false;
    this.preferencesLoadPromise = null;
  }
}

// ============================================================
// Singleton via globalThis
// ============================================================

const globalForTaskTypeDetector = globalThis as unknown as {
  taskTypeDetector: TaskTypeDetector | undefined;
};

export function getTaskTypeDetector(): TaskTypeDetector {
  if (!globalForTaskTypeDetector.taskTypeDetector) {
    globalForTaskTypeDetector.taskTypeDetector = new TaskTypeDetector();
  }
  return globalForTaskTypeDetector.taskTypeDetector;
}

export { TaskTypeDetector };

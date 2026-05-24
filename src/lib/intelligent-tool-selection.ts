/**
 * Intelligent Tool Selection
 *
 * Before calling the LLM, analyzes the prompt and pre-selects relevant tools.
 * Only sends tool definitions for tools that are relevant to the current task.
 * This reduces token usage and helps models focus on the right tools.
 * Includes tool relevance scoring based on prompt keywords.
 */

import { getToolsPrompt, getMcpTools, getGeminiFunctionDeclarations, getOpenAIToolsDefinitions } from "@/lib/tools";

// ── Types ──────────────────────────────────────────────────────────────────

export interface ToolRelevanceScore {
  toolName: string;
  score: number;
  matchedKeywords: string[];
  category: string;
}

export interface ToolSelectionResult {
  selectedTools: string[];
  excludedTools: string[];
  relevanceScores: ToolRelevanceScore[];
  tokenSavings: number;
  reasoning: string;
}

// ── Tool Categories & Keywords ────────────────────────────────────────────

interface ToolProfile {
  name: string;
  category: string;
  keywords: string[];
  description: string;
  estimatedTokens: number;
}

const TOOL_PROFILES: ToolProfile[] = [
  {
    name: "web_search",
    category: "web",
    keywords: ["search", "find", "look up", "google", "lookup", "information", "latest", "news", "current", "recent", "what is", "who is", "where is", "how to", "tutorial"],
    description: "Search the web for information",
    estimatedTokens: 150,
  },
  {
    name: "web_fetch",
    category: "web",
    keywords: ["website", "web page", "url", "fetch", "scrape", "download", "visit", "browse", "page", "site", "http", "https", "analyze website", "review site"],
    description: "Fetch and extract content from a URL",
    estimatedTokens: 150,
  },
  {
    name: "read_file",
    category: "filesystem",
    keywords: ["read", "file", "open", "view", "show", "display", "content", "code", "source", "cat", "examine", "inspect"],
    description: "Read the contents of a file",
    estimatedTokens: 120,
  },
  {
    name: "write_file",
    category: "filesystem",
    keywords: ["write", "create", "save", "new file", "generate", "output", "export", "produce", "make file"],
    description: "Create or overwrite a file with content",
    estimatedTokens: 140,
  },
  {
    name: "search_replace",
    category: "filesystem",
    keywords: ["replace", "edit", "modify", "change", "update", "fix", "patch", "alter", "refactor", "rename"],
    description: "Search and replace text in a file",
    estimatedTokens: 140,
  },
  {
    name: "list_files",
    category: "filesystem",
    keywords: ["list", "directory", "folder", "files", "ls", "dir", "contents", "structure", "what files"],
    description: "List files and directories",
    estimatedTokens: 100,
  },
  {
    name: "tree_view",
    category: "filesystem",
    keywords: ["tree", "structure", "project", "hierarchy", "layout", "architecture", "organization", "map"],
    description: "View directory tree structure",
    estimatedTokens: 100,
  },
  {
    name: "grep_code",
    category: "code",
    keywords: ["grep", "search", "find", "pattern", "regex", "match", "occurrence", "where is", "locate"],
    description: "Search for patterns in code files",
    estimatedTokens: 120,
  },
  {
    name: "code_analysis",
    category: "code",
    keywords: ["analyze", "review", "audit", "security", "quality", "bug", "issue", "problem", "lint", "check", "static analysis"],
    description: "Analyze code for bugs, security issues, and improvements",
    estimatedTokens: 130,
  },
  {
    name: "local_cmd",
    category: "system",
    keywords: ["command", "run", "execute", "shell", "terminal", "bash", "script", "process", "system", "cli", "install", "npm", "pip", "git"],
    description: "Execute a local system command",
    estimatedTokens: 120,
  },
  {
    name: "git_status",
    category: "system",
    keywords: ["git", "status", "commit", "branch", "diff", "changes", "unstaged", "staged", "repository", "version control"],
    description: "Get git repository status",
    estimatedTokens: 100,
  },
  {
    name: "diff_files",
    category: "code",
    keywords: ["diff", "compare", "difference", "contrast", "versus", "changes", "between"],
    description: "Compare two files or versions",
    estimatedTokens: 110,
  },
  {
    name: "http_request",
    category: "web",
    keywords: ["api", "request", "http", "rest", "endpoint", "post", "get", "put", "delete", "fetch", "call", "curl"],
    description: "Make HTTP requests to APIs",
    estimatedTokens: 140,
  },
  {
    name: "memory_save",
    category: "memory",
    keywords: ["remember", "save", "store", "note", "persist", "keep", "memory", "preference"],
    description: "Save information to persistent memory",
    estimatedTokens: 80,
  },
  {
    name: "memory_recall",
    category: "memory",
    keywords: ["recall", "remember", "retrieve", "find memory", "stored", "saved", "previous", "history"],
    description: "Retrieve information from persistent memory",
    estimatedTokens: 80,
  },
];

// ── Core Functions ────────────────────────────────────────────────────────

/**
 * Score tool relevance based on prompt keywords.
 * Returns scores sorted by relevance (highest first).
 */
export function scoreToolRelevance(prompt: string): ToolRelevanceScore[] {
  const promptLower = prompt.toLowerCase();
  const promptWords = promptLower.split(/\s+/).filter(w => w.length > 2);
  
  const scores: ToolRelevanceScore[] = TOOL_PROFILES.map(profile => {
    let score = 0;
    const matchedKeywords: string[] = [];
    
    // Check each keyword against the prompt
    for (const keyword of profile.keywords) {
      if (promptLower.includes(keyword)) {
        // Exact multi-word match gets higher score
        const wordCount = keyword.split(/\s+/).length;
        const matchScore = wordCount > 1 ? 15 : 8;
        score += matchScore;
        matchedKeywords.push(keyword);
      }
    }
    
    // Also check individual prompt words against tool name
    for (const word of promptWords) {
      if (profile.name.includes(word) || profile.category.includes(word)) {
        score += 5;
      }
    }
    
    // Category-level matching
    if (promptLower.includes("code") && profile.category === "code") score += 3;
    if (promptLower.includes("file") && profile.category === "filesystem") score += 3;
    if ((promptLower.includes("web") || promptLower.includes("internet")) && profile.category === "web") score += 3;
    if (promptLower.includes("system") && profile.category === "system") score += 3;
    
    return {
      toolName: profile.name,
      score,
      matchedKeywords,
      category: profile.category,
    };
  });
  
  return scores.sort((a, b) => b.score - a.score);
}

/**
 * Select relevant tools based on prompt analysis.
 * Always includes certain "universal" tools, and adds specialized tools
 * based on relevance scores.
 */
export function selectRelevantTools(
  prompt: string,
  minRelevanceScore: number = 5,
  maxTools: number = 10
): ToolSelectionResult {
  const scores = scoreToolRelevance(prompt);
  
  // Tools that are always available (they're too fundamental to exclude)
  const universalTools = new Set([
    "web_search",
    "read_file",
    "write_file",
    "list_files",
    "local_cmd",
  ]);
  
  const selectedTools: string[] = [];
  const excludedTools: string[] = [];
  let tokenSavings = 0;
  
  for (const scoreResult of scores) {
    if (
      universalTools.has(scoreResult.toolName) ||
      scoreResult.score >= minRelevanceScore
    ) {
      if (selectedTools.length < maxTools) {
        selectedTools.push(scoreResult.toolName);
      }
    } else {
      excludedTools.push(scoreResult.toolName);
      const profile = TOOL_PROFILES.find(p => p.name === scoreResult.toolName);
      tokenSavings += profile?.estimatedTokens || 100;
    }
  }
  
  // Generate reasoning for the selection
  const topRelevant = scores.filter(s => s.score >= minRelevanceScore && !universalTools.has(s.toolName));
  const reasoningParts: string[] = [];
  
  if (topRelevant.length > 0) {
    reasoningParts.push(
      `Selected specialized tools based on prompt: ${topRelevant
        .map(t => `${t.toolName} (score: ${t.score}, matched: ${t.matchedKeywords.slice(0, 3).join(", ")})`)
        .join("; ")}`
    );
  }
  
  if (excludedTools.length > 0) {
    reasoningParts.push(`Excluded irrelevant tools: ${excludedTools.join(", ")} (saved ~${tokenSavings} tokens)`);
  }
  
  return {
    selectedTools,
    excludedTools,
    relevanceScores: scores,
    tokenSavings,
    reasoning: reasoningParts.join(". "),
  };
}

/**
 * Get filtered tool definitions for OpenAI-compatible providers.
 * Only includes tools that are relevant to the current prompt.
 */
export async function getFilteredOpenAITools(
  prompt: string,
  maxTools: number = 10
): Promise<{ tools: any[]; selection: ToolSelectionResult }> {
  const selection = selectRelevantTools(prompt, 5, maxTools);
  
  try {
    const allTools = await getOpenAIToolsDefinitions();
    const filteredTools = allTools.filter((tool: any) => {
      const toolName = tool.function?.name || "";
      return selection.selectedTools.includes(toolName);
    });
    
    return { tools: filteredTools.length > 0 ? filteredTools : allTools, selection };
  } catch {
    // If filtering fails, return all tools
    const allTools = await getOpenAIToolsDefinitions();
    return { tools: allTools, selection };
  }
}

/**
 * Get filtered function declarations for Gemini providers.
 * Only includes tools that are relevant to the current prompt.
 */
export async function getFilteredGeminiFunctions(
  prompt: string,
  maxTools: number = 10
): Promise<{ declarations: any[]; selection: ToolSelectionResult }> {
  const selection = selectRelevantTools(prompt, 5, maxTools);
  
  try {
    const allDeclarations = await getGeminiFunctionDeclarations();
    const filteredDeclarations = allDeclarations.filter((decl: any) => {
      const toolName = decl.name || "";
      return selection.selectedTools.includes(toolName);
    });
    
    return { declarations: filteredDeclarations.length > 0 ? filteredDeclarations : allDeclarations, selection };
  } catch {
    const allDeclarations = await getGeminiFunctionDeclarations();
    return { declarations: allDeclarations, selection };
  }
}

/**
 * Get a filtered tools prompt that only includes relevant tools.
 */
export function getFilteredToolsPrompt(
  prompt: string,
  fullToolsPrompt: string
): { prompt: string; selection: ToolSelectionResult } {
  const selection = selectRelevantTools(prompt, 5, 10);
  
  // If most tools are selected, just return the full prompt
  if (selection.selectedTools.length >= TOOL_PROFILES.length - 2) {
    return { prompt: fullToolsPrompt, selection };
  }
  
  // Otherwise, build a filtered version
  const selectedProfiles = TOOL_PROFILES.filter(p => selection.selectedTools.includes(p.name));
  const toolLines = selectedProfiles.map(p => `- **${p.name}**: ${p.description}`);
  
  const filteredPrompt = `[AVAILABLE TOOLS]\n${toolLines.join("\n")}\n\nUse these tools via the tool_call format or XML tags.`;
  
  return { prompt: filteredPrompt, selection };
}

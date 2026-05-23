/**
 * Prompt Router - Automatically analyzes user prompts and determines
 * the best agent and skills to use for the task.
 * This makes ClawHub models act like specialized agents instead of generic chatbots.
 */

interface RoutingResult {
  agentType: string;
  skills: string[];
  systemPromptAddition: string;
  toolPriority: string[];
}

const PROMPT_PATTERNS: Array<{
  patterns: RegExp[];
  agentType: string;
  skills: string[];
  systemPromptAddition: string;
  toolPriority: string[];
}> = [
  {
    patterns: [
      /(?:scan|analyze|review|audit|check)\s+(?:this|a|the)?\s*(?:website|site|web\s*page|url|domain)/i,
      /(?:redesign|rebuild|remake|improve)\s+(?:a|the|this)?\s*(?:website|site|web\s*page|wordpress)/i,
      /(?:build|create|make|design)\s+(?:a|the)?\s*(?:website|web\s*app|landing\s*page|wordpress\s*theme)/i,
    ],
    agentType: "web-analyst",
    skills: ["web_fetch", "web_search", "http_request", "read_file", "write_file", "search_replace", "local_cmd"],
    systemPromptAddition: `[WEB ANALYSIS MODE]
You are operating in Web Analysis mode. Your job is to:
1. FIRST use web_fetch to get the actual page content - NEVER skip this step
2. If web_fetch fails, try http_request with different headers/user-agent
3. If the main URL fails, try common variations (http vs https, with/without www, /wp-json/wp/v2/pages endpoint for WordPress)
4. Analyze the ACTUAL content you fetched - be specific about what you found
5. Provide COMPLETE, actionable recommendations with code examples
NEVER say "I can't access" without trying at least 3 different approaches.`,
    toolPriority: ["web_fetch", "http_request", "web_search", "read_file", "write_file"],
  },
  {
    patterns: [
      /(?:write|create|build|generate|implement)\s+(?:a|the|some)?\s*(?:code|script|function|component|module|app|application)/i,
      /(?:fix|debug|solve|resolve|patch)\s+(?:the|a|this)?\s*(?:bug|error|issue|problem)/i,
      /(?:refactor|optimize|improve|enhance)\s+(?:the|this)?\s*(?:code|function|component)/i,
    ],
    agentType: "coder",
    skills: ["read_file", "write_file", "search_replace", "append_file", "diff_files", "list_files", "grep_code", "tree_view", "code_analysis", "git_status", "local_cmd"],
    systemPromptAddition: `[CODING MODE]
You are operating in Coding mode. Your job is to:
1. Use tree_view to understand project structure first
2. Read existing code with read_file or grep_code before making changes
3. Write COMPLETE, production-quality code
4. Use search_replace for targeted edits to existing files
5. Use write_file only for new files
6. After writing code, verify with code_analysis and read it back
7. Check git_status to understand what changed
8. Always include error handling, proper types, and documentation`,
    toolPriority: ["tree_view", "grep_code", "read_file", "write_file", "search_replace", "code_analysis", "git_status", "list_files", "local_cmd"],
  },
  {
    patterns: [
      /(?:search|find|look\s*up|research|investigate)\s+(?:for|about|on|the)?\s*/i,
      /(?:what\s*is|who\s*is|when\s*did|where\s*is|how\s*does|why\s*does)/i,
      /(?:latest|current|recent|today|now)\s+(?:news|info|data|updates)/i,
    ],
    agentType: "researcher",
    skills: ["web_search", "web_fetch", "http_request", "memory_recall", "memory_save"],
    systemPromptAddition: `[RESEARCH MODE]
You are operating in Research mode. Your job is to:
1. Start with web_search to find relevant information
2. Use web_fetch or http_request to get detailed content from the most promising URLs
3. Cross-reference information from multiple sources
4. Save important findings to memory for future reference
5. Provide comprehensive, well-sourced answers`,
    toolPriority: ["web_search", "web_fetch", "http_request", "memory_recall", "memory_save"],
  },
  {
    patterns: [
      /(?:deploy|setup|install|configure|build|compile)\s+(?:the|a|this)?\s*/i,
      /(?:run|execute|start|launch)\s+(?:the|a|this)?\s*(?:command|script|server|app)/i,
      /(?:docker|kubernetes|nginx|apache|ci\/cd|pipeline)/i,
    ],
    agentType: "devops",
    skills: ["local_cmd", "read_file", "write_file", "get_env_var", "get_system_info", "git_status"],
    systemPromptAddition: `[DEVOPS MODE]
You are operating in DevOps mode. Your job is to:
1. Check system info first with get_system_info
2. Check environment with get_env_var
3. Check repository state with git_status
4. Execute commands with local_cmd
5. Monitor output and handle errors
6. Provide clear status updates`,
    toolPriority: ["local_cmd", "get_system_info", "get_env_var", "git_status", "read_file", "write_file"],
  },
  {
    patterns: [
      /(?:analyze|review|check|audit)\s+(?:the|this|my)?\s*(?:code|source|project|repository|repo|codebase)/i,
      /(?:find|detect|identify)\s+(?:bugs|vulnerabilities|security|issues|problems)/i,
      /(?:code\s*quality|technical\s*debt|code\s*smell)/i,
    ],
    agentType: "code-reviewer",
    skills: ["tree_view", "grep_code", "code_analysis", "read_file", "git_status", "diff_files"],
    systemPromptAddition: `[CODE REVIEW MODE]
You are operating in Code Review mode. Your job is to:
1. Use tree_view to understand the project structure
2. Use grep_code to find patterns, anti-patterns, or specific code
3. Use code_analysis on key files to identify bugs, security issues, and performance problems
4. Use git_status to see recent changes
5. Use read_file for detailed review of specific files
6. Provide a comprehensive review with severity ratings and actionable fixes`,
    toolPriority: ["tree_view", "grep_code", "code_analysis", "read_file", "git_status", "diff_files"],
  },
  {
    patterns: [
      /(?:test|api|endpoint|webhook|rest|graphql|http)/i,
      /(?:post|get|put|delete|patch)\s+(?:request|data|to|from)/i,
      /(?:curl|fetch|axios|http\s*client)/i,
    ],
    agentType: "api-tester",
    skills: ["http_request", "web_fetch", "read_file", "write_file", "local_cmd"],
    systemPromptAddition: `[API TESTING MODE]
You are operating in API Testing mode. Your job is to:
1. Use http_request to make API calls with full control over method, headers, and body
2. Use web_fetch for simpler GET requests or page content
3. Test different HTTP methods, status codes, and response formats
4. Validate responses against expected schemas
5. Report findings including status codes, response times, and data`,
    toolPriority: ["http_request", "web_fetch", "read_file", "write_file", "local_cmd"],
  },
];

export function routePrompt(userPrompt: string): RoutingResult {
  for (const route of PROMPT_PATTERNS) {
    for (const pattern of route.patterns) {
      if (pattern.test(userPrompt)) {
        return route;
      }
    }
  }
  // Default: full agent mode with all tools
  return {
    agentType: "general",
    skills: [],
    systemPromptAddition: "",
    toolPriority: [],
  };
}

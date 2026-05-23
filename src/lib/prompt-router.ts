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
    skills: ["web_fetch", "web_search", "read_file", "write_file", "search_replace", "local_cmd"],
    systemPromptAddition: `[WEB ANALYSIS MODE]
You are operating in Web Analysis mode. Your job is to:
1. FIRST use web_fetch to get the actual page content - NEVER skip this step
2. If web_fetch fails, try web_search to find cached versions or alternative URLs  
3. If the main URL fails, try common variations (http vs https, with/without www, /wp-json/wp/v2/pages endpoint for WordPress)
4. Analyze the ACTUAL content you fetched - be specific about what you found
5. Provide COMPLETE, actionable recommendations with code examples
NEVER say "I can't access" without trying at least 3 different approaches.`,
    toolPriority: ["web_fetch", "web_search", "read_file", "write_file"],
  },
  {
    patterns: [
      /(?:write|create|build|generate|implement)\s+(?:a|the|some)?\s*(?:code|script|function|component|module|app|application)/i,
      /(?:fix|debug|solve|resolve|patch)\s+(?:the|a|this)?\s*(?:bug|error|issue|problem)/i,
      /(?:refactor|optimize|improve|enhance)\s+(?:the|this)?\s*(?:code|function|component)/i,
    ],
    agentType: "coder",
    skills: ["read_file", "write_file", "search_replace", "append_file", "diff_files", "list_files", "local_cmd"],
    systemPromptAddition: `[CODING MODE]
You are operating in Coding mode. Your job is to:
1. Read existing code first using read_file before making changes
2. Write COMPLETE, production-quality code
3. Use search_replace for targeted edits to existing files
4. Use write_file only for new files
5. After writing code, verify it by reading it back
6. Always include error handling, proper types, and documentation`,
    toolPriority: ["read_file", "write_file", "search_replace", "list_files", "local_cmd"],
  },
  {
    patterns: [
      /(?:search|find|look\s*up|research|investigate)\s+(?:for|about|on|the)?\s*/i,
      /(?:what\s*is|who\s*is|when\s*did|where\s*is|how\s*does|why\s*does)/i,
      /(?:latest|current|recent|today|now)\s+(?:news|info|data|updates)/i,
    ],
    agentType: "researcher",
    skills: ["web_search", "web_fetch", "memory_recall", "memory_save"],
    systemPromptAddition: `[RESEARCH MODE]
You are operating in Research mode. Your job is to:
1. Start with web_search to find relevant information
2. Use web_fetch to get detailed content from the most promising URLs
3. Cross-reference information from multiple sources
4. Save important findings to memory for future reference
5. Provide comprehensive, well-sourced answers`,
    toolPriority: ["web_search", "web_fetch", "memory_recall", "memory_save"],
  },
  {
    patterns: [
      /(?:deploy|setup|install|configure|build|compile)\s+(?:the|a|this)?\s*/i,
      /(?:run|execute|start|launch)\s+(?:the|a|this)?\s*(?:command|script|server|app)/i,
      /(?:docker|kubernetes|nginx|apache|ci\/cd|pipeline)/i,
    ],
    agentType: "devops",
    skills: ["local_cmd", "read_file", "write_file", "get_env_var", "get_system_info"],
    systemPromptAddition: `[DEVOPS MODE]
You are operating in DevOps mode. Your job is to:
1. Check system info first with get_system_info
2. Check environment with get_env_var
3. Execute commands with local_cmd
4. Monitor output and handle errors
5. Provide clear status updates`,
    toolPriority: ["local_cmd", "get_system_info", "get_env_var", "read_file", "write_file"],
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

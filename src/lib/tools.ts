import fs from "fs";
import path from "path";
import os from "os";
import { exec, ExecException } from "child_process";
import { MCPClient, getMcpServerConfigs } from "@/lib/mcp";

export interface ToolParameter {
  type: string;
  description: string;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, ToolParameter>;
  execute: (params: Record<string, any>, workspacePath?: string) => Promise<string>;
}

export interface ToolCallRequest {
  name: string;
  arguments: Record<string, any>;
}

export interface ToolCallResult {
  name: string;
  arguments: Record<string, any>;
  result: string;
  status: "success" | "error";
  timestamp: string;
}

function resolvePath(filePath: string, workspacePath?: string): string {
  const base = (workspacePath && fs.existsSync(workspacePath)) ? path.resolve(workspacePath) : os.homedir();
  const resolved = path.resolve(base, filePath);
  if (!resolved.startsWith(base)) {
    throw new Error(`Path traversal detected: ${filePath}`);
  }
  return resolved;
}

function safeMathEval(expression: string): number {
  const sanitized = expression.replace(/\s/g, "");
  if (/[^0-9+\-*/().%^]/.test(sanitized)) {
    throw new Error("Expression contains disallowed characters. Only numbers and + - * / ( ) . % ^ are allowed.");
  }
  const withPow = sanitized.replace(/\^/g, "**");
  return new Function(`"use strict"; return (${withPow})`)();
}

const availableTools: ToolDefinition[] = [
  {
    name: "calculator",
    description: "Evaluate a mathematical expression safely. Supports +, -, *, /, (), %, ^.",
    parameters: {
      expression: { type: "string", description: "The math expression to evaluate, e.g. '2 + 2 * 3'" },
    },
    execute: async (params) => {
      const expr = params.expression as string;
      if (!expr) return JSON.stringify({ error: "No expression provided" });
      try {
        const result = safeMathEval(expr);
        return JSON.stringify({ expression: expr, result });
      } catch (e: any) {
        return JSON.stringify({ error: e.message });
      }
    },
  },
  {
    name: "read_file",
    description: "Read the contents of a file at the given relative path.",
    parameters: {
      filePath: { type: "string", description: "Path to the file relative to the workspace" },
    },
    execute: async (params, workspacePath) => {
      const filePath = params.filePath as string;
      if (!filePath) return JSON.stringify({ error: "No file path provided" });
      try {
        const resolved = resolvePath(filePath, workspacePath);
        if (!fs.existsSync(resolved)) {
          return JSON.stringify({ error: `File not found: ${resolved}` });
        }
        if (!fs.statSync(resolved).isFile()) {
          return JSON.stringify({ error: `Path is not a file: ${resolved}` });
        }
        const content = fs.readFileSync(resolved, "utf-8");
        return JSON.stringify({ path: resolved, content });
      } catch (e: any) {
        return JSON.stringify({ error: e.message });
      }
    },
  },
  {
    name: "write_file",
    description: "Write content to a file at the given relative path. Creates parent directories if needed.",
    parameters: {
      filePath: { type: "string", description: "Path to the file relative to the workspace" },
      content: { type: "string", description: "Content to write to the file" },
    },
    execute: async (params, workspacePath) => {
      const filePath = params.filePath as string;
      const content = params.content as string;
      if (!filePath) return JSON.stringify({ error: "No file path provided" });
      if (content === undefined) return JSON.stringify({ error: "No content provided" });
      try {
        const resolved = resolvePath(filePath, workspacePath);
        const parentDir = path.dirname(resolved);
        if (!fs.existsSync(parentDir)) {
          fs.mkdirSync(parentDir, { recursive: true });
        }
        fs.writeFileSync(resolved, content, "utf-8");
        return JSON.stringify({ path: resolved, written: true });
      } catch (e: any) {
        return JSON.stringify({ error: e.message });
      }
    },
  },
  {
    name: "list_files",
    description: "List files and directories at the given relative path.",
    parameters: {
      dirPath: { type: "string", description: "Directory path relative to the workspace (use '.' for root)" },
    },
    execute: async (params, workspacePath) => {
      const dirPath = (params.dirPath as string) || ".";
      try {
        const resolved = resolvePath(dirPath, workspacePath);
        if (!fs.existsSync(resolved)) {
          return JSON.stringify({ error: `Directory not found: ${resolved}` });
        }
        if (!fs.statSync(resolved).isDirectory()) {
          return JSON.stringify({ error: `Path is not a directory: ${resolved}` });
        }
        const files = fs.readdirSync(resolved).map((f) => {
          try {
            const stats = fs.statSync(path.join(resolved, f));
            return {
              name: f,
              type: stats.isDirectory() ? "directory" : "file",
              size: stats.size,
              modified: stats.mtime.toISOString(),
            };
          } catch {
            return { name: f, type: "unknown", size: 0, modified: "" };
          }
        });
        return JSON.stringify({ path: resolved, files });
      } catch (e: any) {
        return JSON.stringify({ error: e.message });
      }
    },
  },
  {
    name: "web_search",
    description: "Search the web for information. Returns search results with titles, URLs, and snippets. If no results found, try a simpler or broader query.",
    parameters: {
      query: { type: "string", description: "The search query string" },
    },
    execute: async (params) => {
      const query = (params.query as string)?.trim();
      if (!query) return JSON.stringify({ error: "No search query provided" });
      try {
        // Try multiple ports in case the app is running on a different one
        const ports = [3000, 3001, 3002, 3003];
        let data: any = null;
        for (const port of ports) {
          try {
            const res = await fetch(`http://127.0.0.1:${port}/api/search`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ query }),
              signal: AbortSignal.timeout(5000),
            });
            if (res.ok) {
              data = await res.json();
              break;
            }
          } catch { continue; }
        }
        if (!data) return JSON.stringify({ query, results: [], source: "unavailable", hint: "Search API unavailable. Try using web_fetch to directly access URLs instead." });
        if (data.error) return JSON.stringify({ error: data.error, hint: "Try a simpler search query or use web_fetch to directly fetch a URL." });
        const results = data.results || [];
        if (results.length === 0) {
          return JSON.stringify({ query, results: [], source: data.source || "none", hint: "No results found. Try a broader or different search query. You can also use the web_fetch tool to directly access a specific URL." });
        }
        return JSON.stringify({ query, results, source: data.source });
      } catch (e: any) {
        return JSON.stringify({ error: e.message, hint: "Search failed. Try using web_fetch to directly access a URL instead." });
      }
    },
  },
  {
    name: "web_fetch",
    description: "Fetch the content of a web page by URL. Returns the page text content, title, and metadata. Handles redirects and common blocking. Use this to read specific web pages directly when you know the URL.",
    parameters: {
      url: { type: "string", description: "The full URL to fetch (e.g. https://example.com)" },
    },
    execute: async (params) => {
      const url = (params.url as string)?.trim();
      if (!url) return JSON.stringify({ error: "No URL provided" });
      
      // Normalize URL - add https:// if no protocol
      let fetchUrl = url;
      if (!fetchUrl.startsWith("http://") && !fetchUrl.startsWith("https://")) {
        fetchUrl = "https://" + fetchUrl;
      }
      
      try {
        // Try the local web-fetch API first (has better headers and SSL handling)
        const ports = [3000, 3001, 3002, 3003];
        for (const port of ports) {
          try {
            const res = await fetch(`http://127.0.0.1:${port}/api/web-fetch`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ url: fetchUrl }),
              signal: AbortSignal.timeout(15000),
            });
            if (res.ok) {
              const data = await res.json();
              // Check if the API returned an error
              if (data.error && !data.textContent) {
                // API failed, try direct fetch below
                break;
              }
              return JSON.stringify(data);
            }
          } catch { continue; }
        }
        
        // Fallback: direct fetch with Node.js - try both https and http
        const urlsToTry = [fetchUrl];
        if (fetchUrl.startsWith("https://")) {
          urlsToTry.push(fetchUrl.replace("https://", "http://"));
        }
        
        for (const tryUrl of urlsToTry) {
          try {
            const response = await fetch(tryUrl, {
              headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                "Accept-Language": "en-US,en;q=0.9,fr;q=0.8",
                "Accept-Encoding": "identity",
                "Cache-Control": "no-cache",
              },
              signal: AbortSignal.timeout(15000),
              redirect: "follow",
            });
            
            if (!response.ok) continue;
            
            const contentType = response.headers.get("content-type") || "";
            // Skip non-text responses (PDFs, images, etc.)
            if (!contentType.includes("text/") && !contentType.includes("html") && !contentType.includes("xml") && !contentType.includes("json")) {
              return JSON.stringify({
                url: tryUrl,
                title: "Non-text content",
                description: `Content-Type: ${contentType}`,
                textContent: "",
                contentLength: 0,
                contentType,
                fetched: true,
                hint: "The URL returned non-text content. Try web_search for information about this site.",
              });
            }
            
            const html = await response.text();
            if (!html || html.length < 50) continue;
            
            // Extract title
            const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
            const title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, "").trim() : "No title";
            // Extract meta description
            const descMatch = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i) ||
                             html.match(/<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["']/i);
            const description = descMatch ? descMatch[1] : "";
            
            // Check for CMS/framework indicators
            const indicators: string[] = [];
            if (/avada/i.test(html)) indicators.push("Avada Theme");
            if (/elementor/i.test(html)) indicators.push("Elementor");
            if (/wp-content/i.test(html)) indicators.push("WordPress");
            if (/divi/i.test(html)) indicators.push("Divi Theme");
            
            // Strip HTML tags for readable text (basic)
            const textContent = html
              .replace(/<script[\s\S]*?<\/script>/gi, "")
              .replace(/<style[\s\S]*?<\/style>/gi, "")
              .replace(/<[^>]+>/g, " ")
              .replace(/&nbsp;/g, " ")
              .replace(/&amp;/g, "&")
              .replace(/&lt;/g, "<")
              .replace(/&gt;/g, ">")
              .replace(/&quot;/g, '"')
              .replace(/\s+/g, " ")
              .trim()
              .slice(0, 15000);
            
            if (textContent.length > 0) {
              return JSON.stringify({
                url: tryUrl,
                title,
                description,
                indicators,
                contentLength: html.length,
                textContent,
                contentType,
                fetched: true,
              });
            }
          } catch {
            continue;
          }
        }
        
        // All attempts failed
        return JSON.stringify({ 
          error: "Could not fetch content from this URL", 
          url, 
          hint: "The website may be blocking automated access, using JavaScript rendering, or may be down. Try using web_search to find information about this site instead.",
        });
      } catch (e: any) {
        return JSON.stringify({ error: `Failed to fetch URL: ${e.message}`, url, hint: "Try using web_search instead." });
      }
    },
  },
  {
    name: "get_current_time",
    description: "Returns the current date and time.",
    parameters: {},
    execute: async () => {
      const now = new Date();
      return JSON.stringify({
        iso: now.toISOString(),
        local: now.toString(),
        date: now.toLocaleDateString(),
        time: now.toLocaleTimeString(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        timestamp: now.getTime(),
      });
    },
  },
  {
    name: "get_system_info",
    description: "Returns basic system information including OS, platform, memory, uptime, and available commands.",
    parameters: {},
    execute: async () => {
      const totalMem = os.totalmem();
      const freeMem = os.freemem();
      // Check which common commands are available
      const checkCmd = (cmd: string): boolean => {
        try {
          const result = require("child_process").execSync(`which ${cmd} 2>/dev/null || where ${cmd} 2>nul`, { encoding: "utf-8", timeout: 3000 });
          return result.trim().length > 0;
        } catch { return false; }
      };
      const availableCommands = ["curl", "wget", "python3", "python", "node", "npm", "npx", "git"]
        .filter(cmd => checkCmd(cmd));
      return JSON.stringify({
        platform: os.platform(),
        arch: os.arch(),
        hostname: os.hostname(),
        cpus: os.cpus().length,
        memory: {
          total: `${(totalMem / (1024 * 1024 * 1024)).toFixed(1)} GB`,
          free: `${(freeMem / (1024 * 1024 * 1024)).toFixed(1)} GB`,
          usedPercent: `${((1 - freeMem / totalMem) * 100).toFixed(1)}%`,
        },
        uptime: `${(os.uptime() / 3600).toFixed(1)} hours`,
        homedir: os.homedir(),
        availableCommands,
        hint: availableCommands.length === 0 ? "No common CLI tools found. Use built-in tools instead of local_cmd." : undefined,
      });
    },
  },
];

export function getToolDefinitions(): ToolDefinition[] {
  return availableTools;
}

/**
 * Build Gemini-compatible functionDeclarations from available tools.
 * This enables the Gemini API to use native function calling.
 */
export async function getGeminiFunctionDeclarations(): Promise<any[]> {
  const allTools = [...availableTools];

  // Include MCP tools
  try {
    const mcpTools = await getMcpTools();
    allTools.push(...mcpTools);
  } catch {}

  // Include local_cmd as a function declaration
  const functionDeclarations = allTools.map((tool) => {
    const properties: Record<string, any> = {};
    const required: string[] = [];

    for (const [key, param] of Object.entries(tool.parameters)) {
      properties[key] = {
        type: param.type === "string" ? "STRING" : param.type === "number" ? "NUMBER" : param.type === "boolean" ? "BOOLEAN" : "STRING",
        description: param.description,
      };
      required.push(key);
    }

    return {
      name: tool.name,
      description: tool.description,
      parameters: {
        type: "OBJECT",
        properties,
        required: required.length > 0 ? required : undefined,
      },
    };
  });

  // Add local_cmd as a function declaration (it's handled separately in executeToolCall)
  functionDeclarations.push({
    name: "local_cmd",
    description: "Execute a command in the terminal. Returns stdout, stderr, and exit code. Use for system commands, scripts, and tools not available as built-in tools.",
    parameters: {
      type: "OBJECT",
      properties: {
        command: {
          type: "STRING",
          description: "The shell command to execute",
        },
      },
      required: ["command"],
    },
  });

  return functionDeclarations;
}

/**
 * Build OpenAI-compatible tools array for native function calling.
 * This enables OpenAI-compatible models (GPT-4, DeepSeek, Qwen, Ollama, LM Studio, etc.)
 * to use structured tool calls instead of outputting text-based XML/JSON.
 */
export async function getOpenAIToolsDefinitions(): Promise<any[]> {
  const allTools = [...availableTools];

  // Include MCP tools
  try {
    const mcpTools = await getMcpTools();
    allTools.push(...mcpTools);
  } catch {}

  const tools = allTools.map((tool) => {
    const properties: Record<string, any> = {};
    const required: string[] = [];

    for (const [key, param] of Object.entries(tool.parameters)) {
      properties[key] = {
        type: param.type,
        description: param.description,
      };
      required.push(key);
    }

    return {
      type: "function" as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: {
          type: "object" as const,
          properties,
          required: required.length > 0 ? required : undefined,
        },
      },
    };
  });

  // Add local_cmd as a tool (it's handled separately in executeToolCall)
  tools.push({
    type: "function" as const,
    function: {
      name: "local_cmd",
      description: "Execute a command in the terminal. Returns stdout, stderr, and exit code. Use for system commands, scripts, and tools not available as built-in tools.",
      parameters: {
        type: "object" as const,
        properties: {
          command: {
            type: "string",
            description: "The shell command to execute",
          },
        },
        required: ["command"],
      },
    },
  });

  return tools;
}

export function getToolByName(name: string): ToolDefinition | undefined {
  return availableTools.find((t) => t.name === name);
}

export async function getMcpTools(): Promise<ToolDefinition[]> {
  const configs = await getMcpServerConfigs();
  const mcpTools: ToolDefinition[] = [];

  for (const config of configs) {
    const client = new MCPClient(config);
    try {
      await client.connect();
      const tools = await client.listTools();
      for (const tool of tools) {
        const toolName = `mcp_${config.name}_${tool.name}`;
        const paramKeys = Object.keys(tool.inputSchema?.properties || {});
        const parameters: Record<string, ToolParameter> = {};
        for (const key of paramKeys) {
          const prop = tool.inputSchema.properties[key];
          parameters[key] = {
            type: prop.type || "string",
            description: prop.description || "",
          };
        }
        mcpTools.push({
          name: toolName,
          description: `[MCP:${config.name}] ${tool.description}`,
          parameters,
          execute: async (args: Record<string, any>) => {
            const mcpClient = new MCPClient(config);
            try {
              await mcpClient.connect();
              const result = await mcpClient.callTool(tool.name, args);
              return result;
            } finally {
              mcpClient.disconnect();
            }
          },
        });
      }
    } catch (e: any) {
      console.error(`[MCP] Failed to connect to "${config.name}":`, e.message);
    } finally {
      client.disconnect();
    }
  }

  return mcpTools;
}

export function getToolsPrompt(): string {
  const lines = availableTools.map((tool) => {
    const params = Object.entries(tool.parameters)
      .map(([k, v]) => `  - ${k} (${v.type}): ${v.description}`)
      .join("\n");
    return `- **${tool.name}**: ${tool.description}\n${params}`;
  });
  return `[AVAILABLE TOOLS]
You can call tools using ANY of these formats:

1. JSON in a tool_call code block (PREFERRED):
\`\`\`tool_call
{"name": "read_file", "arguments": {"filePath": "src/main.ts"}}
\`\`\`

2. Inline JSON:
{"name": "read_file", "arguments": {"filePath": "src/main.ts"}}

3. XML tool call format:
<longcat_tool_call>read_file</longcat_tool_call>
<longcat_arg_key>filePath</longcat_arg_key>
<longcat_arg_value>src/main.ts</longcat_arg_value>

You can call multiple tools at once. Each tool call will be executed and the result fed back to you.

${lines.join("\n")}`;
}

export function parseToolCalls(text: string): ToolCallRequest[] {
  const calls: ToolCallRequest[] = [];

  // --- Format 1: ```tool_call code blocks ---
  const toolBlockRegex = /```tool_call\s*\n([\s\S]*?)```/g;
  let match;
  while ((match = toolBlockRegex.exec(text)) !== null) {
    const lines = match[1].split("\n").filter((l) => l.trim());
    for (const line of lines) {
      try {
        const obj = JSON.parse(line.trim());
        if (obj.name && typeof obj.name === "string") {
          calls.push({ name: obj.name, arguments: obj.arguments || {} });
        }
      } catch {}
    }
  }

  // --- Format 2: ```json code blocks with {name, arguments} ---
  const jsonBlockRegex = /```(?:json)?\s*\n(\s*\{[\s\S]*?\}\s*)\n```/g;
  while ((match = jsonBlockRegex.exec(text)) !== null) {
    try {
      const obj = JSON.parse(match[1].trim());
      if (obj.name && typeof obj.name === "string" && !calls.some((c) => c.name === obj.name && JSON.stringify(c.arguments) === JSON.stringify(obj.arguments))) {
        calls.push({ name: obj.name, arguments: obj.arguments || {} });
      }
    } catch {}
  }

  // --- Format 3: Inline JSON {name: "...", arguments: {...}} ---
  const inlineJsonRegex = /\{\s*"name"\s*:\s*"(\w+)"\s*,\s*"arguments"\s*:\s*(\{(?:[^{}]|\{[^{}]*\})*\})\s*\}/g;
  while ((match = inlineJsonRegex.exec(text)) !== null) {
    const name = match[1];
    try {
      const args = JSON.parse(match[2]);
      if (!calls.some((c) => c.name === name && JSON.stringify(c.arguments) === JSON.stringify(args))) {
        calls.push({ name, arguments: args });
      }
    } catch {}
  }

  // --- Format 4: <longcat_tool_call> XML format (used by Gemini CLI and many LLM models) ---
  // Supports TWO sub-formats:
  // A) Args INSIDE the tag: <longcat_tool_call>tool_name <longcat_arg_key>key</longcat_arg_key> <longcat_arg_value>value</longcat_arg_value> </longcat_tool_call>
  // B) Args OUTSIDE the tag: <longcat_tool_call>tool_name</longcat_tool_call> <longcat_arg_key>key</longcat_arg_key> <longcat_arg_value>value</longcat_arg_value>

  // Extract each <longcat_tool_call>...</longcat_tool_call> block (including nested tags)
  const longcatBlockRegex = /<longcat_tool_call>([\s\S]*?)<\/longcat_tool_call>/g;
  while ((match = longcatBlockRegex.exec(text)) !== null) {
    const blockContent = match[1].trim();
    const args: Record<string, any> = {};

    // Parse key-value pairs inside this block
    const argKeyRegex = /<longcat_arg_key>\s*([^<]*?)\s*<\/longcat_arg_key>\s*<longcat_arg_value>\s*([\s\S]*?)\s*<\/longcat_arg_value>/g;
    let argMatch;
    while ((argMatch = argKeyRegex.exec(blockContent)) !== null) {
      const key = argMatch[1].trim();
      const value = argMatch[2].trim();
      args[key] = value;
    }

    // Tool name is the text before the first <longcat_arg_key> tag, trimmed
    const firstArgTag = blockContent.indexOf('<longcat_arg_key>');
    const toolName = (firstArgTag > 0 ? blockContent.substring(0, firstArgTag) : blockContent)
      .replace(/<[^>]+>/g, '') // Remove any residual XML tags
      .trim();

    if (toolName && /^[\w_]+$/.test(toolName)) {
      if (!calls.some((c) => c.name === toolName && JSON.stringify(c.arguments) === JSON.stringify(args))) {
        calls.push({ name: toolName, arguments: args });
      }
    }
  }

  // Also handle the outside-tag format: args appear AFTER the closing tag
  // <longcat_tool_call>tool_name</longcat_tool_call> <longcat_arg_key>...</longcat_arg_key> <longcat_arg_value>...</longcat_arg_value>
  const longcatOutsideRegex = /<longcat_tool_call>\s*([\w_]+)\s*<\/longcat_tool_call>/g;
  while ((match = longcatOutsideRegex.exec(text)) !== null) {
    const toolName = match[1].trim();
    // Skip if already captured by the block regex above
    if (calls.some((c) => c.name === toolName)) continue;

    const args: Record<string, any> = {};
    // Look for arg key-value pairs after this tag, before the next <longcat_tool_call>
    const afterTag = text.substring(match.index + match[0].length);
    const nextToolCall = afterTag.indexOf('<longcat_tool_call>');
    const searchRegion = nextToolCall > 0 ? afterTag.substring(0, nextToolCall) : afterTag;

    const argKeyRegex2 = /<longcat_arg_key>\s*([^<]*?)\s*<\/longcat_arg_key>\s*<longcat_arg_value>\s*([\s\S]*?)\s*<\/longcat_arg_value>/g;
    let argMatch2;
    while ((argMatch2 = argKeyRegex2.exec(searchRegion)) !== null) {
      const key = argMatch2[1].trim();
      const value = argMatch2[2].trim();
      args[key] = value;
    }

    calls.push({ name: toolName, arguments: args });
  }

  // --- Format 5: Gemini function_call style: {"name": "...", "args": {...}} ---
  const geminiFuncRegex = /"functionCall"\s*:\s*\{\s*"name"\s*:\s*"([^"]+)"\s*,\s*"args"\s*:\s*(\{[^}]*\})/g;
  while ((match = geminiFuncRegex.exec(text)) !== null) {
    const name = match[1];
    try {
      const args = JSON.parse(match[2]);
      if (!calls.some((c) => c.name === name && JSON.stringify(c.arguments) === JSON.stringify(args))) {
        calls.push({ name, arguments: args });
      }
    } catch {}
  }

  // --- Format 6: Action JSON pattern used by some models ---
  // Pattern: {"action": "tool_name", "params": {...}} or {"tool": "tool_name", "input": {...}}
  const actionRegex = /\{\s*"(?:action|tool)"\s*:\s*"(\w+)"\s*,\s*"(?:params|input|arguments|args)"\s*:\s*(\{(?:[^{}]|\{[^{}]*\})*\})\s*\}/g;
  while ((match = actionRegex.exec(text)) !== null) {
    const name = match[1];
    try {
      const args = JSON.parse(match[2]);
      if (!calls.some((c) => c.name === name && JSON.stringify(c.arguments) === JSON.stringify(args))) {
        calls.push({ name, arguments: args });
      }
    } catch {}
  }

  // --- Format 7: XML-style tool calls (backward compatibility) ---
  const cmdRegex = /<local_cmd>([\s\S]*?)<\/local_cmd>/;
  const cmdMatch = text.match(cmdRegex);
  if (cmdMatch) {
    calls.push({ name: "local_cmd", arguments: { command: cmdMatch[1].trim() } });
  }

  const listRegex = /<list_files>([\s\S]*?)<\/list_files>/;
  const listMatch = text.match(listRegex);
  if (listMatch) {
    calls.push({ name: "list_files", arguments: { dirPath: listMatch[1].trim() || "." } });
  }

  const readRegex = /<read_file>([\s\S]*?)<\/read_file>/;
  const readMatch = text.match(readRegex);
  if (readMatch) {
    calls.push({ name: "read_file", arguments: { filePath: readMatch[1].trim() } });
  }

  const writeRegex = /<write_file\s+path="([\s\S]*?)">([\s\S]*?)<\/write_file>/;
  const writeMatch = text.match(writeRegex);
  if (writeMatch) {
    calls.push({ name: "write_file", arguments: { filePath: writeMatch[1].trim(), content: writeMatch[2] } });
  }

  return calls;
}

/**
 * Strip tool-call XML/JSON markup from model response text so the user
 * doesn't see raw <longcat_tool_call>, ```tool_call```, etc.
 */
export function stripToolCallXml(text: string): string {
  let clean = text;
  // 1. Remove <longcat_tool_call>...</longcat_tool_call> blocks (including nested tags)
  clean = clean.replace(/<longcat_tool_call>[\s\S]*?<\/longcat_tool_call>/g, "");
  // 2. Remove orphaned <longcat_arg_key>/<longcat_arg_value> tags
  clean = clean.replace(/<longcat_arg_key>[\s\S]*?<\/longcat_arg_key>/g, "");
  clean = clean.replace(/<longcat_arg_value>[\s\S]*?<\/longcat_arg_value>/g, "");
  // 3. Remove ```tool_call ... ``` code blocks
  clean = clean.replace(/```tool_call\s*\n[\s\S]*?```/g, "");
  // 4. Remove inline JSON tool calls: {"name": "...", "arguments": {...}}
  clean = clean.replace(/\{\s*"name"\s*:\s*"\w+"\s*,\s*"arguments"\s*:\s*\{[^{}]*\}\s*\}/g, "");
  // 5. Remove <local_cmd>...</local_cmd>, <list_files>...</list_files>, etc.
  clean = clean.replace(/<local_cmd>[\s\S]*?<\/local_cmd>/g, "");
  clean = clean.replace(/<list_files>[\s\S]*?<\/list_files>/g, "");
  clean = clean.replace(/<read_file>[\s\S]*?<\/read_file>/g, "");
  clean = clean.replace(/<write_file\s+path="[\s\S]*?">[\s\S]*?<\/write_file>/g, "");
  // 6. Clean up extra whitespace
  clean = clean.replace(/\n{3,}/g, "\n\n").trim();
  return clean;
}

export async function executeToolCall(
  call: ToolCallRequest,
  workspacePath?: string
): Promise<ToolCallResult> {
  const timestamp = new Date().toISOString();

  if (call.name === "local_cmd") {
    const activeDir = (workspacePath && fs.existsSync(workspacePath))
      ? path.resolve(workspacePath)
      : path.join(os.homedir(), "Desktop");
    try {
      const result = await new Promise<string>((resolve) => {
        exec(call.arguments.command, { cwd: activeDir, timeout: 30000 }, (error: ExecException | null, stdout: string, stderr: string) => {
          if (error && (error as any).code === "ENOENT") {
            // Extract command name for helpful error message
            const cmdName = call.arguments.command.split(/\s+/)[0];
            resolve(
              JSON.stringify({
                stdout: "(no stdout)",
                stderr: `(no stderr)`,
                exitCode: "ENOENT",
                error: `Command '${cmdName}' not found on this system.`,
                hint: `The command '${cmdName}' is not available. Try using built-in tools instead: use web_fetch to access URLs, use read_file/write_file for file operations, or use web_search for web searches.`,
              })
            );
            return;
          }
          resolve(
            JSON.stringify({
              stdout: stdout || "(no stdout)",
              stderr: stderr || "(no stderr)",
              exitCode: error ? error.code : 0,
            })
          );
        });
      });
      return { name: "local_cmd", arguments: call.arguments, result, status: "success", timestamp };
    } catch (e: any) {
      return { name: "local_cmd", arguments: call.arguments, result: JSON.stringify({ error: e.message }), status: "error", timestamp };
    }
  }

  if (call.name.startsWith("mcp_")) {
    try {
      const mcpTools = await getMcpTools();
      const mcpTool = mcpTools.find((t) => t.name === call.name);
      if (!mcpTool) {
        return { name: call.name, arguments: call.arguments, result: JSON.stringify({ error: `Unknown MCP tool: ${call.name}` }), status: "error", timestamp };
      }
      const result = await mcpTool.execute(call.arguments, workspacePath);
      return { name: call.name, arguments: call.arguments, result, status: "success", timestamp };
    } catch (e: any) {
      return { name: call.name, arguments: call.arguments, result: JSON.stringify({ error: e.message }), status: "error", timestamp };
    }
  }

  const tool = getToolByName(call.name);
  if (!tool) {
    return { name: call.name, arguments: call.arguments, result: JSON.stringify({ error: `Unknown tool: ${call.name}` }), status: "error", timestamp };
  }

  try {
    const result = await tool.execute(call.arguments, workspacePath);
    return { name: call.name, arguments: call.arguments, result, status: "success", timestamp };
  } catch (e: any) {
    return { name: call.name, arguments: call.arguments, result: JSON.stringify({ error: e.message }), status: "error", timestamp };
  }
}

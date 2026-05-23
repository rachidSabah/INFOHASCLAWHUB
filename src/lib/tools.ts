import fs from "fs";
import path from "path";
import os from "os";
import { exec, ExecException } from "child_process";
import { MCPClient, getMcpServerConfigs } from "@/lib/mcp";
// Re-export client-safe utility functions from shared module
export { stripToolCallXml } from "@/lib/tool-call-utils";
import { stripToolCallXml } from "@/lib/tool-call-utils";
import { getCachedToolResult, setCachedToolResult } from "@/lib/tool-cache";

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
      const cached = getCachedToolResult("read_file", params);
      if (cached) return cached;
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
        const result = JSON.stringify({ path: resolved, content });
        setCachedToolResult("read_file", params, result);
        return result;
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
      const cached = getCachedToolResult("list_files", params);
      if (cached) return cached;
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
        const result = JSON.stringify({ path: resolved, files });
        setCachedToolResult("list_files", params, result);
        return result;
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
      const cached = getCachedToolResult("web_search", params);
      if (cached) return cached;
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
        const result = JSON.stringify({ query, results, source: data.source });
        setCachedToolResult("web_search", params, result);
        return result;
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
      const cached = getCachedToolResult("web_fetch", params);
      if (cached) return cached;
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
              const result = JSON.stringify(data);
              setCachedToolResult("web_fetch", params, result);
              return result;
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
              const result = JSON.stringify({
                url: tryUrl,
                title,
                description,
                indicators,
                contentLength: html.length,
                textContent,
                contentType,
                fetched: true,
              });
              setCachedToolResult("web_fetch", params, result);
              return result;
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
      const cached = getCachedToolResult("get_system_info", {});
      if (cached) return cached;
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
      const result = JSON.stringify({
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
      setCachedToolResult("get_system_info", {}, result);
      return result;
    },
  },
  {
    name: "search_replace",
    description: "Search for a string in a file and replace it with a new string. More precise than write_file for making targeted edits. Returns the number of replacements made.",
    parameters: {
      filePath: { type: "string", description: "Path to the file relative to the workspace" },
      search: { type: "string", description: "The exact string to search for" },
      replace: { type: "string", description: "The string to replace it with" },
    },
    execute: async (params, workspacePath) => {
      const filePath = params.filePath as string;
      const search = params.search as string;
      const replace = params.replace as string;
      if (!filePath || !search) return JSON.stringify({ error: "filePath and search are required" });
      try {
        const resolved = resolvePath(filePath, workspacePath);
        if (!fs.existsSync(resolved)) return JSON.stringify({ error: `File not found: ${resolved}` });
        const content = fs.readFileSync(resolved, "utf-8");
        const count = (content.match(new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
        if (count === 0) return JSON.stringify({ error: `Search string not found in ${resolved}`, hint: "Make sure the search string matches exactly, including whitespace and indentation." });
        const newContent = content.split(search).join(replace);
        fs.writeFileSync(resolved, newContent, "utf-8");
        return JSON.stringify({ path: resolved, replacements: count, success: true });
      } catch (e: any) {
        return JSON.stringify({ error: e.message });
      }
    },
  },
  {
    name: "get_env_var",
    description: "Get the value of an environment variable. Useful for checking configuration, API keys paths, and system settings.",
    parameters: {
      name: { type: "string", description: "The name of the environment variable" },
    },
    execute: async (params) => {
      const name = params.name as string;
      if (!name) return JSON.stringify({ error: "No variable name provided" });
      const value = process.env[name];
      if (value === undefined) return JSON.stringify({ name, exists: false, hint: "Variable not set. Check .env files or system configuration." });
      // Don't expose full API keys for security - mask them
      const masked = value.length > 8 && (name.includes("KEY") || name.includes("SECRET") || name.includes("TOKEN") || name.includes("PASSWORD"))
        ? value.substring(0, 4) + "..." + value.substring(value.length - 4)
        : value;
      return JSON.stringify({ name, value: masked, exists: true });
    },
  },
  {
    name: "memory_save",
    description: "Save an important fact, preference, or instruction to persistent memory for future conversations. Use this to remember user preferences, project context, or important decisions.",
    parameters: {
      key: { type: "string", description: "A short unique identifier for this memory (e.g., 'user_preferred_framework', 'project_uses_postgresql')" },
      content: { type: "string", description: "The content to remember" },
    },
    execute: async (params) => {
      const key = params.key as string;
      const content = params.content as string;
      if (!key || !content) return JSON.stringify({ error: "Both key and content are required" });
      try {
        const { db } = require("@/lib/db");
        // Upsert: update if exists, create if not
        const existing = await db.memory.findFirst({ where: { key } });
        if (existing) {
          await db.memory.update({ where: { id: existing.id }, data: { content } });
          return JSON.stringify({ key, content, updated: true });
        } else {
          await db.memory.create({ data: { key, content, source: "agent_tool" } });
          return JSON.stringify({ key, content, created: true });
        }
      } catch (e: any) {
        return JSON.stringify({ error: e.message, hint: "Memory system uses SQLite. Check that the database is accessible." });
      }
    },
  },
  {
    name: "memory_recall",
    description: "Recall previously saved memories. Search by key or get all memories. Use this to retrieve user preferences, project context, or past decisions.",
    parameters: {
      query: { type: "string", description: "Search query to find relevant memories (optional - leave empty to get all)" },
    },
    execute: async (params) => {
      const query = (params.query as string || "").trim();
      try {
        const { db } = require("@/lib/db");
        let memories;
        if (query) {
          memories = await db.memory.findMany({
            where: {
              OR: [
                { key: { contains: query } },
                { content: { contains: query } },
              ]
            },
            take: 20,
            orderBy: { createdAt: "desc" },
          });
        } else {
          memories = await db.memory.findMany({
            take: 50,
            orderBy: { createdAt: "desc" },
          });
        }
        return JSON.stringify({ memories: memories.map((m: any) => ({ key: m.key, content: m.content, saved: m.createdAt })), count: memories.length });
      } catch (e: any) {
        return JSON.stringify({ error: e.message, memories: [] });
      }
    },
  },
  {
    name: "file_change_check",
    description: "Check if a file has been modified since a given timestamp. Useful for monitoring file changes, detecting when source files are updated, or checking if a build output is stale. Returns modification time and whether the file changed.",
    parameters: {
      filePath: { type: "string", description: "Path to the file relative to the workspace" },
      sinceTimestamp: { type: "string", description: "ISO timestamp to compare against (e.g., '2024-01-01T00:00:00Z'). If omitted, returns current mtime." },
    },
    execute: async (params, workspacePath) => {
      const filePath = params.filePath as string;
      const sinceTimestamp = params.sinceTimestamp as string;
      
      if (!filePath) return JSON.stringify({ error: "No file path provided" });
      
      try {
        const resolved = resolvePath(filePath, workspacePath);
        if (!fs.existsSync(resolved)) {
          return JSON.stringify({ error: `File not found: ${resolved}`, changed: false });
        }
        
        const stats = fs.statSync(resolved);
        const mtime = stats.mtime.toISOString();
        let changed = false;
        
        if (sinceTimestamp) {
          const since = new Date(sinceTimestamp).getTime();
          const modified = stats.mtime.getTime();
          changed = modified > since;
        }
        
        return JSON.stringify({
          path: resolved,
          size: stats.size,
          modified: mtime,
          changed,
          since: sinceTimestamp || null,
        });
      } catch (e: any) {
        return JSON.stringify({ error: e.message });
      }
    },
  },
  {
    name: "list_processes",
    description: "List running system processes. Useful for checking if a server is running, finding process IDs, or monitoring system resources.",
    parameters: {
      filter: { type: "string", description: "Filter processes by name (e.g., 'node', 'python', 'gemini'). Optional." },
    },
    execute: async (params) => {
      const filter = (params.filter as string || "").toLowerCase().trim();
      
      try {
        const isWindows = os.platform() === "win32";
        const cmd = isWindows 
          ? "tasklist /FO CSV /NH" 
          : "ps aux --sort=-%mem";
        
        return await new Promise<string>((resolve) => {
          exec(cmd, { timeout: 10000, maxBuffer: 512 * 1024 }, (error, stdout, stderr) => {
            if (error) {
              return resolve(JSON.stringify({ error: "Failed to list processes", hint: "Process listing may not be available on this system" }));
            }
            
            let lines = stdout.split("\n").filter(Boolean);
            
            if (isWindows) {
              // Parse CSV format: "name","pid","session","session#","mem"
              const processes = lines.slice(0, 100).map(line => {
                const parts = line.split('","').map(p => p.replace(/"/g, "").trim());
                return { name: parts[0], pid: parts[1], memory: parts[4] || "" };
              });
              const filtered = filter 
                ? processes.filter(p => p.name.toLowerCase().includes(filter))
                : processes.slice(0, 50);
              resolve(JSON.stringify({ processes: filtered, total: processes.length, filtered: filtered.length }));
            } else {
              // Parse ps aux format
              const processes = lines.slice(0, 100).map(line => {
                const parts = line.trim().split(/\s+/);
                return {
                  user: parts[0],
                  pid: parts[1],
                  cpu: parts[2],
                  mem: parts[3],
                  command: parts.slice(10).join(" ").substring(0, 200),
                };
              }).filter(p => p.pid && p.pid !== "PID");
              
              const filtered = filter
                ? processes.filter(p => p.command.toLowerCase().includes(filter) || p.user.toLowerCase().includes(filter))
                : processes.slice(0, 50);
              resolve(JSON.stringify({ processes: filtered, total: processes.length, filtered: filtered.length }));
            }
          });
        });
      } catch (e: any) {
        return JSON.stringify({ error: e.message });
      }
    },
  },
  {
    name: "diff_files",
    description: "Compare two files and show their differences. Useful for reviewing changes, comparing versions, or understanding modifications.",
    parameters: {
      filePath1: { type: "string", description: "Path to the first file" },
      filePath2: { type: "string", description: "Path to the second file" },
    },
    execute: async (params, workspacePath) => {
      const filePath1 = params.filePath1 as string;
      const filePath2 = params.filePath2 as string;
      if (!filePath1 || !filePath2) return JSON.stringify({ error: "Both filePath1 and filePath2 are required" });
      try {
        const resolved1 = resolvePath(filePath1, workspacePath);
        const resolved2 = resolvePath(filePath2, workspacePath);
        if (!fs.existsSync(resolved1)) return JSON.stringify({ error: `File not found: ${resolved1}` });
        if (!fs.existsSync(resolved2)) return JSON.stringify({ error: `File not found: ${resolved2}` });
        const content1 = fs.readFileSync(resolved1, "utf-8").split("\n");
        const content2 = fs.readFileSync(resolved2, "utf-8").split("\n");
        // Simple diff - show lines only in one file
        const onlyIn1 = content1.filter(l => !content2.includes(l));
        const onlyIn2 = content2.filter(l => !content1.includes(l));
        return JSON.stringify({
          file1: resolved1,
          file2: resolved2,
          linesOnlyInFile1: onlyIn1.length,
          linesOnlyInFile2: onlyIn2.length,
          diff: [
            ...onlyIn1.slice(0, 30).map(l => `- ${l}`),
            ...onlyIn2.slice(0, 30).map(l => `+ ${l}`),
          ].join("\n"),
          summary: `File1: ${content1.length} lines, File2: ${content2.length} lines, ${onlyIn1.length + onlyIn2.length} lines different`,
        });
      } catch (e: any) {
        return JSON.stringify({ error: e.message });
      }
    },
  },
  {
    name: "append_file",
    description: "Append content to an existing file. If the file doesn't exist, creates it. Useful for adding to logs, appending to configs, or incrementally building files.",
    parameters: {
      filePath: { type: "string", description: "Path to the file relative to the workspace" },
      content: { type: "string", description: "Content to append" },
    },
    execute: async (params, workspacePath) => {
      const filePath = params.filePath as string;
      const content = params.content as string;
      if (!filePath || content === undefined) return JSON.stringify({ error: "filePath and content are required" });
      try {
        const resolved = resolvePath(filePath, workspacePath);
        const parentDir = path.dirname(resolved);
        if (!fs.existsSync(parentDir)) fs.mkdirSync(parentDir, { recursive: true });
        fs.appendFileSync(resolved, content, "utf-8");
        const stats = fs.statSync(resolved);
        return JSON.stringify({ path: resolved, appended: true, fileSize: stats.size });
      } catch (e: any) {
        return JSON.stringify({ error: e.message });
      }
    },
  },
  {
    name: "grep_code",
    description: "Search for a pattern (regex or string) in files within a directory. Returns matching lines with file paths and line numbers. Like 'grep' or 'ripgrep' but built-in. Essential for finding code, configs, or text across a project.",
    parameters: {
      pattern: { type: "string", description: "The search pattern (supports regex, e.g., 'function\\s+\\w+', 'TODO:', 'import.*from')" },
      dirPath: { type: "string", description: "Directory to search in (relative to workspace, use '.' for root)" },
      filePattern: { type: "string", description: "Glob pattern to filter files (e.g., '*.ts', '*.py', '*.{js,jsx}'). Default: all files" },
      maxResults: { type: "string", description: "Maximum number of results to return (default: 50)" },
    },
    execute: async (params, workspacePath) => {
      const cached = getCachedToolResult("grep_code", params);
      if (cached) return cached;
      const pattern = params.pattern as string;
      const dirPath = (params.dirPath as string) || ".";
      const filePattern = (params.filePattern as string) || "";
      const maxResults = parseInt(params.maxResults as string) || 50;
      
      if (!pattern) return JSON.stringify({ error: "No search pattern provided" });
      
      try {
        const resolved = resolvePath(dirPath, workspacePath);
        if (!fs.existsSync(resolved)) return JSON.stringify({ error: `Directory not found: ${resolved}` });
        if (!fs.statSync(resolved).isDirectory()) return JSON.stringify({ error: `Path is not a directory: ${resolved}` });
        
        const results: { file: string; line: number; content: string }[] = [];
        let regex: RegExp;
        try {
          regex = new RegExp(pattern, "gi");
        } catch {
          // If regex is invalid, do a simple string search
          regex = new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), "gi");
        }
        
        const globRegex = filePattern ? globToRegex(filePattern) : null;
        
        function searchDir(dir: string, depth: number = 0) {
          if (depth > 10 || results.length >= maxResults) return;
          
          let entries;
          try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
          
          // Skip common non-code directories
          const skipDirs = new Set(["node_modules", ".git", ".next", "dist", "build", ".cache", "coverage", "__pycache__", ".venv", "venv", ".tox", "target", "vendor", ".idea", ".vscode"]);
          
          for (const entry of entries) {
            if (results.length >= maxResults) break;
            
            const fullPath = path.join(dir, entry.name);
            
            if (entry.isDirectory()) {
              if (!skipDirs.has(entry.name)) {
                searchDir(fullPath, depth + 1);
              }
            } else if (entry.isFile()) {
              // Apply file pattern filter
              if (globRegex && !globRegex.test(entry.name)) continue;
              
              // Skip binary files by extension
              const ext = path.extname(entry.name).toLowerCase();
              const binaryExts = new Set([".png", ".jpg", ".jpeg", ".gif", ".ico", ".svg", ".woff", ".woff2", ".ttf", ".eot", ".mp3", ".mp4", ".zip", ".tar", ".gz", ".exe", ".dll", ".so", ".dylib", ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".sqlite", ".db"]);
              if (binaryExts.has(ext)) continue;
              
              try {
                const content = fs.readFileSync(fullPath, "utf-8");
                const lines = content.split("\n");
                for (let i = 0; i < lines.length; i++) {
                  if (results.length >= maxResults) break;
                  regex.lastIndex = 0;
                  if (regex.test(lines[i])) {
                    const relPath = path.relative(resolved, fullPath);
                    results.push({
                      file: relPath,
                      line: i + 1,
                      content: lines[i].trim().substring(0, 200),
                    });
                  }
                }
              } catch { /* skip unreadable files */ }
            }
          }
        }
        
        searchDir(resolved);
        
        const result = JSON.stringify({
          pattern,
          directory: dirPath,
          filePattern: filePattern || "all",
          matches: results.length,
          results,
          ...(results.length >= maxResults ? { truncated: true, hint: `Showing first ${maxResults} results. Use a more specific pattern or filePattern to narrow results.` } : {}),
        });
        setCachedToolResult("grep_code", params, result);
        return result;
      } catch (e: any) {
        return JSON.stringify({ error: e.message });
      }
    },
  },
  {
    name: "tree_view",
    description: "Display the directory tree structure of a project. Shows files and folders in a hierarchical tree format with depth control. Essential for understanding project structure before making changes.",
    parameters: {
      dirPath: { type: "string", description: "Directory path (relative to workspace, use '.' for root)" },
      maxDepth: { type: "string", description: "Maximum depth to traverse (default: 3, max: 6)" },
      showHidden: { type: "string", description: "Show hidden files/dirs like .git, .env (default: false)" },
    },
    execute: async (params, workspacePath) => {
      const cached = getCachedToolResult("tree_view", params);
      if (cached) return cached;
      const dirPath = (params.dirPath as string) || ".";
      const maxDepth = Math.min(parseInt(params.maxDepth as string) || 3, 6);
      const showHidden = (params.showHidden as string) === "true";
      
      try {
        const resolved = resolvePath(dirPath, workspacePath);
        if (!fs.existsSync(resolved)) return JSON.stringify({ error: `Directory not found: ${resolved}` });
        if (!fs.statSync(resolved).isDirectory()) return JSON.stringify({ error: `Path is not a directory: ${resolved}` });
        
        const skipDirs = new Set(["node_modules", ".git", ".next", "dist", "build", ".cache", "coverage", "__pycache__", ".venv", "venv", ".tox", "target", "vendor"]);
        const skipFiles = new Set([".DS_Store", "Thumbs.db"]);
        
        let totalFiles = 0;
        let totalDirs = 0;
        
        function buildTree(dir: string, depth: number, prefix: string): string {
          if (depth > maxDepth) return `${prefix}...\n`;
          
          let entries;
          try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return ""; }
          
          // Sort: directories first, then files, both alphabetically
          const sorted = entries
            .filter(e => {
              if (!showHidden && e.name.startsWith(".") && e.name !== ".") return false;
              if (e.isDirectory() && skipDirs.has(e.name)) return false;
              if (e.isFile() && skipFiles.has(e.name)) return false;
              return true;
            })
            .sort((a, b) => {
              if (a.isDirectory() && !b.isDirectory()) return -1;
              if (!a.isDirectory() && b.isDirectory()) return 1;
              return a.name.localeCompare(b.name);
            });
          
          let result = "";
          const maxEntries = 50; // Limit entries per directory for readability
          const shown = sorted.slice(0, maxEntries);
          
          for (let i = 0; i < shown.length; i++) {
            const entry = shown[i];
            const isLast = i === shown.length - 1;
            const connector = isLast ? "└── " : "├── ";
            const childPrefix = isLast ? "    " : "│   ";
            
            if (entry.isDirectory()) {
              totalDirs++;
              result += `${prefix}${connector}${entry.name}/\n`;
              result += buildTree(path.join(dir, entry.name), depth + 1, prefix + childPrefix);
            } else {
              totalFiles++;
              const size = getFileSize(path.join(dir, entry.name));
              result += `${prefix}${connector}${entry.name}${size ? ` (${size})` : ""}\n`;
            }
          }
          
          if (sorted.length > maxEntries) {
            result += `${prefix}└── ... and ${sorted.length - maxEntries} more\n`;
          }
          
          return result;
        }
        
        const tree = buildTree(resolved, 0, "");
        const rootName = path.basename(resolved);
        
        const result = JSON.stringify({
          root: rootName,
          path: dirPath,
          depth: maxDepth,
          tree: `${rootName}/\n${tree}`,
          stats: { files: totalFiles, directories: totalDirs },
        });
        setCachedToolResult("tree_view", params, result);
        return result;
      } catch (e: any) {
        return JSON.stringify({ error: e.message });
      }
    },
  },
  {
    name: "git_status",
    description: "Get the current git repository status including branch, changed files, recent commits, and staged/unstaged changes. Essential for understanding project state before making code changes.",
    parameters: {
      dirPath: { type: "string", description: "Path to the git repository (relative to workspace, use '.' for root)" },
    },
    execute: async (params, workspacePath) => {
      const cached = getCachedToolResult("git_status", params);
      if (cached) return cached;
      const dirPath = (params.dirPath as string) || ".";
      
      try {
        const resolved = resolvePath(dirPath, workspacePath);
        
        const runGit = (args: string): Promise<{ stdout: string; stderr: string; exitCode: number }> => {
          return new Promise((resolve) => {
            exec(`git ${args}`, { cwd: resolved, timeout: 10000 }, (error, stdout, stderr) => {
              resolve({ stdout: stdout?.trim() || "", stderr: stderr?.trim() || "", exitCode: error ? (error as any).code || 1 : 0 });
            });
          });
        };
        
        // Run multiple git commands in parallel
        const [branch, status, log, diffStat, remote] = await Promise.all([
          runGit("branch --show-current"),
          runGit("status --porcelain"),
          runGit("log --oneline -10"),
          runGit("diff --stat"),
          runGit("remote -v"),
        ]);
        
        if (branch.exitCode !== 0) {
          return JSON.stringify({ error: "Not a git repository", hint: "Initialize with 'git init' or navigate to a git repository." });
        }
        
        // Parse status
        const changedFiles = status.stdout.split("\n").filter(Boolean).map(line => ({
          status: line.substring(0, 2).trim(),
          file: line.substring(3),
        }));
        
        const staged = changedFiles.filter(f => f.status.includes("A") || f.status.includes("M") || f.status.includes("D") || f.status === "R");
        const unstaged = changedFiles.filter(f => f.status === " M" || f.status === " D" || f.status === "??");
        
        // Parse recent commits
        const commits = log.stdout.split("\n").filter(Boolean).map(line => {
          const match = line.match(/^([a-f0-9]+)\s+(.*)/);
          return match ? { hash: match[1], message: match[2] } : { hash: "", message: line };
        });
        
        const result = JSON.stringify({
          branch: branch.stdout,
          changedFiles: changedFiles.length,
          staged: staged.map(f => f.file),
          unstaged: unstaged.map(f => f.file),
          recentCommits: commits,
          diffStat: diffStat.stdout || "No unstaged changes",
          remote: remote.stdout.split("\n").filter(Boolean).map(r => {
            const match = r.match(/^(\w+)\s+(.+?)\s+\(.*\)/);
            return match ? { name: match[1], url: match[2] } : { name: "origin", url: r };
          }),
        });
        setCachedToolResult("git_status", params, result);
        return result;
      } catch (e: any) {
        return JSON.stringify({ error: e.message, hint: "Make sure git is installed and the directory is a git repository." });
      }
    },
  },
  {
    name: "http_request",
    description: "Make an HTTP request (GET, POST, PUT, DELETE, PATCH) to any URL. Supports custom headers, body, and authentication. More flexible than web_fetch for API calls, webhooks, and testing endpoints.",
    parameters: {
      url: { type: "string", description: "The full URL to request" },
      method: { type: "string", description: "HTTP method: GET, POST, PUT, DELETE, PATCH (default: GET)" },
      headers: { type: "string", description: "JSON object of headers, e.g. '{\"Authorization\": \"Bearer token\"}' (optional)" },
      body: { type: "string", description: "Request body (for POST/PUT/PATCH). Can be JSON string or plain text (optional)" },
    },
    execute: async (params) => {
      const cached = getCachedToolResult("http_request", params);
      if (cached) return cached;
      const url = (params.url as string)?.trim();
      const method = ((params.method as string) || "GET").toUpperCase();
      const headersStr = params.headers as string;
      const bodyStr = params.body as string;
      
      if (!url) return JSON.stringify({ error: "No URL provided" });
      if (!url.startsWith("http://") && !url.startsWith("https://")) {
        return JSON.stringify({ error: "URL must start with http:// or https://" });
      }
      
      const allowedMethods = ["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"];
      if (!allowedMethods.includes(method)) {
        return JSON.stringify({ error: `Method ${method} not allowed. Use: ${allowedMethods.join(", ")}` });
      }
      
      try {
        let parsedHeaders: Record<string, string> = {
          "User-Agent": "ClawHub-Agent/1.0",
          "Accept": "application/json, text/html, text/plain, */*",
        };
        
        if (headersStr) {
          try {
            const customHeaders = JSON.parse(headersStr);
            parsedHeaders = { ...parsedHeaders, ...customHeaders };
          } catch {
            return JSON.stringify({ error: "Invalid headers JSON. Provide a valid JSON object." });
          }
        }
        
        const fetchOptions: any = {
          method,
          headers: parsedHeaders,
          signal: AbortSignal.timeout(30000),
          redirect: "follow",
        };
        
        if (["POST", "PUT", "PATCH"].includes(method) && bodyStr) {
          fetchOptions.body = bodyStr;
          // Auto-set Content-Type if not specified
          if (!parsedHeaders["Content-Type"] && !parsedHeaders["content-type"]) {
            try {
              JSON.parse(bodyStr);
              fetchOptions.headers["Content-Type"] = "application/json";
            } catch {
              fetchOptions.headers["Content-Type"] = "text/plain";
            }
          }
        }
        
        const startTime = Date.now();
        const response = await fetch(url, fetchOptions);
        const duration = Date.now() - startTime;
        
        const contentType = response.headers.get("content-type") || "";
        let responseBody: string;
        let responseJson: any = null;
        
        const responseText = await response.text();
        
        if (contentType.includes("application/json")) {
          try {
            responseJson = JSON.parse(responseText);
            responseBody = JSON.stringify(responseJson, null, 2).substring(0, 20000);
          } catch {
            responseBody = responseText.substring(0, 20000);
          }
        } else {
          responseBody = responseText.substring(0, 20000);
        }
        
        // Collect response headers
        const respHeaders: Record<string, string> = {};
        response.headers.forEach((value, key) => { respHeaders[key] = value; });
        
        const result = JSON.stringify({
          status: response.status,
          statusText: response.statusText,
          headers: respHeaders,
          body: responseJson || responseBody,
          duration: `${duration}ms`,
          contentType,
          bodyLength: responseText.length,
          ...(responseText.length > 20000 ? { truncated: true, hint: "Response truncated to 20KB. Use web_fetch for full page content." } : {}),
        });
        setCachedToolResult("http_request", params, result);
        return result;
      } catch (e: any) {
        return JSON.stringify({ error: `Request failed: ${e.message}`, hint: "Check the URL, network connectivity, and try again." });
      }
    },
  },
  {
    name: "code_analysis",
    description: "Analyze a code file for issues, metrics, and suggestions. Provides line count, complexity estimate, potential bugs, style issues, and improvement suggestions. Works with any programming language.",
    parameters: {
      filePath: { type: "string", description: "Path to the code file relative to the workspace" },
      focus: { type: "string", description: "Analysis focus: 'bugs', 'security', 'performance', 'style', 'all' (default: 'all')" },
    },
    execute: async (params, workspacePath) => {
      const cached = getCachedToolResult("code_analysis", params);
      if (cached) return cached;
      const filePath = params.filePath as string;
      const focus = (params.focus as string) || "all";
      
      if (!filePath) return JSON.stringify({ error: "No file path provided" });
      
      try {
        const resolved = resolvePath(filePath, workspacePath);
        if (!fs.existsSync(resolved)) return JSON.stringify({ error: `File not found: ${resolved}` });
        if (!fs.statSync(resolved).isFile()) return JSON.stringify({ error: `Path is not a file: ${resolved}` });
        
        const content = fs.readFileSync(resolved, "utf-8");
        const lines = content.split("\n");
        const ext = path.extname(resolved).toLowerCase();
        
        // Basic metrics
        const metrics = {
          totalLines: lines.length,
          codeLines: lines.filter(l => l.trim() && !l.trim().startsWith("//") && !l.trim().startsWith("#") && !l.trim().startsWith("/*") && !l.trim().startsWith("*")).length,
          commentLines: lines.filter(l => l.trim().startsWith("//") || l.trim().startsWith("#") || l.trim().startsWith("/*") || l.trim().startsWith("*")).length,
          blankLines: lines.filter(l => !l.trim()).length,
          fileSize: fs.statSync(resolved).size,
          extension: ext,
        };
        
        // Pattern-based analysis
        const issues: { type: string; severity: "info" | "warning" | "error"; line?: number; message: string }[] = [];
        
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          const lineNum = i + 1;
          const trimmed = line.trim();
          
          if ((focus === "all" || focus === "security") && ext.match(/\.(ts|js|py|rb|php|java|go)$/)) {
            // Security checks
            if (/eval\s*\(/i.test(trimmed) && !trimmed.includes("//")) issues.push({ type: "security", severity: "error", line: lineNum, message: "Use of eval() — potential code injection risk" });
            if (/innerHTML\s*=/i.test(trimmed) && !trimmed.includes("//")) issues.push({ type: "security", severity: "warning", line: lineNum, message: "Direct innerHTML assignment — potential XSS risk. Use textContent or DOMPurify." });
            if (/password|secret|api_key|apikey/i.test(trimmed) && /=/.test(trimmed) && !trimmed.includes("env") && !trimmed.includes("process.env") && !trimmed.includes("//")) issues.push({ type: "security", severity: "error", line: lineNum, message: "Hardcoded credential/secret detected — use environment variables" });
            if (/SELECT.*FROM.*WHERE.*\+\s*["']|`\$\{.*\}.*`/i.test(trimmed)) issues.push({ type: "security", severity: "error", line: lineNum, message: "Potential SQL injection — use parameterized queries" });
          }
          
          if ((focus === "all" || focus === "bugs")) {
            // Bug pattern checks
            if (/console\.log/i.test(trimmed) && !trimmed.includes("//")) issues.push({ type: "bug", severity: "info", line: lineNum, message: "console.log statement — remove before production" });
            if (/TODO|FIXME|HACK|XXX/i.test(trimmed)) issues.push({ type: "bug", severity: "info", line: lineNum, message: `Code annotation found: ${trimmed.match(/TODO|FIXME|HACK|XXX/i)?.[0]}` });
            if (/catch\s*\(\s*\w*\s*\)\s*\{\s*\}/i.test(trimmed) || /except\s*:\s*pass/i.test(trimmed)) issues.push({ type: "bug", severity: "warning", line: lineNum, message: "Empty catch block — errors are silently swallowed" });
            if (/\.then\s*\(\s*\)/i.test(trimmed) && !/\.catch/i.test(content.substring(content.indexOf(trimmed), content.indexOf(trimmed) + 200))) issues.push({ type: "bug", severity: "warning", line: lineNum, message: "Promise without .catch() — unhandled rejection risk" });
          }
          
          if ((focus === "all" || focus === "performance")) {
            if (/document\.querySelector.*document\.querySelector/i.test(content)) issues.push({ type: "performance", severity: "info", line: lineNum, message: "Multiple DOM queries — cache the result" });
            if (/for\s*\(.*await/i.test(trimmed)) issues.push({ type: "performance", severity: "warning", line: lineNum, message: "Await inside loop — consider Promise.all() for parallel execution" });
          }
        }
        
        // Complexity estimate (very rough)
        const functionCount = (content.match(/function\s|=>\s|def\s|func\s|fn\s/g) || []).length;
        const branchCount = (content.match(/if\s*\(|else|switch|case|elif|match\s/g) || []).length;
        const loopCount = (content.match(/for\s*\(|while\s*\(|\.forEach|\.map|\.filter|\.reduce/g) || []).length;
        
        const result = JSON.stringify({
          file: filePath,
          metrics,
          complexity: {
            functions: functionCount,
            branches: branchCount,
            loops: loopCount,
            estimatedComplexity: functionCount + branchCount * 0.5 + loopCount * 0.3,
            level: functionCount + branchCount * 0.5 + loopCount * 0.3 > 20 ? "high" : functionCount + branchCount * 0.5 + loopCount * 0.3 > 10 ? "medium" : "low",
          },
          issues: issues.slice(0, 30),
          issueSummary: {
            errors: issues.filter(i => i.severity === "error").length,
            warnings: issues.filter(i => i.severity === "warning").length,
            info: issues.filter(i => i.severity === "info").length,
          },
        });
        setCachedToolResult("code_analysis", params, result);
        return result;
      } catch (e: any) {
        return JSON.stringify({ error: e.message });
      }
    },
  },
  {
    name: "execute_code",
    description: "Execute Python or JavaScript code safely in a sandboxed environment. Returns stdout, stderr, and exit code. Use for: running scripts, testing code, data processing, calculations. Supports: Python 3, Node.js. Timeout: 30 seconds max.",
    parameters: {
      language: { type: "string", description: "Programming language: 'python' or 'javascript' (default: 'python')" },
      code: { type: "string", description: "The code to execute. For Python, use standard Python 3 syntax. For JavaScript, use Node.js syntax." },
      timeout: { type: "string", description: "Execution timeout in seconds (default: 30, max: 60)" },
    },
    execute: async (params) => {
      const language = ((params.language as string) || "python").toLowerCase();
      const code = params.code as string;
      const timeout = Math.min(parseInt(params.timeout as string) || 30, 60);
      
      if (!code) return JSON.stringify({ error: "No code provided" });
      if (!["python", "javascript", "js"].includes(language)) {
        return JSON.stringify({ error: `Unsupported language: ${language}. Use 'python' or 'javascript'` });
      }
      
      try {
        const tmpDir = os.tmpdir();
        const scriptId = `clawhub_exec_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const ext = language === "javascript" || language === "js" ? "js" : "py";
        const scriptPath = path.join(tmpDir, `${scriptId}.${ext}`);
        
        // Write code to temporary file
        fs.writeFileSync(scriptPath, code, "utf-8");
        
        const cmd = ext === "py" ? "python3" : "node";
        const startTime = Date.now();
        
        return await new Promise<string>((resolve) => {
          const proc = exec(`"${cmd}" "${scriptPath}"`, { 
            timeout: timeout * 1000,
            maxBuffer: 1024 * 1024, // 1MB output limit
          }, (error: ExecException | null, stdout: string, stderr: string) => {
            // Clean up temp file
            try { fs.unlinkSync(scriptPath); } catch {}
            
            const duration = Date.now() - startTime;
            const result: any = {
              language: ext === "py" ? "python" : "javascript",
              exitCode: error ? (error as any).code || 1 : 0,
              stdout: stdout.substring(0, 20000),
              stderr: stderr.substring(0, 5000),
              duration: `${duration}ms`,
            };
            
            if (error) {
              if (error.killed) {
                result.timedOut = true;
                result.error = `Execution timed out after ${timeout} seconds`;
              } else if (error.message && !stderr) {
                result.error = error.message.substring(0, 1000);
              }
            }
            
            resolve(JSON.stringify(result));
          });
        });
      } catch (e: any) {
        return JSON.stringify({ error: `Failed to execute code: ${e.message}` });
      }
    },
  },
];

// Helper functions for new tools
function globToRegex(glob: string): RegExp {
  const regexStr = glob
    .replace(/\./g, "\\.")
    .replace(/\*/g, ".*")
    .replace(/\?/g, ".")
    .replace(/\{([^}]*)\}/g, (_, group) => `(${group.split(",").join("|")})`);
  return new RegExp(`^${regexStr}$`, "i");
}

function getFileSize(filePath: string): string {
  try {
    const stats = fs.statSync(filePath);
    if (stats.size < 1024) return `${stats.size}B`;
    if (stats.size < 1024 * 1024) return `${(stats.size / 1024).toFixed(1)}KB`;
    return `${(stats.size / (1024 * 1024)).toFixed(1)}MB`;
  } catch {
    return "";
  }
}

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

[TOOL CATEGORIES]
📄 FILE OPERATIONS: read_file, write_file, append_file, search_replace, list_files, diff_files
🔍 CODE: grep_code, tree_view, code_analysis
🌐 WEB: web_search, web_fetch, http_request
🧠 MEMORY: memory_save, memory_recall
📦 GIT: git_status
💻 SYSTEM: local_cmd, get_system_info, get_env_var, calculator, get_current_time

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

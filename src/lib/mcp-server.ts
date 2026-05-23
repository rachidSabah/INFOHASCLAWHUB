/**
 * MCPServer — ClawHub exposing itself as an MCP Server
 *
 * Enables external tools (Cursor, Claude Desktop, Windsurf, etc.) to
 * connect to ClawHub over HTTP+SSE or stdio and use its capabilities
 * as MCP tools & resources.
 *
 * Transports:
 *   - HTTP+SSE  (default port 3001) for remote / desktop-app connections
 *   - Stdio     for CLI tool integration
 *
 * Auth: API-key via `x-api-key` header (HTTP) or `--api-key` CLI flag (stdio)
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  CompleteRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { db } from "@/lib/db";
import { createServer, IncomingMessage, ServerResponse } from "http";
import { exec } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";
import crypto from "crypto";
import { randomUUID } from "crypto";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MCPServerConfig {
  port: number;
  apiKey: string;
  enabled: boolean;
  allowedOrigins: string[];
  maxConnections: number;
  commandTimeoutMs: number;
  allowedCommandPatterns: string[];
  blockedCommandPatterns: string[];
  workspaceRoot: string;
}

interface MCPServerSessionRow {
  id: string;
  clientName: string;
  clientVersion: string;
  transport: string;
  remoteAddr: string;
  apiKeyHash: string;
  connectedAt: string;
  disconnectedAt: string | null;
  requestCount: number;
  lastRequestAt: string | null;
  isActive: boolean;
  metadata: string;
}

interface ToolResult {
  content: Array<
    | { type: "text"; text: string }
    | { type: "resource"; resource: { uri: string; mimeType?: string; text: string } }
  >;
  isError?: boolean;
}

// ---------------------------------------------------------------------------
// Default config
// ---------------------------------------------------------------------------

const DEFAULT_CONFIG: MCPServerConfig = {
  port: 3001,
  apiKey: "",
  enabled: true,
  allowedOrigins: ["*"],
  maxConnections: 10,
  commandTimeoutMs: 30_000,
  allowedCommandPatterns: [
    "git *",
    "ls *",
    "cat *",
    "head *",
    "tail *",
    "wc *",
    "grep *",
    "find *",
    "pwd",
    "echo *",
    "node *",
    "npx *",
    "bun *",
    "npm *",
    "python3 *",
    "curl *",
    "which *",
    "du *",
    "df *",
    "ps *",
    "env",
    "whoami",
    "date",
  ],
  blockedCommandPatterns: [
    "rm -rf /",
    "rm -rf ~",
    "mkfs *",
    "dd *",
    ":(){ :|:& };:",
    "chmod 777 /",
    "wget * | sh",
    "curl * | sh",
    "> /dev/sda",
  ],
  workspaceRoot: os.homedir(),
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseJsonSafe<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function hashApiKey(key: string): string {
  return crypto.createHash("sha256").update(key).digest("hex");
}

function generateApiKey(): string {
  return `clawhub_${randomUUID().replace(/-/g, "")}`;
}

function isCommandAllowed(
  command: string,
  config: MCPServerConfig
): { allowed: boolean; reason?: string } {
  const trimmed = command.trim();

  // Block dangerous commands first
  for (const blocked of config.blockedCommandPatterns) {
    const regex = new RegExp(
      "^" + blocked.replace(/\*/g, ".*").replace(/\?/g, ".") + "$",
      "i"
    );
    if (regex.test(trimmed)) {
      return { allowed: false, reason: `Command matches blocked pattern: ${blocked}` };
    }
  }

  // Additional safety: block obvious destructive patterns
  const dangerousPatterns = [
    /rm\s+(-[a-zA-Z]*f[a-zA-Z]*\s+)?\/(?!tmp|home|usr\/local)/,
    /:\(\)\{/,
    /dd\s+if=.*of=\/dev/,
    /mkfs/,
    />\s*\/dev\/sd/,
    /chmod\s+777\s+\//,
  ];
  for (const pattern of dangerousPatterns) {
    if (pattern.test(trimmed)) {
      return { allowed: false, reason: "Command contains dangerous pattern" };
    }
  }

  // Check allowed patterns
  for (const allowed of config.allowedCommandPatterns) {
    const regex = new RegExp(
      "^" + allowed.replace(/\*/g, ".*").replace(/\?/g, ".") + "$",
      "i"
    );
    if (regex.test(trimmed)) {
      return { allowed: true };
    }
  }

  return { allowed: false, reason: "Command does not match any allowed pattern" };
}

function resolveSafePath(base: string, target: string): string {
  const resolved = path.resolve(base, target);
  if (!resolved.startsWith(base)) {
    throw new Error("Path traversal denied");
  }
  return resolved;
}

// ---------------------------------------------------------------------------
// Internal API helpers — call ClawHub's own REST API
// ---------------------------------------------------------------------------

const INTERNAL_BASE = "http://localhost:3000";

async function internalFetch<T>(
  apiPath: string,
  options?: RequestInit
): Promise<T> {
  const url = `${INTERNAL_BASE}${apiPath}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options?.headers ?? {}),
    },
    signal: AbortSignal.timeout(60_000),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Internal API ${res.status}: ${errText.slice(0, 300)}`);
  }

  return (await res.json()) as T;
}

/**
 * Call the internal chat API and accumulate the full SSE-streamed response.
 */
async function callChatAPI(
  prompt: string,
  model?: string,
  agentId?: string
): Promise<string> {
  const url = `${INTERNAL_BASE}/api/gemini/chat`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt,
      model: model || "gemini-2.5-flash",
      agentId: agentId || undefined,
      conversationHistory: [],
    }),
    signal: AbortSignal.timeout(120_000),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Chat API error ${res.status}: ${errText.slice(0, 300)}`);
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error("No response body from chat API");

  const decoder = new TextDecoder();
  let accumulated = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const text = decoder.decode(value, { stream: true });
    for (const line of text.split("\n")) {
      if (line.startsWith("data: ")) {
        try {
          const data = JSON.parse(line.slice(6));
          if (data.type === "chunk") accumulated += data.content || "";
        } catch {
          /* ignore malformed SSE */
        }
      }
    }
  }

  return accumulated;
}

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------

const CLAWHUB_TOOLS = [
  {
    name: "clawhub_chat",
    description:
      "Send a message to the ClawHub AI and get a response. Supports model selection and optional agent context.",
    inputSchema: {
      type: "object" as const,
      properties: {
        message: {
          type: "string",
          description: "The message to send to the AI",
        },
        model: {
          type: "string",
          description:
            "Model to use (e.g. gemini-2.5-pro, gemini-2.5-flash). Defaults to gemini-2.5-flash.",
        },
        agentId: {
          type: "string",
          description: "Optional agent ID to use as context for the response.",
        },
      },
      required: ["message"],
    },
  },
  {
    name: "clawhub_list_models",
    description: "List all available AI models configured in ClawHub.",
    inputSchema: {
      type: "object" as const,
      properties: {},
    },
  },
  {
    name: "clawhub_list_agents",
    description: "List all available agents in ClawHub with their roles and capabilities.",
    inputSchema: {
      type: "object" as const,
      properties: {
        activeOnly: {
          type: "boolean",
          description: "If true, only return active agents. Defaults to false.",
        },
      },
    },
  },
  {
    name: "clawhub_run_agent",
    description:
      "Execute an agent task. The agent will autonomously plan and execute steps to accomplish the given task.",
    inputSchema: {
      type: "object" as const,
      properties: {
        agentId: {
          type: "string",
          description: "The ID of the agent to run.",
        },
        task: {
          type: "string",
          description: "The task description for the agent to execute.",
        },
        model: {
          type: "string",
          description: "Optional model override for the agent run.",
        },
        maxIterations: {
          type: "number",
          description: "Maximum number of iterations (default: 10).",
        },
        workspacePath: {
          type: "string",
          description: "Optional workspace path for the agent to work in.",
        },
      },
      required: ["agentId", "task"],
    },
  },
  {
    name: "clawhub_search_memory",
    description:
      "Search the ClawHub memory store for relevant memories by keyword or semantic query.",
    inputSchema: {
      type: "object" as const,
      properties: {
        query: {
          type: "string",
          description: "The search query to find relevant memories.",
        },
        limit: {
          type: "number",
          description: "Maximum number of results to return (default: 10).",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "clawhub_read_file",
    description: "Read a file from the workspace. The path must be within the allowed workspace root.",
    inputSchema: {
      type: "object" as const,
      properties: {
        filePath: {
          type: "string",
          description: "Path to the file to read (relative to workspace root or absolute).",
        },
      },
      required: ["filePath"],
    },
  },
  {
    name: "clawhub_write_file",
    description: "Write content to a file in the workspace. Creates parent directories if needed.",
    inputSchema: {
      type: "object" as const,
      properties: {
        filePath: {
          type: "string",
          description: "Path to the file to write (relative to workspace root or absolute).",
        },
        content: {
          type: "string",
          description: "The content to write to the file.",
        },
      },
      required: ["filePath", "content"],
    },
  },
  {
    name: "clawhub_list_files",
    description: "List files and directories in a workspace directory.",
    inputSchema: {
      type: "object" as const,
      properties: {
        dirPath: {
          type: "string",
          description:
            "Directory path to list (relative to workspace root or absolute). Defaults to workspace root.",
        },
        recursive: {
          type: "boolean",
          description: "If true, list files recursively. Defaults to false.",
        },
      },
    },
  },
  {
    name: "clawhub_execute_command",
    description:
      "Run a shell command with safety checks. Only pre-approved command patterns are allowed. Dangerous commands are blocked.",
    inputSchema: {
      type: "object" as const,
      properties: {
        command: {
          type: "string",
          description: "The shell command to execute.",
        },
        cwd: {
          type: "string",
          description: "Working directory for the command. Defaults to workspace root.",
        },
        timeout: {
          type: "number",
          description: "Timeout in milliseconds (default: 30000, max: 120000).",
        },
      },
      required: ["command"],
    },
  },
];

// ---------------------------------------------------------------------------
// Resource templates
// ---------------------------------------------------------------------------

const CLAWHUB_RESOURCES = [
  {
    uri: "clawhub://conversations",
    name: "ClawHub Conversations",
    description: "List of all conversations in ClawHub",
    mimeType: "application/json",
  },
  {
    uri: "clawhub://memories",
    name: "ClawHub Memories",
    description: "All stored memories in ClawHub",
    mimeType: "application/json",
  },
  {
    uri: "clawhub://agents",
    name: "ClawHub Agents",
    description: "All configured agents in ClawHub",
    mimeType: "application/json",
  },
  {
    uri: "clawhub://conversations/{id}",
    name: "ClawHub Conversation",
    description: "A specific conversation with its messages",
    mimeType: "application/json",
  },
  {
    uri: "clawhub://agents/{id}",
    name: "ClawHub Agent Detail",
    description: "Details of a specific agent",
    mimeType: "application/json",
  },
];

// ---------------------------------------------------------------------------
// MCPServerSession — persists session info to DB via Settings key
// ---------------------------------------------------------------------------

async function saveSessionToDB(session: MCPServerSessionRow): Promise<void> {
  try {
    const entry = await db.settings.findUnique({
      where: { key: "mcp_server_sessions" },
    });
    let sessions: MCPServerSessionRow[] = entry
      ? parseJsonSafe<MCPServerSessionRow[]>(entry.value, [])
      : [];

    // Update existing or add new
    const idx = sessions.findIndex((s) => s.id === session.id);
    if (idx >= 0) {
      sessions[idx] = session;
    } else {
      sessions.push(session);
    }

    // Keep last 100 sessions
    if (sessions.length > 100) {
      sessions = sessions.slice(-100);
    }

    await db.settings.upsert({
      where: { key: "mcp_server_sessions" },
      update: { value: JSON.stringify(sessions) },
      create: { key: "mcp_server_sessions", value: JSON.stringify(sessions) },
    });
  } catch (err) {
    console.error("[MCPServer] Failed to save session:", err);
  }
}

async function getActiveSessions(): Promise<MCPServerSessionRow[]> {
  try {
    const entry = await db.settings.findUnique({
      where: { key: "mcp_server_sessions" },
    });
    const sessions = entry
      ? parseJsonSafe<MCPServerSessionRow[]>(entry.value, [])
      : [];
    return sessions.filter((s) => s.isActive);
  } catch {
    return [];
  }
}

async function deactivateSession(sessionId: string): Promise<void> {
  try {
    const entry = await db.settings.findUnique({
      where: { key: "mcp_server_sessions" },
    });
    if (!entry) return;
    const sessions = parseJsonSafe<MCPServerSessionRow[]>(entry.value, []);
    const session = sessions.find((s) => s.id === sessionId);
    if (session) {
      session.isActive = false;
      session.disconnectedAt = new Date().toISOString();
      await db.settings.upsert({
        where: { key: "mcp_server_sessions" },
        update: { value: JSON.stringify(sessions) },
        create: { key: "mcp_server_sessions", value: JSON.stringify(sessions) },
      });
    }
  } catch {
    /* graceful */
  }
}

// ---------------------------------------------------------------------------
// MCPServerEngine — the singleton engine
// ---------------------------------------------------------------------------

const globalForMCP = globalThis as unknown as {
  __mcpServerEngine: MCPServerEngine | undefined;
};

class MCPServerEngine {
  private config: MCPServerConfig;
  private httpServer: ReturnType<typeof createServer> | null = null;
  private activeTransports: Map<string, SSEServerTransport> = new Map();
  private activeSessions: Map<string, MCPServerSessionRow> = new Map();
  private started = false;

  constructor(config?: Partial<MCPServerConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // -----------------------------------------------------------------------
  // Config management
  // -----------------------------------------------------------------------

  getConfig(): MCPServerConfig {
    return { ...this.config };
  }

  async updateConfig(partial: Partial<MCPServerConfig>): Promise<MCPServerConfig> {
    this.config = { ...this.config, ...partial };
    await this.saveConfigToDB();
    return this.getConfig();
  }

  async saveConfigToDB(): Promise<void> {
    try {
      await db.settings.upsert({
        where: { key: "mcp_server_config" },
        update: { value: JSON.stringify(this.config) },
        create: { key: "mcp_server_config", value: JSON.stringify(this.config) },
      });
    } catch (err) {
      console.error("[MCPServer] Failed to save config:", err);
    }
  }

  async loadConfigFromDB(): Promise<void> {
    try {
      const entry = await db.settings.findUnique({
        where: { key: "mcp_server_config" },
      });
      if (entry) {
        const stored = parseJsonSafe<Partial<MCPServerConfig>>(entry.value, {});
        this.config = { ...DEFAULT_CONFIG, ...stored };
      }
    } catch {
      /* use defaults */
    }
  }

  // -----------------------------------------------------------------------
  // API Key management
  // -----------------------------------------------------------------------

  async getOrCreateApiKey(): Promise<string> {
    if (this.config.apiKey) return this.config.apiKey;

    // Check DB
    try {
      const entry = await db.settings.findUnique({
        where: { key: "mcp_server_api_key" },
      });
      if (entry) {
        this.config.apiKey = entry.value;
        return entry.value;
      }
    } catch {
      /* generate new */
    }

    // Generate new key
    const newKey = generateApiKey();
    this.config.apiKey = newKey;

    try {
      await db.settings.upsert({
        where: { key: "mcp_server_api_key" },
        update: { value: newKey },
        create: { key: "mcp_server_api_key", value: newKey },
      });
      await this.saveConfigToDB();
    } catch (err) {
      console.error("[MCPServer] Failed to save API key:", err);
    }

    return newKey;
  }

  async regenerateApiKey(): Promise<string> {
    const newKey = generateApiKey();
    this.config.apiKey = newKey;

    try {
      await db.settings.upsert({
        where: { key: "mcp_server_api_key" },
        update: { value: newKey },
        create: { key: "mcp_server_api_key", value: newKey },
      });
      await this.saveConfigToDB();
    } catch (err) {
      console.error("[MCPServer] Failed to regenerate API key:", err);
    }

    return newKey;
  }

  // -----------------------------------------------------------------------
  // Auth validation
  // -----------------------------------------------------------------------

  validateApiKey(providedKey: string): boolean {
    if (!this.config.apiKey) return true; // No key set = open access
    return providedKey === this.config.apiKey;
  }

  // -----------------------------------------------------------------------
  // MCP Server factory — creates a configured MCP Server instance
  // -----------------------------------------------------------------------

  private createMCPServer(): Server {
    const server = new Server(
      {
        name: "clawhub-desktop",
        version: "1.0.0",
      },
      {
        capabilities: {
          tools: {},
          resources: {},
          logging: {},
        },
      }
    );

    // ── List Tools ──
    server.setRequestHandler(ListToolsRequestSchema, async () => {
      return { tools: CLAWHUB_TOOLS };
    });

    // ── Call Tool ──
    server.setRequestHandler(
      CallToolRequestSchema,
      async (request) => {
        const { name, arguments: args } = request.params;
        return this.handleToolCall(name, args ?? {}) as any;
      }
    );

    // ── List Resources ──
    server.setRequestHandler(ListResourcesRequestSchema, async () => {
      return {
        resources: CLAWHUB_RESOURCES.map((r) => ({
          uri: r.uri,
          name: r.name,
          description: r.description,
          mimeType: r.mimeType,
        })),
      };
    });

    // ── Read Resource ──
    server.setRequestHandler(
      ReadResourceRequestSchema,
      async (request) => {
        const { uri } = request.params;
        return this.handleResourceRead(uri);
      }
    );

    // ── Completion (optional) ──
    server.setRequestHandler(CompleteRequestSchema, async () => {
      return { completion: { values: [], total: 0, hasMore: false } };
    });

    return server;
  }

  // -----------------------------------------------------------------------
  // Tool call handler
  // -----------------------------------------------------------------------

  private async handleToolCall(
    toolName: string,
    args: Record<string, unknown>
  ): Promise<ToolResult> {
    try {
      switch (toolName) {
        case "clawhub_chat":
          return await this.toolChat(args);
        case "clawhub_list_models":
          return await this.toolListModels();
        case "clawhub_list_agents":
          return await this.toolListAgents(args);
        case "clawhub_run_agent":
          return await this.toolRunAgent(args);
        case "clawhub_search_memory":
          return await this.toolSearchMemory(args);
        case "clawhub_read_file":
          return await this.toolReadFile(args);
        case "clawhub_write_file":
          return await this.toolWriteFile(args);
        case "clawhub_list_files":
          return await this.toolListFiles(args);
        case "clawhub_execute_command":
          return await this.toolExecuteCommand(args);
        default:
          return {
            content: [{ type: "text", text: `Unknown tool: ${toolName}` }],
            isError: true,
          };
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        content: [{ type: "text", text: `Error: ${msg}` }],
        isError: true,
      };
    }
  }

  // ── clawhub_chat ──

  private async toolChat(args: Record<string, unknown>): Promise<ToolResult> {
    const message = args.message as string;
    const model = args.model as string | undefined;
    const agentId = args.agentId as string | undefined;

    if (!message) {
      return {
        content: [{ type: "text", text: "Error: message is required" }],
        isError: true,
      };
    }

    const response = await callChatAPI(message, model, agentId);

    return {
      content: [{ type: "text", text: response }],
    };
  }

  // ── clawhub_list_models ──

  private async toolListModels(): Promise<ToolResult> {
    try {
      const data = await internalFetch<{ models?: Array<{ id: string; name?: string; provider?: string }> }>(
        "/api/models"
      );
      return {
        content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      };
    } catch (err: unknown) {
      // Fallback: read providers from DB
      try {
        const providers = await db.provider.findMany({ where: { isActive: true } });
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  models: providers.map((p) => ({
                    provider: p.name,
                    baseUrl: p.baseUrl,
                  })),
                },
                null,
                2
              ),
            },
          ],
        };
      } catch {
        return {
          content: [
            {
              type: "text",
              text: "Error: Could not retrieve models list",
            },
          ],
          isError: true,
        };
      }
    }
  }

  // ── clawhub_list_agents ──

  private async toolListAgents(
    args: Record<string, unknown>
  ): Promise<ToolResult> {
    const activeOnly = (args.activeOnly as boolean) ?? false;

    try {
      const where = activeOnly ? { isActive: true } : {};
      const agents = await db.agent.findMany({ where });

      const result = agents.map((a) => ({
        id: a.id,
        name: a.name,
        role: a.role,
        avatar: a.avatar,
        isActive: a.isActive,
        skills: a.skills ? parseJsonSafe<string[]>(a.skills, []) : [],
      }));

      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    } catch (err: unknown) {
      return {
        content: [
          {
            type: "text",
            text: `Error listing agents: ${err instanceof Error ? err.message : String(err)}`,
          },
        ],
        isError: true,
      };
    }
  }

  // ── clawhub_run_agent ──

  private async toolRunAgent(args: Record<string, unknown>): Promise<ToolResult> {
    const agentId = args.agentId as string;
    const task = args.task as string;
    const model = args.model as string | undefined;
    const maxIterations = (args.maxIterations as number) ?? 10;
    const workspacePath = args.workspacePath as string | undefined;

    if (!agentId || !task) {
      return {
        content: [{ type: "text", text: "Error: agentId and task are required" }],
        isError: true,
      };
    }

    try {
      // Use internal API to start agent run
      const data = await internalFetch<{ runId: string }>(
        "/api/agents/run",
        {
          method: "POST",
          body: JSON.stringify({
            agentId,
            task,
            model: model || "gemini-2.5-flash",
            maxIterations,
            workspacePath,
          }),
        }
      );

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                status: "started",
                runId: data.runId || "unknown",
                agentId,
                task,
                maxIterations,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (err: unknown) {
      // Fallback: direct chat API call
      try {
        const agent = await db.agent.findUnique({ where: { id: agentId } });
        if (!agent) {
          return {
            content: [{ type: "text", text: `Error: Agent ${agentId} not found` }],
            isError: true,
          };
        }

        const prompt = `You are ${agent.name}, ${agent.role}.\n\n${agent.systemPrompt}\n\nTASK: ${task}`;
        const response = await callChatAPI(prompt, model, agentId);

        return {
          content: [{ type: "text", text: response }],
        };
      } catch (innerErr: unknown) {
        return {
          content: [
            {
              type: "text",
              text: `Error running agent: ${innerErr instanceof Error ? innerErr.message : String(innerErr)}`,
            },
          ],
          isError: true,
        };
      }
    }
  }

  // ── clawhub_search_memory ──

  private async toolSearchMemory(
    args: Record<string, unknown>
  ): Promise<ToolResult> {
    const query = args.query as string;
    const limit = (args.limit as number) ?? 10;

    if (!query) {
      return {
        content: [{ type: "text", text: "Error: query is required" }],
        isError: true,
      };
    }

    try {
      // Search by key or content (case-insensitive)
      const memories = await db.memory.findMany({
        where: {
          OR: [
            { key: { contains: query } },
            { content: { contains: query } },
          ],
        },
        take: limit,
        orderBy: { updatedAt: "desc" },
      });

      const result = memories.map((m) => ({
        id: m.id,
        key: m.key,
        content: m.content.slice(0, 500),
        source: m.source,
        createdAt: m.createdAt,
        updatedAt: m.updatedAt,
      }));

      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    } catch (err: unknown) {
      return {
        content: [
          {
            type: "text",
            text: `Error searching memory: ${err instanceof Error ? err.message : String(err)}`,
          },
        ],
        isError: true,
      };
    }
  }

  // ── clawhub_read_file ──

  private async toolReadFile(args: Record<string, unknown>): Promise<ToolResult> {
    const filePath = args.filePath as string;

    if (!filePath) {
      return {
        content: [{ type: "text", text: "Error: filePath is required" }],
        isError: true,
      };
    }

    try {
      const resolved = path.isAbsolute(filePath)
        ? filePath
        : resolveSafePath(this.config.workspaceRoot, filePath);

      if (!fs.existsSync(resolved)) {
        return {
          content: [{ type: "text", text: `Error: File not found: ${resolved}` }],
          isError: true,
        };
      }

      const stats = fs.statSync(resolved);
      if (stats.isDirectory()) {
        return {
          content: [{ type: "text", text: `Error: Path is a directory, not a file: ${resolved}` }],
          isError: true,
        };
      }

      // Limit file size to 1MB
      if (stats.size > 1_024_000) {
        return {
          content: [
            {
              type: "text",
              text: `Error: File too large (${(stats.size / 1024).toFixed(0)}KB). Maximum size is 1MB.`,
            },
          ],
          isError: true,
        };
      }

      const content = fs.readFileSync(resolved, "utf-8");
      const ext = path.extname(resolved).toLowerCase();
      const mimeMap: Record<string, string> = {
        ".json": "application/json",
        ".md": "text/markdown",
        ".txt": "text/plain",
        ".csv": "text/csv",
        ".html": "text/html",
        ".xml": "application/xml",
        ".yaml": "text/yaml",
        ".yml": "text/yaml",
        ".ts": "text/typescript",
        ".tsx": "text/typescript",
        ".js": "text/javascript",
        ".jsx": "text/javascript",
        ".py": "text/x-python",
        ".css": "text/css",
        ".scss": "text/x-scss",
      };

      return {
        content: [
          {
            type: "resource",
            resource: {
              uri: `file://${resolved}`,
              mimeType: mimeMap[ext] || "text/plain",
              text: content,
            },
          },
        ],
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        content: [{ type: "text", text: `Error reading file: ${msg}` }],
        isError: true,
      };
    }
  }

  // ── clawhub_write_file ──

  private async toolWriteFile(args: Record<string, unknown>): Promise<ToolResult> {
    const filePath = args.filePath as string;
    const content = args.content as string;

    if (!filePath || content === undefined) {
      return {
        content: [{ type: "text", text: "Error: filePath and content are required" }],
        isError: true,
      };
    }

    try {
      const resolved = path.isAbsolute(filePath)
        ? filePath
        : resolveSafePath(this.config.workspaceRoot, filePath);

      // Ensure parent directory exists
      const parentDir = path.dirname(resolved);
      if (!fs.existsSync(parentDir)) {
        fs.mkdirSync(parentDir, { recursive: true });
      }

      fs.writeFileSync(resolved, content, "utf-8");

      return {
        content: [{ type: "text", text: `File written successfully: ${resolved}` }],
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        content: [{ type: "text", text: `Error writing file: ${msg}` }],
        isError: true,
      };
    }
  }

  // ── clawhub_list_files ──

  private async toolListFiles(args: Record<string, unknown>): Promise<ToolResult> {
    const dirPath = (args.dirPath as string) || this.config.workspaceRoot;
    const recursive = (args.recursive as boolean) ?? false;

    try {
      const resolved = path.isAbsolute(dirPath)
        ? dirPath
        : resolveSafePath(this.config.workspaceRoot, dirPath);

      if (!fs.existsSync(resolved)) {
        return {
          content: [{ type: "text", text: `Error: Directory not found: ${resolved}` }],
          isError: true,
        };
      }

      const stats = fs.statSync(resolved);
      if (!stats.isDirectory()) {
        return {
          content: [{ type: "text", text: `Error: Path is not a directory: ${resolved}` }],
          isError: true,
        };
      }

      interface FileEntry {
        name: string;
        path: string;
        type: "file" | "directory";
        size: number;
      }

      const entries: FileEntry[] = [];

      function listDir(dir: string, depth = 0): void {
        if (recursive && depth > 10) return; // max depth safety

        const items = fs.readdirSync(dir);
        for (const item of items) {
          // Skip hidden files and common ignore dirs
          if (item.startsWith(".") || item === "node_modules" || item === "__pycache__") continue;

          const fullPath = path.join(dir, item);
          try {
            const itemStats = fs.statSync(fullPath);
            entries.push({
              name: item,
              path: fullPath,
              type: itemStats.isDirectory() ? "directory" : "file",
              size: itemStats.size,
            });

            if (recursive && itemStats.isDirectory()) {
              listDir(fullPath, depth + 1);
            }
          } catch {
            // Permission denied or other error, skip
          }
        }
      }

      listDir(resolved);

      // Sort: directories first, then alphabetical
      entries.sort((a, b) => {
        if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
        return a.name.localeCompare(b.name);
      });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                path: resolved,
                count: entries.length,
                entries: entries.slice(0, 500), // limit output
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        content: [{ type: "text", text: `Error listing files: ${msg}` }],
        isError: true,
      };
    }
  }

  // ── clawhub_execute_command ──

  private async toolExecuteCommand(
    args: Record<string, unknown>
  ): Promise<ToolResult> {
    const command = args.command as string;
    const cwd = (args.cwd as string) || this.config.workspaceRoot;
    const timeout = Math.min(
      (args.timeout as number) ?? this.config.commandTimeoutMs,
      120_000
    );

    if (!command) {
      return {
        content: [{ type: "text", text: "Error: command is required" }],
        isError: true,
      };
    }

    // Safety check
    const { allowed, reason } = isCommandAllowed(command, this.config);
    if (!allowed) {
      return {
        content: [
          {
            type: "text",
            text: `Error: Command blocked for safety. ${reason || "Command not in allowed list."}`,
          },
        ],
        isError: true,
      };
    }

    return new Promise<ToolResult>((resolve) => {
      exec(
        command,
        {
          cwd,
          timeout,
          maxBuffer: 1024 * 1024, // 1MB output buffer
          windowsHide: true,
        },
        (error, stdout, stderr) => {
          const result = {
            command,
            cwd,
            stdout: stdout || "",
            stderr: stderr || "",
            exitCode: error ? error.code ?? 1 : 0,
            success: !error,
          };

          resolve({
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
            isError: !!error,
          });
        }
      );
    });
  }

  // -----------------------------------------------------------------------
  // Resource read handler
  // -----------------------------------------------------------------------

  private async handleResourceRead(uri: string) {
    const contents: Array<{
      uri: string;
      mimeType?: string;
      text: string;
    }> = [];

    try {
      if (uri === "clawhub://conversations") {
        const conversations = await db.conversation.findMany({
          orderBy: { updatedAt: "desc" },
          take: 50,
          select: {
            id: true,
            title: true,
            model: true,
            isFavorite: true,
            createdAt: true,
            updatedAt: true,
          },
        });
        contents.push({
          uri,
          mimeType: "application/json",
          text: JSON.stringify(conversations, null, 2),
        });
      } else if (uri === "clawhub://memories") {
        const memories = await db.memory.findMany({
          orderBy: { updatedAt: "desc" },
          take: 100,
          select: {
            id: true,
            key: true,
            content: true,
            source: true,
            createdAt: true,
            updatedAt: true,
          },
        });
        contents.push({
          uri,
          mimeType: "application/json",
          text: JSON.stringify(memories, null, 2),
        });
      } else if (uri === "clawhub://agents") {
        const agents = await db.agent.findMany({
          select: {
            id: true,
            name: true,
            role: true,
            avatar: true,
            isActive: true,
            skills: true,
          },
        });
        contents.push({
          uri,
          mimeType: "application/json",
          text: JSON.stringify(agents, null, 2),
        });
      } else if (uri.startsWith("clawhub://conversations/")) {
        const id = uri.replace("clawhub://conversations/", "");
        const conversation = await db.conversation.findUnique({
          where: { id },
          include: {
            messages: {
              orderBy: { createdAt: "asc" },
              select: {
                id: true,
                role: true,
                content: true,
                createdAt: true,
              },
            },
          },
        });
        if (conversation) {
          contents.push({
            uri,
            mimeType: "application/json",
            text: JSON.stringify(conversation, null, 2),
          });
        }
      } else if (uri.startsWith("clawhub://agents/")) {
        const id = uri.replace("clawhub://agents/", "");
        const agent = await db.agent.findUnique({ where: { id } });
        if (agent) {
          contents.push({
            uri,
            mimeType: "application/json",
            text: JSON.stringify(agent, null, 2),
          });
        }
      }
    } catch (err: unknown) {
      contents.push({
        uri,
        mimeType: "text/plain",
        text: `Error reading resource: ${err instanceof Error ? err.message : String(err)}`,
      });
    }

    return { contents };
  }

  // -----------------------------------------------------------------------
  // Lifecycle — Start / Stop
  // -----------------------------------------------------------------------

  async start(): Promise<void> {
    if (this.started) return;

    // Load config from DB
    await this.loadConfigFromDB();

    // Ensure API key exists
    await this.getOrCreateApiKey();

    if (!this.config.enabled) {
      console.log("[MCPServer] Disabled in config — not starting");
      return;
    }

    this.started = true;
    console.log(
      `[MCPServer] Starting on port ${this.config.port} (HTTP+SSE transport)`
    );

    // Start HTTP+SSE server
    this.startHTTPServer();
  }

  async stop(): Promise<void> {
    if (!this.started) return;
    this.started = false;

    // Deactivate all sessions
    for (const [id, session] of this.activeSessions) {
      session.isActive = false;
      session.disconnectedAt = new Date().toISOString();
      await deactivateSession(id);
    }
    this.activeSessions.clear();

    // Close all SSE transports
    for (const [, transport] of this.activeTransports) {
      try {
        await transport.close?.();
      } catch {
        /* graceful */
      }
    }
    this.activeTransports.clear();

    // Shutdown HTTP server
    if (this.httpServer) {
      await new Promise<void>((resolve) => {
        this.httpServer!.close(() => resolve());
      });
      this.httpServer = null;
    }

    console.log("[MCPServer] Stopped");
  }

  // -----------------------------------------------------------------------
  // HTTP+SSE Transport
  // -----------------------------------------------------------------------

  private startHTTPServer(): void {
    this.httpServer = createServer(async (req, res) => {
      await this.handleHTTPRequest(req, res);
    });

    this.httpServer.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "EADDRINUSE") {
        console.warn(
          `[MCPServer] Port ${this.config.port} already in use, trying ${this.config.port + 1}`
        );
        this.config.port += 1;
        this.startHTTPServer();
      } else {
        console.error("[MCPServer] HTTP server error:", err);
      }
    });

    this.httpServer.listen(this.config.port, () => {
      console.log(
        `[MCPServer] HTTP+SSE server listening on http://localhost:${this.config.port}`
      );
      console.log(
        `[MCPServer] SSE endpoint: http://localhost:${this.config.port}/sse`
      );
      console.log(
        `[MCPServer] Messages endpoint: http://localhost:${this.config.port}/messages`
      );
    });
  }

  private async handleHTTPRequest(
    req: IncomingMessage,
    res: ServerResponse
  ): Promise<void> {
    const url = new URL(req.url ?? "/", `http://localhost:${this.config.port}`);
    const pathname = url.pathname;

    // CORS headers
    const origin = req.headers.origin || "*";
    const allowedOrigins = this.config.allowedOrigins;
    const isOriginAllowed =
      allowedOrigins.includes("*") || allowedOrigins.includes(origin);

    res.setHeader("Access-Control-Allow-Origin", isOriginAllowed ? origin : "");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-api-key");
    res.setHeader("Access-Control-Expose-Headers", "Mcp-Session-Id");

    // Preflight
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    // ── Authentication ──
    if (this.config.apiKey) {
      const apiKey = req.headers["x-api-key"] as string | undefined;
      if (!apiKey || !this.validateApiKey(apiKey)) {
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Invalid or missing API key" }));
        return;
      }
    }

    // ── Connection limit ──
    const activeCount = this.activeTransports.size;
    if (activeCount >= this.config.maxConnections && pathname === "/sse") {
      res.writeHead(429, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Maximum connections reached" }));
      return;
    }

    // ── GET /sse — SSE endpoint for MCP client to connect ──
    if (pathname === "/sse" && req.method === "GET") {
      const mcpServer = this.createMCPServer();
      const transport = new SSEServerTransport("/messages", res);
      this.activeTransports.set(transport.sessionId, transport);

      // Track session
      const session: MCPServerSessionRow = {
        id: transport.sessionId,
        clientName: "unknown",
        clientVersion: "unknown",
        transport: "http+sse",
        remoteAddr: req.socket.remoteAddress ?? "unknown",
        apiKeyHash: this.config.apiKey
          ? hashApiKey(this.config.apiKey)
          : "none",
        connectedAt: new Date().toISOString(),
        disconnectedAt: null,
        requestCount: 0,
        lastRequestAt: null,
        isActive: true,
        metadata: JSON.stringify({ userAgent: req.headers["user-agent"] }),
      };
      this.activeSessions.set(transport.sessionId, session);
      await saveSessionToDB(session);

      // Connect MCP server to transport
      await mcpServer.connect(transport);

      // Handle close
      req.on("close", async () => {
        this.activeTransports.delete(transport.sessionId);
        const s = this.activeSessions.get(transport.sessionId);
        if (s) {
          s.isActive = false;
          s.disconnectedAt = new Date().toISOString();
          await deactivateSession(transport.sessionId);
          this.activeSessions.delete(transport.sessionId);
        }
        console.log(
          `[MCPServer] Client disconnected: ${transport.sessionId.slice(0, 8)}...`
        );
      });

      console.log(
        `[MCPServer] Client connected: ${transport.sessionId.slice(0, 8)}... (${activeCount + 1} active)`
      );
      return;
    }

    // ── POST /messages — MCP client sends messages here ──
    if (pathname === "/messages" && req.method === "POST") {
      const sessionId = url.searchParams.get("sessionId");

      if (!sessionId) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Missing sessionId parameter" }));
        return;
      }

      const transport = this.activeTransports.get(sessionId);
      if (!transport) {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Session not found" }));
        return;
      }

      // Update session stats
      const session = this.activeSessions.get(sessionId);
      if (session) {
        session.requestCount++;
        session.lastRequestAt = new Date().toISOString();
      }

      await transport.handlePostMessage(req, res);
      return;
    }

    // ── GET /health — Health check endpoint ──
    if (pathname === "/health" && req.method === "GET") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          status: "ok",
          server: "clawhub-desktop",
          version: "1.0.0",
          activeConnections: this.activeTransports.size,
          port: this.config.port,
          uptime: process.uptime(),
        })
      );
      return;
    }

    // ── GET /config — Get server config (non-sensitive) ──
    if (pathname === "/config" && req.method === "GET") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          name: "clawhub-desktop",
          version: "1.0.0",
          port: this.config.port,
          enabled: this.config.enabled,
          maxConnections: this.config.maxConnections,
          workspaceRoot: this.config.workspaceRoot,
          hasApiKey: !!this.config.apiKey,
          activeConnections: this.activeTransports.size,
        })
      );
      return;
    }

    // ── GET / — Info page ──
    if (pathname === "/" && req.method === "GET") {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(`<!DOCTYPE html>
<html>
<head><title>ClawHub MCP Server</title></head>
<body style="font-family:system-ui,sans-serif;max-width:720px;margin:40px auto;padding:0 20px">
  <h1>ClawHub MCP Server</h1>
  <p>ClawHub Desktop is exposing itself as an <strong>MCP Server</strong> so external tools can connect.</p>
  <h2>Connection Info</h2>
  <table style="border-collapse:collapse">
    <tr><td style="padding:4px 12px;font-weight:bold">SSE Endpoint</td><td><code>http://localhost:${this.config.port}/sse</code></td></tr>
    <tr><td style="padding:4px 12px;font-weight:bold">Messages</td><td><code>http://localhost:${this.config.port}/messages</code></td></tr>
    <tr><td style="padding:4px 12px;font-weight:bold">Auth</td><td>API Key via <code>x-api-key</code> header${this.config.apiKey ? " (required)" : " (not configured)"}</td></tr>
    <tr><td style="padding:4px 12px;font-weight:bold">Active Connections</td><td>${this.activeTransports.size}</td></tr>
  </table>
  <h2>Client Configuration</h2>
  <h3>Cursor</h3>
  <pre style="background:#f4f4f4;padding:12px;border-radius:6px;overflow-x:auto">{
  "mcpServers": {
    "clawhub": {
      "url": "http://localhost:${this.config.port}/sse"${this.config.apiKey ? `,\n      "headers": { "x-api-key": "YOUR_API_KEY" }` : ""}
    }
  }
}</pre>
  <h3>Claude Desktop</h3>
  <pre style="background:#f4f4f4;padding:12px;border-radius:6px;overflow-x:auto">{
  "mcpServers": {
    "clawhub": {
      "url": "http://localhost:${this.config.port}/sse"${this.config.apiKey ? `,\n      "headers": { "x-api-key": "YOUR_API_KEY" }` : ""}
    }
  }
}</pre>
  <h3>Windsurf</h3>
  <pre style="background:#f4f4f4;padding:12px;border-radius:6px;overflow-x:auto">{
  "mcpServers": {
    "clawhub": {
      "serverUrl": "http://localhost:${this.config.port}/sse"${this.config.apiKey ? `,\n      "apiKey": "YOUR_API_KEY"` : ""}
    }
  }
}</pre>
  <h2>Available Tools</h2>
  <ul>${CLAWHUB_TOOLS.map((t) => `<li><code>${t.name}</code> — ${t.description}</li>`).join("\n    ")}</ul>
  <h2>Available Resources</h2>
  <ul>${CLAWHUB_RESOURCES.map((r) => `<li><code>${r.uri}</code> — ${r.description}</li>`).join("\n    ")}</ul>
</body>
</html>`);
      return;
    }

    // 404
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not found" }));
  }

  // -----------------------------------------------------------------------
  // Stdio Transport — for CLI integration
  // -----------------------------------------------------------------------

  async startStdio(): Promise<void> {
    const mcpServer = this.createMCPServer();
    const transport = new StdioServerTransport();
    await mcpServer.connect(transport);

    console.error("[MCPServer] Stdio transport started");

    // Track session
    const session: MCPServerSessionRow = {
      id: randomUUID(),
      clientName: "stdio",
      clientVersion: "unknown",
      transport: "stdio",
      remoteAddr: "local",
      apiKeyHash: this.config.apiKey ? hashApiKey(this.config.apiKey) : "none",
      connectedAt: new Date().toISOString(),
      disconnectedAt: null,
      requestCount: 0,
      lastRequestAt: null,
      isActive: true,
      metadata: "{}",
    };
    await saveSessionToDB(session);
  }

  // -----------------------------------------------------------------------
  // Status / Info
  // -----------------------------------------------------------------------

  getStatus(): {
    started: boolean;
    port: number;
    enabled: boolean;
    activeConnections: number;
    config: MCPServerConfig;
  } {
    return {
      started: this.started,
      port: this.config.port,
      enabled: this.config.enabled,
      activeConnections: this.activeTransports.size,
      config: this.getConfig(),
    };
  }

  async getSessionList(): Promise<MCPServerSessionRow[]> {
    const active = Array.from(this.activeSessions.values());
    const dbSessions = await getActiveSessions();
    // Merge in-memory with DB
    const merged = new Map<string, MCPServerSessionRow>();
    for (const s of dbSessions) merged.set(s.id, s);
    for (const s of active) merged.set(s.id, s);
    return Array.from(merged.values());
  }
}

// ---------------------------------------------------------------------------
// Singleton export
// ---------------------------------------------------------------------------

export function getMCPServerEngine(): MCPServerEngine {
  if (!globalForMCP.__mcpServerEngine) {
    globalForMCP.__mcpServerEngine = new MCPServerEngine();
  }
  return globalForMCP.__mcpServerEngine;
}

export { MCPServerEngine, generateApiKey, hashApiKey };
export type { MCPServerSessionRow };

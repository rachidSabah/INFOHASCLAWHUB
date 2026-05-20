import { spawn, ChildProcess } from "child_process";
import { db } from "@/lib/db";

export interface MCPServerConfig {
  name: string;
  command: string;
  args: string[];
  env?: Record<string, string>;
}

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: Record<string, any>;
}

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: number;
  method: string;
  params?: Record<string, any>;
}

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: number;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}

export class MCPClient {
  private config: MCPServerConfig;
  private process: ChildProcess | null = null;
  private requestId = 0;
  private pending = new Map<number, { resolve: (value: any) => void; reject: (err: Error) => void }>();
  private buffer = "";
  private initialized = false;
  public name: string;

  constructor(config: MCPServerConfig) {
    this.config = config;
    this.name = config.name;
  }

  async connect(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const { command, args, env } = this.config;

      this.process = spawn(command, args, {
        env: { ...process.env, ...env },
        stdio: ["pipe", "pipe", "pipe"],
        shell: true,
      });

      const connectTimeout = setTimeout(() => {
        reject(new Error(`MCP server "${this.config.name}" connection timed out`));
      }, 15000);

      this.process.on("error", (err) => {
        clearTimeout(connectTimeout);
        reject(new Error(`Failed to start MCP server "${this.config.name}": ${err.message}`));
      });

      this.process.stdout?.on("data", (chunk: Buffer) => {
        this.buffer += chunk.toString();
        this.processBuffer();
      });

      this.process.stderr?.on("data", (chunk: Buffer) => {
        console.error(`[MCP:${this.config.name}] stderr:`, chunk.toString());
      });

      this.process.on("close", (code) => {
        clearTimeout(connectTimeout);
        this.initialized = false;
        const exitInfo = code !== null ? `exited with code ${code}` : "was killed";
        this.pending.forEach((p) => p.reject(new Error(`MCP server "${this.config.name}" ${exitInfo}`)));
        this.pending.clear();
      });

      this.sendRequest("initialize", {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "gemini-desktop", version: "1.0.0" },
      })
        .then(() => {
          clearTimeout(connectTimeout);
          this.initialized = true;
          this.sendNotification("initialized", {});
          resolve();
        })
        .catch((err) => {
          clearTimeout(connectTimeout);
          reject(err);
        });
    });
  }

  private sendRequest(method: string, params?: Record<string, any>): Promise<any> {
    const id = ++this.requestId;
    const request: JsonRpcRequest = {
      jsonrpc: "2.0",
      id,
      method,
      params,
    };

    return new Promise<any>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });

      const data = JSON.stringify(request) + "\n";
      if (!this.process?.stdin?.writable) {
        reject(new Error(`MCP server "${this.config.name}" stdin is not writable`));
        return;
      }
      this.process.stdin.write(data, (err) => {
        if (err) reject(err);
      });
    });
  }

  private sendNotification(method: string, params?: Record<string, any>): void {
    const data = JSON.stringify({ jsonrpc: "2.0", method, params }) + "\n";
    if (this.process?.stdin?.writable) {
      this.process.stdin.write(data);
    }
  }

  private processBuffer(): void {
    const lines = this.buffer.split("\n");
    this.buffer = lines.pop() || "";

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const response: JsonRpcResponse = JSON.parse(line);
        const pending = this.pending.get(response.id);
        if (pending) {
          this.pending.delete(response.id);
          if (response.error) {
            pending.reject(new Error(response.error.message));
          } else {
            pending.resolve(response.result);
          }
        }
      } catch {
        // Non-JSON lines are ignored
      }
    }
  }

  async listTools(): Promise<MCPTool[]> {
    if (!this.initialized) {
      throw new Error(`MCP server "${this.config.name}" is not connected`);
    }

    const result = await this.sendRequest("tools/list", {});
    return (result?.tools || []).map((t: any) => ({
      name: t.name,
      description: t.description || "",
      inputSchema: t.inputSchema || {},
    }));
  }

  async callTool(name: string, args: Record<string, any>): Promise<string> {
    if (!this.initialized) {
      throw new Error(`MCP server "${this.config.name}" is not connected`);
    }

    const result = await this.sendRequest("tools/call", { name, arguments: args });

    if (result?.content && Array.isArray(result.content)) {
      return result.content
        .map((c: any) => {
          if (c.type === "text") return c.text;
          if (c.type === "resource") return JSON.stringify(c.resource);
          return JSON.stringify(c);
        })
        .join("\n");
    }

    return JSON.stringify(result);
  }

  disconnect(): void {
    this.initialized = false;
    if (this.process) {
      this.process.kill();
      this.process = null;
    }
    this.pending.forEach((p) => p.reject(new Error("Client disconnected")));
    this.pending.clear();
  }
}

export async function getMcpServerConfigs(): Promise<MCPServerConfig[]> {
  try {
    const entry = await db.settings.findUnique({ where: { key: "mcp_servers" } });
    if (!entry) return [];
    return JSON.parse(entry.value) as MCPServerConfig[];
  } catch {
    return [];
  }
}

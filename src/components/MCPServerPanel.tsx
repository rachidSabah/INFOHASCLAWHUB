"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, Trash2, RefreshCw, Server, Wrench, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import type { MCPServerConfig, MCPTool } from "@/lib/mcp";

interface ServerStatus {
  name: string;
  config: MCPServerConfig;
  tools: MCPTool[];
  connected: boolean;
  error: string | null;
}

export function MCPServerPanel() {
  const [servers, setServers] = useState<ServerStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [form, setForm] = useState({
    name: "",
    command: "",
    args: "",
    env: "",
  });

  const fetchServers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/mcp/servers");
      const configs: MCPServerConfig[] = await res.json();
      setServers(
        configs.map((c) => ({
          name: c.name,
          config: c,
          tools: [],
          connected: false,
          error: null,
        }))
      );
    } catch {
      toast.error("Failed to load MCP servers");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchServers();
  }, [fetchServers]);

  const handleAdd = async () => {
    if (!form.name.trim() || !form.command.trim()) {
      return toast.error("Name and command are required");
    }

    const args = form.args
      .split("\n")
      .map((a) => a.trim())
      .filter(Boolean);

    const env: Record<string, string> = {};
    if (form.env.trim()) {
      form.env
        .split("\n")
        .filter((l) => l.includes("="))
        .forEach((line) => {
          const eqIdx = line.indexOf("=");
          const key = line.slice(0, eqIdx).trim();
          const value = line.slice(eqIdx + 1).trim();
          if (key) env[key] = value;
        });
    }

    try {
      const res = await fetch("/api/mcp/servers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          command: form.command.trim(),
          args,
          env,
        }),
      });

      if (res.ok) {
        toast.success("MCP server added");
        setForm({ name: "", command: "", args: "", env: "" });
        setIsAdding(false);
        await fetchServers();
      } else {
        const err = await res.json();
        toast.error(err.error || "Failed to add server");
      }
    } catch {
      toast.error("Failed to add MCP server");
    }
  };

  const handleDelete = async (name: string) => {
    try {
      const res = await fetch(`/api/mcp/servers/${encodeURIComponent(name)}`, {
        method: "DELETE",
      });
      if (res.ok) {
        toast.success(`Removed "${name}"`);
        await fetchServers();
      } else {
        toast.error("Failed to remove server");
      }
    } catch {
      toast.error("Failed to remove MCP server");
    }
  };

  const handleRefreshTools = async (name: string) => {
    setServers((prev) =>
      prev.map((s) =>
        s.name === name ? { ...s, tools: [], connected: false, error: null } : s
      )
    );

    try {
      const res = await fetch(`/api/mcp/tools`);
      const data = await res.json();
      const serverData = data.servers?.find((s: any) => s.name === name);

      setServers((prev) =>
        prev.map((s) =>
          s.name === name
            ? {
                ...s,
                tools: serverData?.tools || [],
                connected: !serverData?.error,
                error: serverData?.error || null,
              }
            : s
        )
      );

      if (serverData?.error) {
        toast.error(`Connection failed: ${serverData.error}`);
      } else {
        toast.success(`Connected to "${name}" - ${serverData?.tools?.length || 0} tools available`);
      }
    } catch {
      setServers((prev) =>
        prev.map((s) =>
          s.name === name ? { ...s, error: "Failed to fetch tools" } : s
        )
      );
      toast.error("Failed to connect to MCP server");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-semibold">MCP Servers</Label>
        <Button
          variant="outline"
          size="sm"
          className="h-8 px-3 text-xs"
          onClick={() => setIsAdding(!isAdding)}
        >
          {isAdding ? "Cancel" : <><Plus className="h-3.5 w-3.5 mr-1.5" /> Add Server</>}
        </Button>
      </div>

      {isAdding && (
        <div className="p-4 rounded-xl border bg-accent/10 space-y-4 animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="mcp-name" className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">Name</Label>
              <Input
                id="mcp-name"
                placeholder="e.g. Filesystem"
                className="h-9 text-sm"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mcp-cmd" className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">Command</Label>
              <Input
                id="mcp-cmd"
                placeholder="e.g. npx or node"
                className="h-9 text-sm"
                value={form.command}
                onChange={(e) => setForm({ ...form, command: e.target.value })}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="mcp-args" className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">Arguments (one per line)</Label>
            <Textarea
              id="mcp-args"
              placeholder={"-y\n@modelcontextprotocol/server-filesystem\n/path/to/allowed/dir"}
              className="min-h-[80px] text-xs font-mono"
              value={form.args}
              onChange={(e) => setForm({ ...form, args: e.target.value })}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="mcp-env" className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">Environment Variables (KEY=value, one per line)</Label>
            <Textarea
              id="mcp-env"
              placeholder={"API_KEY=sk-...\nDEBUG=true"}
              className="min-h-[60px] text-xs font-mono"
              value={form.env}
              onChange={(e) => setForm({ ...form, env: e.target.value })}
            />
          </div>

          <Button className="w-full h-9 text-xs" onClick={handleAdd}>
            Save MCP Server
          </Button>
        </div>
      )}

      <div className="space-y-3">
        {loading ? (
          <div className="text-center py-12 text-muted-foreground border rounded-xl border-dashed">
            <Loader2 className="h-10 w-10 mx-auto mb-3 opacity-20 animate-spin" />
            <p className="text-xs">Loading MCP servers...</p>
          </div>
        ) : servers.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground border rounded-xl border-dashed">
            <Server className="h-10 w-10 mx-auto mb-3 opacity-20" />
            <p className="text-xs">No MCP servers configured.</p>
            <p className="text-[10px] text-muted-foreground mt-1">Add an MCP server to extend AI capabilities with external tools.</p>
          </div>
        ) : (
          servers.map((server) => (
            <div
              key={server.name}
              className="p-4 rounded-xl border bg-card/50 hover:border-primary/40 hover:bg-card transition-all shadow-sm"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  <div className="h-10 w-10 rounded-xl bg-primary/5 flex items-center justify-center shrink-0 border border-primary/10 mt-0.5">
                    <Server className="h-5 w-5 text-primary/70" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm">{server.name}</span>
                      {server.connected ? (
                        <Badge variant="secondary" className="bg-green-500/10 text-green-600 border-green-500/20 text-[9px] px-1.5 py-0">
                          <CheckCircle2 className="h-2.5 w-2.5 mr-0.5" />
                          Connected
                        </Badge>
                      ) : server.error ? (
                        <Badge variant="secondary" className="bg-red-500/10 text-red-600 border-red-500/20 text-[9px] px-1.5 py-0">
                          <XCircle className="h-2.5 w-2.5 mr-0.5" />
                          Failed
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="text-[9px] px-1.5 py-0">Disconnected</Badge>
                      )}
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-0.5 font-mono">
                      {server.config.command} {server.config.args?.join(" ")}
                    </p>
                    {server.error && (
                      <p className="text-[10px] text-red-500 mt-1 break-all">{server.error}</p>
                    )}
                    {server.tools.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {server.tools.map((tool) => (
                          <div
                            key={tool.name}
                            className="text-[9px] px-2 py-0.5 rounded-full bg-primary/5 border border-primary/10 flex items-center gap-1"
                          >
                            <Wrench className="h-2.5 w-2.5 opacity-50" />
                            {tool.name}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => handleRefreshTools(server.name)}
                    title="Test connection and refresh tools"
                  >
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                    onClick={() => handleDelete(server.name)}
                    title="Delete server"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

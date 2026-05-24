"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Card } from "@/components/ui/card";
import {
  Server,
  Power,
  Copy,
  Loader2,
  Users,
  Key,
  Code2,
  CheckCircle2,
  XCircle,
  Wrench,
  Terminal,
  Globe,
  Shield,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ───────────────────────────────────────────────────────────────────

interface MCPServerStatus {
  running: boolean;
  port: number;
  connectedClients: number;
  startedAt?: string;
  uptime?: number;
}

interface MCPTool {
  name: string;
  description: string;
  exposed: boolean;
}

interface MCPClientConfig {
  name: string;
  icon: string;
  config: string;
}

interface MCPServerPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function MCPServerPanel({ open, onOpenChange }: MCPServerPanelProps) {
  const [activeTab, setActiveTab] = useState("status");
  const [serverStatus, setServerStatus] = useState<MCPServerStatus | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [tools, setTools] = useState<MCPTool[]>([]);
  const [loading, setLoading] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [copied, setCopied] = useState(false);

  const clientConfigs: MCPClientConfig[] = [
    {
      name: "Cursor",
      icon: "⌨️",
      config: JSON.stringify(
        {
          mcpServers: {
            clawhub: {
              url: `http://localhost:${serverStatus?.port || 3100}/mcp`,
              headers: { Authorization: `Bearer ${apiKey || "your-api-key"}` },
            },
          },
        },
        null,
        2
      ),
    },
    {
      name: "Claude Desktop",
      icon: "🤖",
      config: JSON.stringify(
        {
          mcpServers: {
            clawhub: {
              command: "npx",
              args: ["-y", "mcp-remote", `http://localhost:${serverStatus?.port || 3100}/mcp`, "--header", `Authorization: Bearer ${apiKey || "your-api-key"}`],
            },
          },
        },
        null,
        2
      ),
    },
    {
      name: "Windsurf",
      icon: "🌊",
      config: JSON.stringify(
        {
          mcpServers: {
            clawhub: {
              serverUrl: `http://localhost:${serverStatus?.port || 3100}/mcp`,
              apiKey: apiKey || "your-api-key",
            },
          },
        },
        null,
        2
      ),
    },
  ];

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/mcp-server");
      if (res.ok) {
        const data = await res.json();
        setServerStatus(data.status || null);
        setApiKey(data.apiKey || "");
        setTools(data.tools || []);
      }
    } catch {
      toast.error("Failed to load MCP server data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) fetchData();
  }, [open, fetchData]);

  const toggleServer = async () => {
    setToggling(true);
    try {
      const res = await fetch("/api/mcp-server/toggle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: serverStatus?.running ? "stop" : "start" }),
      });
      if (res.ok) {
        toast.success(serverStatus?.running ? "Server stopped" : "Server started");
        fetchData();
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to toggle server");
      }
    } catch {
      toast.error("Failed to toggle server");
    } finally {
      setToggling(false);
    }
  };

  const toggleToolExposure = async (toolName: string, currentExposed: boolean) => {
    try {
      const res = await fetch("/api/mcp-server/tools", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toolName, exposed: !currentExposed }),
      });
      if (res.ok) {
        setTools((prev) =>
          prev.map((t) => (t.name === toolName ? { ...t, exposed: !currentExposed } : t))
        );
        toast.success(!currentExposed ? "Tool exposed" : "Tool hidden");
      }
    } catch {
      toast.error("Failed to toggle tool");
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success("Copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-5xl max-h-[92vh] overflow-hidden flex flex-col" showCloseButton>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-gradient-to-br from-emerald-500/20 to-teal-500/20 border border-emerald-500/30">
              <Server className="h-4 w-4 text-emerald-400" />
            </div>
            MCP Server Mode
          </DialogTitle>
          <DialogDescription>
            Expose ClawHub as an MCP Server for external tool integration
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
          <TabsList className="grid w-full grid-cols-3 mb-1 shrink-0">
            <TabsTrigger value="status" className="gap-1.5 text-xs">
              <Power className="h-3.5 w-3.5" />
              Status
            </TabsTrigger>
            <TabsTrigger value="tools" className="gap-1.5 text-xs">
              <Wrench className="h-3.5 w-3.5" />
              Tools
            </TabsTrigger>
            <TabsTrigger value="clients" className="gap-1.5 text-xs">
              <Code2 className="h-3.5 w-3.5" />
              Clients
            </TabsTrigger>
          </TabsList>

          {/* ═══ STATUS TAB ═══ */}
          <TabsContent value="status" className="flex-1 min-h-0 mt-0 overflow-y-auto">
            <ScrollArea className="h-[calc(90vh-200px)]">
              <div className="space-y-5 p-1 pr-4">
                {loading ? (
                  <div className="flex items-center justify-center py-12 text-muted-foreground">
                    <Loader2 className="h-5 w-5 animate-spin mr-2" />
                    Loading server status...
                  </div>
                ) : (
                  <>
                    {/* Server Control */}
                    <div className="rounded-xl border bg-card p-6 space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className={cn(
                            "flex items-center justify-center h-12 w-12 rounded-full border-2",
                            serverStatus?.running
                              ? "border-emerald-500/50 bg-emerald-500/10"
                              : "border-zinc-600/50 bg-zinc-700/10"
                          )}>
                            {serverStatus?.running ? (
                              <CheckCircle2 className="h-6 w-6 text-emerald-400" />
                            ) : (
                              <XCircle className="h-6 w-6 text-zinc-500" />
                            )}
                          </div>
                          <div>
                            <h4 className="text-sm font-semibold">MCP Server</h4>
                            <p className="text-xs text-muted-foreground">
                              {serverStatus?.running ? `Running on port ${serverStatus.port}` : "Stopped"}
                            </p>
                          </div>
                        </div>
                        <Button
                          size="sm"
                          onClick={toggleServer}
                          disabled={toggling}
                          className={cn(
                            "h-9 text-xs gap-1.5 min-w-[120px]",
                            serverStatus?.running
                              ? "bg-red-500/15 text-red-400 border border-red-500/30 hover:bg-red-500/25"
                              : "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/25"
                          )}
                          variant="outline"
                        >
                          {toggling ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : serverStatus?.running ? (
                            <Power className="h-3.5 w-3.5" />
                          ) : (
                            <Power className="h-3.5 w-3.5" />
                          )}
                          {serverStatus?.running ? "Stop" : "Start"}
                        </Button>
                      </div>

                      {serverStatus?.running && (
                        <>
                          <Separator />
                          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                            <div className="rounded-lg bg-muted/30 p-3 text-center">
                              <div className="text-lg font-bold text-emerald-400">{serverStatus.port}</div>
                              <div className="text-[10px] text-muted-foreground">Port</div>
                            </div>
                            <div className="rounded-lg bg-muted/30 p-3 text-center">
                              <div className="text-lg font-bold">{serverStatus.connectedClients}</div>
                              <div className="text-[10px] text-muted-foreground">Clients</div>
                            </div>
                            <div className="rounded-lg bg-muted/30 p-3 text-center">
                              <div className="text-lg font-bold">{serverStatus.uptime || 0}s</div>
                              <div className="text-[10px] text-muted-foreground">Uptime</div>
                            </div>
                          </div>
                        </>
                      )}
                    </div>

                    {/* API Key */}
                    <div className="rounded-xl border bg-card p-5 space-y-3">
                      <h4 className="text-sm font-semibold flex items-center gap-2">
                        <Key className="h-4 w-4 text-amber-400" />
                        API Key
                      </h4>
                      <div className="flex items-center gap-2">
                        <Input
                          value={apiKey}
                          onChange={(e) => setApiKey(e.target.value)}
                          readOnly
                          className="h-9 font-mono text-xs"
                          type="password"
                        />
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-9 w-9 shrink-0"
                          onClick={() => copyToClipboard(apiKey)}
                        >
                          {copied ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                        </Button>
                      </div>
                      <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                        <Shield className="h-3 w-3" />
                        Required for client authentication. Keep this key secure.
                      </p>
                    </div>
                  </>
                )}
              </div>
            </ScrollArea>
          </TabsContent>

          {/* ═══ TOOLS TAB ═══ */}
          <TabsContent value="tools" className="flex-1 min-h-0 mt-0 overflow-y-auto">
            <ScrollArea className="h-[calc(90vh-200px)]">
              <div className="space-y-3 p-1 pr-4">
                {tools.length === 0 ? (
                  <div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
                    <Wrench className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">No tools available</p>
                    <p className="text-xs mt-1">Start the server to see available tools</p>
                  </div>
                ) : (
                  tools.map((tool) => (
                    <div key={tool.name} className="rounded-lg border bg-card p-4 flex items-center gap-3">
                      <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-muted/50">
                        <Wrench className="h-4 w-4 text-amber-400" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium">{tool.name}</div>
                        <p className="text-[10px] text-muted-foreground truncate">{tool.description}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Label htmlFor={`tool-${tool.name}`} className="text-[10px] text-muted-foreground">
                          {tool.exposed ? "Exposed" : "Hidden"}
                        </Label>
                        <Switch
                          id={`tool-${tool.name}`}
                          checked={tool.exposed}
                          onCheckedChange={() => toggleToolExposure(tool.name, tool.exposed)}
                        />
                      </div>
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
          </TabsContent>

          {/* ═══ CLIENTS TAB ═══ */}
          <TabsContent value="clients" className="flex-1 min-h-0 mt-0 overflow-y-auto">
            <ScrollArea className="h-[calc(90vh-200px)]">
              <div className="space-y-5 p-1 pr-4">
                <p className="text-xs text-muted-foreground">
                  Copy the configuration snippet for your preferred client to connect to ClawHub MCP Server.
                </p>
                {clientConfigs.map((client) => (
                  <div key={client.name} className="rounded-xl border bg-card p-5 space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-semibold flex items-center gap-2">
                        <span>{client.icon}</span>
                        {client.name}
                      </h4>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-[10px] gap-1"
                        onClick={() => copyToClipboard(client.config)}
                      >
                        <Copy className="h-3 w-3" />
                        Copy JSON
                      </Button>
                    </div>
                    <pre className="rounded-lg bg-zinc-900 border p-3 text-[11px] text-zinc-300 overflow-x-auto font-mono">
                      {client.config}
                    </pre>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import {
  Box,
  Play,
  Square,
  Trash2,
  ExternalLink,
  Plus,
  Loader2,
  Code2,
  Globe,
  Clock,
  AlertCircle,
  CheckCircle2,
  Server,
  Cpu,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ──────────────────────────────────────────────────────────────────

interface Sandbox {
  id: string;
  name: string;
  framework: string;
  status: string;
  port: number | null;
  containerId: string | null;
  previewUrl: string | null;
  files: string;
  envVars: string;
  createdAt: string;
  updatedAt: string;
}

interface LiveSandboxPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const FRAMEWORKS = [
  { value: "nextjs", label: "Next.js", color: "text-gray-300", bgColor: "bg-gray-500/10 border-gray-500/20" },
  { value: "react", label: "React", color: "text-sky-400", bgColor: "bg-sky-500/10 border-sky-500/20" },
  { value: "html", label: "HTML", color: "text-orange-400", bgColor: "bg-orange-500/10 border-orange-500/20" },
  { value: "vue", label: "Vue", color: "text-emerald-400", bgColor: "bg-emerald-500/10 border-emerald-500/20" },
] as const;

// ─── Helpers ────────────────────────────────────────────────────────────────

function getFrameworkInfo(framework: string) {
  return FRAMEWORKS.find((f) => f.value === framework) ?? FRAMEWORKS[0];
}

function getStatusConfig(status: string) {
  switch (status) {
    case "creating":
      return {
        icon: Loader2,
        label: "Creating",
        badgeClass: "bg-amber-500/10 text-amber-600 border-amber-500/20",
        iconClass: "animate-spin h-3 w-3",
      };
    case "running":
      return {
        icon: CheckCircle2,
        label: "Running",
        badgeClass: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
        iconClass: "h-3 w-3",
      };
    case "stopped":
      return {
        icon: Square,
        label: "Stopped",
        badgeClass: "bg-gray-500/10 text-gray-500 border-gray-500/20",
        iconClass: "h-3 w-3",
      };
    case "error":
      return {
        icon: AlertCircle,
        label: "Error",
        badgeClass: "bg-red-500/10 text-red-600 border-red-500/20",
        iconClass: "h-3 w-3",
      };
    default:
      return {
        icon: Box,
        label: status,
        badgeClass: "bg-gray-500/10 text-gray-500 border-gray-500/20",
        iconClass: "h-3 w-3",
      };
  }
}

function formatRelativeDate(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHr = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHr / 24);

    if (diffSec < 60) return `${diffSec}s ago`;
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffHr < 24) return `${diffHr}h ago`;
    return `${diffDay}d ago`;
  } catch {
    return dateStr;
  }
}

// ─── Component ──────────────────────────────────────────────────────────────

export function LiveSandboxPanel({ open, onOpenChange }: LiveSandboxPanelProps) {
  // ── Sandboxes Tab state ──
  const [sandboxes, setSandboxes] = useState<Sandbox[]>([]);
  const [loadingSandboxes, setLoadingSandboxes] = useState(false);
  const [actioningId, setActioningId] = useState<string | null>(null);

  // ── Create Tab state ──
  const [createName, setCreateName] = useState("");
  const [createFramework, setCreateFramework] = useState("nextjs");
  const [createFiles, setCreateFiles] = useState('{\n  "index.html": "<h1>Hello Sandbox</h1>"\n}');
  const [createEnvVars, setCreateEnvVars] = useState('{\n  "NODE_ENV": "development"\n}');
  const [creating, setCreating] = useState(false);

  // ── Fetch sandboxes ──
  const fetchSandboxes = useCallback(async () => {
    setLoadingSandboxes(true);
    try {
      const res = await fetch("/api/sandbox");
      if (res.ok) {
        const data = await res.json();
        setSandboxes(Array.isArray(data) ? data : []);
      }
    } catch {
      toast.error("Failed to load sandboxes");
    } finally {
      setLoadingSandboxes(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      fetchSandboxes();
    }
  }, [open, fetchSandboxes]);

  // ── Start/Stop sandbox ──
  const handleStatusChange = async (sandbox: Sandbox, newStatus: string) => {
    setActioningId(sandbox.id);
    try {
      const res = await fetch(`/api/sandbox/${sandbox.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        toast.success(
          newStatus === "running"
            ? `Sandbox "${sandbox.name}" started`
            : `Sandbox "${sandbox.name}" stopped`
        );
        await fetchSandboxes();
      } else {
        const data = await res.json();
        toast.error(data.error || `Failed to ${newStatus === "running" ? "start" : "stop"} sandbox`);
      }
    } catch {
      toast.error("Request failed");
    } finally {
      setActioningId(null);
    }
  };

  // ── Delete sandbox ──
  const handleDelete = async (sandbox: Sandbox) => {
    setActioningId(sandbox.id);
    try {
      const res = await fetch(`/api/sandbox/${sandbox.id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        toast.success(`Sandbox "${sandbox.name}" deleted`);
        await fetchSandboxes();
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to delete sandbox");
      }
    } catch {
      toast.error("Delete request failed");
    } finally {
      setActioningId(null);
    }
  };

  // ── Create sandbox ──
  const handleCreate = async () => {
    if (!createName.trim()) {
      toast.error("Please enter a sandbox name");
      return;
    }

    let files: Record<string, string> = {};
    let envVars: Record<string, string> = {};

    try {
      files = JSON.parse(createFiles);
    } catch {
      toast.error("Invalid JSON in files field");
      return;
    }

    try {
      envVars = JSON.parse(createEnvVars);
    } catch {
      toast.error("Invalid JSON in env vars field");
      return;
    }

    setCreating(true);
    try {
      const res = await fetch("/api/sandbox", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: createName.trim(),
          framework: createFramework,
          files,
          envVars,
        }),
      });

      if (res.ok) {
        toast.success(`Sandbox "${createName}" created`);
        setCreateName("");
        setCreateFramework("nextjs");
        setCreateFiles('{\n  "index.html": "<h1>Hello Sandbox</h1>"\n}');
        setCreateEnvVars('{\n  "NODE_ENV": "development"\n}');
        await fetchSandboxes();
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to create sandbox");
      }
    } catch {
      toast.error("Create request failed");
    } finally {
      setCreating(false);
    }
  };

  // ── Render ──
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl max-h-[92vh] p-0 gap-0 overflow-hidden flex flex-col">
        <DialogHeader className="px-6 pt-6 pb-0">
          <DialogTitle className="flex items-center gap-2">
            <Box className="h-5 w-5" />
            Live App Sandbox
          </DialogTitle>
          <DialogDescription>
            Create, manage, and preview live application sandboxes in isolated environments
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="sandboxes" className="flex flex-col flex-1 min-h-0">
          <div className="px-6 pt-2">
            <TabsList className="w-full">
              <TabsTrigger value="sandboxes" className="flex-1 gap-1.5">
                <Box className="h-3.5 w-3.5" />
                Sandboxes
              </TabsTrigger>
              <TabsTrigger value="create" className="flex-1 gap-1.5">
                <Plus className="h-3.5 w-3.5" />
                Create
              </TabsTrigger>
            </TabsList>
          </div>

          {/* ──────── SANDBOXES TAB ──────── */}
          <TabsContent value="sandboxes" className="flex-1 min-h-0 mt-0 overflow-y-auto">
            <ScrollArea className="h-[calc(90vh-14rem)]">
              <div className="p-6 space-y-4">
                {/* Header */}
                <div className="flex items-center justify-between">
                  <div className="text-sm text-muted-foreground">
                    {sandboxes.length} sandbox{sandboxes.length !== 1 ? "es" : ""}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={fetchSandboxes}
                    disabled={loadingSandboxes}
                  >
                    {loadingSandboxes ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                    ) : (
                      <Globe className="h-3.5 w-3.5 mr-1" />
                    )}
                    Refresh
                  </Button>
                </div>

                {/* Sandbox list */}
                {loadingSandboxes ? (
                  <div className="flex items-center justify-center py-12 text-muted-foreground">
                    <Loader2 className="h-5 w-5 animate-spin mr-2" />
                    Loading sandboxes...
                  </div>
                ) : sandboxes.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                    <Box className="h-10 w-10 mb-3 opacity-40" />
                    <p className="text-sm">No sandboxes yet</p>
                    <p className="text-xs mt-1">Create a sandbox to get started</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {sandboxes.map((sandbox) => {
                      const fwInfo = getFrameworkInfo(sandbox.framework);
                      const statusConfig = getStatusConfig(sandbox.status);
                      const StatusIcon = statusConfig.icon;
                      const isActioning = actioningId === sandbox.id;

                      return (
                        <div
                          key={sandbox.id}
                          className="rounded-lg border bg-card p-4 space-y-3 transition-colors"
                        >
                          {/* Top row: name, framework, status */}
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-center gap-2 flex-wrap min-w-0">
                              <span className="font-semibold text-sm truncate">
                                {sandbox.name}
                              </span>
                              <Badge
                                variant="outline"
                                className={cn("h-5 text-[10px] gap-1", fwInfo.bgColor, fwInfo.color)}
                              >
                                <Code2 className="h-3 w-3" />
                                {fwInfo.label}
                              </Badge>
                              <Badge
                                variant="outline"
                                className={cn("h-5 text-[10px] gap-1", statusConfig.badgeClass)}
                              >
                                <StatusIcon className={statusConfig.iconClass} />
                                {statusConfig.label}
                              </Badge>
                            </div>
                            <span className="text-[10px] text-muted-foreground shrink-0 flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {formatRelativeDate(sandbox.createdAt)}
                            </span>
                          </div>

                          {/* Info row: port, preview URL */}
                          <div className="flex flex-wrap items-center gap-3 text-xs">
                            {sandbox.port !== null && sandbox.port !== undefined && (
                              <span className="flex items-center gap-1 text-muted-foreground">
                                <Server className="h-3 w-3" />
                                Port: <span className="font-medium text-foreground">{sandbox.port}</span>
                              </span>
                            )}
                            {sandbox.previewUrl && (
                              <a
                                href={sandbox.previewUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-1 text-primary hover:underline"
                              >
                                <ExternalLink className="h-3 w-3" />
                                Open Preview
                              </a>
                            )}
                          </div>

                          {/* Actions row */}
                          <div className="flex items-center gap-2 pt-1">
                            {sandbox.status === "running" ? (
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 text-[11px] gap-1"
                                onClick={() => handleStatusChange(sandbox, "stopped")}
                                disabled={isActioning}
                              >
                                {isActioning ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <Square className="h-3 w-3" />
                                )}
                                Stop
                              </Button>
                            ) : (
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 text-[11px] gap-1"
                                onClick={() => handleStatusChange(sandbox, "running")}
                                disabled={isActioning || sandbox.status === "creating"}
                              >
                                {isActioning ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <Play className="h-3 w-3" />
                                )}
                                Start
                              </Button>
                            )}

                            {sandbox.previewUrl && (
                              <a
                                href={sandbox.previewUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-7 text-[11px] gap-1"
                                >
                                  <ExternalLink className="h-3 w-3" />
                                  Open Preview
                                </Button>
                              </a>
                            )}

                            <div className="flex-1" />

                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 text-[11px] gap-1 text-destructive hover:text-destructive"
                              onClick={() => handleDelete(sandbox)}
                              disabled={isActioning}
                            >
                              {isActioning ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <Trash2 className="h-3 w-3" />
                              )}
                              Delete
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </ScrollArea>
          </TabsContent>

          {/* ──────── CREATE TAB ──────── */}
          <TabsContent value="create" className="flex-1 min-h-0 mt-0 overflow-y-auto">
            <ScrollArea className="h-[calc(90vh-14rem)]">
              <div className="p-6 space-y-5">
                {/* Name & framework */}
                <div className="rounded-lg border bg-card p-4 space-y-4">
                  <h4 className="font-semibold text-sm flex items-center gap-2">
                    <Code2 className="h-4 w-4" />
                    Sandbox Configuration
                  </h4>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Name</Label>
                      <Input
                        value={createName}
                        onChange={(e) => setCreateName(e.target.value)}
                        placeholder="e.g., My React App"
                        className="h-8 text-sm"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Framework</Label>
                      <Select value={createFramework} onValueChange={setCreateFramework}>
                        <SelectTrigger className="h-8 text-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {FRAMEWORKS.map((fw) => (
                            <SelectItem key={fw.value} value={fw.value}>
                              <span className="flex items-center gap-2">
                                <Code2 className={cn("h-3.5 w-3.5", fw.color)} />
                                {fw.label}
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>

                {/* Files JSON */}
                <div className="rounded-lg border bg-card p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-semibold flex items-center gap-2">
                      <Code2 className="h-3.5 w-3.5" />
                      Files
                    </Label>
                    <span className="text-[10px] text-muted-foreground">
                      JSON: path → content
                    </span>
                  </div>
                  <Textarea
                    value={createFiles}
                    onChange={(e) => setCreateFiles(e.target.value)}
                    placeholder='{"index.html": "<h1>Hello</h1>"}'
                    className="min-h-[120px] text-xs font-mono resize-none"
                  />
                </div>

                {/* Env vars JSON */}
                <div className="rounded-lg border bg-card p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-semibold flex items-center gap-2">
                      <Cpu className="h-3.5 w-3.5" />
                      Environment Variables
                    </Label>
                    <span className="text-[10px] text-muted-foreground">
                      JSON: key → value
                    </span>
                  </div>
                  <Textarea
                    value={createEnvVars}
                    onChange={(e) => setCreateEnvVars(e.target.value)}
                    placeholder='{"API_KEY": "xxx"}'
                    className="min-h-[80px] text-xs font-mono resize-none"
                  />
                </div>

                {/* Create button */}
                <Button
                  className="w-full h-10 gap-2"
                  onClick={handleCreate}
                  disabled={creating || !createName.trim()}
                >
                  {creating ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Plus className="h-4 w-4" />
                  )}
                  {creating ? "Creating Sandbox..." : "Create Sandbox"}
                </Button>
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

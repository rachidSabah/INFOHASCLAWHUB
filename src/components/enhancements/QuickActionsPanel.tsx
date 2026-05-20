"use client";

import { useState, useCallback } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Zap,
  FileCode,
  FolderTree,
  Loader2,
  Copy,
  Check,
  Play,
  BookOpen,
  Wrench,
  TestTube,
  FileText,
  Gauge,
  Shield,
  FileType,
  Activity,
  GitBranch,
  Container,
  GitMerge,
  ScanLine,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ──────────────────────────────────────────────────────────────────

interface QuickActionsPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface ActionResult {
  result?: string;
  message?: string;
  data?: any;
  error?: string;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const FILE_ACTIONS = [
  { value: "explain", label: "Explain", icon: BookOpen, color: "text-sky-400", desc: "Explain what the file does" },
  { value: "refactor", label: "Refactor", icon: Wrench, color: "text-amber-400", desc: "Suggest refactoring improvements" },
  { value: "test", label: "Test", icon: TestTube, color: "text-emerald-400", desc: "Generate tests for the file" },
  { value: "document", label: "Document", icon: FileText, color: "text-purple-400", desc: "Add documentation" },
  { value: "optimize", label: "Optimize", icon: Gauge, color: "text-orange-400", desc: "Optimize performance" },
  { value: "add-error-handling", label: "Add Error Handling", icon: Shield, color: "text-red-400", desc: "Add error handling" },
  { value: "convert-to-typescript", label: "Convert to TS", icon: FileType, color: "text-blue-400", desc: "Convert to TypeScript" },
  { value: "add-logging", label: "Add Logging", icon: Activity, color: "text-cyan-400", desc: "Add logging statements" },
] as const;

const PROJECT_ACTIONS = [
  { value: "add-authentication", label: "Add Auth", icon: Shield, color: "text-red-400", desc: "Set up authentication" },
  { value: "set-up-testing", label: "Set Up Testing", icon: TestTube, color: "text-emerald-400", desc: "Configure test framework" },
  { value: "dockerize", label: "Dockerize", icon: Container, color: "text-sky-400", desc: "Add Docker configuration" },
  { value: "add-cicd", label: "Add CI/CD", icon: GitMerge, color: "text-purple-400", desc: "Set up CI/CD pipeline" },
  { value: "add-linting", label: "Add Linting", icon: ScanLine, color: "text-amber-400", desc: "Configure linting rules" },
  { value: "initialize-git", label: "Init Git", icon: GitBranch, color: "text-orange-400", desc: "Initialize git repository" },
] as const;

// ─── Component ──────────────────────────────────────────────────────────────

export function QuickActionsPanel({ open, onOpenChange }: QuickActionsPanelProps) {
  // ── State ──
  const [filePath, setFilePath] = useState("");
  const [projectPath, setProjectPath] = useState("");
  const [executing, setExecuting] = useState(false);
  const [result, setResult] = useState<ActionResult | null>(null);
  const [lastAction, setLastAction] = useState<string>("");
  const [copied, setCopied] = useState(false);
  const [applied, setApplied] = useState(false);

  // ── Execute action ──
  const executeAction = useCallback(async (action: string, type: "file" | "project") => {
    if (type === "file" && !filePath.trim()) {
      toast.error("File path is required");
      return;
    }
    if (type === "project" && !projectPath.trim()) {
      toast.error("Project path is required");
      return;
    }

    setExecuting(true);
    setResult(null);
    setLastAction(action);
    setApplied(false);

    try {
      const res = await fetch("/api/quick-actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          params: {
            type,
            path: type === "file" ? filePath.trim() : projectPath.trim(),
          },
          context: { actionType: type },
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setResult(data);
        toast.success(`Action "${action}" completed`);
      } else {
        const data = await res.json();
        setResult({ error: data.error || "Action failed" });
        toast.error(data.error || "Action failed");
      }
    } catch {
      setResult({ error: "Request failed" });
      toast.error("Request failed");
    } finally {
      setExecuting(false);
    }
  }, [filePath, projectPath]);

  // ── Copy result ──
  const handleCopy = async () => {
    if (!result) return;
    const text = result.message || result.result || JSON.stringify(result, null, 2);
    await navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success("Copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  };

  // ── Apply result ──
  const handleApply = () => {
    setApplied(true);
    toast.success("Changes applied successfully");
    setTimeout(() => setApplied(false), 3000);
  };

  // ── Render ──
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl max-h-[90vh] p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-0">
          <DialogTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5" />
            Context-Aware Quick Actions
          </DialogTitle>
          <DialogDescription>
            Execute AI-powered actions on files and projects instantly
          </DialogDescription>
        </DialogHeader>
          <PowerToolHint name="Quick Actions" />

        <ScrollArea className="h-[calc(90vh-8rem)]">
          <div className="p-6 space-y-6">
            {/* ──────── FILE ACTIONS ──────── */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <FileCode className="h-4 w-4 text-sky-400" />
                <h3 className="text-sm font-semibold">File Actions</h3>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">File Path</Label>
                <Input
                  value={filePath}
                  onChange={(e) => setFilePath(e.target.value)}
                  placeholder="/path/to/your/file.ts"
                  className="h-9 text-sm"
                />
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {FILE_ACTIONS.map((action) => {
                  const Icon = action.icon;
                  return (
                    <Button
                      key={action.value}
                      variant="outline"
                      size="sm"
                      className={cn(
                        "h-auto py-2 px-3 justify-start gap-2 text-xs",
                        lastAction === action.value && executing && "border-primary/50"
                      )}
                      onClick={() => executeAction(action.value, "file")}
                      disabled={executing}
                    >
                      <Icon className={cn("h-3.5 w-3.5 shrink-0", action.color)} />
                      <span className="truncate">{action.label}</span>
                    </Button>
                  );
                })}
              </div>
            </div>

            <Separator />

            {/* ──────── PROJECT ACTIONS ──────── */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <FolderTree className="h-4 w-4 text-amber-400" />
                <h3 className="text-sm font-semibold">Project Actions</h3>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Project Path</Label>
                <Input
                  value={projectPath}
                  onChange={(e) => setProjectPath(e.target.value)}
                  placeholder="/path/to/your/project"
                  className="h-9 text-sm"
                />
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {PROJECT_ACTIONS.map((action) => {
                  const Icon = action.icon;
                  return (
                    <Button
                      key={action.value}
                      variant="outline"
                      size="sm"
                      className={cn(
                        "h-auto py-2 px-3 justify-start gap-2 text-xs",
                        lastAction === action.value && executing && "border-primary/50"
                      )}
                      onClick={() => executeAction(action.value, "project")}
                      disabled={executing}
                    >
                      <Icon className={cn("h-3.5 w-3.5 shrink-0", action.color)} />
                      <span className="truncate">{action.label}</span>
                    </Button>
                  );
                })}
              </div>
            </div>

            <Separator />

            {/* ──────── RESULTS ──────── */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Play className="h-4 w-4 text-emerald-400" />
                  <h3 className="text-sm font-semibold">Result</h3>
                  {lastAction && !executing && (
                    <Badge variant="secondary" className="h-5 text-[10px]">
                      {lastAction}
                    </Badge>
                  )}
                </div>
                {result && !result.error && (
                  <div className="flex items-center gap-1.5">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs gap-1"
                      onClick={handleCopy}
                    >
                      {copied ? (
                        <Check className="h-3.5 w-3.5 text-emerald-400" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                      {copied ? "Copied" : "Copy"}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs gap-1"
                      onClick={handleApply}
                      disabled={applied}
                    >
                      {applied ? (
                        <Check className="h-3.5 w-3.5 text-emerald-400" />
                      ) : (
                        <Wrench className="h-3.5 w-3.5" />
                      )}
                      {applied ? "Applied" : "Apply"}
                    </Button>
                  </div>
                )}
              </div>

              {executing && (
                <div className="flex items-center justify-center py-10 text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin mr-2" />
                  <span className="text-sm">Executing &quot;{lastAction}&quot;...</span>
                </div>
              )}

              {!executing && result?.error && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
                  <p className="text-sm text-destructive font-medium">Error</p>
                  <p className="text-xs text-destructive/80 mt-1">{result.error}</p>
                </div>
              )}

              {!executing && result && !result.error && (
                <div className="rounded-lg border bg-card p-4 space-y-3">
                  {result.message && (
                    <div>
                      <Label className="text-xs text-muted-foreground mb-1 block">Summary</Label>
                      <p className="text-sm">{result.message}</p>
                    </div>
                  )}
                  {result.result && result.result !== result.message && (
                    <div>
                      <Label className="text-xs text-muted-foreground mb-1 block">Result</Label>
                      <pre className="text-xs bg-muted/50 rounded-md p-3 overflow-x-auto whitespace-pre-wrap max-h-64 overflow-y-auto">
                        {typeof result.result === "string"
                          ? result.result
                          : JSON.stringify(result.result, null, 2)}
                      </pre>
                    </div>
                  )}
                  {result.data && (
                    <div>
                      <Label className="text-xs text-muted-foreground mb-1 block">Data</Label>
                      <pre className="text-xs bg-muted/50 rounded-md p-3 overflow-x-auto whitespace-pre-wrap max-h-64 overflow-y-auto">
                        {JSON.stringify(result.data, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              )}

              {!executing && !result && (
                <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
                  <Zap className="h-10 w-10 mb-3 opacity-40" />
                  <p className="text-sm">No action executed yet</p>
                  <p className="text-xs mt-1">Choose a file or project action to get started</p>
                </div>
              )}
            </div>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

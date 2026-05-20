"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
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
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Code2,
  Play,
  Square,
  Pause,
  RotateCcw,
  CheckCircle2,
  XCircle,
  ChevronDown,
  ChevronUp,
  Trash2,
  Activity,
  Loader2,
  FileCode2,
  TestTube2,
  GitCommitHorizontal,
  ListChecks,
  Clock,
  Zap,
  History,
  Settings2,
  Eye,
  ThumbsUp,
  ThumbsDown,
  FastForward,
  AlertTriangle,
  FolderOpen,
  CircleDot,
  ArrowRight,
  RefreshCw,
  Wrench,
  Bug,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Types ──────────────────────────────────────────────────────────────────

interface CodingSession {
  id: string;
  title: string;
  workspacePath: string;
  task: string;
  status: "idle" | "planning" | "coding" | "testing" | "fixing" | "committed" | "failed";
  approvalMode: "auto" | "suggest" | "ask";
  iterations: number;
  maxIterations: number;
  plan: string | null;
  checkpoints: string | null;
  diffLog: string | null;
  testResults: string | null;
  result: string | null;
  createdAt: string;
  updatedAt: string;
}

interface AutonomousCodingPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// ── Phase definitions ──────────────────────────────────────────────────────

const PHASES = [
  { key: "planning", label: "Planning", icon: ListChecks, color: "text-sky-400", bg: "bg-sky-500/15", border: "border-sky-500/30" },
  { key: "coding", label: "Coding", icon: FileCode2, color: "text-amber-400", bg: "bg-amber-500/15", border: "border-amber-500/30" },
  { key: "testing", label: "Testing", icon: TestTube2, color: "text-violet-400", bg: "bg-violet-500/15", border: "border-violet-500/30" },
  { key: "fixing", label: "Fixing", icon: Wrench, color: "text-orange-400", bg: "bg-orange-500/15", border: "border-orange-500/30" },
  { key: "committed", label: "Committed", icon: GitCommitHorizontal, color: "text-emerald-400", bg: "bg-emerald-500/15", border: "border-emerald-500/30" },
] as const;

type PhaseKey = (typeof PHASES)[number]["key"];

const APPROVAL_MODES = [
  { value: "auto", label: "Auto-approve", desc: "All changes applied automatically" },
  { value: "suggest", label: "Suggest", desc: "Suggest changes, require approval" },
  { value: "ask", label: "Ask-every-time", desc: "Ask before every single action" },
] as const;

// ── Helpers ────────────────────────────────────────────────────────────────

function statusBadge(status: string) {
  const map: Record<string, { color: string; icon: React.ReactNode; label: string }> = {
    idle: { color: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30", icon: <CircleDot className="h-3 w-3 mr-1" />, label: "Idle" },
    planning: { color: "bg-sky-500/15 text-sky-400 border-sky-500/30", icon: <ListChecks className="h-3 w-3 mr-1" />, label: "Planning" },
    coding: { color: "bg-amber-500/15 text-amber-400 border-amber-500/30", icon: <FileCode2 className="h-3 w-3 mr-1" />, label: "Coding" },
    testing: { color: "bg-violet-500/15 text-violet-400 border-violet-500/30", icon: <TestTube2 className="h-3 w-3 mr-1" />, label: "Testing" },
    fixing: { color: "bg-orange-500/15 text-orange-400 border-orange-500/30", icon: <Wrench className="h-3 w-3 mr-1" />, label: "Fixing" },
    committed: { color: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30", icon: <CheckCircle2 className="h-3 w-3 mr-1" />, label: "Committed" },
    failed: { color: "bg-red-500/15 text-red-400 border-red-500/30", icon: <XCircle className="h-3 w-3 mr-1" />, label: "Failed" },
  };
  const entry = map[status] || map.idle;
  return (
    <Badge className={cn("h-5 text-[10px] border", entry.color)}>
      {entry.icon}
      {entry.label}
    </Badge>
  );
}

function getPhaseIndex(status: string): number {
  const idx = PHASES.findIndex((p) => p.key === status);
  return idx >= 0 ? idx : -1;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function safeJsonParse<T>(val: string | null | undefined, fallback: T): T {
  if (!val) return fallback;
  try {
    return JSON.parse(val) as T;
  } catch {
    return fallback;
  }
}

// ── Main Component ─────────────────────────────────────────────────────────

export function AutonomousCodingPanel({ open, onOpenChange }: AutonomousCodingPanelProps) {
  // ── State ──────────────────────────────────────────────────────────────
  const [sessions, setSessions] = useState<CodingSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("setup");

  // Setup form
  const [taskInput, setTaskInput] = useState("");
  const [workspacePath, setWorkspacePath] = useState("/home/user/project");
  const [approvalMode, setApprovalMode] = useState<"auto" | "suggest" | "ask">("suggest");
  const [maxIterations, setMaxIterations] = useState([10]);
  const [creating, setCreating] = useState(false);

  // Live loop
  const [planExpanded, setPlanExpanded] = useState(true);
  const [diffExpanded, setDiffExpanded] = useState(true);
  const [testExpanded, setTestExpanded] = useState(false);
  const [iterating, setIterating] = useState(false);
  const [planning, setPlanning] = useState(false);
  const [rollingBack, setRollingBack] = useState(false);
  const [rollbackCheckpoint, setRollbackCheckpoint] = useState<string | null>(null);

  // History detail
  const [historyDetailId, setHistoryDetailId] = useState<string | null>(null);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Data fetching ──────────────────────────────────────────────────────
  const fetchSessions = useCallback(async () => {
    try {
      const res = await fetch("/api/coding-sessions");
      if (res.ok) {
        const data: CodingSession[] = await res.json();
        setSessions(data);
      }
    } catch {
      // silent
    }
  }, []);

  const fetchActiveSession = useCallback(async () => {
    if (!activeSessionId) return;
    try {
      const res = await fetch(`/api/coding-sessions/${activeSessionId}`);
      if (res.ok) {
        const data: CodingSession = await res.json();
        setSessions((prev) => prev.map((s) => (s.id === data.id ? data : s)));
      }
    } catch {
      // silent
    }
  }, [activeSessionId]);

  // Load sessions on open
  useEffect(() => {
    if (!open) return;
    fetchSessions();
  }, [open, fetchSessions]);

  // Auto-refresh every 2s when session is running
  useEffect(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }

    const active = sessions.find((s) => s.id === activeSessionId);
    const isRunning = active && ["planning", "coding", "testing", "fixing"].includes(active.status);

    if (open && activeSessionId && isRunning) {
      pollRef.current = setInterval(fetchActiveSession, 2000);
    }

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [open, activeSessionId, sessions, fetchActiveSession]);

  // ── Handlers ───────────────────────────────────────────────────────────
  const handleCreateSession = async () => {
    if (!taskInput.trim()) {
      toast.error("Please enter a task description");
      return;
    }
    if (!workspacePath.trim()) {
      toast.error("Please enter a workspace path");
      return;
    }

    setCreating(true);
    try {
      const res = await fetch("/api/coding-sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: taskInput.trim().substring(0, 60) + (taskInput.trim().length > 60 ? "..." : ""),
          task: taskInput.trim(),
          workspacePath: workspacePath.trim(),
          approvalMode,
          maxIterations: maxIterations[0],
          status: "idle",
        }),
      });

      if (res.ok) {
        const session: CodingSession = await res.json();
        toast.success("Coding session created");
        setActiveSessionId(session.id);
        setActiveTab("live");
        setTaskInput("");
        await fetchSessions();
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to create session");
      }
    } catch {
      toast.error("Failed to create session");
    } finally {
      setCreating(false);
    }
  };

  const handlePlan = async () => {
    if (!activeSessionId) return;
    setPlanning(true);
    try {
      const res = await fetch(`/api/coding-sessions/${activeSessionId}/plan`, { method: "POST" });
      if (res.ok) {
        toast.success("Plan generated");
        await fetchActiveSession();
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to generate plan");
      }
    } catch {
      toast.error("Failed to generate plan");
    } finally {
      setPlanning(false);
    }
  };

  const handleIterate = async () => {
    if (!activeSessionId) return;
    setIterating(true);
    try {
      const res = await fetch(`/api/coding-sessions/${activeSessionId}/iterate`, { method: "POST" });
      if (res.ok) {
        const data: CodingSession = await res.json();
        if (data.status === "committed") {
          toast.success("Session completed!");
        } else {
          toast.success("Iteration completed");
        }
        await fetchActiveSession();
      } else {
        const data = await res.json();
        toast.error(data.error || "Iteration failed");
      }
    } catch {
      toast.error("Iteration failed");
    } finally {
      setIterating(false);
    }
  };

  const handlePause = async () => {
    if (!activeSessionId) return;
    try {
      await fetch(`/api/coding-sessions/${activeSessionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "idle" }),
      });
      toast.info("Session paused");
      await fetchActiveSession();
    } catch {
      toast.error("Failed to pause session");
    }
  };

  const handleStop = async () => {
    if (!activeSessionId) return;
    try {
      await fetch(`/api/coding-sessions/${activeSessionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "failed" }),
      });
      toast.info("Session stopped");
      await fetchActiveSession();
    } catch {
      toast.error("Failed to stop session");
    }
  };

  const handleApprove = async () => {
    if (!activeSessionId) return;
    toast.success("Changes approved, continuing...");
    await handleIterate();
  };

  const handleReject = async () => {
    if (!activeSessionId) return;
    toast.error("Changes rejected, stopping session");
    await handleStop();
  };

  const handleRollback = async (checkpointId: string) => {
    if (!activeSessionId) return;
    setRollingBack(true);
    setRollbackCheckpoint(checkpointId);
    try {
      const res = await fetch(`/api/coding-sessions/${activeSessionId}/rollback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ checkpointId }),
      });
      if (res.ok) {
        toast.success("Rolled back to checkpoint");
        await fetchActiveSession();
      } else {
        const data = await res.json();
        toast.error(data.error || "Rollback failed");
      }
    } catch {
      toast.error("Rollback failed");
    } finally {
      setRollingBack(false);
      setRollbackCheckpoint(null);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/coding-sessions/${id}`, { method: "DELETE" });
      if (res.ok) {
        toast.success("Session deleted");
        if (activeSessionId === id) {
          setActiveSessionId(null);
          setActiveTab("setup");
        }
        if (historyDetailId === id) setHistoryDetailId(null);
        await fetchSessions();
      }
    } catch {
      toast.error("Failed to delete session");
    }
  };

  const handleSelectHistorySession = (id: string) => {
    setActiveSessionId(id);
    setHistoryDetailId(id);
    setActiveTab("live");
  };

  // ── Derived data ───────────────────────────────────────────────────────
  const activeSession = sessions.find((s) => s.id === activeSessionId) || null;
  const isRunning = activeSession
    ? ["planning", "coding", "testing", "fixing"].includes(activeSession.status)
    : false;
  const isTerminal = activeSession
    ? ["committed", "failed"].includes(activeSession.status)
    : false;

  const planData = safeJsonParse<{ steps: string[] }>(activeSession?.plan, { steps: [] });
  const diffEntries = safeJsonParse<Array<{ timestamp: string; step: number; diff: Record<string, unknown> }>>(
    activeSession?.diffLog,
    []
  );
  const testEntries = safeJsonParse<Array<{ passed: number; failed: number; output: string }>>(
    activeSession?.testResults,
    []
  );
  const checkpoints = safeJsonParse<Array<{ id: string; timestamp: string; description: string }>>(
    activeSession?.checkpoints,
    []
  );

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-5xl max-h-[90vh] overflow-hidden flex flex-col" showCloseButton>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Code2 className="h-5 w-5" />
            Autonomous Coding Loop
          </DialogTitle>
          <DialogDescription>
            Set up and monitor AI-driven autonomous coding sessions
          </DialogDescription>
        </DialogHeader>
          <PowerToolHint name="Autonomous Coding" />

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
          <TabsList className="w-full grid grid-cols-3">
            <TabsTrigger value="setup" className="gap-1.5">
              <Settings2 className="h-3.5 w-3.5" />
              Session Setup
            </TabsTrigger>
            <TabsTrigger value="live" className="gap-1.5">
              <Activity className="h-3.5 w-3.5" />
              Live Loop
            </TabsTrigger>
            <TabsTrigger value="history" className="gap-1.5">
              <History className="h-3.5 w-3.5" />
              History
            </TabsTrigger>
          </TabsList>

          {/* ─── SETUP TAB ──────────────────────────────────────────────── */}
          <TabsContent value="setup" className="flex-1 overflow-y-auto mt-0">
            <ScrollArea className="max-h-[65vh]">
              <div className="space-y-6 p-1">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Zap className="h-4 w-4 text-amber-400" />
                      Create New Session
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* Task description */}
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium">Task Description</Label>
                      <Textarea
                        value={taskInput}
                        onChange={(e) => setTaskInput(e.target.value)}
                        placeholder="Describe the coding task in detail. Be specific about files to modify, features to implement, or bugs to fix..."
                        className="min-h-[100px] text-sm resize-none"
                        rows={4}
                      />
                      <p className="text-[10px] text-muted-foreground">
                        The AI will break this task into steps and execute them autonomously.
                      </p>
                    </div>

                    {/* Workspace path */}
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium flex items-center gap-1.5">
                        <FolderOpen className="h-3.5 w-3.5" />
                        Workspace Path
                      </Label>
                      <Input
                        value={workspacePath}
                        onChange={(e) => setWorkspacePath(e.target.value)}
                        placeholder="/path/to/your/project"
                        className="h-9 text-sm font-mono"
                      />
                    </div>

                    {/* Approval mode */}
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium">Approval Mode</Label>
                      <div className="grid grid-cols-3 gap-2">
                        {APPROVAL_MODES.map((mode) => (
                          <button
                            key={mode.value}
                            type="button"
                            className={cn(
                              "text-left rounded-lg border p-3 transition-all",
                              approvalMode === mode.value
                                ? "border-primary bg-primary/10 text-primary"
                                : "border-border hover:border-primary/30 text-muted-foreground"
                            )}
                            onClick={() => setApprovalMode(mode.value)}
                          >
                            <div className="text-xs font-semibold mb-0.5">{mode.label}</div>
                            <div className="text-[10px] opacity-70 leading-tight">{mode.desc}</div>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Max iterations slider */}
                    <div className="space-y-2">
                      <Label className="text-xs font-medium flex items-center justify-between">
                        <span>Max Iterations</span>
                        <span className="text-primary font-bold text-sm">{maxIterations[0]}</span>
                      </Label>
                      <Slider
                        value={maxIterations}
                        onValueChange={setMaxIterations}
                        min={1}
                        max={20}
                        step={1}
                        className="w-full"
                      />
                      <div className="flex justify-between text-[10px] text-muted-foreground">
                        <span>1</span>
                        <span>20</span>
                      </div>
                    </div>

                    <Separator />

                    {/* Start button */}
                    <Button
                      className="w-full"
                      onClick={handleCreateSession}
                      disabled={creating || !taskInput.trim() || !workspacePath.trim()}
                    >
                      {creating ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Play className="h-4 w-4 mr-2" />
                      )}
                      Start Session
                    </Button>
                  </CardContent>
                </Card>

                {/* Quick-start from existing session */}
                {sessions.length > 0 && (
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <FastForward className="h-4 w-4 text-sky-400" />
                        Resume Existing Session
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-1.5">
                        {sessions
                          .filter((s) => !["committed", "failed"].includes(s.status))
                          .slice(0, 5)
                          .map((s) => (
                            <button
                              key={s.id}
                              type="button"
                              className="w-full text-left flex items-center justify-between gap-2 rounded-md border px-3 py-2 hover:bg-muted/50 transition-colors"
                              onClick={() => {
                                setActiveSessionId(s.id);
                                setActiveTab("live");
                              }}
                            >
                              <div className="min-w-0">
                                <div className="text-xs font-medium truncate">{s.title}</div>
                                <div className="text-[10px] text-muted-foreground flex items-center gap-2 mt-0.5">
                                  <span>Iter {s.iterations}/{s.maxIterations}</span>
                                  {statusBadge(s.status)}
                                </div>
                              </div>
                              <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                            </button>
                          ))}
                        {sessions.filter((s) => !["committed", "failed"].includes(s.status)).length === 0 && (
                          <p className="text-xs text-muted-foreground text-center py-2">No active sessions</p>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            </ScrollArea>
          </TabsContent>

          {/* ─── LIVE LOOP TAB ───────────────────────────────────────────── */}
          <TabsContent value="live" className="flex-1 overflow-hidden mt-0">
            {!activeSession ? (
              <div className="flex flex-col items-center justify-center h-full min-h-[300px] text-center gap-3 p-8">
                <Code2 className="h-12 w-12 text-muted-foreground/30" />
                <div>
                  <p className="text-sm font-medium text-muted-foreground">No Active Session</p>
                  <p className="text-xs text-muted-foreground/70 mt-1">
                    Create a new session from the Setup tab, or select one from History.
                  </p>
                </div>
                <Button variant="outline" size="sm" onClick={() => setActiveTab("setup")}>
                  <Settings2 className="h-3.5 w-3.5 mr-1.5" />
                  Go to Setup
                </Button>
              </div>
            ) : (
              <ScrollArea className="max-h-[65vh]">
                <div className="space-y-4 p-1">
                  {/* ── Status Bar ─────────────────────────────────────── */}
                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between gap-3 mb-3">
                        <div className="flex items-center gap-2 min-w-0">
                          <h3 className="text-sm font-semibold truncate">{activeSession.title}</h3>
                          {statusBadge(activeSession.status)}
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {isRunning && (
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handlePause}>
                              <Pause className="h-4 w-4" />
                            </Button>
                          )}
                          {activeSession.status === "idle" && activeSession.plan && (
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleIterate}>
                              <Play className="h-4 w-4" />
                            </Button>
                          )}
                          {(isRunning || activeSession.status === "idle") && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive hover:text-destructive"
                              onClick={handleStop}
                            >
                              <Square className="h-4 w-4" />
                            </Button>
                          )}
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={fetchActiveSession}>
                                  <RefreshCw className="h-4 w-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Refresh</TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </div>
                      </div>

                      {/* Phase progress */}
                      <div className="flex items-center gap-1 mb-2">
                        {PHASES.map((phase, idx) => {
                          const currentIdx = getPhaseIndex(activeSession.status);
                          const isActive = phase.key === activeSession.status;
                          const isCompleted = currentIdx >= 0 && idx < currentIdx;
                          const isFailed = activeSession.status === "failed";

                          return (
                            <div key={phase.key} className="flex items-center gap-1 flex-1">
                              <div
                                className={cn(
                                  "flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border text-[10px] font-medium transition-all w-full justify-center",
                                  isActive && !isFailed && cn(phase.bg, phase.border, phase.color),
                                  isCompleted && "bg-emerald-500/10 border-emerald-500/30 text-emerald-400",
                                  !isActive && !isCompleted && "bg-muted/30 border-transparent text-muted-foreground",
                                  isFailed && isActive && "bg-red-500/10 border-red-500/30 text-red-400"
                                )}
                              >
                                {isCompleted ? (
                                  <CheckCircle2 className="h-3 w-3 shrink-0" />
                                ) : isActive && isRunning ? (
                                  <Loader2 className="h-3 w-3 shrink-0 animate-spin" />
                                ) : (
                                  <phase.icon className="h-3 w-3 shrink-0" />
                                )}
                                <span className="hidden sm:inline truncate">{phase.label}</span>
                              </div>
                              {idx < PHASES.length - 1 && (
                                <ArrowRight className="h-3 w-3 text-muted-foreground/30 shrink-0" />
                              )}
                            </div>
                          );
                        })}
                      </div>

                      {/* Iteration progress bar */}
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                          <span>Iteration {activeSession.iterations}/{activeSession.maxIterations}</span>
                          <span>
                            {activeSession.approvalMode === "auto"
                              ? "Auto-approve"
                              : activeSession.approvalMode === "suggest"
                              ? "Suggest"
                              : "Ask-every-time"}
                          </span>
                        </div>
                        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                          <div
                            className={cn(
                              "h-full rounded-full transition-all duration-700",
                              isTerminal
                                ? activeSession.status === "committed"
                                  ? "bg-emerald-500"
                                  : "bg-red-500"
                                : "bg-primary"
                            )}
                            style={{
                              width: `${Math.min(100, (activeSession.iterations / activeSession.maxIterations) * 100)}%`,
                            }}
                          />
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* ── Controls Row ──────────────────────────────────── */}
                  <div className="flex flex-wrap items-center gap-2">
                    {!activeSession.plan && activeSession.status === "idle" && (
                      <Button size="sm" onClick={handlePlan} disabled={planning}>
                        {planning ? (
                          <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                        ) : (
                          <ListChecks className="h-3.5 w-3.5 mr-1.5" />
                        )}
                        Generate Plan
                      </Button>
                    )}
                    {activeSession.plan && !isTerminal && (
                      <Button size="sm" onClick={handleIterate} disabled={iterating || isRunning}>
                        {iterating ? (
                          <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                        ) : (
                          <FastForward className="h-3.5 w-3.5 mr-1.5" />
                        )}
                        Run Next Iteration
                      </Button>
                    )}
                    {activeSession.approvalMode !== "auto" && isRunning && (
                      <>
                        <Button size="sm" variant="outline" className="text-emerald-500 hover:text-emerald-400" onClick={handleApprove}>
                          <ThumbsUp className="h-3.5 w-3.5 mr-1.5" />
                          Approve
                        </Button>
                        <Button size="sm" variant="outline" className="text-destructive hover:text-destructive" onClick={handleReject}>
                          <ThumbsDown className="h-3.5 w-3.5 mr-1.5" />
                          Reject
                        </Button>
                      </>
                    )}
                    {isTerminal && (
                      <Badge
                        className={cn(
                          "text-xs py-1",
                          activeSession.status === "committed"
                            ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                            : "bg-red-500/15 text-red-400 border-red-500/30"
                        )}
                      >
                        {activeSession.status === "committed" ? (
                          <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                        ) : (
                          <XCircle className="h-3.5 w-3.5 mr-1" />
                        )}
                        {activeSession.status === "committed" ? "Session Complete" : "Session Failed"}
                      </Badge>
                    )}
                  </div>

                  {/* ── Plan Section ──────────────────────────────────── */}
                  {activeSession.plan && (
                    <Collapsible open={planExpanded} onOpenChange={setPlanExpanded}>
                      <Card>
                        <CollapsibleTrigger asChild>
                          <CardHeader className="pb-2 cursor-pointer hover:bg-muted/30 transition-colors rounded-t-lg">
                            <CardTitle className="text-xs font-medium flex items-center justify-between">
                              <span className="flex items-center gap-1.5">
                                <ListChecks className="h-3.5 w-3.5 text-sky-400" />
                                Plan ({planData.steps.length} steps)
                              </span>
                              {planExpanded ? (
                                <ChevronUp className="h-3.5 w-3.5" />
                              ) : (
                                <ChevronDown className="h-3.5 w-3.5" />
                              )}
                            </CardTitle>
                          </CardHeader>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <CardContent className="pt-0 pb-3">
                            <div className="space-y-1">
                              {planData.steps.map((step, idx) => {
                                const isStepCompleted = idx < activeSession.iterations;
                                const isCurrentStep = idx === activeSession.iterations;
                                return (
                                  <div
                                    key={idx}
                                    className={cn(
                                      "flex items-start gap-2 px-2.5 py-1.5 rounded-md text-xs",
                                      isStepCompleted && "text-muted-foreground line-through opacity-60",
                                      isCurrentStep && "bg-primary/10 text-primary font-medium",
                                      !isStepCompleted && !isCurrentStep && "text-foreground"
                                    )}
                                  >
                                    <span className="shrink-0 mt-0.5">
                                      {isStepCompleted ? (
                                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                                      ) : isCurrentStep ? (
                                        <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                                      ) : (
                                        <CircleDot className="h-3.5 w-3.5 text-muted-foreground" />
                                      )}
                                    </span>
                                    <span className="leading-relaxed">
                                      <span className="text-muted-foreground mr-1.5">{idx + 1}.</span>
                                      {step}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          </CardContent>
                        </CollapsibleContent>
                      </Card>
                    </Collapsible>
                  )}

                  {/* ── Diff Viewer Section ───────────────────────────── */}
                  <Collapsible open={diffExpanded} onOpenChange={setDiffExpanded}>
                    <Card>
                      <CollapsibleTrigger asChild>
                        <CardHeader className="pb-2 cursor-pointer hover:bg-muted/30 transition-colors rounded-t-lg">
                          <CardTitle className="text-xs font-medium flex items-center justify-between">
                            <span className="flex items-center gap-1.5">
                              <FileCode2 className="h-3.5 w-3.5 text-amber-400" />
                              File Changes ({diffEntries.length})
                            </span>
                            {diffExpanded ? (
                              <ChevronUp className="h-3.5 w-3.5" />
                            ) : (
                              <ChevronDown className="h-3.5 w-3.5" />
                            )}
                          </CardTitle>
                        </CardHeader>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <CardContent className="pt-0 pb-3">
                          {diffEntries.length === 0 ? (
                            <p className="text-xs text-muted-foreground text-center py-4">
                              No changes yet. Run an iteration to see diffs.
                            </p>
                          ) : (
                            <ScrollArea className="max-h-[200px]">
                              <div className="space-y-2">
                                {diffEntries.map((entry, idx) => (
                                  <div
                                    key={idx}
                                    className="rounded-md border bg-muted/30 p-2.5 font-mono text-[11px]"
                                  >
                                    <div className="flex items-center gap-2 mb-1.5 text-[10px] text-muted-foreground">
                                      <Badge variant="secondary" className="h-4 text-[9px] px-1.5">
                                        Step {entry.step + 1}
                                      </Badge>
                                      <Clock className="h-2.5 w-2.5" />
                                      <span>{formatDate(entry.timestamp)}</span>
                                    </div>
                                    <div className="text-foreground whitespace-pre-wrap break-all leading-relaxed">
                                      {entry.diff?.summary
                                        ? String(entry.diff.summary)
                                        : entry.diff?.action
                                        ? `${String(entry.diff.action)}: ${(entry.diff.files as string[])?.join(", ") || "no files"}`
                                        : JSON.stringify(entry.diff, null, 2)}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </ScrollArea>
                          )}
                        </CardContent>
                      </CollapsibleContent>
                    </Card>
                  </Collapsible>

                  {/* ── Test Results Section ──────────────────────────── */}
                  <Collapsible open={testExpanded} onOpenChange={setTestExpanded}>
                    <Card>
                      <CollapsibleTrigger asChild>
                        <CardHeader className="pb-2 cursor-pointer hover:bg-muted/30 transition-colors rounded-t-lg">
                          <CardTitle className="text-xs font-medium flex items-center justify-between">
                            <span className="flex items-center gap-1.5">
                              <TestTube2 className="h-3.5 w-3.5 text-violet-400" />
                              Test Results
                              {testEntries.length > 0 && (
                                <span className="flex items-center gap-1 ml-1">
                                  <span className="text-emerald-400">
                                    {testEntries.reduce((a, t) => a + t.passed, 0)} passed
                                  </span>
                                  <span className="text-muted-foreground">/</span>
                                  <span className="text-red-400">
                                    {testEntries.reduce((a, t) => a + t.failed, 0)} failed
                                  </span>
                                </span>
                              )}
                            </span>
                            {testExpanded ? (
                              <ChevronUp className="h-3.5 w-3.5" />
                            ) : (
                              <ChevronDown className="h-3.5 w-3.5" />
                            )}
                          </CardTitle>
                        </CardHeader>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <CardContent className="pt-0 pb-3">
                          {testEntries.length === 0 ? (
                            <p className="text-xs text-muted-foreground text-center py-4">
                              No test results yet. Tests run during the testing phase.
                            </p>
                          ) : (
                            <div className="space-y-1.5">
                              {testEntries.map((entry, idx) => (
                                <div key={idx} className="flex items-center gap-3 text-xs px-2 py-1.5 rounded-md border">
                                  <span className="flex items-center gap-1 text-emerald-400">
                                    <CheckCircle2 className="h-3 w-3" />
                                    {entry.passed}
                                  </span>
                                  <span className="flex items-center gap-1 text-red-400">
                                    <XCircle className="h-3 w-3" />
                                    {entry.failed}
                                  </span>
                                  {entry.output && (
                                    <span className="text-muted-foreground truncate flex-1 text-[10px]">
                                      {entry.output}
                                    </span>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </CardContent>
                      </CollapsibleContent>
                    </Card>
                  </Collapsible>

                  {/* ── Checkpoints Section ───────────────────────────── */}
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-xs font-medium flex items-center gap-1.5">
                        <GitCommitHorizontal className="h-3.5 w-3.5 text-emerald-400" />
                        Checkpoints ({checkpoints.length})
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0 pb-3">
                      {checkpoints.length === 0 ? (
                        <p className="text-xs text-muted-foreground text-center py-3">
                          Checkpoints created automatically after each iteration.
                        </p>
                      ) : (
                        <div className="space-y-1">
                          {checkpoints.map((cp, idx) => (
                            <div
                              key={cp.id}
                              className="flex items-center justify-between gap-2 text-xs px-2.5 py-2 rounded-md border group"
                            >
                              <div className="min-w-0 flex items-center gap-2">
                                <GitCommitHorizontal className="h-3 w-3 text-emerald-400 shrink-0" />
                                <div className="min-w-0">
                                  <span className="font-mono text-[10px] text-muted-foreground">{cp.id}</span>
                                  <p className="text-[10px] text-muted-foreground truncate">
                                    {cp.description}
                                  </p>
                                </div>
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0">
                                <span className="text-[10px] text-muted-foreground hidden sm:inline">
                                  {formatDate(cp.timestamp)}
                                </span>
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                                        disabled={rollingBack && rollbackCheckpoint === cp.id}
                                        onClick={() => handleRollback(cp.id)}
                                      >
                                        {rollingBack && rollbackCheckpoint === cp.id ? (
                                          <Loader2 className="h-3 w-3 animate-spin" />
                                        ) : (
                                          <RotateCcw className="h-3 w-3" />
                                        )}
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>Rollback to this checkpoint</TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {/* ── Result ────────────────────────────────────────── */}
                  {activeSession.result && (
                    <Card className={cn(
                      "border",
                      activeSession.status === "committed"
                        ? "border-emerald-500/30 bg-emerald-500/5"
                        : "border-red-500/30 bg-red-500/5"
                    )}>
                      <CardContent className="p-4">
                        <div className="flex items-start gap-2">
                          {activeSession.status === "committed" ? (
                            <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
                          ) : (
                            <AlertTriangle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
                          )}
                          <div>
                            <p className="text-xs font-semibold mb-0.5">
                              {activeSession.status === "committed" ? "Session Result" : "Session Failed"}
                            </p>
                            <p className="text-xs text-muted-foreground">{activeSession.result}</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </div>
              </ScrollArea>
            )}
          </TabsContent>

          {/* ─── HISTORY TAB ───────────────────────────────────────────── */}
          <TabsContent value="history" className="flex-1 overflow-hidden mt-0">
            <ScrollArea className="max-h-[65vh]">
              {sessions.length === 0 ? (
                <div className="flex flex-col items-center justify-center min-h-[200px] text-center gap-3 p-8">
                  <History className="h-10 w-10 text-muted-foreground/30" />
                  <p className="text-sm text-muted-foreground">No past sessions yet</p>
                </div>
              ) : (
                <div className="space-y-2 p-1">
                  {sessions.map((session) => (
                    <div
                      key={session.id}
                      className={cn(
                        "rounded-lg border p-3 transition-colors hover:bg-muted/30",
                        historyDetailId === session.id && "border-primary/40 bg-primary/5"
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div
                          className="flex-1 min-w-0 cursor-pointer"
                          onClick={() => handleSelectHistorySession(session.id)}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleSelectHistorySession(session.id);
                          }}
                        >
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-sm truncate">{session.title}</span>
                            {statusBadge(session.status)}
                          </div>
                          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                            {session.task}
                          </p>
                          <div className="flex items-center gap-3 mt-1.5 text-[10px] text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {formatDate(session.createdAt)}
                            </span>
                            <span className="flex items-center gap-1">
                              <Bug className="h-3 w-3" />
                              {session.iterations}/{session.maxIterations} iterations
                            </span>
                            <span className="flex items-center gap-1">
                              <FolderOpen className="h-3 w-3" />
                              <span className="truncate max-w-[120px]">{session.workspacePath}</span>
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-0.5 shrink-0">
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7"
                                  onClick={() => handleSelectHistorySession(session.id)}
                                >
                                  <Eye className="h-3.5 w-3.5" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>View session</TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 text-destructive hover:text-destructive"
                                  onClick={() => handleDelete(session.id)}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Delete session</TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </div>
                      </div>

                      {/* Expanded detail view */}
                      {historyDetailId === session.id && (
                        <div className="mt-3 pt-3 border-t space-y-2">
                          {/* Result */}
                          {session.result && (
                            <div className={cn(
                              "rounded-md px-3 py-2 text-xs",
                              session.status === "committed"
                                ? "bg-emerald-500/10 text-emerald-400"
                                : "bg-red-500/10 text-red-400"
                            )}>
                              <span className="font-medium">Result: </span>
                              {session.result}
                            </div>
                          )}

                          {/* Plan summary */}
                          {session.plan && (
                            <div className="text-xs">
                              <span className="text-muted-foreground font-medium">Plan steps: </span>
                              <span>{safeJsonParse<{ steps: string[] }>(session.plan, { steps: [] }).steps.length}</span>
                            </div>
                          )}

                          {/* Checkpoints */}
                          {session.checkpoints && (() => {
                            const cps = safeJsonParse<Array<{ id: string; description: string }>>(session.checkpoints, []);
                            return cps.length > 0 ? (
                              <div>
                                <span className="text-xs text-muted-foreground font-medium">Checkpoints: </span>
                                <div className="flex flex-wrap gap-1 mt-1">
                                  {cps.map((cp) => (
                                    <Badge key={cp.id} variant="secondary" className="text-[9px] h-5">
                                      {cp.id}: {cp.description.substring(0, 40)}
                                      {cp.description.length > 40 ? "..." : ""}
                                    </Badge>
                                  ))}
                                </div>
                              </div>
                            ) : null;
                          })()}

                          {/* Diff log count */}
                          {session.diffLog && (
                            <div className="text-xs">
                              <span className="text-muted-foreground font-medium">File changes: </span>
                              <span>{safeJsonParse<Array<unknown>>(session.diffLog, []).length} entries</span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

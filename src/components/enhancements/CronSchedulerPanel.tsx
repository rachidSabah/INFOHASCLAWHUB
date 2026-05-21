"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PowerToolHint } from "./PowerToolHint";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  Clock,
  Play,
  Pause,
  Trash2,
  Plus,
  Activity,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Zap,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

interface CronTask {
  id: string;
  name: string;
  description: string | null;
  cronExpr: string;
  taskType: string;
  agentId: string | null;
  config: string;
  status: string;
  lastRunAt: string | null;
  nextRunAt: string | null;
  lastResult: string | null;
  runCount: number;
  failCount: number;
  retryPolicy: string;
  dependencies: string;
  createdAt: string;
  updatedAt: string;
}

interface AgentWorker {
  id: string;
  name: string;
  agentId: string;
  status: string;
  currentTask: string | null;
  pid: number | null;
  lastHeartbeat: string | null;
  totalTasks: number;
  successCount: number;
  errorCount: number;
  config: string;
  createdAt: string;
  updatedAt: string;
}

interface SelfHealResult {
  issues: string[];
  fixed: string[];
}

interface CronSchedulerPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function taskStatusBadge(status: string) {
  switch (status) {
    case "active":
      return "bg-emerald-500/15 text-emerald-400 border-emerald-500/30";
    case "paused":
      return "bg-yellow-500/15 text-yellow-400 border-yellow-500/30";
    case "disabled":
      return "bg-zinc-500/15 text-zinc-400 border-zinc-500/30";
    case "error":
      return "bg-red-500/15 text-red-400 border-red-500/30";
    default:
      return "bg-zinc-500/15 text-zinc-400 border-zinc-500/30";
  }
}

function workerStatusBadge(status: string) {
  switch (status) {
    case "idle":
      return "bg-sky-500/15 text-sky-400 border-sky-500/30";
    case "running":
      return "bg-emerald-500/15 text-emerald-400 border-emerald-500/30";
    case "waiting":
      return "bg-yellow-500/15 text-yellow-400 border-yellow-500/30";
    case "error":
      return "bg-red-500/15 text-red-400 border-red-500/30";
    case "stopped":
      return "bg-zinc-500/15 text-zinc-400 border-zinc-500/30";
    default:
      return "bg-zinc-500/15 text-zinc-400 border-zinc-500/30";
  }
}

function taskTypeLabel(type: string) {
  switch (type) {
    case "agent_run":
      return "Agent Run";
    case "repo_monitor":
      return "Repo Monitor";
    case "health_check":
      return "Health Check";
    case "auto_deploy":
      return "Auto Deploy";
    case "issue_resolve":
      return "Issue Resolve";
    case "custom":
      return "Custom";
    default:
      return type;
  }
}

function formatTimeAgo(dateStr: string | null): string {
  if (!dateStr) return "Never";
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHrs = Math.floor(diffMins / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  const diffDays = Math.floor(diffHrs / 24);
  if (diffDays < 30) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

function formatFutureDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  if (diffMs < 0) return "Overdue";
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "In <1m";
  if (diffMins < 60) return `In ${diffMins}m`;
  const diffHrs = Math.floor(diffMins / 60);
  if (diffHrs < 24) return `In ${diffHrs}h`;
  return date.toLocaleDateString();
}

// ─── Component ───────────────────────────────────────────────────────────────

export function CronSchedulerPanel({ open, onOpenChange }: CronSchedulerPanelProps) {
  // ── Tasks State ──
  const [tasks, setTasks] = useState<CronTask[]>([]);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [showCreateTask, setShowCreateTask] = useState(false);
  const [creatingTask, setCreatingTask] = useState(false);
  const [executingTaskId, setExecutingTaskId] = useState<string | null>(null);
  const [deletingTaskId, setDeletingTaskId] = useState<string | null>(null);

  // ── Workers State ──
  const [workers, setWorkers] = useState<AgentWorker[]>([]);
  const [workersLoading, setWorkersLoading] = useState(false);
  const [showCreateWorker, setShowCreateWorker] = useState(false);
  const [creatingWorker, setCreatingWorker] = useState(false);
  const [workerActionId, setWorkerActionId] = useState<string | null>(null);

  // ── Self-Heal State ──
  const [selfHealResult, setSelfHealResult] = useState<SelfHealResult | null>(null);
  const [selfHealRunning, setSelfHealRunning] = useState(false);

  // ── Active Tab ──
  const [activeTab, setActiveTab] = useState("tasks");

  // ── Create Task Form ──
  const [newTask, setNewTask] = useState({
    name: "",
    description: "",
    cronExpr: "",
    taskType: "agent_run",
    agentId: "",
    config: "{}",
    maxRetries: 3,
    backoffMs: 1000,
  });

  // ── Create Worker Form ──
  const [newWorker, setNewWorker] = useState({
    name: "",
    agentId: "",
  });

  // ── Fetch Tasks ──
  const fetchTasks = useCallback(async () => {
    setTasksLoading(true);
    try {
      const res = await fetch("/api/cron/tasks");
      if (res.ok) {
        const data = await res.json();
        setTasks(data.tasks || []);
      }
    } catch {
      // silently fail
    } finally {
      setTasksLoading(false);
    }
  }, []);

  // ── Fetch Workers ──
  const fetchWorkers = useCallback(async () => {
    setWorkersLoading(true);
    try {
      const res = await fetch("/api/cron/workers");
      if (res.ok) {
        const data = await res.json();
        setWorkers(data.workers || []);
      }
    } catch {
      // silently fail
    } finally {
      setWorkersLoading(false);
    }
  }, []);

  // ── Init ──
  useEffect(() => {
    if (!open) return;
    fetchTasks();
    fetchWorkers();
    setSelfHealResult(null);
  }, [open, fetchTasks, fetchWorkers]);

  // ── Create Task ──
  const handleCreateTask = async () => {
    if (!newTask.name.trim() || !newTask.cronExpr.trim()) {
      toast.error("Name and cron expression are required");
      return;
    }
    setCreatingTask(true);
    try {
      let parsedConfig = {};
      try {
        parsedConfig = JSON.parse(newTask.config);
      } catch {
        toast.error("Config must be valid JSON");
        setCreatingTask(false);
        return;
      }

      const res = await fetch("/api/cron/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newTask.name.trim(),
          description: newTask.description || undefined,
          cronExpr: newTask.cronExpr.trim(),
          taskType: newTask.taskType,
          agentId: newTask.agentId || undefined,
          config: parsedConfig,
          retryPolicy: {
            maxRetries: newTask.maxRetries,
            backoffMs: newTask.backoffMs,
          },
        }),
      });
      if (res.ok) {
        toast.success("Task created successfully");
        setShowCreateTask(false);
        setNewTask({
          name: "",
          description: "",
          cronExpr: "",
          taskType: "agent_run",
          agentId: "",
          config: "{}",
          maxRetries: 3,
          backoffMs: 1000,
        });
        await fetchTasks();
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to create task");
      }
    } catch {
      toast.error("Failed to create task");
    } finally {
      setCreatingTask(false);
    }
  };

  // ── Toggle Task (Play/Pause) ──
  const toggleTask = async (task: CronTask) => {
    const newStatus = task.status === "active" ? "paused" : "active";
    try {
      const res = await fetch(`/api/cron/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        toast.success(`Task ${newStatus === "active" ? "resumed" : "paused"}`);
        await fetchTasks();
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to update task");
      }
    } catch {
      toast.error("Failed to update task");
    }
  };

  // ── Execute Task Now ──
  const executeTask = async (taskId: string) => {
    setExecutingTaskId(taskId);
    try {
      const res = await fetch("/api/cron/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.result?.success) {
          toast.success("Task executed successfully");
        } else {
          toast.warning(`Task executed with issues: ${data.result?.output?.slice(0, 100) || "unknown"}`);
        }
        await fetchTasks();
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to execute task");
      }
    } catch {
      toast.error("Failed to execute task");
    } finally {
      setExecutingTaskId(null);
    }
  };

  // ── Delete Task ──
  const deleteTask = async (taskId: string) => {
    setDeletingTaskId(taskId);
    try {
      const res = await fetch(`/api/cron/tasks/${taskId}`, { method: "DELETE" });
      if (res.ok) {
        toast.success("Task deleted");
        await fetchTasks();
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to delete task");
      }
    } catch {
      toast.error("Failed to delete task");
    } finally {
      setDeletingTaskId(null);
    }
  };

  // ── Register Worker ──
  const handleCreateWorker = async () => {
    if (!newWorker.name.trim() || !newWorker.agentId.trim()) {
      toast.error("Name and agent ID are required");
      return;
    }
    setCreatingWorker(true);
    try {
      const res = await fetch("/api/cron/workers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newWorker.name.trim(),
          agentId: newWorker.agentId.trim(),
        }),
      });
      if (res.ok) {
        toast.success("Worker registered");
        setShowCreateWorker(false);
        setNewWorker({ name: "", agentId: "" });
        await fetchWorkers();
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to register worker");
      }
    } catch {
      toast.error("Failed to register worker");
    } finally {
      setCreatingWorker(false);
    }
  };

  // ── Worker Actions ──
  const startWorker = async (workerId: string) => {
    setWorkerActionId(workerId);
    try {
      const res = await fetch(`/api/cron/workers/${workerId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "start" }),
      });
      if (res.ok) {
        toast.success("Worker started");
        await fetchWorkers();
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to start worker");
      }
    } catch {
      toast.error("Failed to start worker");
    } finally {
      setWorkerActionId(null);
    }
  };

  const stopWorker = async (workerId: string) => {
    setWorkerActionId(workerId);
    try {
      const res = await fetch(`/api/cron/workers/${workerId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "stop" }),
      });
      if (res.ok) {
        toast.success("Worker stopped");
        await fetchWorkers();
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to stop worker");
      }
    } catch {
      toast.error("Failed to stop worker");
    } finally {
      setWorkerActionId(null);
    }
  };

  const heartbeatWorker = async (workerId: string) => {
    setWorkerActionId(workerId);
    try {
      const res = await fetch(`/api/cron/workers/${workerId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "heartbeat" }),
      });
      if (res.ok) {
        toast.success("Heartbeat sent");
        await fetchWorkers();
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to send heartbeat");
      }
    } catch {
      toast.error("Failed to send heartbeat");
    } finally {
      setWorkerActionId(null);
    }
  };

  const deleteWorker = async (workerId: string) => {
    setWorkerActionId(workerId);
    try {
      const res = await fetch(`/api/cron/workers/${workerId}`, { method: "DELETE" });
      if (res.ok) {
        toast.success("Worker removed");
        await fetchWorkers();
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to remove worker");
      }
    } catch {
      toast.error("Failed to remove worker");
    } finally {
      setWorkerActionId(null);
    }
  };

  // ── Self-Heal ──
  const runSelfHeal = async () => {
    setSelfHealRunning(true);
    setSelfHealResult(null);
    try {
      const res = await fetch("/api/cron/self-heal", { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setSelfHealResult(data);
        const issueCount = data.issues?.length || 0;
        const fixedCount = data.fixed?.length || 0;
        toast.success(`Self-heal complete: ${issueCount} issue(s), ${fixedCount} fixed`);
      } else {
        const data = await res.json();
        toast.error(data.error || "Self-heal check failed");
      }
    } catch {
      toast.error("Self-heal check failed");
    } finally {
      setSelfHealRunning(false);
    }
  };

  // ── Stats ──
  const taskStats = {
    total: tasks.length,
    active: tasks.filter((t) => t.status === "active").length,
    paused: tasks.filter((t) => t.status === "paused").length,
    errors: tasks.filter((t) => t.status === "error").length,
  };

  const workerStats = {
    total: workers.length,
    running: workers.filter((w) => w.status === "running").length,
    idle: workers.filter((w) => w.status === "idle").length,
    stopped: workers.filter((w) => w.status === "stopped").length,
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════════

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl max-h-[92vh] overflow-hidden flex flex-col" showCloseButton>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-gradient-to-br from-emerald-500/20 to-teal-500/20 border border-emerald-500/30">
              <Clock className="h-4 w-4 text-emerald-400" />
            </div>
            Cron Scheduler &amp; Always-On Agents
          </DialogTitle>
          <DialogDescription>
            Schedule recurring tasks, manage workers, and run self-heal checks
          </DialogDescription>
        </DialogHeader>
        <PowerToolHint name="Cron Scheduler" />

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
          <TabsList className="grid w-full grid-cols-3 mb-1 shrink-0">
            <TabsTrigger value="tasks" className="gap-1.5 text-xs">
              <Clock className="h-3.5 w-3.5" />
              Tasks
            </TabsTrigger>
            <TabsTrigger value="workers" className="gap-1.5 text-xs">
              <Activity className="h-3.5 w-3.5" />
              Workers
            </TabsTrigger>
            <TabsTrigger value="self-heal" className="gap-1.5 text-xs">
              <Zap className="h-3.5 w-3.5" />
              Self-Heal
            </TabsTrigger>
          </TabsList>

          {/* ═══ TASKS TAB ═══ */}
          <TabsContent value="tasks" className="flex-1 min-h-0 mt-0 overflow-y-auto">
            <ScrollArea className="h-[calc(90vh-200px)]">
              <div className="space-y-4 p-1 pr-4">
                {/* Stats Row */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="rounded-lg border bg-card p-3 text-center">
                    <p className="text-2xl font-bold text-emerald-400">{taskStats.active}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">Active</p>
                  </div>
                  <div className="rounded-lg border bg-card p-3 text-center">
                    <p className="text-2xl font-bold text-yellow-400">{taskStats.paused}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">Paused</p>
                  </div>
                  <div className="rounded-lg border bg-card p-3 text-center">
                    <p className="text-2xl font-bold text-red-400">{taskStats.errors}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">Errors</p>
                  </div>
                  <div className="rounded-lg border bg-card p-3 text-center">
                    <p className="text-2xl font-bold text-zinc-400">{taskStats.total}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">Total</p>
                  </div>
                </div>

                {/* Action Bar */}
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    onClick={() => setShowCreateTask(true)}
                    className="h-8 text-xs gap-1.5"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Create Task
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={fetchTasks}
                    disabled={tasksLoading}
                    className="h-8 text-xs gap-1 ml-auto"
                  >
                    <Loader2 className={cn("h-3.5 w-3.5", tasksLoading && "animate-spin")} />
                    Refresh
                  </Button>
                </div>

                {/* Create Task Form */}
                {showCreateTask && (
                  <div className="rounded-xl border bg-card p-4 space-y-3">
                    <h4 className="text-sm font-semibold flex items-center gap-2">
                      <Plus className="h-4 w-4 text-emerald-400" />
                      New Cron Task
                    </h4>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs">Name *</Label>
                        <Input
                          placeholder="My scheduled task"
                          value={newTask.name}
                          onChange={(e) => setNewTask((p) => ({ ...p, name: e.target.value }))}
                          className="h-8 text-xs"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Cron Expression *</Label>
                        <Input
                          placeholder="*/5 * * * *"
                          value={newTask.cronExpr}
                          onChange={(e) => setNewTask((p) => ({ ...p, cronExpr: e.target.value }))}
                          className="h-8 text-xs font-mono"
                        />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Description</Label>
                      <Input
                        placeholder="What this task does..."
                        value={newTask.description}
                        onChange={(e) => setNewTask((p) => ({ ...p, description: e.target.value }))}
                        className="h-8 text-xs"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs">Task Type</Label>
                        <Select
                          value={newTask.taskType}
                          onValueChange={(v) => setNewTask((p) => ({ ...p, taskType: v }))}
                        >
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="agent_run">Agent Run</SelectItem>
                            <SelectItem value="repo_monitor">Repo Monitor</SelectItem>
                            <SelectItem value="health_check">Health Check</SelectItem>
                            <SelectItem value="auto_deploy">Auto Deploy</SelectItem>
                            <SelectItem value="issue_resolve">Issue Resolve</SelectItem>
                            <SelectItem value="custom">Custom</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Agent ID</Label>
                        <Input
                          placeholder="Optional agent ID"
                          value={newTask.agentId}
                          onChange={(e) => setNewTask((p) => ({ ...p, agentId: e.target.value }))}
                          className="h-8 text-xs"
                        />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Config (JSON)</Label>
                      <Textarea
                        placeholder='{"key": "value"}'
                        value={newTask.config}
                        onChange={(e) => setNewTask((p) => ({ ...p, config: e.target.value }))}
                        className="text-xs font-mono min-h-[60px]"
                        rows={3}
                      />
                    </div>
                    <Separator />
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs">Max Retries</Label>
                        <Input
                          type="number"
                          min={0}
                          max={10}
                          value={newTask.maxRetries}
                          onChange={(e) => setNewTask((p) => ({ ...p, maxRetries: parseInt(e.target.value) || 0 }))}
                          className="h-8 text-xs"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Backoff (ms)</Label>
                        <Input
                          type="number"
                          min={100}
                          step={100}
                          value={newTask.backoffMs}
                          onChange={(e) => setNewTask((p) => ({ ...p, backoffMs: parseInt(e.target.value) || 1000 }))}
                          className="h-8 text-xs"
                        />
                      </div>
                    </div>
                    <div className="flex gap-2 pt-1">
                      <Button size="sm" onClick={handleCreateTask} disabled={creatingTask} className="h-8 text-xs gap-1.5">
                        {creatingTask ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Plus className="h-3.5 w-3.5" />
                        )}
                        {creatingTask ? "Creating..." : "Create"}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setShowCreateTask(false)} className="h-8 text-xs">
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}

                {/* Tasks List */}
                {tasksLoading && tasks.length === 0 ? (
                  <div className="flex items-center justify-center py-16 text-muted-foreground">
                    <Loader2 className="h-6 w-6 animate-spin mr-2" />
                    <span className="text-sm">Loading tasks...</span>
                  </div>
                ) : tasks.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-muted-foreground border border-dashed rounded-lg">
                    <Clock className="h-10 w-10 mb-3 opacity-30" />
                    <p className="text-sm font-medium">No cron tasks</p>
                    <p className="text-xs mt-1">Click &quot;Create Task&quot; to schedule your first task</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {tasks.map((task) => (
                      <div
                        key={task.id}
                        className="rounded-lg border bg-card p-4 transition-all"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-medium truncate">{task.name}</span>
                              <Badge className={cn("h-5 text-[10px] border", taskStatusBadge(task.status))}>
                                {task.status}
                              </Badge>
                              <Badge variant="outline" className="h-5 text-[10px]">
                                {taskTypeLabel(task.taskType)}
                              </Badge>
                            </div>
                            <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                              <span className="font-mono bg-muted/60 px-2 py-0.5 rounded text-[11px]">
                                {task.cronExpr}
                              </span>
                              <span>Last: {formatTimeAgo(task.lastRunAt)}</span>
                              <span>Next: {formatFutureDate(task.nextRunAt)}</span>
                            </div>
                            <div className="flex items-center gap-3 mt-1 text-[10px] text-muted-foreground">
                              <span className="flex items-center gap-1">
                                <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                                {task.runCount} runs
                              </span>
                              <span className="flex items-center gap-1">
                                <AlertTriangle className="h-3 w-3 text-red-500" />
                                {task.failCount} fails
                              </span>
                              {task.agentId && (
                                <span className="truncate">Agent: {task.agentId.slice(0, 8)}...</span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => toggleTask(task)}
                              disabled={task.status === "disabled"}
                              className={cn(
                                "h-7 w-7 p-0",
                                task.status === "active"
                                  ? "text-yellow-400 hover:text-yellow-300 hover:border-yellow-500/50"
                                  : "text-emerald-400 hover:text-emerald-300 hover:border-emerald-500/50"
                              )}
                              title={task.status === "active" ? "Pause" : "Resume"}
                            >
                              {task.status === "active" ? (
                                <Pause className="h-3.5 w-3.5" />
                              ) : (
                                <Play className="h-3.5 w-3.5" />
                              )}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => executeTask(task.id)}
                              disabled={executingTaskId === task.id}
                              className="h-7 w-7 p-0 text-sky-400 hover:text-sky-300 hover:border-sky-500/50"
                              title="Execute Now"
                            >
                              {executingTaskId === task.id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Zap className="h-3.5 w-3.5" />
                              )}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => deleteTask(task.id)}
                              disabled={deletingTaskId === task.id}
                              className="h-7 w-7 p-0 text-red-400 hover:text-red-300 hover:border-red-500/50"
                              title="Delete"
                            >
                              {deletingTaskId === task.id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Trash2 className="h-3.5 w-3.5" />
                              )}
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </ScrollArea>
          </TabsContent>

          {/* ═══ WORKERS TAB ═══ */}
          <TabsContent value="workers" className="flex-1 min-h-0 mt-0 overflow-y-auto">
            <ScrollArea className="h-[calc(90vh-200px)]">
              <div className="space-y-4 p-1 pr-4">
                {/* Stats Row */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="rounded-lg border bg-card p-3 text-center">
                    <p className="text-2xl font-bold text-emerald-400">{workerStats.running}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">Running</p>
                  </div>
                  <div className="rounded-lg border bg-card p-3 text-center">
                    <p className="text-2xl font-bold text-sky-400">{workerStats.idle}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">Idle</p>
                  </div>
                  <div className="rounded-lg border bg-card p-3 text-center">
                    <p className="text-2xl font-bold text-zinc-400">{workerStats.stopped}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">Stopped</p>
                  </div>
                  <div className="rounded-lg border bg-card p-3 text-center">
                    <p className="text-2xl font-bold text-zinc-400">{workerStats.total}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">Total</p>
                  </div>
                </div>

                {/* Action Bar */}
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    onClick={() => setShowCreateWorker(true)}
                    className="h-8 text-xs gap-1.5"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Register Worker
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={fetchWorkers}
                    disabled={workersLoading}
                    className="h-8 text-xs gap-1 ml-auto"
                  >
                    <Loader2 className={cn("h-3.5 w-3.5", workersLoading && "animate-spin")} />
                    Refresh
                  </Button>
                </div>

                {/* Register Worker Form */}
                {showCreateWorker && (
                  <div className="rounded-xl border bg-card p-4 space-y-3">
                    <h4 className="text-sm font-semibold flex items-center gap-2">
                      <Plus className="h-4 w-4 text-teal-400" />
                      Register New Worker
                    </h4>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs">Name *</Label>
                        <Input
                          placeholder="Worker name"
                          value={newWorker.name}
                          onChange={(e) => setNewWorker((p) => ({ ...p, name: e.target.value }))}
                          className="h-8 text-xs"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Agent ID *</Label>
                        <Input
                          placeholder="Agent to bind"
                          value={newWorker.agentId}
                          onChange={(e) => setNewWorker((p) => ({ ...p, agentId: e.target.value }))}
                          className="h-8 text-xs"
                        />
                      </div>
                    </div>
                    <div className="flex gap-2 pt-1">
                      <Button size="sm" onClick={handleCreateWorker} disabled={creatingWorker} className="h-8 text-xs gap-1.5">
                        {creatingWorker ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Plus className="h-3.5 w-3.5" />
                        )}
                        {creatingWorker ? "Registering..." : "Register"}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setShowCreateWorker(false)} className="h-8 text-xs">
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}

                {/* Workers List */}
                {workersLoading && workers.length === 0 ? (
                  <div className="flex items-center justify-center py-16 text-muted-foreground">
                    <Loader2 className="h-6 w-6 animate-spin mr-2" />
                    <span className="text-sm">Loading workers...</span>
                  </div>
                ) : workers.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-muted-foreground border border-dashed rounded-lg">
                    <Activity className="h-10 w-10 mb-3 opacity-30" />
                    <p className="text-sm font-medium">No workers registered</p>
                    <p className="text-xs mt-1">Click &quot;Register Worker&quot; to add a new worker</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {workers.map((worker) => (
                      <div
                        key={worker.id}
                        className="rounded-lg border bg-card p-4 transition-all"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-medium truncate">{worker.name}</span>
                              <Badge className={cn("h-5 text-[10px] border", workerStatusBadge(worker.status))}>
                                {worker.status}
                              </Badge>
                            </div>
                            <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                              <span>Agent: {worker.agentId.slice(0, 8)}...</span>
                              {worker.currentTask && (
                                <span className="truncate text-emerald-400">
                                  Task: {worker.currentTask}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-3 mt-1 text-[10px] text-muted-foreground">
                              <span>Heartbeat: {formatTimeAgo(worker.lastHeartbeat)}</span>
                              <span className="flex items-center gap-1">
                                <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                                {worker.successCount} ok
                              </span>
                              <span className="flex items-center gap-1">
                                <AlertTriangle className="h-3 w-3 text-red-500" />
                                {worker.errorCount} err
                              </span>
                              <span>Total: {worker.totalTasks}</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            {worker.status === "stopped" || worker.status === "idle" ? (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => startWorker(worker.id)}
                                disabled={workerActionId === worker.id}
                                className="h-7 w-7 p-0 text-emerald-400 hover:text-emerald-300 hover:border-emerald-500/50"
                                title="Start"
                              >
                                {workerActionId === worker.id ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <Play className="h-3.5 w-3.5" />
                                )}
                              </Button>
                            ) : (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => stopWorker(worker.id)}
                                disabled={workerActionId === worker.id}
                                className="h-7 w-7 p-0 text-red-400 hover:text-red-300 hover:border-red-500/50"
                                title="Stop"
                              >
                                {workerActionId === worker.id ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <Pause className="h-3.5 w-3.5" />
                                )}
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => heartbeatWorker(worker.id)}
                              disabled={workerActionId === worker.id}
                              className="h-7 w-7 p-0 text-sky-400 hover:text-sky-300 hover:border-sky-500/50"
                              title="Heartbeat"
                            >
                              <Activity className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => deleteWorker(worker.id)}
                              disabled={workerActionId === worker.id}
                              className="h-7 w-7 p-0 text-red-400 hover:text-red-300 hover:border-red-500/50"
                              title="Delete"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </ScrollArea>
          </TabsContent>

          {/* ═══ SELF-HEAL TAB ═══ */}
          <TabsContent value="self-heal" className="flex-1 min-h-0 mt-0 overflow-y-auto">
            <ScrollArea className="h-[calc(90vh-200px)]">
              <div className="space-y-4 p-1 pr-4">
                <div className="rounded-xl border bg-card p-5 space-y-4">
                  <h4 className="text-sm font-semibold flex items-center gap-2">
                    <Zap className="h-4 w-4 text-amber-400" />
                    Self-Heal Diagnostics
                  </h4>
                  <p className="text-xs text-muted-foreground">
                    Run a comprehensive health check. The system will detect issues and attempt automatic fixes for known problems.
                  </p>
                  <Button
                    size="sm"
                    onClick={runSelfHeal}
                    disabled={selfHealRunning}
                    className="h-8 text-xs gap-1.5 min-w-[160px]"
                  >
                    {selfHealRunning ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Zap className="h-3.5 w-3.5" />
                    )}
                    {selfHealRunning ? "Running Check..." : "Run Self-Heal Check"}
                  </Button>
                </div>

                {selfHealResult && (
                  <div className="space-y-4">
                    {/* Issues */}
                    <div className="rounded-xl border bg-card p-5 space-y-3">
                      <h4 className="text-sm font-semibold flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4 text-red-400" />
                        Issues Detected
                        <Badge variant="secondary" className="h-5 text-[10px]">
                          {selfHealResult.issues?.length || 0}
                        </Badge>
                      </h4>
                      {selfHealResult.issues?.length === 0 ? (
                        <div className="flex items-center gap-2 py-4 text-emerald-400">
                          <CheckCircle2 className="h-5 w-5" />
                          <span className="text-sm font-medium">No issues found — all systems healthy!</span>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {selfHealResult.issues?.map((issue, idx) => (
                            <div key={idx} className="rounded-lg border border-red-500/20 bg-red-500/5 p-3">
                              <div className="flex items-start gap-2">
                                <AlertTriangle className="h-3.5 w-3.5 text-red-400 shrink-0 mt-0.5" />
                                <p className="text-xs text-foreground">{issue}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Fixed */}
                    <div className="rounded-xl border bg-card p-5 space-y-3">
                      <h4 className="text-sm font-semibold flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                        Auto-Fixed
                        <Badge variant="secondary" className="h-5 text-[10px]">
                          {selfHealResult.fixed?.length || 0}
                        </Badge>
                      </h4>
                      {selfHealResult.fixed?.length === 0 ? (
                        <p className="text-xs text-muted-foreground py-2">No automatic fixes applied.</p>
                      ) : (
                        <div className="space-y-2">
                          {selfHealResult.fixed?.map((fix, idx) => (
                            <div key={idx} className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3">
                              <div className="flex items-start gap-2">
                                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0 mt-0.5" />
                                <p className="text-xs text-foreground">{fix}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {!selfHealResult && !selfHealRunning && (
                  <div className="flex flex-col items-center justify-center py-12 text-muted-foreground border border-dashed rounded-lg">
                    <Zap className="h-10 w-10 mb-3 opacity-30" />
                    <p className="text-sm font-medium">No diagnostics yet</p>
                    <p className="text-xs mt-1">Click &quot;Run Self-Heal Check&quot; to scan for issues</p>
                  </div>
                )}
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

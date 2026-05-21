"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useAgentStore, useSettingsStore } from "@/lib/stores";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Clock,
  Plus,
  Play,
  Pencil,
  Trash2,
  CalendarClock,
  CheckCircle2,
  XCircle,
  RefreshCw,
  ChevronRight,
  Bot,
  MessageSquare,
} from "lucide-react";
import { cn, formatTime } from "@/lib/utils";

// Matches the CronTask Prisma model from the API
interface CronTask {
  id: string;
  name: string;
  description: string | null;
  cronExpr: string;
  taskType: string;
  agentId: string | null;
  config: string; // JSON string
  status: string; // "active" | "paused" | "disabled" | "error"
  lastRunAt: string | null;
  nextRunAt: string | null;
  lastResult: string | null; // JSON string: { success, output, duration, conversationId }
  runCount: number;
  failCount: number;
  retryPolicy: string;
  dependencies: string;
  createdAt: string;
  updatedAt: string;
}

interface SchedulerPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const SCHEDULE_EXAMPLES = [
  "*/5 * * * *",
  "*/30 * * * *",
  "0 * * * *",
  "0 9 * * *",
  "0 8 * * 1-5",
  "*/15 * * * *",
];

const TASK_TYPES = [
  { value: "agent_run", label: "Agent Run" },
  { value: "repo_monitor", label: "Repo Monitor" },
  { value: "health_check", label: "Health Check" },
  { value: "auto_deploy", label: "Auto Deploy" },
  { value: "issue_resolve", label: "Issue Resolve" },
  { value: "custom", label: "Custom" },
];

function parseCronConfig(configStr: string): { prompt?: string; model?: string; [key: string]: unknown } {
  try {
    return JSON.parse(configStr);
  } catch {
    return {};
  }
}

function parseLastResult(lastResult: string | null): { success?: boolean; output?: string; conversationId?: string } | null {
  if (!lastResult) return null;
  try {
    return JSON.parse(lastResult);
  } catch {
    return null;
  }
}

export function SchedulerPanel({ open, onOpenChange }: SchedulerPanelProps) {
  const [tasks, setTasks] = useState<CronTask[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [running, setRunning] = useState<string | null>(null);

  const [formName, setFormName] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formPrompt, setFormPrompt] = useState("");
  const [formCronExpr, setFormCronExpr] = useState("0 * * * *");
  const [formTaskType, setFormTaskType] = useState("agent_run");
  const [formAgentId, setFormAgentId] = useState("");
  const [formModel, setFormModel] = useState("");
  const formRef = useRef<HTMLDivElement>(null);

  const { agents } = useAgentStore();
  const { settings, modelGroups } = useSettingsStore();

  const loadTasks = useCallback(async () => {
    try {
      const res = await fetch("/api/scheduler/tasks");
      if (res.ok) {
        const data = await res.json();
        setTasks(data);
      }
    } catch {
      // Ignore
    }
  }, []);

  useEffect(() => {
    if (open) loadTasks();
  }, [open, loadTasks]);

  useEffect(() => {
    if (showForm && formRef.current) {
      formRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [showForm]);

  const resetForm = () => {
    setFormName("");
    setFormDescription("");
    setFormPrompt("");
    setFormCronExpr("0 * * * *");
    setFormTaskType("agent_run");
    setFormAgentId("");
    setFormModel("");
    setEditingId(null);
    setShowForm(false);
  };

  const handleSave = async () => {
    if (!formName.trim() || !formCronExpr.trim() || !formTaskType) {
      toast.error("Name, cron expression, and task type are required");
      return;
    }

    setLoading(true);
    try {
      const config = JSON.stringify({
        prompt: formPrompt,
        model: formModel || undefined,
      });

      if (editingId) {
        const res = await fetch(`/api/scheduler/tasks/${editingId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: formName,
            description: formDescription || null,
            cronExpr: formCronExpr,
            taskType: formTaskType,
            agentId: formAgentId || null,
            config,
          }),
        });
        if (res.ok) {
          toast.success("Task updated");
          resetForm();
          await loadTasks();
        } else {
          toast.error("Failed to update task");
        }
      } else {
        const res = await fetch("/api/scheduler/tasks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: formName,
            description: formDescription || null,
            cronExpr: formCronExpr,
            taskType: formTaskType,
            agentId: formAgentId || null,
            config,
          }),
        });
        if (res.ok) {
          toast.success("Task created");
          resetForm();
          await loadTasks();
        } else {
          toast.error("Failed to create task");
        }
      }
    } catch {
      toast.error("Failed to save task");
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (task: CronTask) => {
    const config = parseCronConfig(task.config);
    setFormName(task.name);
    setFormDescription(task.description || "");
    setFormPrompt((config.prompt as string) || "");
    setFormCronExpr(task.cronExpr);
    setFormTaskType(task.taskType);
    setFormAgentId(task.agentId || "");
    setFormModel((config.model as string) || "");
    setEditingId(task.id);
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/scheduler/tasks/${id}`, { method: "DELETE" });
      if (res.ok) {
        toast.success("Task deleted");
        await loadTasks();
      } else {
        toast.error("Failed to delete task");
      }
    } catch {
      toast.error("Failed to delete task");
    }
  };

  const handleToggle = async (task: CronTask) => {
    try {
      const newStatus = task.status === "active" ? "paused" : "active";
      const res = await fetch(`/api/scheduler/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        await loadTasks();
      }
    } catch {
      toast.error("Failed to toggle task");
    }
  };

  const handleRunNow = async (taskId: string) => {
    setRunning(taskId);
    try {
      const res = await fetch("/api/scheduler/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success("Task completed");
        await loadTasks();
      } else {
        toast.error(data.error || "Task failed");
        await loadTasks();
      }
    } catch {
      toast.error("Failed to run task");
    } finally {
      setRunning(null);
    }
  };

  const getAgentName = (agentId: string | null) => {
    if (!agentId) return "Default";
    const agent = agents.find((a) => a.id === agentId);
    return agent?.name || "Unknown";
  };

  const allModels = modelGroups.flatMap((g) => g.models);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh]" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarClock className="h-5 w-5" />
            Scheduled Tasks
          </DialogTitle>
          <DialogDescription>
            Schedule agents to run automatically using cron expressions
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">
            {tasks.length} task{tasks.length !== 1 ? "s" : ""}
          </span>
          <Button size="sm" onClick={() => { resetForm(); setShowForm(true); }}>
            <Plus className="h-4 w-4 mr-1" />
            Add Task
          </Button>
        </div>

        <ScrollArea className="max-h-[55vh]">
          <div className="space-y-3 pr-2">
            {tasks.length === 0 && !showForm && (
              <div className="text-center py-12 text-muted-foreground">
                <Clock className="h-10 w-10 mx-auto mb-3 opacity-30" />
                <p className="text-sm">No scheduled tasks yet</p>
                <p className="text-xs mt-1">Create a task to run agents automatically</p>
              </div>
            )}

            {tasks.map((task) => {
              const config = parseCronConfig(task.config);
              const lastResult = parseLastResult(task.lastResult);
              const isActive = task.status === "active";
              const lastSuccess = lastResult?.success;

              return (
                <div
                  key={task.id}
                  className={cn(
                    "rounded-lg border p-4 transition-all",
                    isActive ? "bg-card" : "bg-muted/30 opacity-60"
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="font-semibold text-sm truncate">{task.name}</h4>
                        <Badge
                          variant={isActive ? "default" : "secondary"}
                          className="h-5 text-[10px] px-1.5"
                        >
                          {task.status}
                        </Badge>
                        <Badge variant="outline" className="h-5 text-[10px] px-1.5">
                          {task.taskType}
                        </Badge>
                        {task.runCount > 0 && lastResult && (
                          <Badge
                            variant={lastSuccess ? "default" : "destructive"}
                            className="h-5 text-[10px] px-1.5"
                          >
                            {lastSuccess ? (
                              <CheckCircle2 className="h-3 w-3 mr-0.5" />
                            ) : (
                              <XCircle className="h-3 w-3 mr-0.5" />
                            )}
                            {lastSuccess ? "success" : "error"}
                          </Badge>
                        )}
                      </div>

                      <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {task.cronExpr}
                        </span>
                        {task.agentId && (
                          <span className="flex items-center gap-1">
                            <Bot className="h-3 w-3" />
                            {getAgentName(task.agentId)}
                          </span>
                        )}
                        {config.model && (
                          <span className="flex items-center gap-1">
                            <MessageSquare className="h-3 w-3" />
                            {config.model as string}
                          </span>
                        )}
                      </div>

                      {(config.prompt || task.description) && (
                        <p className="text-xs text-muted-foreground mt-1.5 line-clamp-2">
                          {(config.prompt as string) || task.description}
                        </p>
                      )}

                      <div className="flex items-center gap-3 mt-2 text-[10px] text-muted-foreground/70">
                        {task.nextRunAt && (
                          <span>
                            Next: {new Date(task.nextRunAt).toLocaleString()}
                          </span>
                        )}
                        {task.lastRunAt && (
                          <span>
                            Last: {formatTime(task.lastRunAt)}
                          </span>
                        )}
                        <span>
                          Runs: {task.runCount} | Fails: {task.failCount}
                        </span>
                      </div>

                      {lastResult?.output && (
                        <details className="mt-2">
                          <summary className="text-[10px] text-muted-foreground cursor-pointer hover:text-foreground">
                            Last result
                          </summary>
                          <div className="mt-1.5 space-y-1 max-h-32 overflow-y-auto">
                            <div
                              className={cn(
                                "text-[10px] rounded px-2 py-1",
                                lastSuccess
                                  ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                                  : "bg-red-500/10 text-red-600 dark:text-red-400"
                              )}
                            >
                              {lastResult.output}
                            </div>
                          </div>
                        </details>
                      )}
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => handleRunNow(task.id)}
                        disabled={running === task.id}
                      >
                        {running === task.id ? (
                          <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Play className="h-3.5 w-3.5" />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => handleEdit(task)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={() => handleDelete(task.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border/50">
                    <Switch
                      checked={isActive}
                      onCheckedChange={() => handleToggle(task)}
                    />
                    <span className="text-xs text-muted-foreground">
                      {isActive ? "Enabled" : "Disabled"}
                    </span>
                  </div>
                </div>
              );
            })}

            {showForm && (
              <div ref={formRef} className="rounded-lg border border-primary/30 bg-card p-4">
                <h4 className="font-semibold text-sm mb-3">
                  {editingId ? "Edit Task" : "New Task"}
                </h4>
                <div className="space-y-3">
                  <div>
                    <Label className="text-xs">Name</Label>
                    <Input
                      value={formName}
                      onChange={(e) => setFormName(e.target.value)}
                      placeholder="e.g. Daily code review"
                      className="h-8 text-sm mt-1"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Description (optional)</Label>
                    <Input
                      value={formDescription}
                      onChange={(e) => setFormDescription(e.target.value)}
                      placeholder="What this task does"
                      className="h-8 text-sm mt-1"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Prompt</Label>
                    <Textarea
                      value={formPrompt}
                      onChange={(e) => setFormPrompt(e.target.value)}
                      placeholder="What should the agent do?"
                      className="min-h-[80px] text-sm mt-1"
                      rows={3}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">Cron Expression</Label>
                      <Input
                        value={formCronExpr}
                        onChange={(e) => setFormCronExpr(e.target.value)}
                        placeholder="0 * * * *"
                        className="h-8 text-sm mt-1"
                      />
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {SCHEDULE_EXAMPLES.map((ex) => (
                          <button
                            key={ex}
                            type="button"
                            className={cn(
                              "text-[10px] px-1.5 py-0.5 rounded-full border transition-colors",
                              formCronExpr === ex
                                ? "border-primary bg-primary/10 text-primary"
                                : "border-border hover:border-primary/50 text-muted-foreground"
                            )}
                            onClick={() => setFormCronExpr(ex)}
                          >
                            {ex}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <Label className="text-xs">Task Type</Label>
                      <Select value={formTaskType} onValueChange={setFormTaskType}>
                        <SelectTrigger className="h-8 text-sm mt-1">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {TASK_TYPES.map((t) => (
                            <SelectItem key={t.value} value={t.value}>
                              {t.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">Agent</Label>
                      <Select value={formAgentId} onValueChange={setFormAgentId}>
                        <SelectTrigger className="h-8 text-sm mt-1">
                          <SelectValue placeholder="Default agent" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Default (no agent)</SelectItem>
                          {agents.map((a) => (
                            <SelectItem key={a.id} value={a.id}>
                              {a.name} — {a.role}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs">Model (optional)</Label>
                      <Select value={formModel} onValueChange={setFormModel}>
                        <SelectTrigger className="h-8 text-sm mt-1">
                          <SelectValue placeholder="Use default model" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Use default</SelectItem>
                          {allModels.map((m) => (
                            <SelectItem key={m.id} value={m.id}>
                              {m.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 pt-1">
                    <Button size="sm" onClick={handleSave} disabled={loading}>
                      {loading ? (
                        <RefreshCw className="h-4 w-4 mr-1 animate-spin" />
                      ) : (
                        <ChevronRight className="h-4 w-4 mr-1" />
                      )}
                      {editingId ? "Update" : "Create"}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={resetForm}>
                      Cancel
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

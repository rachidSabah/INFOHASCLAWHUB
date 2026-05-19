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

interface TaskRunLog {
  id: string;
  timestamp: string;
  status: "success" | "error";
  result?: string;
  conversationId?: string;
  error?: string;
}

interface ScheduledTask {
  id: string;
  name: string;
  agentId: string;
  prompt: string;
  schedule: string;
  model?: string;
  enabled: boolean;
  createdAt: string;
  lastRunAt?: string;
  lastRunStatus?: "success" | "error";
  lastRunResult?: string;
  runHistory: TaskRunLog[];
  nextRun?: string;
}

interface SchedulerPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const SCHEDULE_EXAMPLES = [
  "every hour",
  "every 30 minutes",
  "daily at 09:00",
  "daily at 6pm",
  "weekdays at 08:00",
  "every 15 minutes",
];

function parseSchedule(schedule: string): Date {
  const now = new Date();
  const s = schedule.toLowerCase().trim();

  const everyMinutes = s.match(/^every\s+(\d+)\s*min(?:ute)?s?$/i);
  if (everyMinutes) {
    const mins = parseInt(everyMinutes[1], 10);
    return new Date(now.getTime() + mins * 60 * 1000);
  }

  if (/^every\s*hour$/i.test(s)) {
    return new Date(now.getTime() + 60 * 60 * 1000);
  }

  const dailyAtMatch = s.match(/^(?:daily|every\s*day)\s*(?:at\s*)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i);
  if (dailyAtMatch) {
    let hour = parseInt(dailyAtMatch[1], 10);
    const minute = parseInt(dailyAtMatch[2] || "0", 10);
    const ampm = dailyAtMatch[3]?.toLowerCase();
    if (ampm === "pm" && hour < 12) hour += 12;
    if (ampm === "am" && hour === 12) hour = 0;
    const next = new Date(now);
    next.setHours(hour, minute, 0, 0);
    if (next <= now) next.setDate(next.getDate() + 1);
    return next;
  }

  const weekdaysMatch = s.match(/^weekdays\s*(?:at\s*)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i);
  if (weekdaysMatch) {
    let hour = parseInt(weekdaysMatch[1], 10);
    const minute = parseInt(weekdaysMatch[2] || "0", 10);
    const ampm = weekdaysMatch[3]?.toLowerCase();
    if (ampm === "pm" && hour < 12) hour += 12;
    if (ampm === "am" && hour === 12) hour = 0;
    const next = new Date(now);
    next.setHours(hour, minute, 0, 0);
    while (next <= now || next.getDay() === 0 || next.getDay() === 6) {
      next.setDate(next.getDate() + 1);
      if (next.getDay() !== 0 && next.getDay() !== 6) break;
    }
    return next;
  }

  return new Date(now.getTime() + 30 * 60 * 1000);
}

export function SchedulerPanel({ open, onOpenChange }: SchedulerPanelProps) {
  const [tasks, setTasks] = useState<ScheduledTask[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [running, setRunning] = useState<string | null>(null);

  const [formName, setFormName] = useState("");
  const [formPrompt, setFormPrompt] = useState("");
  const [formSchedule, setFormSchedule] = useState("every hour");
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
        setTasks(data.map((t: ScheduledTask) => ({
          ...t,
          nextRun: parseSchedule(t.schedule).toISOString(),
        })));
      }
    } catch {}
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
    setFormPrompt("");
    setFormSchedule("every hour");
    setFormAgentId("");
    setFormModel("");
    setEditingId(null);
    setShowForm(false);
  };

  const handleSave = async () => {
    if (!formName.trim() || !formPrompt.trim() || !formSchedule.trim()) {
      toast.error("Name, prompt, and schedule are required");
      return;
    }

    setLoading(true);
    try {
      if (editingId) {
        const res = await fetch(`/api/scheduler/tasks/${editingId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: formName,
            prompt: formPrompt,
            schedule: formSchedule,
            agentId: formAgentId,
            model: formModel || undefined,
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
            prompt: formPrompt,
            schedule: formSchedule,
            agentId: formAgentId,
            model: formModel || undefined,
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

  const handleEdit = (task: ScheduledTask) => {
    setFormName(task.name);
    setFormPrompt(task.prompt);
    setFormSchedule(task.schedule);
    setFormAgentId(task.agentId);
    setFormModel(task.model || "");
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

  const handleToggle = async (task: ScheduledTask) => {
    try {
      const res = await fetch(`/api/scheduler/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !task.enabled }),
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
        toast.success(`Task completed`);
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

  const getAgentName = (agentId: string) => {
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
            Schedule agents to run automatically at specific intervals
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

            {tasks.map((task) => (
              <div
                key={task.id}
                className={cn(
                  "rounded-lg border p-4 transition-all",
                  task.enabled ? "bg-card" : "bg-muted/30 opacity-60"
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="font-semibold text-sm truncate">{task.name}</h4>
                      {task.enabled ? (
                        <Badge variant="default" className="h-5 text-[10px] px-1.5">Active</Badge>
                      ) : (
                        <Badge variant="secondary" className="h-5 text-[10px] px-1.5">Paused</Badge>
                      )}
                      {task.lastRunStatus && (
                        <Badge
                          variant={task.lastRunStatus === "success" ? "default" : "destructive"}
                          className="h-5 text-[10px] px-1.5"
                        >
                          {task.lastRunStatus === "success" ? (
                            <CheckCircle2 className="h-3 w-3 mr-0.5" />
                          ) : (
                            <XCircle className="h-3 w-3 mr-0.5" />
                          )}
                          {task.lastRunStatus}
                        </Badge>
                      )}
                    </div>

                    <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {task.schedule}
                      </span>
                      {task.agentId && (
                        <span className="flex items-center gap-1">
                          <Bot className="h-3 w-3" />
                          {getAgentName(task.agentId)}
                        </span>
                      )}
                      {task.model && (
                        <span className="flex items-center gap-1">
                          <MessageSquare className="h-3 w-3" />
                          {task.model}
                        </span>
                      )}
                    </div>

                    <p className="text-xs text-muted-foreground mt-1.5 line-clamp-2">
                      {task.prompt}
                    </p>

                    <div className="flex items-center gap-3 mt-2 text-[10px] text-muted-foreground/70">
                      {task.nextRun && (
                        <span>
                          Next: {new Date(task.nextRun).toLocaleString()}
                        </span>
                      )}
                      {task.lastRunAt && (
                        <span>
                          Last: {formatTime(task.lastRunAt)}
                        </span>
                      )}
                    </div>

                    {task.runHistory.length > 0 && (
                      <details className="mt-2">
                        <summary className="text-[10px] text-muted-foreground cursor-pointer hover:text-foreground">
                          Run history ({task.runHistory.length})
                        </summary>
                        <div className="mt-1.5 space-y-1 max-h-32 overflow-y-auto">
                          {task.runHistory.slice(0, 5).map((log) => (
                            <div
                              key={log.id}
                              className={cn(
                                "text-[10px] rounded px-2 py-1",
                                log.status === "success"
                                  ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                                  : "bg-red-500/10 text-red-600 dark:text-red-400"
                              )}
                            >
                              <div className="flex items-center gap-1">
                                {log.status === "success" ? (
                                  <CheckCircle2 className="h-3 w-3" />
                                ) : (
                                  <XCircle className="h-3 w-3" />
                                )}
                                {new Date(log.timestamp).toLocaleString()}
                              </div>
                              {log.result && (
                                <p className="mt-0.5 line-clamp-2 opacity-80">{log.result}</p>
                              )}
                              {log.error && (
                                <p className="mt-0.5 opacity-80">{log.error}</p>
                              )}
                            </div>
                          ))}
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
                    checked={task.enabled}
                    onCheckedChange={() => handleToggle(task)}
                  />
                  <span className="text-xs text-muted-foreground">
                    {task.enabled ? "Enabled" : "Disabled"}
                  </span>
                </div>
              </div>
            ))}

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
                      <Label className="text-xs">Schedule</Label>
                      <Input
                        value={formSchedule}
                        onChange={(e) => setFormSchedule(e.target.value)}
                        placeholder="every hour"
                        className="h-8 text-sm mt-1"
                      />
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {SCHEDULE_EXAMPLES.map((ex) => (
                          <button
                            key={ex}
                            type="button"
                            className={cn(
                              "text-[10px] px-1.5 py-0.5 rounded-full border transition-colors",
                              formSchedule === ex
                                ? "border-primary bg-primary/10 text-primary"
                                : "border-border hover:border-primary/50 text-muted-foreground"
                            )}
                            onClick={() => setFormSchedule(ex)}
                          >
                            {ex}
                          </button>
                        ))}
                      </div>
                    </div>
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

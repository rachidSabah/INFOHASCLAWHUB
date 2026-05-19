"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useAgentStore, useSettingsStore } from "@/lib/stores";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
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
import { Slider } from "@/components/ui/slider";
import {
  Zap,
  Play,
  Square,
  Pause,
  RefreshCw,
  Bot,
  Clock,
  CheckCircle2,
  XCircle,
  ChevronDown,
  ChevronUp,
  Trash2,
  Activity,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface AgentRunStatus {
  id: string;
  agentId: string;
  task: string;
  status: "running" | "paused" | "completed" | "failed";
  startTime: string;
  endTime?: string;
  iterations: number;
  maxIterations: number;
  currentStep?: string;
  config: {
    model?: string;
    maxIterations?: number;
    autonomyLevel?: string;
    workspacePath?: string;
  };
  logs: AgentLog[];
  result?: string;
}

interface AgentLog {
  timestamp: string;
  type: "plan" | "execute" | "observe" | "replan" | "error" | "info" | "complete";
  content: string;
  iteration: number;
}

interface AgentRunnerPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prefillAgentId?: string | null;
}

const AUTONOMY_LEVELS = [
  { value: "supervised", label: "Supervised", desc: "Agent asks before each action" },
  { value: "semi", label: "Semi-Auto", desc: "Agent proceeds, pauses on major decisions" },
  { value: "full", label: "Full Auto", desc: "Agent operates autonomously" },
];

function statusBadge(status: string) {
  switch (status) {
    case "running":
      return <Badge className="bg-blue-500/15 text-blue-400 border-blue-500/30 h-5 text-[10px]"><Loader2 className="h-3 w-3 mr-1 animate-spin" />Running</Badge>;
    case "paused":
      return <Badge className="bg-yellow-500/15 text-yellow-400 border-yellow-500/30 h-5 text-[10px]"><Pause className="h-3 w-3 mr-1" />Paused</Badge>;
    case "completed":
      return <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30 h-5 text-[10px]"><CheckCircle2 className="h-3 w-3 mr-1" />Done</Badge>;
    case "failed":
      return <Badge className="bg-red-500/15 text-red-400 border-red-500/30 h-5 text-[10px]"><XCircle className="h-3 w-3 mr-1" />Failed</Badge>;
    default:
      return <Badge variant="secondary" className="h-5 text-[10px]">{status}</Badge>;
  }
}

function formatElapsed(startTime: string, endTime?: string): string {
  const start = new Date(startTime).getTime();
  const end = endTime ? new Date(endTime).getTime() : Date.now();
  const elapsed = Math.floor((end - start) / 1000);
  if (elapsed < 60) return `${elapsed}s`;
  const mins = Math.floor(elapsed / 60);
  const secs = elapsed % 60;
  return `${mins}m ${secs}s`;
}

export function AgentRunnerPanel({ open, onOpenChange, prefillAgentId }: AgentRunnerPanelProps) {
  const [runs, setRuns] = useState<AgentRunStatus[]>([]);
  const [taskInput, setTaskInput] = useState("");
  const [selectedAgentId, setSelectedAgentId] = useState(prefillAgentId || "");
  const [selectedModel, setSelectedModel] = useState("");
  const [autonomyLevel, setAutonomyLevel] = useState<"supervised" | "semi" | "full">("semi");
  const [expandedLogs, setExpandedLogs] = useState<Set<string>>(new Set());
  const [starting, setStarting] = useState(false);
  const logsEndRef = useRef<HTMLDivElement>(null);

  const { agents } = useAgentStore();
  const { settings, modelGroups } = useSettingsStore();

  useEffect(() => {
    if (prefillAgentId) {
      setSelectedAgentId(prefillAgentId);
    }
  }, [prefillAgentId]);

  const fetchRuns = useCallback(async () => {
    try {
      const res = await fetch("/api/agents/run");
      if (res.ok) {
        const data = await res.json();
        setRuns(data);
      }
    } catch {}
  }, []);

  useEffect(() => {
    if (!open) return;
    fetchRuns();
    const interval = setInterval(fetchRuns, 2000);
    return () => clearInterval(interval);
  }, [open, fetchRuns]);

  const handleStart = async () => {
    if (!taskInput.trim()) {
      toast.error("Please enter a task description");
      return;
    }
    if (!selectedAgentId) {
      toast.error("Please select an agent");
      return;
    }

    setStarting(true);
    try {
      const res = await fetch("/api/agents/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId: selectedAgentId,
          task: taskInput.trim(),
          config: {
            model: selectedModel || undefined,
            autonomyLevel,
            maxIterations: 10,
          },
        }),
      });
      if (res.ok) {
        toast.success("Agent started");
        setTaskInput("");
        await fetchRuns();
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to start agent");
      }
    } catch {
      toast.error("Failed to start agent");
    } finally {
      setStarting(false);
    }
  };

  const handleControl = async (runId: string, action: "stop" | "pause" | "resume") => {
    try {
      const res = await fetch(`/api/agents/run/${runId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (res.ok) {
        toast.success(`Agent ${action}${action === "stop" ? "ped" : "d"}`);
        await fetchRuns();
      }
    } catch {
      toast.error(`Failed to ${action} agent`);
    }
  };

  const handleDelete = async (runId: string) => {
    try {
      const res = await fetch(`/api/agents/run/${runId}`, { method: "DELETE" });
      if (res.ok) {
        toast.success("Run removed");
        await fetchRuns();
      }
    } catch {
      toast.error("Failed to delete run");
    }
  };

  const toggleLogs = (runId: string) => {
    setExpandedLogs((prev) => {
      const next = new Set(prev);
      if (next.has(runId)) next.delete(runId);
      else next.add(runId);
      return next;
    });
  };

  const getAgentName = (agentId: string) => {
    const agent = agents.find((a) => a.id === agentId);
    return agent?.name || "Unknown Agent";
  };

  const getAgentAvatar = (agentId: string) => {
    const agent = agents.find((a) => a.id === agentId);
    return agent?.avatar || null;
  };

  const allModels = modelGroups.flatMap((g) => g.models);

  const runningRuns = runs.filter((r) => r.status === "running" || r.status === "paused");
  const completedRuns = runs.filter((r) => r.status === "completed" || r.status === "failed");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh]" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5" />
            Agent Runner
          </DialogTitle>
          <DialogDescription>
            Run autonomous agents to execute complex multi-step tasks
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-lg border bg-card p-4">
            <h4 className="font-semibold text-sm mb-3 flex items-center gap-2">
              <Play className="h-4 w-4" /> Start New Run
            </h4>

            <div className="space-y-3">
              <div>
                <Label className="text-xs">Agent</Label>
                <Select value={selectedAgentId} onValueChange={setSelectedAgentId}>
                  <SelectTrigger className="h-8 text-sm mt-1">
                    <SelectValue placeholder="Select an agent..." />
                  </SelectTrigger>
                  <SelectContent>
                    {agents.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.name} — {a.role}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-xs">Task</Label>
                <Textarea
                  value={taskInput}
                  onChange={(e) => setTaskInput(e.target.value)}
                  placeholder="Describe what the agent should do. Be specific for best results..."
                  className="min-h-[80px] text-sm mt-1"
                  rows={3}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Model</Label>
                  <Select value={selectedModel} onValueChange={setSelectedModel}>
                    <SelectTrigger className="h-8 text-sm mt-1">
                      <SelectValue placeholder="Default model" />
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
                <div>
                  <Label className="text-xs">Max Iterations</Label>
                  <Select defaultValue="10">
                    <SelectTrigger className="h-8 text-sm mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[5, 10, 15, 20, 25].map((n) => (
                        <SelectItem key={n} value={String(n)}>
                          {n} iterations
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label className="text-xs flex items-center justify-between">
                  <span>Autonomy Level</span>
                  <span className="text-[10px] text-muted-foreground">
                    {AUTONOMY_LEVELS.find((l) => l.value === autonomyLevel)?.label}
                  </span>
                </Label>
                <div className="flex gap-1 mt-1.5">
                  {AUTONOMY_LEVELS.map((level, idx) => (
                    <button
                      key={level.value}
                      type="button"
                      className={cn(
                        "flex-1 text-[10px] px-2 py-1.5 rounded-md border transition-all",
                        autonomyLevel === level.value
                          ? "border-primary bg-primary/10 text-primary font-medium"
                          : "border-border hover:border-primary/30 text-muted-foreground"
                      )}
                      onClick={() => setAutonomyLevel(level.value as "supervised" | "semi" | "full")}
                    >
                      {level.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <Button
                  size="sm"
                  onClick={handleStart}
                  disabled={starting || !taskInput.trim() || !selectedAgentId}
                >
                  {starting ? (
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  ) : (
                    <Play className="h-4 w-4 mr-1" />
                  )}
                  Start Agent
                </Button>
              </div>
            </div>
          </div>

          {runningRuns.length > 0 && (
            <div>
              <h4 className="font-semibold text-sm mb-2 flex items-center gap-2">
                <Activity className="h-4 w-4 text-blue-400" />
                Running ({runningRuns.length})
              </h4>
              <ScrollArea className="max-h-[40vh]">
                <div className="space-y-2 pr-2">
                  {runningRuns.map((run) => (
                    <div key={run.id} className="rounded-lg border border-blue-500/20 bg-card p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-sm truncate">
                              {getAgentName(run.agentId)}
                            </span>
                            {statusBadge(run.status)}
                          </div>
                          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                            {run.task}
                          </p>
                          <div className="flex items-center gap-3 mt-1.5 text-[10px] text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {formatElapsed(run.startTime)}
                            </span>
                            <span>
                              Iteration {run.iterations}/{run.maxIterations}
                            </span>
                            {run.currentStep && (
                              <span className="truncate max-w-[150px]">
                                {run.currentStep}
                              </span>
                            )}
                          </div>
                          <div className="mt-2 h-1 bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full bg-blue-500 rounded-full transition-all duration-500"
                              style={{
                                width: `${Math.min(
                                  100,
                                  (run.iterations / run.maxIterations) * 100
                                )}%`,
                              }}
                            />
                          </div>
                        </div>
                        <div className="flex items-center gap-0.5 shrink-0">
                          {run.status === "running" ? (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => handleControl(run.id, "pause")}
                            >
                              <Pause className="h-3.5 w-3.5" />
                            </Button>
                          ) : (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => handleControl(run.id, "resume")}
                            >
                              <Play className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive hover:text-destructive"
                            onClick={() => handleControl(run.id, "stop")}
                          >
                            <Square className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>

                      <button
                        type="button"
                        className="flex items-center gap-1 mt-2 text-[10px] text-muted-foreground hover:text-foreground"
                        onClick={() => toggleLogs(run.id)}
                      >
                        {expandedLogs.has(run.id) ? (
                          <ChevronUp className="h-3 w-3" />
                        ) : (
                          <ChevronDown className="h-3 w-3" />
                        )}
                        Logs ({run.logs.length})
                      </button>

                      {expandedLogs.has(run.id) && (
                        <div className="mt-2 max-h-[200px] overflow-y-auto bg-muted/50 rounded-md p-2 space-y-1 font-mono text-[11px]">
                          {run.logs.map((log, i) => (
                            <div
                              key={i}
                              className={cn(
                                "flex gap-2 py-0.5",
                                log.type === "error" && "text-red-400",
                                log.type === "complete" && "text-emerald-400",
                                log.type === "plan" && "text-blue-400",
                                log.type === "replan" && "text-yellow-400",
                                log.type === "execute" && "text-foreground",
                                log.type === "observe" && "text-muted-foreground",
                                log.type === "info" && "text-muted-foreground"
                              )}
                            >
                              <span className="shrink-0 text-muted-foreground">
                                [{log.type.toUpperCase()}]
                              </span>
                              <span className="break-all whitespace-pre-wrap">
                                {log.content}
                              </span>
                            </div>
                          ))}
                          <div ref={logsEndRef} />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>
          )}

          {completedRuns.length > 0 && (
            <div>
              <h4 className="font-semibold text-sm mb-2 flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
                History ({completedRuns.length})
              </h4>
              <ScrollArea className="max-h-[30vh]">
                <div className="space-y-1.5 pr-2">
                  {completedRuns.map((run) => (
                    <details key={run.id} className="rounded-lg border bg-card/50 p-3">
                      <summary className="cursor-pointer select-none">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="font-medium text-sm truncate">
                              {getAgentName(run.agentId)}
                            </span>
                            {statusBadge(run.status)}
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <span className="text-[10px] text-muted-foreground">
                              {formatElapsed(run.startTime, run.endTime)}
                            </span>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              onClick={(e) => {
                                e.preventDefault();
                                handleDelete(run.id);
                              }}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-1">
                          {run.task}
                        </p>
                        <div className="flex items-center gap-3 mt-1 text-[10px] text-muted-foreground">
                          <span>{run.iterations} iterations</span>
                          <span>{new Date(run.startTime).toLocaleString()}</span>
                        </div>
                      </summary>
                      <div className="mt-2 space-y-1">
                        {run.result && (
                          <p className="text-xs text-muted-foreground bg-muted/50 rounded p-2">
                            {run.result}
                          </p>
                        )}
                        <div className="max-h-[120px] overflow-y-auto space-y-0.5 font-mono text-[10px]">
                          {run.logs.slice(-10).map((log, i) => (
                            <div
                              key={i}
                              className={cn(
                                "flex gap-1",
                                log.type === "error" && "text-red-400",
                                log.type === "complete" && "text-emerald-400"
                              )}
                            >
                              <span className="text-muted-foreground shrink-0">
                                [{log.type}]
                              </span>
                              <span className="truncate">{log.content}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </details>
                  ))}
                </div>
              </ScrollArea>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

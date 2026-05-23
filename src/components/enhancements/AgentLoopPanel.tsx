"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Workflow,
  Loader2,
  Brain,
  Play,
  Eye,
  RotateCcw,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Zap,
  Clock,
  Wrench,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ───────────────────────────────────────────────────────────────────

type AgentStep = "planning" | "executing" | "observing" | "replanning" | "completed" | "failed";

interface ToolCall {
  name: string;
  input: Record<string, unknown>;
  output?: string;
  status: "running" | "done" | "error";
  duration?: number;
}

interface AgentRun {
  id: string;
  name: string;
  model: string;
  currentStep: AgentStep;
  status: "running" | "completed" | "failed" | "idle";
  stepsCompleted: number;
  totalSteps: number;
  toolCalls: ToolCall[];
  startedAt: string;
  completedAt?: string;
  duration?: number;
  error?: string;
}

interface AgentLoopPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const STEP_ORDER: AgentStep[] = ["planning", "executing", "observing", "replanning", "completed"];

function stepIcon(step: AgentStep) {
  switch (step) {
    case "planning":
      return <Brain className="h-3.5 w-3.5" />;
    case "executing":
      return <Play className="h-3.5 w-3.5" />;
    case "observing":
      return <Eye className="h-3.5 w-3.5" />;
    case "replanning":
      return <RotateCcw className="h-3.5 w-3.5" />;
    case "completed":
      return <CheckCircle2 className="h-3.5 w-3.5" />;
    case "failed":
      return <Zap className="h-3.5 w-3.5" />;
  }
}

function stepColor(step: AgentStep, isActive: boolean) {
  if (!isActive) return "bg-zinc-500/15 text-zinc-400 border-zinc-500/30";
  switch (step) {
    case "planning":
      return "bg-violet-500/15 text-violet-400 border-violet-500/30";
    case "executing":
      return "bg-amber-500/15 text-amber-400 border-amber-500/30";
    case "observing":
      return "bg-cyan-500/15 text-cyan-400 border-cyan-500/30";
    case "replanning":
      return "bg-fuchsia-500/15 text-fuchsia-400 border-fuchsia-500/30";
    case "completed":
      return "bg-emerald-500/15 text-emerald-400 border-emerald-500/30";
    case "failed":
      return "bg-red-500/15 text-red-400 border-red-500/30";
  }
}

function statusBadgeColor(status: string) {
  switch (status) {
    case "running":
      return "bg-amber-500/15 text-amber-400 border-amber-500/30";
    case "completed":
      return "bg-emerald-500/15 text-emerald-400 border-emerald-500/30";
    case "failed":
      return "bg-red-500/15 text-red-400 border-red-500/30";
    default:
      return "bg-zinc-500/15 text-zinc-400 border-zinc-500/30";
  }
}

// ─── Component ───────────────────────────────────────────────────────────────

export function AgentLoopPanel({ open, onOpenChange }: AgentLoopPanelProps) {
  const [runs, setRuns] = useState<AgentRun[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchRuns = useCallback(async () => {
    try {
      const res = await fetch("/api/agents/runs");
      if (res.ok) {
        const data = await res.json();
        setRuns(data.runs || []);
      }
    } catch {
      // silent for auto-refresh
    }
  }, []);

  const fetchInitial = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/agents/runs");
      if (res.ok) {
        const data = await res.json();
        setRuns(data.runs || []);
      }
    } catch {
      toast.error("Failed to load agent runs");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      fetchInitial();
    }
  }, [open, fetchInitial]);

  // Auto-refresh every 2 seconds for active runs
  useEffect(() => {
    if (open && runs.some((r) => r.status === "running")) {
      intervalRef.current = setInterval(fetchRuns, 2000);
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [open, runs, fetchRuns]);

  const activeRuns = runs.filter((r) => r.status === "running");
  const pastRuns = runs.filter((r) => r.status !== "running");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-5xl max-h-[92vh] overflow-hidden flex flex-col" showCloseButton>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-gradient-to-br from-violet-500/20 to-fuchsia-500/20 border border-violet-500/30">
              <Workflow className="h-4 w-4 text-violet-400" />
            </div>
            Agent Loop Visualization
          </DialogTitle>
          <DialogDescription>
            Real-time animated DAG showing agent execution flow, current steps, and tool calls
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 min-h-0">
          <div className="space-y-5 p-1 pr-4">
            {/* ── Active Runs ── */}
            <div className="rounded-xl border bg-card p-5 space-y-3">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                <Loader2 className={cn("h-3.5 w-3.5", activeRuns.length > 0 && "animate-spin text-amber-400")} />
                Active Runs
                {activeRuns.length > 0 && (
                  <Badge className="h-5 text-[10px] border bg-amber-500/15 text-amber-400 border-amber-500/30">
                    {activeRuns.length}
                  </Badge>
                )}
              </h4>

              {loading ? (
                <div className="flex items-center justify-center py-8 text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin mr-2" />
                  Loading agent runs...
                </div>
              ) : activeRuns.length === 0 ? (
                <div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
                  <Workflow className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">No active agent runs</p>
                  <p className="text-xs mt-1">Start an agent to see its execution flow here</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {activeRuns.map((run) => (
                    <AgentRunCard
                      key={run.id}
                      run={run}
                      expanded={expandedRunId === run.id}
                      onToggle={() => setExpandedRunId(expandedRunId === run.id ? null : run.id)}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* ── DAG Visualization ── */}
            {activeRuns.length > 0 && (
              <div className="rounded-xl border border-violet-500/30 bg-violet-500/5 p-5 space-y-4">
                <h4 className="text-sm font-semibold flex items-center gap-2 text-violet-400">
                  <Workflow className="h-4 w-4" />
                  Execution DAG — {activeRuns[0].name}
                </h4>
                <div className="flex items-center justify-center gap-1 overflow-x-auto pb-2">
                  {STEP_ORDER.map((step, i) => {
                    const isActive = activeRuns[0].currentStep === step;
                    const stepIdx = STEP_ORDER.indexOf(activeRuns[0].currentStep);
                    const isPast = STEP_ORDER.indexOf(step) < stepIdx;
                    return (
                      <div key={step} className="flex items-center">
                        <div
                          className={cn(
                            "flex flex-col items-center gap-1.5 px-3 py-2.5 rounded-lg border transition-all",
                            isActive
                              ? "border-violet-500/50 bg-violet-500/10 shadow-lg shadow-violet-500/10"
                              : isPast
                                ? "border-emerald-500/30 bg-emerald-500/5"
                                : "border-zinc-700/50 bg-zinc-800/30"
                          )}
                        >
                          <div
                            className={cn(
                              "flex items-center justify-center h-8 w-8 rounded-full border",
                              stepColor(step, isActive || isPast)
                            )}
                          >
                            {isActive ? (
                              <span className="animate-pulse">{stepIcon(step)}</span>
                            ) : (
                              stepIcon(step)
                            )}
                          </div>
                          <Badge
                            className={cn(
                              "h-5 text-[9px] border capitalize",
                              stepColor(step, isActive || isPast)
                            )}
                          >
                            {step}
                          </Badge>
                        </div>
                        {i < STEP_ORDER.length - 1 && (
                          <div
                            className={cn(
                              "h-0.5 w-6 mx-1",
                              isPast ? "bg-emerald-500/40" : "bg-zinc-700/40"
                            )}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ── Past Runs ── */}
            <div className="rounded-xl border bg-card p-5 space-y-3">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Past Runs
              </h4>
              {pastRuns.length === 0 ? (
                <div className="rounded-xl border border-dashed p-6 text-center text-muted-foreground">
                  <Clock className="h-6 w-6 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">No past runs yet</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {pastRuns.map((run) => (
                    <AgentRunCard
                      key={run.id}
                      run={run}
                      expanded={expandedRunId === run.id}
                      onToggle={() => setExpandedRunId(expandedRunId === run.id ? null : run.id)}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

// ─── AgentRunCard Sub-Component ──────────────────────────────────────────────

function AgentRunCard({ run, expanded, onToggle }: { run: AgentRun; expanded: boolean; onToggle: () => void }) {
  return (
    <Card className="overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 p-3 hover:bg-muted/50 transition-colors text-left"
      >
        {expanded ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" /> : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium truncate">{run.name}</span>
            <Badge className={cn("h-5 text-[10px] border", statusBadgeColor(run.status))}>
              {run.status}
            </Badge>
            <Badge variant="outline" className="h-5 text-[10px]">
              {run.model}
            </Badge>
          </div>
          <div className="flex items-center gap-3 mt-1 text-[10px] text-muted-foreground">
            <span>Step {run.stepsCompleted}/{run.totalSteps}</span>
            <span>{run.startedAt}</span>
            {run.duration && <span>{run.duration}ms</span>}
          </div>
        </div>
        <Badge className={cn("h-5 text-[10px] border capitalize", stepColor(run.currentStep, true))}>
          {stepIcon(run.currentStep)}
          <span className="ml-1">{run.currentStep}</span>
        </Badge>
      </button>

      {expanded && (
        <div className="border-t p-4 space-y-3 bg-muted/20">
          {/* Step Progress */}
          <div className="flex items-center gap-2">
            {STEP_ORDER.map((step, i) => {
              const stepIdx = STEP_ORDER.indexOf(run.currentStep);
              const isActive = run.currentStep === step;
              const isPast = STEP_ORDER.indexOf(step) < stepIdx;
              return (
                <div key={step} className="flex items-center">
                  <div
                    className={cn(
                      "h-2 w-2 rounded-full transition-all",
                      isActive ? "bg-violet-400 scale-125" : isPast ? "bg-emerald-400" : "bg-zinc-600"
                    )}
                  />
                  {i < STEP_ORDER.length - 1 && (
                    <div className={cn("h-0.5 w-4", isPast ? "bg-emerald-400/40" : "bg-zinc-700/40")} />
                  )}
                </div>
              );
            })}
          </div>

          {/* Tool Calls */}
          {run.toolCalls.length > 0 && (
            <div className="space-y-1.5">
              <span className="text-xs font-medium text-muted-foreground">Tool Calls</span>
              {run.toolCalls.map((tc, i) => (
                <div key={i} className="flex items-center gap-2 rounded bg-muted/30 p-2">
                  <Wrench className="h-3 w-3 text-amber-400 shrink-0" />
                  <span className="text-xs font-medium">{tc.name}</span>
                  {tc.duration && <span className="text-[10px] text-muted-foreground">{tc.duration}ms</span>}
                  <Badge
                    className={cn(
                      "h-4 text-[9px] border ml-auto",
                      tc.status === "done"
                        ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                        : tc.status === "running"
                          ? "bg-amber-500/15 text-amber-400 border-amber-500/30"
                          : "bg-red-500/15 text-red-400 border-red-500/30"
                    )}
                  >
                    {tc.status}
                  </Badge>
                </div>
              ))}
            </div>
          )}

          {run.error && (
            <div className="rounded bg-red-500/10 border border-red-500/20 p-2 text-xs text-red-400">
              {run.error}
            </div>
          )}

          <Separator />
          <div className="flex items-center gap-4 text-[10px] text-muted-foreground">
            <span>ID: {run.id}</span>
            <span>Started: {run.startedAt}</span>
            {run.completedAt && <span>Completed: {run.completedAt}</span>}
          </div>
        </div>
      )}
    </Card>
  );
}

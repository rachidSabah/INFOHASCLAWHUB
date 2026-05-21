"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
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
  Target,
  GitBranch,
  Play,
  Plus,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  ArrowRight,
  Zap,
  TreePine,
  ListOrdered,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ───────────────────────────────────────────────────────────────────

type GoalStatus = "pending" | "planning" | "executing" | "completed" | "failed";
type ActionStatus = "pending" | "running" | "completed" | "failed";

interface Goal {
  id: string;
  name: string;
  description: string;
  status: GoalStatus;
  priority: number;
  planTree: PlanNode | null;
  createdAt: string;
}

interface PlanNode {
  id: string;
  label: string;
  status: ActionStatus;
  children: PlanNode[];
}

interface Action {
  id: string;
  goalId: string;
  name: string;
  type: string;
  status: ActionStatus;
  result: string | null;
  startedAt: string | null;
  completedAt: string | null;
}

interface GoalPlannerPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function goalStatusColor(status: GoalStatus) {
  switch (status) {
    case "completed":
      return "bg-emerald-500/15 text-emerald-400 border-emerald-500/30";
    case "executing":
      return "bg-blue-500/15 text-blue-400 border-blue-500/30";
    case "planning":
      return "bg-amber-500/15 text-amber-400 border-amber-500/30";
    case "failed":
      return "bg-red-500/15 text-red-400 border-red-500/30";
    default:
      return "bg-zinc-500/15 text-zinc-400 border-zinc-500/30";
  }
}

function actionStatusIcon(status: ActionStatus) {
  switch (status) {
    case "completed":
      return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />;
    case "running":
      return <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-400" />;
    case "failed":
      return <XCircle className="h-3.5 w-3.5 text-red-400" />;
    default:
      return <Clock className="h-3.5 w-3.5 text-zinc-400" />;
  }
}

// ─── Component ───────────────────────────────────────────────────────────────

export function GoalPlannerPanel({ open, onOpenChange }: GoalPlannerPanelProps) {
  const [activeTab, setActiveTab] = useState("goals");

  // ══ Goals Tab State ══
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loadingGoals, setLoadingGoals] = useState(false);
  const [newGoalName, setNewGoalName] = useState("");
  const [newGoalDescription, setNewGoalDescription] = useState("");
  const [newGoalPriority, setNewGoalPriority] = useState("5");
  const [creatingGoal, setCreatingGoal] = useState(false);

  // ══ Plan Tab State ══
  const [selectedGoalId, setSelectedGoalId] = useState("");
  const [selectedGoal, setSelectedGoal] = useState<Goal | null>(null);
  const [planning, setPlanning] = useState(false);

  // ══ Actions Tab State ══
  const [actions, setActions] = useState<Action[]>([]);
  const [loadingActions, setLoadingActions] = useState(false);
  const [executingActionId, setExecutingActionId] = useState<string | null>(null);

  // ── Fetch data on open ──
  const fetchGoals = useCallback(async () => {
    setLoadingGoals(true);
    try {
      const res = await fetch("/api/goals");
      if (res.ok) {
        const data = await res.json();
        setGoals(data.goals || []);
      }
    } catch {
      toast.error("Failed to load goals");
    } finally {
      setLoadingGoals(false);
    }
  }, []);

  const fetchActions = useCallback(async () => {
    if (!selectedGoalId) return;
    setLoadingActions(true);
    try {
      const res = await fetch(`/api/goals/actions?goalId=${selectedGoalId}`);
      if (res.ok) {
        const data = await res.json();
        setActions(data.actions || []);
      }
    } catch {
      toast.error("Failed to load actions");
    } finally {
      setLoadingActions(false);
    }
  }, [selectedGoalId]);

  useEffect(() => {
    if (open) {
      fetchGoals();
    }
  }, [open, fetchGoals]);

  useEffect(() => {
    if (open && selectedGoalId) {
      fetchActions();
      const goal = goals.find((g) => g.id === selectedGoalId);
      setSelectedGoal(goal || null);
    }
  }, [open, selectedGoalId, fetchActions, goals]);

  // ── Create Goal ──
  const createGoal = async () => {
    if (!newGoalName.trim()) {
      toast.error("Goal name is required");
      return;
    }
    setCreatingGoal(true);
    try {
      const res = await fetch("/api/goals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newGoalName.trim(),
          description: newGoalDescription.trim(),
          priority: parseInt(newGoalPriority, 10),
        }),
      });
      if (res.ok) {
        toast.success("Goal created");
        setNewGoalName("");
        setNewGoalDescription("");
        fetchGoals();
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to create goal");
      }
    } catch {
      toast.error("Failed to create goal");
    } finally {
      setCreatingGoal(false);
    }
  };

  // ── Run A* Planning ──
  const runPlanning = async () => {
    if (!selectedGoalId) return;
    setPlanning(true);
    try {
      const res = await fetch("/api/goals/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goalId: selectedGoalId }),
      });
      if (res.ok) {
        const data = await res.json();
        toast.success("Plan generated");
        setSelectedGoal(data.goal || null);
        fetchGoals();
        fetchActions();
      } else {
        const data = await res.json();
        toast.error(data.error || "Planning failed");
      }
    } catch {
      toast.error("Planning failed");
    } finally {
      setPlanning(false);
    }
  };

  // ── Execute Action ──
  const executeAction = async (actionId: string) => {
    setExecutingActionId(actionId);
    try {
      const res = await fetch("/api/goals/actions/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actionId }),
      });
      if (res.ok) {
        toast.success("Action executed");
        fetchActions();
      } else {
        const data = await res.json();
        toast.error(data.error || "Action execution failed");
      }
    } catch {
      toast.error("Action execution failed");
    } finally {
      setExecutingActionId(null);
    }
  };

  // ── Render Plan Tree ──
  const renderPlanNode = (node: PlanNode, depth: number = 0): React.ReactNode => (
    <div key={node.id} style={{ paddingLeft: depth * 20 }}>
      <div className="flex items-center gap-2 py-1.5">
        <div className="flex items-center justify-center h-6 w-6 rounded-md bg-indigo-500/15 shrink-0">
          {actionStatusIcon(node.status)}
        </div>
        {depth > 0 && <div className="h-px w-3 bg-indigo-500/30" />}
        <span className="text-xs font-medium">{node.label}</span>
      </div>
      {node.children.map((child) => renderPlanNode(child, depth + 1))}
    </div>
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════════

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-5xl max-h-[92vh] overflow-hidden flex flex-col" showCloseButton>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-gradient-to-br from-indigo-500/20 to-blue-500/20 border border-indigo-500/30">
              <Target className="h-4 w-4 text-indigo-400" />
            </div>
            Goal Planner
          </DialogTitle>
          <DialogDescription>
            Create goals, run A* planning, execute actions, and visualize plan trees
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
          <TabsList className="grid w-full grid-cols-3 mb-1 shrink-0">
            <TabsTrigger value="goals" className="gap-1.5 text-xs">
              <Target className="h-3.5 w-3.5" />
              Goals
            </TabsTrigger>
            <TabsTrigger value="plan" className="gap-1.5 text-xs">
              <TreePine className="h-3.5 w-3.5" />
              Plan
            </TabsTrigger>
            <TabsTrigger value="actions" className="gap-1.5 text-xs">
              <ListOrdered className="h-3.5 w-3.5" />
              Actions
            </TabsTrigger>
          </TabsList>

          {/* ═══ GOALS TAB ═══ */}
          <TabsContent value="goals" className="flex-1 min-h-0 mt-0 overflow-y-auto">
            <ScrollArea className="h-[calc(90vh-200px)]">
              <div className="space-y-5 p-1 pr-4">
                {/* Create Goal */}
                <div className="rounded-xl border bg-card p-5 space-y-4">
                  <h4 className="text-sm font-semibold flex items-center gap-2">
                    <Plus className="h-4 w-4 text-indigo-400" />
                    Create Goal
                  </h4>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">Goal Name</Label>
                    <Input value={newGoalName} onChange={(e) => setNewGoalName(e.target.value)} placeholder="e.g., Deploy production API" className="h-9" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">Description</Label>
                    <Textarea value={newGoalDescription} onChange={(e) => setNewGoalDescription(e.target.value)} placeholder="Describe what you want to achieve..." className="min-h-[60px] resize-none" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium">Priority (1-10)</Label>
                      <Input type="number" min="1" max="10" value={newGoalPriority} onChange={(e) => setNewGoalPriority(e.target.value)} className="h-9" />
                    </div>
                    <div className="flex items-end">
                      <Button size="sm" onClick={createGoal} disabled={creatingGoal || !newGoalName.trim()} className="h-9 text-xs gap-1.5 w-full">
                        {creatingGoal ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                        Create Goal
                      </Button>
                    </div>
                  </div>
                </div>

                {/* Goals List */}
                <div className="rounded-xl border bg-card p-5 space-y-3">
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Your Goals</h4>
                  {loadingGoals ? (
                    <div className="flex items-center justify-center py-8 text-muted-foreground">
                      <Loader2 className="h-5 w-5 animate-spin mr-2" />
                      Loading goals...
                    </div>
                  ) : goals.length === 0 ? (
                    <div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
                      <Target className="h-8 w-8 mx-auto mb-2 opacity-30" />
                      <p className="text-sm">No goals found</p>
                      <p className="text-xs mt-1">Create a goal above</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {goals.map((goal) => (
                        <div key={goal.id} className="flex items-center gap-3 rounded-lg bg-muted/30 p-3 cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => { setSelectedGoalId(goal.id); setActiveTab("plan"); }}>
                          <Badge className={cn("h-5 text-[10px] border", goalStatusColor(goal.status))}>
                            {goal.status}
                          </Badge>
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-medium">{goal.name}</div>
                            {goal.description && <div className="text-[10px] text-muted-foreground truncate">{goal.description}</div>}
                          </div>
                          <Badge variant="outline" className="h-5 text-[10px]">P{goal.priority}</Badge>
                          <ArrowRight className="h-4 w-4 text-muted-foreground" />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </ScrollArea>
          </TabsContent>

          {/* ═══ PLAN TAB ═══ */}
          <TabsContent value="plan" className="flex-1 min-h-0 mt-0 overflow-y-auto">
            <ScrollArea className="h-[calc(90vh-200px)]">
              <div className="space-y-5 p-1 pr-4">
                {/* Select Goal */}
                <div className="rounded-xl border bg-card p-5 space-y-4">
                  <h4 className="text-sm font-semibold flex items-center gap-2">
                    <TreePine className="h-4 w-4 text-blue-400" />
                    Plan Tree View
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium">Select Goal</Label>
                      <Select value={selectedGoalId} onValueChange={setSelectedGoalId}>
                        <SelectTrigger className="h-9">
                          <SelectValue placeholder="Choose a goal..." />
                        </SelectTrigger>
                        <SelectContent>
                          {goals.map((g) => (
                            <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-end">
                      <Button size="sm" onClick={runPlanning} disabled={planning || !selectedGoalId} className="h-9 text-xs gap-1.5 w-full">
                        {planning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
                        Run A* Planning
                      </Button>
                    </div>
                  </div>
                </div>

                {/* Plan Tree */}
                {selectedGoal && (
                  <div className="rounded-xl border border-indigo-500/30 bg-indigo-500/5 p-5 space-y-3">
                    <div className="flex items-center gap-2">
                      <Target className="h-4 w-4 text-indigo-400" />
                      <span className="text-sm font-semibold text-indigo-400">{selectedGoal.name}</span>
                      <Badge className={cn("h-5 text-[10px] border", goalStatusColor(selectedGoal.status))}>
                        {selectedGoal.status}
                      </Badge>
                    </div>
                    {selectedGoal.planTree ? (
                      <div className="space-y-0">
                        {renderPlanNode(selectedGoal.planTree)}
                      </div>
                    ) : (
                      <div className="text-center text-xs text-muted-foreground py-6">
                        No plan generated yet. Click &quot;Run A* Planning&quot; above.
                      </div>
                    )}
                  </div>
                )}
              </div>
            </ScrollArea>
          </TabsContent>

          {/* ═══ ACTIONS TAB ═══ */}
          <TabsContent value="actions" className="flex-1 min-h-0 mt-0 overflow-y-auto">
            <ScrollArea className="h-[calc(90vh-200px)]">
              <div className="space-y-5 p-1 pr-4">
                {/* Actions Grid */}
                {loadingActions ? (
                  <div className="flex items-center justify-center py-12 text-muted-foreground">
                    <Loader2 className="h-5 w-5 animate-spin mr-2" />
                    Loading actions...
                  </div>
                ) : actions.length === 0 ? (
                  <div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
                    <ListOrdered className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">No actions found</p>
                    <p className="text-xs mt-1">Select a goal and run planning to generate actions</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {actions.map((action) => (
                      <div key={action.id} className="rounded-xl border bg-card p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            {actionStatusIcon(action.status)}
                            <span className="text-sm font-medium">{action.name}</span>
                          </div>
                          <Badge variant="outline" className="h-5 text-[10px]">{action.type}</Badge>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge className={cn("h-5 text-[10px] border", action.status === "completed" ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" : action.status === "failed" ? "bg-red-500/15 text-red-400 border-red-500/30" : action.status === "running" ? "bg-blue-500/15 text-blue-400 border-blue-500/30" : "bg-zinc-500/15 text-zinc-400 border-zinc-500/30")}>
                            {action.status}
                          </Badge>
                          {action.result && (
                            <span className="text-[10px] text-muted-foreground truncate">{action.result}</span>
                          )}
                        </div>
                        {action.status === "pending" && (
                          <Button variant="outline" size="sm" className="h-7 text-[10px] gap-1 w-full" onClick={() => executeAction(action.id)} disabled={executingActionId === action.id}>
                            {executingActionId === action.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
                            Execute
                          </Button>
                        )}
                      </div>
                    ))}
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

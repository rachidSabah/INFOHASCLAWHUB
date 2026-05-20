"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  GitBranch,
  Plus,
  Trash2,
  Play,
  Pause,
  RotateCcw,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  ChevronDown,
  ChevronRight,
  ArrowRight,
  Users,
  Workflow,
  List,
  Eye,
  Shield,
  AlertTriangle,
  Circle,
  GripVertical,
  ArrowDown,
  Zap,
  Layers,
  Copy,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

interface Agent {
  id: string;
  name: string;
  role: string;
  avatar?: string | null;
  isActive: boolean;
}

interface PipelineStep {
  agentId: string;
  order: number;
  approvalRequired: boolean;
  inputMapping?: string;
  outputMapping?: string;
  parallelGroup?: number;
}

interface PipelineResult {
  step: number;
  output?: string;
  status?: string;
  duration?: number;
  approved?: boolean;
  timestamp?: string;
}

interface Pipeline {
  id: string;
  name: string;
  description?: string | null;
  steps: string; // JSON
  status: "draft" | "running" | "completed" | "failed" | "paused";
  currentStep: number;
  results?: string | null; // JSON
  parallelGroups?: string | null; // JSON
  createdAt: string;
  updatedAt: string;
}

interface AgentOrchestrationPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseSteps(raw: string): PipelineStep[] {
  try {
    return JSON.parse(raw) as PipelineStep[];
  } catch {
    return [];
  }
}

function parseResults(raw: string | null | undefined): PipelineResult[] {
  try {
    if (!raw) return [];
    return JSON.parse(raw) as PipelineResult[];
  } catch {
    return [];
  }
}

function parseParallelGroups(raw: string | null | undefined): number[][] {
  try {
    if (!raw) return [];
    return JSON.parse(raw) as number[][];
  } catch {
    return [];
  }
}

function statusColor(status: string) {
  switch (status) {
    case "draft":
      return "bg-zinc-500/15 text-zinc-400 border-zinc-500/30";
    case "running":
      return "bg-blue-500/15 text-blue-400 border-blue-500/30";
    case "completed":
      return "bg-emerald-500/15 text-emerald-400 border-emerald-500/30";
    case "failed":
      return "bg-red-500/15 text-red-400 border-red-500/30";
    case "paused":
      return "bg-yellow-500/15 text-yellow-400 border-yellow-500/30";
    default:
      return "bg-zinc-500/15 text-zinc-400 border-zinc-500/30";
  }
}

function statusIcon(status: string, size = "h-3 w-3") {
  switch (status) {
    case "draft":
      return <Circle className={cn(size, "text-zinc-400")} />;
    case "running":
      return <Loader2 className={cn(size, "text-blue-400 animate-spin")} />;
    case "completed":
      return <CheckCircle2 className={cn(size, "text-emerald-400")} />;
    case "failed":
      return <XCircle className={cn(size, "text-red-400")} />;
    case "paused":
      return <Pause className={cn(size, "text-yellow-400")} />;
    default:
      return <Circle className={cn(size, "text-zinc-400")} />;
  }
}

function stepNodeColor(status: string) {
  switch (status) {
    case "draft":
      return "border-zinc-500/40 bg-zinc-500/5";
    case "running":
      return "border-blue-500/50 bg-blue-500/10 shadow-[0_0_15px_rgba(59,130,246,0.15)]";
    case "completed":
      return "border-emerald-500/50 bg-emerald-500/10";
    case "failed":
      return "border-red-500/50 bg-red-500/10";
    case "paused":
      return "border-yellow-500/50 bg-yellow-500/10";
    default:
      return "border-zinc-500/40 bg-zinc-500/5";
  }
}

function connectorColor(status: string) {
  switch (status) {
    case "completed":
      return "bg-emerald-500/60";
    case "running":
      return "bg-blue-500/40 animate-pulse";
    case "failed":
      return "bg-red-500/40";
    default:
      return "bg-zinc-500/30";
  }
}

// ─── Status Badge ────────────────────────────────────────────────────────────

function PipelineStatusBadge({ status }: { status: string }) {
  return (
    <Badge className={cn("h-5 text-[10px] font-medium border", statusColor(status))}>
      {statusIcon(status, "h-2.5 w-2.5 mr-1")}
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </Badge>
  );
}

// ─── Component ───────────────────────────────────────────────────────────────

export function AgentOrchestrationPanel({ open, onOpenChange }: AgentOrchestrationPanelProps) {
  // ── Agents ──
  const [agents, setAgents] = useState<Agent[]>([]);

  // ── Pipelines ──
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [loading, setLoading] = useState(false);

  // ── Builder State ──
  const [builderName, setBuilderName] = useState("");
  const [builderDesc, setBuilderDesc] = useState("");
  const [builderSteps, setBuilderSteps] = useState<PipelineStep[]>([]);
  const [builderParallelGroups, setBuilderParallelGroups] = useState<number[][]>([]);
  const [saving, setSaving] = useState(false);

  // ── Visual Pipeline State ──
  const [selectedPipelineId, setSelectedPipelineId] = useState<string | null>(null);
  const [selectedPipeline, setSelectedPipeline] = useState<Pipeline | null>(null);
  const [expandedSteps, setExpandedSteps] = useState<Set<number>>(new Set());
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // ── Active Tab ──
  const [activeTab, setActiveTab] = useState("builder");

  // ── Fetch Agents ──
  const fetchAgents = useCallback(async () => {
    try {
      const res = await fetch("/api/agents");
      if (res.ok) {
        const data = await res.json();
        setAgents(data);
      }
    } catch {
      // silently fail
    }
  }, []);

  // ── Fetch Pipelines ──
  const fetchPipelines = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/pipelines");
      if (res.ok) {
        const data = await res.json();
        setPipelines(data);
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  // ── Fetch Selected Pipeline ──
  const fetchSelectedPipeline = useCallback(async () => {
    if (!selectedPipelineId) return;
    try {
      const res = await fetch(`/api/pipelines/${selectedPipelineId}`);
      if (res.ok) {
        const data = await res.json();
        setSelectedPipeline(data);
      }
    } catch {
      // silently fail
    }
  }, [selectedPipelineId]);

  // ── Init ──
  useEffect(() => {
    if (!open) return;
    fetchAgents();
    fetchPipelines();
  }, [open, fetchAgents, fetchPipelines]);

  // ── Poll running pipeline ──
  useEffect(() => {
    if (!open || !selectedPipelineId) return;
    fetchSelectedPipeline();
    const interval = setInterval(fetchSelectedPipeline, 2000);
    return () => clearInterval(interval);
  }, [open, selectedPipelineId, fetchSelectedPipeline]);

  // ── Builder: Add Step ──
  const addStep = () => {
    setBuilderSteps((prev) => [
      ...prev,
      {
        agentId: "",
        order: prev.length,
        approvalRequired: false,
        parallelGroup: undefined,
      },
    ]);
  };

  // ── Builder: Remove Step ──
  const removeStep = (index: number) => {
    setBuilderSteps((prev) => {
      const next = prev.filter((_, i) => i !== index);
      return next.map((s, i) => ({ ...s, order: i }));
    });
    // Clean parallel groups
    setBuilderParallelGroups((prev) =>
      prev
        .map((group) => group.filter((idx) => idx !== index).map((idx) => (idx > index ? idx - 1 : idx)))
        .filter((group) => group.length > 1)
    );
  };

  // ── Builder: Update Step ──
  const updateStep = (index: number, field: keyof PipelineStep, value: unknown) => {
    setBuilderSteps((prev) =>
      prev.map((s, i) => (i === index ? { ...s, [field]: value } : s))
    );
  };

  // ── Builder: Move Step ──
  const moveStep = (index: number, direction: "up" | "down") => {
    if ((direction === "up" && index === 0) || (direction === "down" && index === builderSteps.length - 1)) return;
    const swapWith = direction === "up" ? index - 1 : index + 1;
    setBuilderSteps((prev) => {
      const next = [...prev];
      [next[index], next[swapWith]] = [next[swapWith], next[index]];
      return next.map((s, i) => ({ ...s, order: i }));
    });
  };

  // ── Builder: Toggle Parallel Group ──
  const toggleParallelGroup = (stepIndex: number) => {
    setBuilderParallelGroups((prev) => {
      // Check if step is already in a parallel group
      for (let i = 0; i < prev.length; i++) {
        if (prev[i].includes(stepIndex)) {
          // Remove from group; delete group if <= 1 remains
          const updated = prev[i].filter((idx) => idx !== stepIndex);
          if (updated.length <= 1) {
            return prev.filter((_, gi) => gi !== i);
          }
          return prev.map((g, gi) => (gi === i ? updated : g));
        }
      }
      // Try to add to an existing group that includes the adjacent step
      const adjacentPrev = stepIndex - 1;
      for (let i = 0; i < prev.length; i++) {
        if (prev[i].includes(adjacentPrev)) {
          return prev.map((g, gi) => (gi === i ? [...g, stepIndex] : g));
        }
      }
      // Create new group with previous step
      if (adjacentPrev >= 0) {
        return [...prev, [adjacentPrev, stepIndex]];
      }
      return prev;
    });
  };

  // ── Builder: Get Parallel Group For Step ──
  const getParallelGroupForStep = (stepIndex: number): number | null => {
    for (let i = 0; i < builderParallelGroups.length; i++) {
      if (builderParallelGroups[i].includes(stepIndex)) return i;
    }
    return null;
  };

  // ── Builder: Save Pipeline ──
  const savePipeline = async () => {
    if (!builderName.trim()) {
      toast.error("Pipeline name is required");
      return;
    }
    if (builderSteps.length === 0) {
      toast.error("Add at least one step");
      return;
    }
    const hasEmptyAgent = builderSteps.some((s) => !s.agentId);
    if (hasEmptyAgent) {
      toast.error("All steps must have an assigned agent");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/pipelines", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: builderName.trim(),
          description: builderDesc.trim() || null,
          steps: JSON.stringify(builderSteps),
          parallelGroups: JSON.stringify(builderParallelGroups),
          status: "draft",
          currentStep: 0,
        }),
      });
      if (res.ok) {
        toast.success("Pipeline created successfully");
        // Reset builder
        setBuilderName("");
        setBuilderDesc("");
        setBuilderSteps([]);
        setBuilderParallelGroups([]);
        await fetchPipelines();
        setActiveTab("pipelines");
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to create pipeline");
      }
    } catch {
      toast.error("Failed to create pipeline");
    } finally {
      setSaving(false);
    }
  };

  // ── Pipeline Actions ──
  const runPipeline = async (id: string) => {
    setActionLoading(id + "-run");
    try {
      const res = await fetch(`/api/pipelines/${id}/run`, { method: "POST" });
      if (res.ok) {
        toast.success("Pipeline started");
        await fetchPipelines();
        await fetchSelectedPipeline();
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to start pipeline");
      }
    } catch {
      toast.error("Failed to start pipeline");
    } finally {
      setActionLoading(null);
    }
  };

  const pausePipeline = async (id: string) => {
    setActionLoading(id + "-pause");
    try {
      const res = await fetch(`/api/pipelines/${id}/pause`, { method: "POST" });
      if (res.ok) {
        toast.success("Pipeline paused");
        await fetchPipelines();
        await fetchSelectedPipeline();
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to pause pipeline");
      }
    } catch {
      toast.error("Failed to pause pipeline");
    } finally {
      setActionLoading(null);
    }
  };

  const resumePipeline = async (id: string) => {
    setActionLoading(id + "-resume");
    try {
      const res = await fetch(`/api/pipelines/${id}/resume`, { method: "POST" });
      if (res.ok) {
        toast.success("Pipeline resumed");
        await fetchPipelines();
        await fetchSelectedPipeline();
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to resume pipeline");
      }
    } catch {
      toast.error("Failed to resume pipeline");
    } finally {
      setActionLoading(null);
    }
  };

  const approveStep = async (id: string, step: number) => {
    setActionLoading(id + "-approve");
    try {
      const res = await fetch(`/api/pipelines/${id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ step }),
      });
      if (res.ok) {
        toast.success("Step approved");
        await fetchPipelines();
        await fetchSelectedPipeline();
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to approve step");
      }
    } catch {
      toast.error("Failed to approve step");
    } finally {
      setActionLoading(null);
    }
  };

  const deletePipeline = async (id: string) => {
    try {
      const res = await fetch(`/api/pipelines/${id}`, { method: "DELETE" });
      if (res.ok) {
        toast.success("Pipeline deleted");
        if (selectedPipelineId === id) {
          setSelectedPipelineId(null);
          setSelectedPipeline(null);
        }
        await fetchPipelines();
      } else {
        toast.error("Failed to delete pipeline");
      }
    } catch {
      toast.error("Failed to delete pipeline");
    }
  };

  // ── View Pipeline in Visual Tab ──
  const viewPipeline = (pipeline: Pipeline) => {
    setSelectedPipelineId(pipeline.id);
    setSelectedPipeline(pipeline);
    setExpandedSteps(new Set());
    setActiveTab("visual");
  };

  // ── Get Step Status in Running Pipeline ──
  const getStepStatus = (stepIndex: number, pipeline: Pipeline): string => {
    if (pipeline.status === "draft") return "draft";
    const results = parseResults(pipeline.results);
    const stepResult = results.find((r) => r.step === stepIndex);

    if (stepIndex < pipeline.currentStep) {
      return stepResult?.status === "failed" ? "failed" : "completed";
    }
    if (stepIndex === pipeline.currentStep) {
      if (pipeline.status === "paused") return "paused";
      if (pipeline.status === "failed") return "failed";
      return "running";
    }
    return "draft";
  };

  // ── Toggle Expanded Step ──
  const toggleExpandedStep = (index: number) => {
    setExpandedSteps((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  // ── Get Agent Name ──
  const getAgentName = (agentId: string): string => {
    const agent = agents.find((a) => a.id === agentId);
    return agent?.name || "Unknown Agent";
  };

  // ── Get Agent Avatar ──
  const getAgentAvatar = (agentId: string): string | null => {
    const agent = agents.find((a) => a.id === agentId);
    return agent?.avatar || null;
  };

  // ── Get Parallel Group Color ──
  const getParallelGroupColor = (groupIndex: number): string => {
    const colors = [
      "border-violet-500/40 bg-violet-500/5",
      "border-cyan-500/40 bg-cyan-500/5",
      "border-amber-500/40 bg-amber-500/5",
      "border-rose-500/40 bg-rose-500/5",
      "border-teal-500/40 bg-teal-500/5",
    ];
    return colors[groupIndex % colors.length];
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════════

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-5xl max-h-[90vh] overflow-hidden flex flex-col" showCloseButton>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-gradient-to-br from-violet-500/20 to-cyan-500/20 border border-violet-500/30">
              <GitBranch className="h-4 w-4 text-violet-400" />
            </div>
            Multi-Agent Orchestration
          </DialogTitle>
          <DialogDescription>
            Build, visualize, and manage agent pipelines for complex multi-step workflows
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
          <TabsList className="grid w-full grid-cols-3 mb-1 shrink-0">
            <TabsTrigger value="builder" className="gap-1.5 text-xs">
              <Layers className="h-3.5 w-3.5" />
              Builder
            </TabsTrigger>
            <TabsTrigger value="visual" className="gap-1.5 text-xs">
              <Eye className="h-3.5 w-3.5" />
              Visual Pipeline
            </TabsTrigger>
            <TabsTrigger value="pipelines" className="gap-1.5 text-xs">
              <List className="h-3.5 w-3.5" />
              All Pipelines
            </TabsTrigger>
          </TabsList>

          {/* ═══ BUILDER TAB ═══ */}
          <TabsContent value="builder" className="flex-1 min-h-0 mt-0">
            <ScrollArea className="h-[calc(90vh-200px)]">
              <div className="space-y-6 p-1 pr-4">
                {/* Pipeline Info */}
                <div className="rounded-xl border bg-card p-5 space-y-4">
                  <h4 className="text-sm font-semibold flex items-center gap-2">
                    <Workflow className="h-4 w-4 text-violet-400" />
                    Pipeline Configuration
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium">Pipeline Name</Label>
                      <Input
                        value={builderName}
                        onChange={(e) => setBuilderName(e.target.value)}
                        placeholder="e.g., Code Review Pipeline"
                        className="h-9"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium">Description</Label>
                      <Input
                        value={builderDesc}
                        onChange={(e) => setBuilderDesc(e.target.value)}
                        placeholder="Brief description of what this pipeline does"
                        className="h-9"
                      />
                    </div>
                  </div>
                </div>

                {/* Steps Builder */}
                <div className="rounded-xl border bg-card p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-semibold flex items-center gap-2">
                      <Users className="h-4 w-4 text-cyan-400" />
                      Pipeline Steps
                      {builderSteps.length > 0 && (
                        <Badge variant="secondary" className="h-5 text-[10px]">
                          {builderSteps.length}
                        </Badge>
                      )}
                    </h4>
                    <Button size="sm" variant="outline" onClick={addStep} className="h-7 text-xs gap-1">
                      <Plus className="h-3 w-3" />
                      Add Step
                    </Button>
                  </div>

                  {builderSteps.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-muted-foreground border border-dashed rounded-lg">
                      <Layers className="h-10 w-10 mb-3 opacity-30" />
                      <p className="text-sm font-medium">No steps yet</p>
                      <p className="text-xs mt-1">Click &quot;Add Step&quot; to start building your pipeline</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {builderSteps.map((step, index) => {
                        const pg = getParallelGroupForStep(index);
                        return (
                          <div
                            key={index}
                            className={cn(
                              "rounded-lg border p-4 transition-all",
                              pg !== null
                                ? getParallelGroupColor(pg)
                                : "border-border bg-card"
                            )}
                          >
                            <div className="flex items-start gap-3">
                              {/* Order & Drag Handle */}
                              <div className="flex flex-col items-center gap-0.5 pt-1">
                                <div className="flex items-center justify-center h-6 w-6 rounded-full bg-primary/10 text-primary text-[10px] font-bold">
                                  {index + 1}
                                </div>
                                <div className="flex flex-col gap-0.5 mt-1">
                                  <button
                                    type="button"
                                    className="p-0.5 rounded hover:bg-muted transition-colors disabled:opacity-30"
                                    onClick={() => moveStep(index, "up")}
                                    disabled={index === 0}
                                  >
                                    <ChevronDown className="h-3 w-3 rotate-180" />
                                  </button>
                                  <button
                                    type="button"
                                    className="p-0.5 rounded hover:bg-muted transition-colors disabled:opacity-30"
                                    onClick={() => moveStep(index, "down")}
                                    disabled={index === builderSteps.length - 1}
                                  >
                                    <ChevronDown className="h-3 w-3" />
                                  </button>
                                </div>
                              </div>

                              {/* Step Fields */}
                              <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-3">
                                <div className="space-y-1">
                                  <Label className="text-[10px] text-muted-foreground">Agent</Label>
                                  <Select
                                    value={step.agentId}
                                    onValueChange={(v) => updateStep(index, "agentId", v)}
                                  >
                                    <SelectTrigger className="h-8 text-xs">
                                      <SelectValue placeholder="Select agent..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {agents.map((a) => (
                                        <SelectItem key={a.id} value={a.id}>
                                          <span className="flex items-center gap-1.5">
                                            {a.avatar && <span className="text-sm">{a.avatar}</span>}
                                            {a.name}
                                            <span className="text-muted-foreground">— {a.role}</span>
                                          </span>
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>

                                <div className="space-y-1">
                                  <Label className="text-[10px] text-muted-foreground">Parallel Group</Label>
                                  <div className="flex items-center gap-2 h-8">
                                    <Button
                                      size="sm"
                                      variant={pg !== null ? "default" : "outline"}
                                      className={cn(
                                        "h-8 text-xs gap-1",
                                        pg !== null && "text-[10px]"
                                      )}
                                      onClick={() => toggleParallelGroup(index)}
                                    >
                                      <Copy className="h-3 w-3" />
                                      {pg !== null ? `Group ${String.fromCharCode(65 + pg)}` : "Parallel"}
                                    </Button>
                                    {pg !== null && (
                                      <Badge
                                        className={cn(
                                          "h-5 text-[9px] font-mono",
                                          getParallelGroupColor(pg)
                                        )}
                                      >
                                        {String.fromCharCode(65 + pg)}
                                      </Badge>
                                    )}
                                  </div>
                                </div>
                              </div>

                              {/* Approval & Delete */}
                              <div className="flex flex-col items-end gap-2 pt-0.5">
                                <div className="flex items-center gap-2">
                                  <Label className="text-[10px] text-muted-foreground flex items-center gap-1">
                                    <Shield className="h-3 w-3" />
                                    Approval
                                  </Label>
                                  <Switch
                                    checked={step.approvalRequired}
                                    onCheckedChange={(v) =>
                                      updateStep(index, "approvalRequired", v)
                                    }
                                    className="scale-75"
                                  />
                                </div>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 text-destructive hover:text-destructive"
                                  onClick={() => removeStep(index)}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </div>

                            {/* Agent preview chip */}
                            {step.agentId && (
                              <div className="mt-2 ml-9 flex items-center gap-1.5">
                                <div className="flex items-center gap-1.5 rounded-md bg-muted/50 px-2 py-0.5 text-[10px]">
                                  {getAgentAvatar(step.agentId) && (
                                    <span className="text-xs">{getAgentAvatar(step.agentId)}</span>
                                  )}
                                  <span className="font-medium">{getAgentName(step.agentId)}</span>
                                  {step.approvalRequired && (
                                    <Shield className="h-2.5 w-2.5 text-yellow-500 ml-1" />
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Parallel Groups Legend */}
                  {builderParallelGroups.length > 0 && (
                    <div className="rounded-lg border bg-muted/30 p-3">
                      <Label className="text-[10px] text-muted-foreground mb-2 block">
                        Parallel Execution Groups
                      </Label>
                      <div className="flex flex-wrap gap-2">
                        {builderParallelGroups.map((group, gi) => (
                          <div
                            key={gi}
                            className={cn(
                              "flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[10px]",
                              getParallelGroupColor(gi)
                            )}
                          >
                            <Badge className={cn("h-4 text-[8px] font-mono px-1.5", getParallelGroupColor(gi))}>
                              {String.fromCharCode(65 + gi)}
                            </Badge>
                            <span className="text-muted-foreground">
                              Steps {group.map((idx) => idx + 1).join(" & ")} run simultaneously
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Save Button */}
                <div className="flex items-center justify-end gap-3 pt-2 pb-4">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setBuilderName("");
                      setBuilderDesc("");
                      setBuilderSteps([]);
                      setBuilderParallelGroups([]);
                    }}
                    className="h-8 text-xs"
                  >
                    Reset
                  </Button>
                  <Button
                    size="sm"
                    onClick={savePipeline}
                    disabled={saving || !builderName.trim() || builderSteps.length === 0}
                    className="h-8 text-xs gap-1.5 min-w-[140px]"
                  >
                    {saving ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Zap className="h-3.5 w-3.5" />
                    )}
                    Create Pipeline
                  </Button>
                </div>
              </div>
            </ScrollArea>
          </TabsContent>

          {/* ═══ VISUAL PIPELINE TAB ═══ */}
          <TabsContent value="visual" className="flex-1 min-h-0 mt-0">
            {!selectedPipeline ? (
              <div className="flex flex-col items-center justify-center h-[calc(90vh-200px)] text-muted-foreground">
                <Workflow className="h-12 w-12 mb-4 opacity-20" />
                <p className="text-sm font-medium">No pipeline selected</p>
                <p className="text-xs mt-1 mb-4">Select a pipeline from the &quot;All Pipelines&quot; tab to visualize</p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setActiveTab("pipelines")}
                  className="h-8 text-xs gap-1"
                >
                  <List className="h-3 w-3" />
                  View Pipelines
                </Button>
              </div>
            ) : (
              <ScrollArea className="h-[calc(90vh-200px)]">
                <div className="p-1 pr-4 space-y-4">
                  {/* Pipeline Header */}
                  <div className="rounded-xl border bg-card p-5">
                    <div className="flex items-center justify-between gap-4 flex-wrap">
                      <div className="flex items-center gap-3">
                        <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-gradient-to-br from-violet-500/20 to-cyan-500/20 border border-violet-500/30">
                          <GitBranch className="h-5 w-5 text-violet-400" />
                        </div>
                        <div>
                          <h3 className="font-semibold text-sm">{selectedPipeline.name}</h3>
                          {selectedPipeline.description && (
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {selectedPipeline.description}
                            </p>
                          )}
                        </div>
                        <PipelineStatusBadge status={selectedPipeline.status} />
                      </div>

                      <div className="flex items-center gap-2">
                        {(selectedPipeline.status === "draft" || selectedPipeline.status === "paused") && (
                          <Button
                            size="sm"
                            onClick={() => runPipeline(selectedPipeline.id)}
                            disabled={actionLoading === selectedPipeline.id + "-run"}
                            className="h-8 text-xs gap-1"
                          >
                            {actionLoading === selectedPipeline.id + "-run" ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Play className="h-3.5 w-3.5" />
                            )}
                            {selectedPipeline.status === "paused" ? "Resume" : "Run"}
                          </Button>
                        )}
                        {selectedPipeline.status === "running" && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => pausePipeline(selectedPipeline.id)}
                            disabled={actionLoading === selectedPipeline.id + "-pause"}
                            className="h-8 text-xs gap-1"
                          >
                            {actionLoading === selectedPipeline.id + "-pause" ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Pause className="h-3.5 w-3.5" />
                            )}
                            Pause
                          </Button>
                        )}
                        {selectedPipeline.status === "failed" && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => runPipeline(selectedPipeline.id)}
                            disabled={actionLoading === selectedPipeline.id + "-run"}
                            className="h-8 text-xs gap-1"
                          >
                            <RotateCcw className="h-3.5 w-3.5" />
                            Retry
                          </Button>
                        )}
                      </div>
                    </div>

                    {/* Progress bar */}
                    {selectedPipeline.status !== "draft" && (
                      <div className="mt-4">
                        <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-1.5">
                          <span>Progress</span>
                          <span>
                            Step {Math.min(selectedPipeline.currentStep + 1, parseSteps(selectedPipeline.steps).length)} of {parseSteps(selectedPipeline.steps).length}
                          </span>
                        </div>
                        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                          <div
                            className={cn(
                              "h-full rounded-full transition-all duration-700",
                              selectedPipeline.status === "failed"
                                ? "bg-red-500"
                                : selectedPipeline.status === "paused"
                                  ? "bg-yellow-500"
                                  : "bg-emerald-500"
                            )}
                            style={{
                              width: `${Math.min(100, (selectedPipeline.currentStep / parseSteps(selectedPipeline.steps).length) * 100)}%`,
                            }}
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Visual Flow */}
                  {(() => {
                    const steps = parseSteps(selectedPipeline.steps);
                    const parallelGroups = parseParallelGroups(selectedPipeline.parallelGroups);
                    const results = parseResults(selectedPipeline.results);

                    return (
                      <div className="space-y-0">
                        {steps.map((step, index) => {
                          const stepStatus = getStepStatus(index, selectedPipeline);
                          const isExpanded = expandedSteps.has(index);
                          const stepResult = results.find((r) => r.step === index);
                          const pgIndex = parallelGroups.findIndex((g) => g.includes(index));
                          const isParallelStart = pgIndex !== -1 && parallelGroups[pgIndex][0] === index;
                          const isParallelEnd = pgIndex !== -1 && parallelGroups[pgIndex][parallelGroups[pgIndex].length - 1] === index;
                          const isParallelMiddle = pgIndex !== -1 && !isParallelStart && !isParallelEnd;

                          return (
                            <div key={index}>
                              {/* Parallel group start indicator */}
                              {isParallelStart && (
                                <div className="ml-6 mb-1">
                                  <div className={cn(
                                    "flex items-center gap-2 rounded-md border px-3 py-1.5 text-[10px]",
                                    getParallelGroupColor(pgIndex)
                                  )}>
                                    <Copy className="h-3 w-3" />
                                    <span className="font-medium">Parallel Group {String.fromCharCode(65 + pgIndex)}</span>
                                    <span className="text-muted-foreground">
                                      ({parallelGroups[pgIndex].length} steps run simultaneously)
                                    </span>
                                  </div>
                                </div>
                              )}

                              <div className={cn(
                                "flex items-stretch gap-4",
                                isParallelMiddle && "ml-6"
                              )}>
                                {/* Connector line */}
                                {index > 0 && !isParallelMiddle && (
                                  <div className="flex flex-col items-center ml-4">
                                    <div className={cn("w-0.5 h-3", connectorColor(getStepStatus(index - 1, selectedPipeline)))} />
                                  </div>
                                )}

                                {/* Step Node */}
                                <div
                                  className={cn(
                                    "flex-1 rounded-lg border-2 p-4 transition-all cursor-pointer hover:border-primary/30",
                                    stepNodeColor(stepStatus),
                                    isParallelMiddle && "ml-2"
                                  )}
                                  onClick={() => toggleExpandedStep(index)}
                                >
                                  <div className="flex items-center justify-between gap-3">
                                    <div className="flex items-center gap-3">
                                      {/* Status Icon */}
                                      <div className="flex items-center justify-center h-8 w-8 rounded-full bg-background/80 border shrink-0">
                                        {statusIcon(stepStatus, "h-4 w-4")}
                                      </div>

                                      {/* Step Info */}
                                      <div>
                                        <div className="flex items-center gap-2">
                                          <span className="font-medium text-sm">Step {index + 1}</span>
                                          <PipelineStatusBadge status={stepStatus} />
                                          {step.approvalRequired && (
                                            <Badge className="bg-yellow-500/15 text-yellow-400 border-yellow-500/30 h-5 text-[10px]">
                                              <Shield className="h-2.5 w-2.5 mr-0.5" />
                                              Gate
                                            </Badge>
                                          )}
                                        </div>
                                        <div className="flex items-center gap-1.5 mt-1">
                                          {getAgentAvatar(step.agentId) && (
                                            <span className="text-sm">{getAgentAvatar(step.agentId)}</span>
                                          )}
                                          <span className="text-xs text-muted-foreground">
                                            {getAgentName(step.agentId)}
                                          </span>
                                        </div>
                                      </div>
                                    </div>

                                    {/* Expand toggle */}
                                    <div className="flex items-center gap-2">
                                      {stepStatus === "running" && (
                                        <div className="flex items-center gap-1.5 text-[10px] text-blue-400 mr-2">
                                          <Loader2 className="h-3 w-3 animate-spin" />
                                          Executing...
                                        </div>
                                      )}
                                      {isExpanded ? (
                                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                      ) : (
                                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                                      )}
                                    </div>
                                  </div>

                                  {/* Approval Gate */}
                                  {step.approvalRequired &&
                                    stepStatus === "running" &&
                                    index === selectedPipeline.currentStep && (
                                      <div className="mt-3 pt-3 border-t border-yellow-500/20">
                                        <div className="flex items-center gap-2 mb-2">
                                          <AlertTriangle className="h-4 w-4 text-yellow-400" />
                                          <span className="text-xs font-medium text-yellow-400">
                                            Approval Required
                                          </span>
                                        </div>
                                        <p className="text-[10px] text-muted-foreground mb-3">
                                          This step requires manual approval before proceeding to the next step.
                                        </p>
                                        <div className="flex gap-2">
                                          <Button
                                            size="sm"
                                            className="h-7 text-xs gap-1"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              approveStep(selectedPipeline.id, index);
                                            }}
                                            disabled={actionLoading === selectedPipeline.id + "-approve"}
                                          >
                                            <CheckCircle2 className="h-3 w-3" />
                                            Approve
                                          </Button>
                                          <Button
                                            size="sm"
                                            variant="destructive"
                                            className="h-7 text-xs gap-1"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              toast.error("Step rejected");
                                            }}
                                          >
                                            <XCircle className="h-3 w-3" />
                                            Reject
                                          </Button>
                                        </div>
                                      </div>
                                    )}

                                  {/* Expanded Output */}
                                  {isExpanded && stepResult && (
                                    <div className="mt-3 pt-3 border-t">
                                      <Label className="text-[10px] text-muted-foreground mb-1.5 block">
                                        Step Output
                                      </Label>
                                      <div className="rounded-md bg-muted/50 p-3 font-mono text-[11px] whitespace-pre-wrap max-h-[200px] overflow-y-auto">
                                        {stepResult.output || "No output recorded"}
                                      </div>
                                      {stepResult.duration && (
                                        <div className="flex items-center gap-1.5 mt-2 text-[10px] text-muted-foreground">
                                          <Clock className="h-3 w-3" />
                                          Duration: {stepResult.duration}ms
                                        </div>
                                      )}
                                    </div>
                                  )}

                                  {/* Expanded: No result yet */}
                                  {isExpanded && !stepResult && stepStatus === "draft" && (
                                    <div className="mt-3 pt-3 border-t">
                                      <p className="text-[10px] text-muted-foreground italic">
                                        Pending execution
                                      </p>
                                    </div>
                                  )}
                                </div>
                              </div>

                              {/* Connector to next step */}
                              {index < steps.length - 1 && !isParallelEnd && (
                                <div className="flex items-center justify-center ml-4 py-0.5">
                                  <div className="flex flex-col items-center">
                                    <div className={cn("w-0.5 h-4", connectorColor(stepStatus))} />
                                    <ArrowDown className={cn("h-3 w-3", stepStatus === "completed" ? "text-emerald-400" : "text-zinc-500")} />
                                  </div>
                                </div>
                              )}

                              {/* Parallel group end indicator */}
                              {isParallelEnd && (
                                <div className="flex items-center justify-center py-1">
                                  <ArrowDown className="h-3 w-3 text-muted-foreground" />
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}
                </div>
              </ScrollArea>
            )}
          </TabsContent>

          {/* ═══ ALL PIPELINES TAB ═══ */}
          <TabsContent value="pipelines" className="flex-1 min-h-0 mt-0">
            <ScrollArea className="h-[calc(90vh-200px)]">
              <div className="p-1 pr-4 space-y-2">
                {loading && pipelines.length === 0 ? (
                  <div className="flex items-center justify-center py-16">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : pipelines.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                    <GitBranch className="h-12 w-12 mb-4 opacity-20" />
                    <p className="text-sm font-medium">No pipelines yet</p>
                    <p className="text-xs mt-1 mb-4">Create your first pipeline in the Builder tab</p>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setActiveTab("builder")}
                      className="h-8 text-xs gap-1"
                    >
                      <Plus className="h-3 w-3" />
                      Create Pipeline
                    </Button>
                  </div>
                ) : (
                  pipelines.map((pipeline) => {
                    const steps = parseSteps(pipeline.steps);
                    return (
                      <div
                        key={pipeline.id}
                        className={cn(
                          "rounded-lg border bg-card p-4 transition-all hover:border-primary/30 cursor-pointer",
                          selectedPipelineId === pipeline.id && "border-primary/50 bg-primary/5"
                        )}
                        onClick={() => viewPipeline(pipeline)}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="flex items-center justify-center h-9 w-9 rounded-lg bg-gradient-to-br from-violet-500/15 to-cyan-500/15 border border-violet-500/20 shrink-0">
                              <GitBranch className="h-4 w-4 text-violet-400" />
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-medium text-sm truncate">{pipeline.name}</span>
                                <PipelineStatusBadge status={pipeline.status} />
                              </div>
                              {pipeline.description && (
                                <p className="text-xs text-muted-foreground mt-0.5 truncate">
                                  {pipeline.description}
                                </p>
                              )}
                              <div className="flex items-center gap-3 mt-1.5 text-[10px] text-muted-foreground">
                                <span className="flex items-center gap-1">
                                  <Users className="h-3 w-3" />
                                  {steps.length} step{steps.length !== 1 ? "s" : ""}
                                </span>
                                <span className="flex items-center gap-1">
                                  <Clock className="h-3 w-3" />
                                  {new Date(pipeline.createdAt).toLocaleDateString()}
                                </span>
                                {pipeline.status !== "draft" && (
                                  <span className="flex items-center gap-1">
                                    <ArrowRight className="h-3 w-3" />
                                    Step {Math.min(pipeline.currentStep + 1, steps.length)}/{steps.length}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            {(pipeline.status === "draft" || pipeline.status === "paused") && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-[10px] gap-1"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  runPipeline(pipeline.id);
                                }}
                                disabled={actionLoading === pipeline.id + "-run"}
                              >
                                {actionLoading === pipeline.id + "-run" ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <Play className="h-3 w-3" />
                                )}
                                {pipeline.status === "paused" ? "Resume" : "Run"}
                              </Button>
                            )}
                            {pipeline.status === "running" && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-[10px] gap-1"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  pausePipeline(pipeline.id);
                                }}
                                disabled={actionLoading === pipeline.id + "-pause"}
                              >
                                <Pause className="h-3 w-3" />
                                Pause
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-destructive hover:text-destructive"
                              onClick={(e) => {
                                e.stopPropagation();
                                deletePipeline(pipeline.id);
                              }}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

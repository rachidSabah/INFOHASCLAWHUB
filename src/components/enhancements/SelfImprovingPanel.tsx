"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
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
  TrendingUp,
  Brain,
  Sparkles,
  Lightbulb,
  Loader2,
  ArrowUpCircle,
  ArrowDownCircle,
  MinusCircle,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

type TaskType = "code_gen" | "debug" | "review" | "deploy" | "research" | "general";
type Outcome = "success" | "partial" | "failure";
type Trend = "improving" | "stable" | "declining";

interface ReflectPattern {
  pattern: string;
  frequency: number;
  impact: number;
}

interface ReflectSuggestion {
  type: string;
  description: string;
  priority: string;
}

interface ReflectResult {
  patterns: ReflectPattern[];
  suggestions: ReflectSuggestion[];
  overallTrend: Trend;
}

interface RecommendResult {
  strategy: string;
  model: string;
  confidence: number;
  reasoning: string;
  alternatives?: Array<{
    strategy: string;
    confidence: number;
  }>;
}

interface EvolveResult {
  created: number;
  updated: number;
  deprecated: number;
}

interface SelfImprovingPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function trendColor(trend: Trend) {
  switch (trend) {
    case "improving":
      return "bg-emerald-500/15 text-emerald-400 border-emerald-500/30";
    case "stable":
      return "bg-zinc-500/15 text-zinc-400 border-zinc-500/30";
    case "declining":
      return "bg-red-500/15 text-red-400 border-red-500/30";
    default:
      return "bg-zinc-500/15 text-zinc-400 border-zinc-500/30";
  }
}

function trendIcon(trend: Trend) {
  switch (trend) {
    case "improving":
      return <ArrowUpCircle className="h-3.5 w-3.5" />;
    case "stable":
      return <MinusCircle className="h-3.5 w-3.5" />;
    case "declining":
      return <ArrowDownCircle className="h-3.5 w-3.5" />;
    default:
      return <MinusCircle className="h-3.5 w-3.5" />;
  }
}

function priorityColor(priority: string) {
  switch (priority) {
    case "high":
      return "bg-red-500/15 text-red-400 border-red-500/30";
    case "medium":
      return "bg-amber-500/15 text-amber-400 border-amber-500/30";
    case "low":
      return "bg-zinc-500/15 text-zinc-400 border-zinc-500/30";
    default:
      return "bg-zinc-500/15 text-zinc-400 border-zinc-500/30";
  }
}

function suggestionTypeIcon(type: string) {
  switch (type) {
    case "prompt_improvement":
      return <Sparkles className="h-3.5 w-3.5" />;
    case "strategy_change":
      return <TrendingUp className="h-3.5 w-3.5" />;
    case "model_switch":
      return <Brain className="h-3.5 w-3.5" />;
    case "process_fix":
      return <Lightbulb className="h-3.5 w-3.5" />;
    default:
      return <Lightbulb className="h-3.5 w-3.5" />;
  }
}

// ─── Component ───────────────────────────────────────────────────────────────

export function SelfImprovingPanel({
  open,
  onOpenChange,
}: SelfImprovingPanelProps) {
  // ── Active Tab ──
  const [activeTab, setActiveTab] = useState("optimize");

  // ══ Optimize Tab State ══
  const [optTaskType, setOptTaskType] = useState<TaskType>("general");
  const [optAgentRole, setOptAgentRole] = useState("");
  const [optCurrentPrompt, setOptCurrentPrompt] = useState("");
  const [optOptimizedPrompt, setOptOptimizedPrompt] = useState("");
  const [optLoading, setOptLoading] = useState(false);

  // ══ Reflect Tab State ══
  const [refAgentId, setRefAgentId] = useState("");
  const [refSince, setRefSince] = useState("");
  const [refLoading, setRefLoading] = useState(false);
  const [refResult, setRefResult] = useState<ReflectResult | null>(null);

  // ══ Strategy Tab State ══
  const [strTaskType, setStrTaskType] = useState<TaskType>("general");
  const [strAgentId, setStrAgentId] = useState("");
  const [strMaxLatency, setStrMaxLatency] = useState("");
  const [strMaxCost, setStrMaxCost] = useState("");
  const [strMinQuality, setStrMinQuality] = useState("");
  const [strLoading, setStrLoading] = useState(false);
  const [strResult, setStrResult] = useState<RecommendResult | null>(null);

  // ══ Evolve Tab State ══
  const [evoLoading, setEvoLoading] = useState(false);
  const [evoResult, setEvoResult] = useState<EvolveResult | null>(null);
  // Record experience form
  const [recAgentId, setRecAgentId] = useState("");
  const [recTaskType, setRecTaskType] = useState<TaskType>("general");
  const [recPrompt, setRecPrompt] = useState("");
  const [recStrategy, setRecStrategy] = useState("");
  const [recOutcome, setRecOutcome] = useState<Outcome>("success");
  const [recScore, setRecScore] = useState(0.5);
  const [recLoading, setRecLoading] = useState(false);

  // ── Optimize Prompt ──
  const optimizePrompt = async () => {
    if (!optCurrentPrompt.trim()) {
      toast.error("Current prompt is required");
      return;
    }
    setOptLoading(true);
    setOptOptimizedPrompt("");
    try {
      const res = await fetch("/api/self-improving/optimize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          taskType: optTaskType,
          agentRole: optAgentRole.trim() || undefined,
          currentPrompt: optCurrentPrompt.trim(),
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setOptOptimizedPrompt(data.optimizedPrompt || "");
        toast.success("Prompt optimized");
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to optimize prompt");
      }
    } catch {
      toast.error("Failed to optimize prompt");
    } finally {
      setOptLoading(false);
    }
  };

  // ── Reflect ──
  const runReflection = async () => {
    setRefLoading(true);
    setRefResult(null);
    try {
      const body: Record<string, unknown> = {};
      if (refAgentId.trim()) body.agentId = refAgentId.trim();
      if (refSince) body.since = new Date(refSince).toISOString();

      const res = await fetch("/api/self-improving/reflect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        const data = await res.json();
        setRefResult(data);
        toast.success("Reflection complete");
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to run reflection");
      }
    } catch {
      toast.error("Failed to run reflection");
    } finally {
      setRefLoading(false);
    }
  };

  // ── Get Strategy Recommendation ──
  const getRecommendation = async () => {
    setStrLoading(true);
    setStrResult(null);
    try {
      const constraints: Record<string, number> = {};
      if (strMaxLatency) constraints.maxLatency = Number(strMaxLatency);
      if (strMaxCost) constraints.maxCost = Number(strMaxCost);
      if (strMinQuality) constraints.minQuality = Number(strMinQuality);

      const res = await fetch("/api/self-improving/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          taskType: strTaskType,
          agentId: strAgentId.trim() || undefined,
          constraints: Object.keys(constraints).length > 0 ? constraints : undefined,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setStrResult(data);
        toast.success("Recommendation ready");
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to get recommendation");
      }
    } catch {
      toast.error("Failed to get recommendation");
    } finally {
      setStrLoading(false);
    }
  };

  // ── Evolve Templates ──
  const evolveTemplates = async () => {
    setEvoLoading(true);
    setEvoResult(null);
    try {
      const res = await fetch("/api/self-improving/evolve", {
        method: "POST",
      });
      if (res.ok) {
        const data = await res.json();
        setEvoResult(data);
        toast.success("Templates evolved");
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to evolve templates");
      }
    } catch {
      toast.error("Failed to evolve templates");
    } finally {
      setEvoLoading(false);
    }
  };

  // ── Record Experience ──
  const recordExperience = async () => {
    if (!recAgentId.trim() || !recPrompt.trim() || !recStrategy.trim()) {
      toast.error("Agent ID, prompt, and strategy are required");
      return;
    }
    setRecLoading(true);
    try {
      const res = await fetch("/api/self-improving/record", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId: recAgentId.trim(),
          taskType: recTaskType,
          prompt: recPrompt.trim(),
          strategy: recStrategy.trim(),
          outcome: recOutcome,
          score: recScore,
        }),
      });
      if (res.ok) {
        toast.success("Experience recorded");
        setRecAgentId("");
        setRecPrompt("");
        setRecStrategy("");
        setRecOutcome("success");
        setRecScore(0.5);
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to record experience");
      }
    } catch {
      toast.error("Failed to record experience");
    } finally {
      setRecLoading(false);
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════════

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-5xl max-h-[92vh] overflow-hidden flex flex-col"
        showCloseButton
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-gradient-to-br from-emerald-500/20 to-teal-500/20 border border-emerald-500/30">
              <Brain className="h-4 w-4 text-emerald-400" />
            </div>
            Self-Improving Agents
          </DialogTitle>
          <DialogDescription>
            Optimize prompts, reflect on patterns, get strategy recommendations,
            and evolve agent templates
          </DialogDescription>
        </DialogHeader>

        <Tabs
          value={activeTab}
          onValueChange={setActiveTab}
          className="flex-1 flex flex-col min-h-0"
        >
          <TabsList className="grid w-full grid-cols-4 mb-1 shrink-0">
            <TabsTrigger value="optimize" className="gap-1.5 text-xs">
              <Sparkles className="h-3.5 w-3.5" />
              Optimize
            </TabsTrigger>
            <TabsTrigger value="reflect" className="gap-1.5 text-xs">
              <Lightbulb className="h-3.5 w-3.5" />
              Reflect
            </TabsTrigger>
            <TabsTrigger value="strategy" className="gap-1.5 text-xs">
              <TrendingUp className="h-3.5 w-3.5" />
              Strategy
            </TabsTrigger>
            <TabsTrigger value="evolve" className="gap-1.5 text-xs">
              <Brain className="h-3.5 w-3.5" />
              Evolve
            </TabsTrigger>
          </TabsList>

          {/* ═══ OPTIMIZE TAB ═══ */}
          <TabsContent
            value="optimize"
            className="flex-1 min-h-0 mt-0 overflow-y-auto"
          >
            <ScrollArea className="h-[calc(90vh-200px)]">
              <div className="space-y-5 p-1 pr-4">
                {/* Input Form */}
                <div className="rounded-xl border bg-card p-5 space-y-4">
                  <h4 className="text-sm font-semibold flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-emerald-400" />
                    Optimize Prompt
                  </h4>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium">Task Type</Label>
                      <Select
                        value={optTaskType}
                        onValueChange={(v) => setOptTaskType(v as TaskType)}
                      >
                        <SelectTrigger className="h-9">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="code_gen">Code Gen</SelectItem>
                          <SelectItem value="debug">Debug</SelectItem>
                          <SelectItem value="review">Review</SelectItem>
                          <SelectItem value="deploy">Deploy</SelectItem>
                          <SelectItem value="research">Research</SelectItem>
                          <SelectItem value="general">General</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium">
                        Agent Role
                        <span className="text-muted-foreground ml-1">
                          (optional)
                        </span>
                      </Label>
                      <Input
                        value={optAgentRole}
                        onChange={(e) => setOptAgentRole(e.target.value)}
                        placeholder="e.g., senior-engineer"
                        className="h-9"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">
                      Current Prompt
                    </Label>
                    <Textarea
                      value={optCurrentPrompt}
                      onChange={(e) => setOptCurrentPrompt(e.target.value)}
                      placeholder="Enter the prompt you want to optimize..."
                      className="min-h-[120px] resize-none"
                    />
                  </div>

                  <div className="flex items-center justify-end">
                    <Button
                      size="sm"
                      onClick={optimizePrompt}
                      disabled={optLoading || !optCurrentPrompt.trim()}
                      className="h-9 text-xs gap-1.5 min-w-[150px]"
                    >
                      {optLoading ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Sparkles className="h-3.5 w-3.5" />
                      )}
                      Optimize Prompt
                    </Button>
                  </div>
                </div>

                {/* Optimized Result */}
                {optOptimizedPrompt && (
                  <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-5 space-y-3">
                    <div className="flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-emerald-400" />
                      <h4 className="text-sm font-semibold text-emerald-400">
                        Optimized Prompt
                      </h4>
                    </div>
                    <Textarea
                      value={optOptimizedPrompt}
                      readOnly
                      className="min-h-[150px] resize-none bg-background"
                    />
                  </div>
                )}
              </div>
            </ScrollArea>
          </TabsContent>

          {/* ═══ REFLECT TAB ═══ */}
          <TabsContent
            value="reflect"
            className="flex-1 min-h-0 mt-0 overflow-y-auto"
          >
            <ScrollArea className="h-[calc(90vh-200px)]">
              <div className="space-y-5 p-1 pr-4">
                {/* Input Form */}
                <div className="rounded-xl border bg-card p-5 space-y-4">
                  <h4 className="text-sm font-semibold flex items-center gap-2">
                    <Lightbulb className="h-4 w-4 text-amber-400" />
                    Run Reflection
                  </h4>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium">
                        Agent ID
                        <span className="text-muted-foreground ml-1">
                          (optional)
                        </span>
                      </Label>
                      <Input
                        value={refAgentId}
                        onChange={(e) => setRefAgentId(e.target.value)}
                        placeholder="Leave empty for all agents"
                        className="h-9 font-mono text-xs"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium">
                        Since Date
                        <span className="text-muted-foreground ml-1">
                          (optional)
                        </span>
                      </Label>
                      <Input
                        type="date"
                        value={refSince}
                        onChange={(e) => setRefSince(e.target.value)}
                        className="h-9"
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-end">
                    <Button
                      size="sm"
                      onClick={runReflection}
                      disabled={refLoading}
                      className="h-9 text-xs gap-1.5 min-w-[150px]"
                    >
                      {refLoading ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Lightbulb className="h-3.5 w-3.5" />
                      )}
                      Run Reflection
                    </Button>
                  </div>
                </div>

                {/* Reflection Results */}
                {refResult && (
                  <div className="space-y-4">
                    {/* Overall Trend */}
                    <div className="rounded-xl border bg-card p-5 space-y-3">
                      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        Overall Trend
                      </h4>
                      <div className="flex items-center gap-3">
                        <Badge
                          className={cn(
                            "h-7 text-xs border gap-1.5 px-3",
                            trendColor(refResult.overallTrend)
                          )}
                        >
                          {trendIcon(refResult.overallTrend)}
                          {refResult.overallTrend.charAt(0).toUpperCase() +
                            refResult.overallTrend.slice(1)}
                        </Badge>
                      </div>
                    </div>

                    {/* Patterns */}
                    {refResult.patterns.length > 0 && (
                      <div className="rounded-xl border bg-card p-5 space-y-3">
                        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                          Patterns Detected
                        </h4>
                        <div className="space-y-2">
                          {refResult.patterns.map((p, i) => (
                            <div
                              key={i}
                              className="flex items-start gap-3 rounded-lg bg-muted/30 p-3"
                            >
                              <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-blue-500/15 text-blue-400 shrink-0 text-xs font-bold">
                                {p.frequency}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="text-xs">{p.pattern}</div>
                                <div className="flex items-center gap-2 mt-1">
                                  <span className="text-[10px] text-muted-foreground">
                                    Freq: {p.frequency}
                                  </span>
                                  <span className="text-[10px] text-muted-foreground">
                                    Impact: {p.impact.toFixed(2)}
                                  </span>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Suggestions */}
                    {refResult.suggestions.length > 0 && (
                      <div className="rounded-xl border bg-card p-5 space-y-3">
                        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                          Suggestions
                        </h4>
                        <div className="space-y-2">
                          {refResult.suggestions.map((s, i) => (
                            <div
                              key={i}
                              className="flex items-start gap-3 rounded-lg bg-muted/30 p-3"
                            >
                              <div className="flex items-center justify-center h-7 w-7 rounded-lg bg-muted shrink-0">
                                {suggestionTypeIcon(s.type)}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="text-xs">{s.description}</div>
                                <div className="flex items-center gap-2 mt-1">
                                  <Badge
                                    className={cn(
                                      "h-4 text-[9px] border",
                                      priorityColor(s.priority)
                                    )}
                                  >
                                    {s.priority}
                                  </Badge>
                                  <span className="text-[10px] text-muted-foreground">
                                    {s.type.replace(/_/g, " ")}
                                  </span>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {refResult.patterns.length === 0 &&
                      refResult.suggestions.length === 0 && (
                        <div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
                          <Lightbulb className="h-8 w-8 mx-auto mb-2 opacity-30" />
                          <p className="text-sm">No patterns or suggestions found</p>
                          <p className="text-xs mt-1">
                            Record more experiences to enable reflection
                          </p>
                        </div>
                      )}
                  </div>
                )}
              </div>
            </ScrollArea>
          </TabsContent>

          {/* ═══ STRATEGY TAB ═══ */}
          <TabsContent
            value="strategy"
            className="flex-1 min-h-0 mt-0 overflow-y-auto"
          >
            <ScrollArea className="h-[calc(90vh-200px)]">
              <div className="space-y-5 p-1 pr-4">
                {/* Input Form */}
                <div className="rounded-xl border bg-card p-5 space-y-4">
                  <h4 className="text-sm font-semibold flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-teal-400" />
                    Get Strategy Recommendation
                  </h4>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium">Task Type</Label>
                      <Select
                        value={strTaskType}
                        onValueChange={(v) => setStrTaskType(v as TaskType)}
                      >
                        <SelectTrigger className="h-9">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="code_gen">Code Gen</SelectItem>
                          <SelectItem value="debug">Debug</SelectItem>
                          <SelectItem value="review">Review</SelectItem>
                          <SelectItem value="deploy">Deploy</SelectItem>
                          <SelectItem value="research">Research</SelectItem>
                          <SelectItem value="general">General</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium">
                        Agent ID
                        <span className="text-muted-foreground ml-1">
                          (optional)
                        </span>
                      </Label>
                      <Input
                        value={strAgentId}
                        onChange={(e) => setStrAgentId(e.target.value)}
                        placeholder="Leave empty for global"
                        className="h-9 font-mono text-xs"
                      />
                    </div>
                  </div>

                  <div>
                    <Label className="text-xs font-medium mb-2 block">
                      Constraints
                      <span className="text-muted-foreground ml-1">
                        (optional)
                      </span>
                    </Label>
                    <div className="grid grid-cols-3 gap-3">
                      <div className="space-y-1.5">
                        <Label className="text-[10px] text-muted-foreground">
                          Max Latency (ms)
                        </Label>
                        <Input
                          type="number"
                          value={strMaxLatency}
                          onChange={(e) => setStrMaxLatency(e.target.value)}
                          placeholder="—"
                          className="h-8 text-xs"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-[10px] text-muted-foreground">
                          Max Cost ($)
                        </Label>
                        <Input
                          type="number"
                          value={strMaxCost}
                          onChange={(e) => setStrMaxCost(e.target.value)}
                          placeholder="—"
                          className="h-8 text-xs"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-[10px] text-muted-foreground">
                          Min Quality (0-1)
                        </Label>
                        <Input
                          type="number"
                          value={strMinQuality}
                          onChange={(e) => setStrMinQuality(e.target.value)}
                          placeholder="—"
                          min="0"
                          max="1"
                          step="0.1"
                          className="h-8 text-xs"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-end">
                    <Button
                      size="sm"
                      onClick={getRecommendation}
                      disabled={strLoading}
                      className="h-9 text-xs gap-1.5 min-w-[170px]"
                    >
                      {strLoading ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <TrendingUp className="h-3.5 w-3.5" />
                      )}
                      Get Recommendation
                    </Button>
                  </div>
                </div>

                {/* Recommendation Result */}
                {strResult && (
                  <div className="space-y-4">
                    <div className="rounded-xl border border-teal-500/30 bg-teal-500/5 p-5 space-y-4">
                      <h4 className="text-sm font-semibold flex items-center gap-2 text-teal-400">
                        <TrendingUp className="h-4 w-4" />
                        Recommended Strategy
                      </h4>

                      <div className="grid grid-cols-3 gap-3">
                        <div className="rounded-lg bg-muted/50 p-3">
                          <div className="text-[10px] text-muted-foreground mb-1">
                            Strategy
                          </div>
                          <div className="text-sm font-medium font-mono truncate">
                            {strResult.strategy}
                          </div>
                        </div>
                        <div className="rounded-lg bg-muted/50 p-3">
                          <div className="text-[10px] text-muted-foreground mb-1">
                            Model
                          </div>
                          <div className="text-sm font-medium font-mono truncate">
                            {strResult.model}
                          </div>
                        </div>
                        <div className="rounded-lg bg-muted/50 p-3">
                          <div className="text-[10px] text-muted-foreground mb-1">
                            Confidence
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="text-sm font-bold">
                              {(strResult.confidence * 100).toFixed(0)}%
                            </div>
                            <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                              <div
                                className={cn(
                                  "h-full rounded-full transition-all",
                                  strResult.confidence >= 0.7
                                    ? "bg-emerald-500"
                                    : strResult.confidence >= 0.4
                                      ? "bg-amber-500"
                                      : "bg-red-500"
                                )}
                                style={{
                                  width: `${strResult.confidence * 100}%`,
                                }}
                              />
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Reasoning */}
                      <div className="space-y-1.5">
                        <Label className="text-[10px] text-muted-foreground">
                          Reasoning
                        </Label>
                        <div className="rounded-md bg-muted/30 p-3 text-xs leading-relaxed">
                          {strResult.reasoning}
                        </div>
                      </div>
                    </div>

                    {/* Alternatives */}
                    {strResult.alternatives &&
                      strResult.alternatives.length > 0 && (
                        <div className="rounded-xl border bg-card p-5 space-y-3">
                          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                            Alternatives
                          </h4>
                          <div className="space-y-2">
                            {strResult.alternatives.map((alt, i) => (
                              <div
                                key={i}
                                className="flex items-center gap-3 rounded-lg bg-muted/30 p-3"
                              >
                                <div className="flex items-center justify-center h-6 w-6 rounded-full bg-muted text-[10px] font-bold shrink-0">
                                  {i + 2}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <span className="text-xs font-mono">
                                    {alt.strategy}
                                  </span>
                                </div>
                                <Badge
                                  variant="secondary"
                                  className="h-5 text-[10px]"
                                >
                                  {(alt.confidence * 100).toFixed(0)}%
                                </Badge>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                  </div>
                )}
              </div>
            </ScrollArea>
          </TabsContent>

          {/* ═══ EVOLVE TAB ═══ */}
          <TabsContent
            value="evolve"
            className="flex-1 min-h-0 mt-0 overflow-y-auto"
          >
            <ScrollArea className="h-[calc(90vh-200px)]">
              <div className="space-y-5 p-1 pr-4">
                {/* Evolve Templates */}
                <div className="rounded-xl border bg-card p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-semibold flex items-center gap-2">
                      <Brain className="h-4 w-4 text-purple-400" />
                      Evolve Templates
                    </h4>
                    <Button
                      size="sm"
                      onClick={evolveTemplates}
                      disabled={evoLoading}
                      className="h-8 text-xs gap-1.5 min-w-[140px]"
                    >
                      {evoLoading ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Brain className="h-3.5 w-3.5" />
                      )}
                      Evolve Templates
                    </Button>
                  </div>

                  {evoResult && (
                    <div className="grid grid-cols-3 gap-3">
                      <div className="rounded-lg bg-emerald-500/10 p-4 text-center">
                        <div className="text-[10px] text-emerald-400 mb-1">
                          Created
                        </div>
                        <div className="text-2xl font-bold text-emerald-400">
                          {evoResult.created}
                        </div>
                      </div>
                      <div className="rounded-lg bg-blue-500/10 p-4 text-center">
                        <div className="text-[10px] text-blue-400 mb-1">
                          Updated
                        </div>
                        <div className="text-2xl font-bold text-blue-400">
                          {evoResult.updated}
                        </div>
                      </div>
                      <div className="rounded-lg bg-red-500/10 p-4 text-center">
                        <div className="text-[10px] text-red-400 mb-1">
                          Deprecated
                        </div>
                        <div className="text-2xl font-bold text-red-400">
                          {evoResult.deprecated}
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <Separator />

                {/* Record Experience Form */}
                <div className="rounded-xl border bg-card p-5 space-y-4">
                  <h4 className="text-sm font-semibold flex items-center gap-2">
                    <Lightbulb className="h-4 w-4 text-amber-400" />
                    Record Experience
                  </h4>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium">
                        Agent ID <span className="text-red-400 ml-0.5">*</span>
                      </Label>
                      <Input
                        value={recAgentId}
                        onChange={(e) => setRecAgentId(e.target.value)}
                        placeholder="e.g., agent-001"
                        className="h-9 font-mono text-xs"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium">Task Type</Label>
                      <Select
                        value={recTaskType}
                        onValueChange={(v) => setRecTaskType(v as TaskType)}
                      >
                        <SelectTrigger className="h-9">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="code_gen">Code Gen</SelectItem>
                          <SelectItem value="debug">Debug</SelectItem>
                          <SelectItem value="review">Review</SelectItem>
                          <SelectItem value="deploy">Deploy</SelectItem>
                          <SelectItem value="research">Research</SelectItem>
                          <SelectItem value="general">General</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">
                      Prompt <span className="text-red-400 ml-0.5">*</span>
                    </Label>
                    <Textarea
                      value={recPrompt}
                      onChange={(e) => setRecPrompt(e.target.value)}
                      placeholder="The prompt that was used for this experience..."
                      className="min-h-[80px] resize-none"
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium">
                        Strategy <span className="text-red-400 ml-0.5">*</span>
                      </Label>
                      <Input
                        value={recStrategy}
                        onChange={(e) => setRecStrategy(e.target.value)}
                        placeholder="e.g., chain-of-thought"
                        className="h-9"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium">Outcome</Label>
                      <Select
                        value={recOutcome}
                        onValueChange={(v) => setRecOutcome(v as Outcome)}
                      >
                        <SelectTrigger className="h-9">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="success">Success</SelectItem>
                          <SelectItem value="partial">Partial</SelectItem>
                          <SelectItem value="failure">Failure</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Score Slider */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-medium">Score</Label>
                      <span className="text-xs font-mono text-muted-foreground">
                        {recScore.toFixed(2)}
                      </span>
                    </div>
                    <Slider
                      value={[recScore]}
                      onValueChange={(v) => setRecScore(v[0])}
                      min={0}
                      max={1}
                      step={0.01}
                      className="w-full"
                    />
                    <div className="flex justify-between text-[10px] text-muted-foreground">
                      <span>0</span>
                      <span>0.5</span>
                      <span>1</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-end">
                    <Button
                      size="sm"
                      onClick={recordExperience}
                      disabled={
                        recLoading ||
                        !recAgentId.trim() ||
                        !recPrompt.trim() ||
                        !recStrategy.trim()
                      }
                      className="h-9 text-xs gap-1.5 min-w-[130px]"
                    >
                      {recLoading ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Lightbulb className="h-3.5 w-3.5" />
                      )}
                      Record
                    </Button>
                  </div>
                </div>
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

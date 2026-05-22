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
  Brain,
  TrendingUp,
  Lightbulb,
  Loader2,
  BookOpen,
  Layers,
  BarChart3,
  Sparkles,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ───────────────────────────────────────────────────────────────────

interface Trajectory {
  id: string;
  agentId: string;
  taskType: string;
  score: number;
  outcome: "success" | "partial" | "failure";
  steps: number;
  createdAt: string;
}

interface ReasoningEntry {
  id: string;
  agentId: string;
  chainOfThought: string;
  taskType: string;
  quality: number;
  createdAt: string;
}

interface Strategy {
  id: string;
  name: string;
  taskType: string;
  confidence: number;
  usageCount: number;
  successRate: number;
  lastUsed: string;
}

interface SONALearningPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function outcomeColor(outcome: string) {
  switch (outcome) {
    case "success":
      return "bg-emerald-500/15 text-emerald-400 border-emerald-500/30";
    case "partial":
      return "bg-amber-500/15 text-amber-400 border-amber-500/30";
    case "failure":
      return "bg-red-500/15 text-red-400 border-red-500/30";
    default:
      return "bg-zinc-500/15 text-zinc-400 border-zinc-500/30";
  }
}

// ─── Component ───────────────────────────────────────────────────────────────

export function SONALearningPanel({ open, onOpenChange }: SONALearningPanelProps) {
  const [activeTab, setActiveTab] = useState("trajectories");

  // ══ Trajectories Tab State ══
  const [trajectories, setTrajectories] = useState<Trajectory[]>([]);
  const [loadingTrajectories, setLoadingTrajectories] = useState(false);
  const [trajFilter, setTrajFilter] = useState("all");

  // ══ Reasoning Tab State ══
  const [reasoningEntries, setReasoningEntries] = useState<ReasoningEntry[]>([]);
  const [loadingReasoning, setLoadingReasoning] = useState(false);
  const [expandedReasoning, setExpandedReasoning] = useState<string | null>(null);

  // ══ Strategies Tab State ══
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [loadingStrategies, setLoadingStrategies] = useState(false);
  const [stratFilter, setStratFilter] = useState("all");

  // ── Fetch data on open ──
  const fetchTrajectories = useCallback(async () => {
    setLoadingTrajectories(true);
    try {
      const params = trajFilter !== "all" ? `?outcome=${trajFilter}` : "";
      const res = await fetch(`/api/sona/trajectories${params}`);
      if (res.ok) {
        const data = await res.json();
        setTrajectories(data.trajectories || []);
      }
    } catch {
      toast.error("Failed to load trajectories");
    } finally {
      setLoadingTrajectories(false);
    }
  }, [trajFilter]);

  const fetchReasoning = useCallback(async () => {
    setLoadingReasoning(true);
    try {
      const res = await fetch("/api/sona/reasoning");
      if (res.ok) {
        const data = await res.json();
        setReasoningEntries(data.entries || []);
      }
    } catch {
      toast.error("Failed to load reasoning entries");
    } finally {
      setLoadingReasoning(false);
    }
  }, []);

  const fetchStrategies = useCallback(async () => {
    setLoadingStrategies(true);
    try {
      const params = stratFilter !== "all" ? `?taskType=${stratFilter}` : "";
      const res = await fetch(`/api/sona/strategies${params}`);
      if (res.ok) {
        const data = await res.json();
        setStrategies(data.strategies || []);
      }
    } catch {
      toast.error("Failed to load strategies");
    } finally {
      setLoadingStrategies(false);
    }
  }, [stratFilter]);

  useEffect(() => {
    if (open) {
      fetchTrajectories();
      fetchReasoning();
      fetchStrategies();
    }
  }, [open, fetchTrajectories, fetchReasoning, fetchStrategies]);

  // ── Learning Curve Visualization ──
  const renderLearningCurve = () => {
    const maxScore = Math.max(...trajectories.map((t) => t.score), 1);
    return (
      <div className="flex items-end gap-1 h-24 px-2">
        {trajectories.slice(0, 20).map((t, i) => (
          <div
            key={i}
            className={cn(
              "flex-1 rounded-t transition-all min-w-[4px]",
              t.score >= 0.7 ? "bg-cyan-500/60" : t.score >= 0.4 ? "bg-teal-500/60" : "bg-red-500/40"
            )}
            style={{ height: `${(t.score / maxScore) * 100}%` }}
            title={`Score: ${t.score.toFixed(2)}`}
          />
        ))}
      </div>
    );
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════════

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-5xl max-h-[92vh] overflow-hidden flex flex-col" showCloseButton>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-gradient-to-br from-cyan-500/20 to-teal-500/20 border border-cyan-500/30">
              <Brain className="h-4 w-4 text-cyan-400" />
            </div>
            SONA Learning
          </DialogTitle>
          <DialogDescription>
            View learning trajectories, reasoning chains, and strategy recommendations
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
          <TabsList className="grid w-full grid-cols-3 mb-1 shrink-0">
            <TabsTrigger value="trajectories" className="gap-1.5 text-xs">
              <TrendingUp className="h-3.5 w-3.5" />
              Trajectories
            </TabsTrigger>
            <TabsTrigger value="reasoning" className="gap-1.5 text-xs">
              <BookOpen className="h-3.5 w-3.5" />
              Reasoning
            </TabsTrigger>
            <TabsTrigger value="strategies" className="gap-1.5 text-xs">
              <Sparkles className="h-3.5 w-3.5" />
              Strategies
            </TabsTrigger>
          </TabsList>

          {/* ═══ TRAJECTORIES TAB ═══ */}
          <TabsContent value="trajectories" className="flex-1 min-h-0 mt-0 overflow-y-auto">
            <ScrollArea className="h-[calc(90vh-200px)]">
              <div className="space-y-5 p-1 pr-4">
                {/* Learning Curve */}
                <div className="rounded-xl border border-cyan-500/30 bg-cyan-500/5 p-5 space-y-3">
                  <h4 className="text-sm font-semibold flex items-center gap-2 text-cyan-400">
                    <TrendingUp className="h-4 w-4" />
                    Learning Curve
                  </h4>
                  {trajectories.length > 0 ? renderLearningCurve() : (
                    <div className="h-24 flex items-center justify-center text-muted-foreground text-xs">
                      No trajectory data yet
                    </div>
                  )}
                  <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                    <span>Oldest</span>
                    <span>Most Recent</span>
                  </div>
                </div>

                {/* Filter */}
                <div className="flex items-center gap-2">
                  <Label className="text-xs shrink-0">Filter Outcome</Label>
                  <Select value={trajFilter} onValueChange={setTrajFilter}>
                    <SelectTrigger className="h-8 text-sm w-[140px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All</SelectItem>
                      <SelectItem value="success">Success</SelectItem>
                      <SelectItem value="partial">Partial</SelectItem>
                      <SelectItem value="failure">Failure</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Trajectories List */}
                <div className="rounded-xl border bg-card p-5 space-y-3">
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Recorded Trajectories</h4>
                  {loadingTrajectories ? (
                    <div className="flex items-center justify-center py-8 text-muted-foreground">
                      <Loader2 className="h-5 w-5 animate-spin mr-2" />
                      Loading...
                    </div>
                  ) : trajectories.length === 0 ? (
                    <div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
                      <TrendingUp className="h-8 w-8 mx-auto mb-2 opacity-30" />
                      <p className="text-sm">No trajectories found</p>
                      <p className="text-xs mt-1">Run agents to generate learning data</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {trajectories.map((traj) => (
                        <div key={traj.id} className="flex items-center gap-3 rounded-lg bg-muted/30 p-3">
                          <Badge className={cn("h-5 text-[10px] border", outcomeColor(traj.outcome))}>
                            {traj.outcome}
                          </Badge>
                          <div className="min-w-0 flex-1">
                            <span className="text-xs font-medium">{traj.agentId}</span>
                            <span className="text-[10px] text-muted-foreground ml-2">{traj.taskType}</span>
                          </div>
                          <div className="text-right">
                            <div className="text-xs font-bold">{(traj.score * 100).toFixed(0)}%</div>
                            <div className="text-[10px] text-muted-foreground">{traj.steps} steps</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </ScrollArea>
          </TabsContent>

          {/* ═══ REASONING TAB ═══ */}
          <TabsContent value="reasoning" className="flex-1 min-h-0 mt-0 overflow-y-auto">
            <ScrollArea className="h-[calc(90vh-200px)]">
              <div className="space-y-5 p-1 pr-4">
                {loadingReasoning ? (
                  <div className="flex items-center justify-center py-12 text-muted-foreground">
                    <Loader2 className="h-5 w-5 animate-spin mr-2" />
                    Loading reasoning entries...
                  </div>
                ) : reasoningEntries.length === 0 ? (
                  <div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
                    <BookOpen className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">No reasoning entries found</p>
                    <p className="text-xs mt-1">Run agents with chain-of-thought to generate data</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {reasoningEntries.map((entry) => (
                      <div key={entry.id} className="rounded-xl border bg-card p-5 space-y-3">
                        <div
                          className="flex items-center justify-between cursor-pointer"
                          onClick={() => setExpandedReasoning(expandedReasoning === entry.id ? null : entry.id)}
                        >
                          <div className="flex items-center gap-2">
                            <BookOpen className="h-4 w-4 text-teal-400" />
                            <span className="text-sm font-medium">{entry.agentId}</span>
                            <Badge variant="outline" className="h-5 text-[10px]">{entry.taskType}</Badge>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge className={cn("h-5 text-[10px] border", entry.quality >= 0.7 ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" : "bg-amber-500/15 text-amber-400 border-amber-500/30")}>
                              {(entry.quality * 100).toFixed(0)}%
                            </Badge>
                            <ChevronRight className={cn("h-4 w-4 text-muted-foreground transition-transform", expandedReasoning === entry.id && "rotate-90")} />
                          </div>
                        </div>
                        {expandedReasoning === entry.id && (
                          <div className="rounded-lg bg-muted/30 p-4 mt-2">
                            <p className="text-xs leading-relaxed whitespace-pre-wrap">{entry.chainOfThought}</p>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </ScrollArea>
          </TabsContent>

          {/* ═══ STRATEGIES TAB ═══ */}
          <TabsContent value="strategies" className="flex-1 min-h-0 mt-0 overflow-y-auto">
            <ScrollArea className="h-[calc(90vh-200px)]">
              <div className="space-y-5 p-1 pr-4">
                {/* Filter */}
                <div className="flex items-center gap-2">
                  <Label className="text-xs shrink-0">Filter Task Type</Label>
                  <Select value={stratFilter} onValueChange={setStratFilter}>
                    <SelectTrigger className="h-8 text-sm w-[140px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All</SelectItem>
                      <SelectItem value="code_gen">Code Gen</SelectItem>
                      <SelectItem value="debug">Debug</SelectItem>
                      <SelectItem value="research">Research</SelectItem>
                      <SelectItem value="general">General</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {loadingStrategies ? (
                  <div className="flex items-center justify-center py-12 text-muted-foreground">
                    <Loader2 className="h-5 w-5 animate-spin mr-2" />
                    Loading strategies...
                  </div>
                ) : strategies.length === 0 ? (
                  <div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
                    <Sparkles className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">No strategies found</p>
                    <p className="text-xs mt-1">Evolve templates or record experiences to generate strategies</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {strategies.map((strat) => (
                      <div key={strat.id} className="rounded-xl border border-teal-500/30 bg-teal-500/5 p-5 space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Sparkles className="h-4 w-4 text-teal-400" />
                            <span className="text-sm font-semibold">{strat.name}</span>
                          </div>
                          <Badge variant="outline" className="h-5 text-[10px]">{strat.taskType}</Badge>
                        </div>
                        <div className="grid grid-cols-3 gap-3">
                          <div className="rounded-lg bg-muted/50 p-3 text-center">
                            <div className="text-[10px] text-muted-foreground mb-1">Confidence</div>
                            <div className="text-sm font-bold text-teal-400">{(strat.confidence * 100).toFixed(0)}%</div>
                          </div>
                          <div className="rounded-lg bg-muted/50 p-3 text-center">
                            <div className="text-[10px] text-muted-foreground mb-1">Success Rate</div>
                            <div className="text-sm font-bold text-emerald-400">{(strat.successRate * 100).toFixed(0)}%</div>
                          </div>
                          <div className="rounded-lg bg-muted/50 p-3 text-center">
                            <div className="text-[10px] text-muted-foreground mb-1">Usage</div>
                            <div className="text-sm font-bold">{strat.usageCount}</div>
                          </div>
                        </div>
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

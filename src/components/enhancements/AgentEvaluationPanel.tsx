"use client";

import { useState, useEffect, useCallback } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Trophy,
  Play,
  BarChart3,
  History,
  Loader2,
  Target,
  TrendingUp,
  Zap,
  CheckCircle2,
  XCircle,
  Minus,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ───────────────────────────────────────────────────────────────────

interface Benchmark {
  id: string;
  name: string;
  category: string;
  description: string;
  difficulty: "easy" | "medium" | "hard";
  questionCount: number;
}

interface BenchmarkResult {
  benchmarkId: string;
  benchmarkName: string;
  agentName: string;
  score: number;
  maxScore: number;
  percentage: number;
  completedAt: string;
  duration: number;
}

interface LeaderboardEntry {
  agentName: string;
  overallScore: number;
  benchmarksCompleted: number;
  rank: number;
  scores: { category: string; score: number }[];
}

interface AgentEvaluationPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function difficultyColor(d: string) {
  switch (d) {
    case "easy":
      return "bg-emerald-500/15 text-emerald-400 border-emerald-500/30";
    case "medium":
      return "bg-amber-500/15 text-amber-400 border-amber-500/30";
    case "hard":
      return "bg-red-500/15 text-red-400 border-red-500/30";
    default:
      return "bg-zinc-500/15 text-zinc-400 border-zinc-500/30";
  }
}

function scoreIcon(pct: number) {
  if (pct >= 80) return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />;
  if (pct >= 50) return <Minus className="h-3.5 w-3.5 text-amber-400" />;
  return <XCircle className="h-3.5 w-3.5 text-red-400" />;
}

function scoreBarColor(pct: number) {
  if (pct >= 80) return "bg-emerald-500";
  if (pct >= 50) return "bg-amber-500";
  return "bg-red-500";
}

// ─── Component ───────────────────────────────────────────────────────────────

export function AgentEvaluationPanel({ open, onOpenChange }: AgentEvaluationPanelProps) {
  const [activeTab, setActiveTab] = useState("benchmarks");
  const [benchmarks, setBenchmarks] = useState<Benchmark[]>([]);
  const [results, setResults] = useState<BenchmarkResult[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedBenchmark, setSelectedBenchmark] = useState("");
  const [selectedAgent, setSelectedAgent] = useState("");
  const [running, setRunning] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/agent-evaluation");
      if (res.ok) {
        const data = await res.json();
        setBenchmarks(data.benchmarks || []);
        setResults(data.results || []);
        setLeaderboard(data.leaderboard || []);
      }
    } catch {
      toast.error("Failed to load evaluation data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) fetchData();
  }, [open, fetchData]);

  const runBenchmark = async () => {
    if (!selectedBenchmark || !selectedAgent) {
      toast.error("Select a benchmark and agent");
      return;
    }
    setRunning(true);
    try {
      const res = await fetch("/api/agent-evaluation/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ benchmarkId: selectedBenchmark, agentName: selectedAgent }),
      });
      if (res.ok) {
        toast.success("Benchmark started!");
        fetchData();
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to run benchmark");
      }
    } catch {
      toast.error("Failed to run benchmark");
    } finally {
      setRunning(false);
    }
  };

  // Group benchmarks by category
  const categories = Array.from(new Set(benchmarks.map((b) => b.category)));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-5xl max-h-[92vh] overflow-hidden flex flex-col" showCloseButton>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-gradient-to-br from-amber-500/20 to-orange-500/20 border border-amber-500/30">
              <Trophy className="h-4 w-4 text-amber-400" />
            </div>
            Agent Evaluation Suite
          </DialogTitle>
          <DialogDescription>
            Benchmarks, performance tracking, and leaderboard comparisons
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
          <TabsList className="grid w-full grid-cols-3 mb-1 shrink-0">
            <TabsTrigger value="benchmarks" className="gap-1.5 text-xs">
              <Target className="h-3.5 w-3.5" />
              Benchmarks
            </TabsTrigger>
            <TabsTrigger value="leaderboard" className="gap-1.5 text-xs">
              <Trophy className="h-3.5 w-3.5" />
              Leaderboard
            </TabsTrigger>
            <TabsTrigger value="history" className="gap-1.5 text-xs">
              <History className="h-3.5 w-3.5" />
              History
            </TabsTrigger>
          </TabsList>

          {/* ═══ BENCHMARKS TAB ═══ */}
          <TabsContent value="benchmarks" className="flex-1 min-h-0 mt-0 overflow-y-auto">
            <ScrollArea className="h-[calc(90vh-200px)]">
              <div className="space-y-5 p-1 pr-4">
                {/* Run Benchmark */}
                <div className="rounded-xl border bg-card p-5 space-y-4">
                  <h4 className="text-sm font-semibold flex items-center gap-2">
                    <Play className="h-4 w-4 text-amber-400" />
                    Run Benchmark
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium">Benchmark</Label>
                      <Select value={selectedBenchmark} onValueChange={setSelectedBenchmark}>
                        <SelectTrigger className="h-9">
                          <SelectValue placeholder="Select benchmark..." />
                        </SelectTrigger>
                        <SelectContent>
                          {benchmarks.map((b) => (
                            <SelectItem key={b.id} value={b.id}>{b.name} ({b.category})</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium">Agent</Label>
                      <Select value={selectedAgent} onValueChange={setSelectedAgent}>
                        <SelectTrigger className="h-9">
                          <SelectValue placeholder="Select agent..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="claude-3.5">Claude 3.5 Sonnet</SelectItem>
                          <SelectItem value="gpt-4o">GPT-4o</SelectItem>
                          <SelectItem value="gpt-4-turbo">GPT-4 Turbo</SelectItem>
                          <SelectItem value="claude-3-haiku">Claude 3 Haiku</SelectItem>
                          <SelectItem value="local-llama">Local Llama 3</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <Button
                      size="sm"
                      onClick={runBenchmark}
                      disabled={running || !selectedBenchmark || !selectedAgent}
                      className="h-9 text-xs gap-1.5 min-w-[150px]"
                    >
                      {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                      Run Benchmark
                    </Button>
                  </div>
                </div>

                {/* Benchmarks by Category */}
                {loading ? (
                  <div className="flex items-center justify-center py-8 text-muted-foreground">
                    <Loader2 className="h-5 w-5 animate-spin mr-2" />
                    Loading benchmarks...
                  </div>
                ) : categories.length === 0 ? (
                  <div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
                    <Target className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">No benchmarks available</p>
                  </div>
                ) : (
                  categories.map((cat) => (
                    <div key={cat} className="rounded-xl border bg-card p-5 space-y-3">
                      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{cat}</h4>
                      <div className="space-y-2">
                        {benchmarks
                          .filter((b) => b.category === cat)
                          .map((b) => (
                            <div key={b.id} className="flex items-center gap-3 rounded-lg bg-muted/30 p-3">
                              <Badge className={cn("h-5 text-[10px] border", difficultyColor(b.difficulty))}>
                                {b.difficulty}
                              </Badge>
                              <div className="min-w-0 flex-1">
                                <span className="text-sm font-medium">{b.name}</span>
                                <p className="text-[10px] text-muted-foreground truncate">{b.description}</p>
                              </div>
                              <span className="text-[10px] text-muted-foreground shrink-0">{b.questionCount} Qs</span>
                            </div>
                          ))}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
          </TabsContent>

          {/* ═══ LEADERBOARD TAB ═══ */}
          <TabsContent value="leaderboard" className="flex-1 min-h-0 mt-0 overflow-y-auto">
            <ScrollArea className="h-[calc(90vh-200px)]">
              <div className="space-y-5 p-1 pr-4">
                {leaderboard.length === 0 ? (
                  <div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
                    <Trophy className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">No leaderboard data</p>
                    <p className="text-xs mt-1">Run benchmarks to see agent rankings</p>
                  </div>
                ) : (
                  <div className="rounded-xl border bg-card p-5 space-y-3">
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Agent Leaderboard
                    </h4>
                    <div className="space-y-2">
                      {leaderboard.map((entry) => (
                        <div key={entry.agentName} className="rounded-lg bg-muted/30 p-4 space-y-2">
                          <div className="flex items-center gap-3">
                            <div className={cn(
                              "flex items-center justify-center h-7 w-7 rounded-full text-xs font-bold",
                              entry.rank === 1 ? "bg-amber-500/20 text-amber-400 border border-amber-500/30" :
                              entry.rank === 2 ? "bg-zinc-400/20 text-zinc-300 border border-zinc-400/30" :
                              entry.rank === 3 ? "bg-orange-500/20 text-orange-400 border border-orange-500/30" :
                              "bg-zinc-500/15 text-zinc-400 border border-zinc-500/30"
                            )}>
                              {entry.rank}
                            </div>
                            <div className="min-w-0 flex-1">
                              <span className="text-sm font-medium">{entry.agentName}</span>
                              <span className="text-[10px] text-muted-foreground ml-2">{entry.benchmarksCompleted} benchmarks</span>
                            </div>
                            <div className="text-right">
                              <span className="text-sm font-bold">{entry.overallScore.toFixed(1)}%</span>
                            </div>
                          </div>
                          {/* Category Scores Bar Chart */}
                          <div className="flex items-end gap-1 h-12 pl-10">
                            {entry.scores.map((s, i) => {
                              const colors = ["bg-cyan-500/60", "bg-violet-500/60", "bg-amber-500/60", "bg-emerald-500/60"];
                              return (
                                <div key={i} className="flex-1 flex flex-col items-center gap-0.5">
                                  <div
                                    className={cn("w-full rounded-t min-h-[4px]", colors[i % colors.length])}
                                    style={{ height: `${Math.max(s.score, 5)}%` }}
                                    title={`${s.category}: ${s.score.toFixed(1)}%`}
                                  />
                                  <span className="text-[8px] text-muted-foreground truncate w-full text-center">{s.category}</span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </ScrollArea>
          </TabsContent>

          {/* ═══ HISTORY TAB ═══ */}
          <TabsContent value="history" className="flex-1 min-h-0 mt-0 overflow-y-auto">
            <ScrollArea className="h-[calc(90vh-200px)]">
              <div className="space-y-5 p-1 pr-4">
                {results.length === 0 ? (
                  <div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
                    <History className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">No benchmark results yet</p>
                    <p className="text-xs mt-1">Run a benchmark to see scores here</p>
                  </div>
                ) : (
                  <>
                    {/* Score History Chart */}
                    <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-5 space-y-3">
                      <h4 className="text-sm font-semibold flex items-center gap-2 text-amber-400">
                        <BarChart3 className="h-4 w-4" />
                        Score History
                      </h4>
                      <div className="flex items-end gap-1 h-32 px-2">
                        {results.slice(-20).map((r, i) => (
                          <div
                            key={i}
                            className={cn("flex-1 rounded-t min-w-[6px] transition-all", scoreBarColor(r.percentage))}
                            style={{ height: `${Math.max(r.percentage, 3)}%` }}
                            title={`${r.benchmarkName}: ${r.percentage.toFixed(1)}%`}
                          />
                        ))}
                      </div>
                      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                        <span>Oldest</span>
                        <span>Most Recent</span>
                      </div>
                    </div>

                    {/* Results List */}
                    <div className="rounded-xl border bg-card p-5 space-y-3">
                      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Recent Results</h4>
                      <div className="space-y-2">
                        {results.map((r, i) => (
                          <div key={i} className="flex items-center gap-3 rounded-lg bg-muted/30 p-3">
                            {scoreIcon(r.percentage)}
                            <div className="min-w-0 flex-1">
                              <span className="text-xs font-medium">{r.benchmarkName}</span>
                              <span className="text-[10px] text-muted-foreground ml-2">{r.agentName}</span>
                            </div>
                            <div className="text-right shrink-0">
                              <span className="text-sm font-bold">{r.score}/{r.maxScore}</span>
                              <span className="text-[10px] text-muted-foreground ml-1">({r.percentage.toFixed(0)}%)</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

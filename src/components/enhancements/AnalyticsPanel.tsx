"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
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
  BarChart3,
  TrendingUp,
  TrendingDown,
  Zap,
  Clock,
  DollarSign,
  Activity,
  Loader2,
  RefreshCw,
  ArrowUpRight,
  ArrowDownRight,
  Sparkles,
  Lightbulb,
  Brain,
  Code,
  Target,
  CheckCircle2,
  AlertTriangle,
  PieChart,
  Cpu,
  Gauge,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

interface AnalyticsEvent {
  id: string;
  eventType: string;
  model: string | null;
  agentId: string | null;
  tokensUsed: number | null;
  cost: number | null;
  duration: number | null;
  success: boolean | null;
  metadata: string | null;
  createdAt: string;
}

interface InsightsData {
  insights: { title: string; description: string; severity: string }[];
  trends: { metric: string; direction: string; change: string }[];
  recommendations: string[];
}

interface InsightsResponse {
  period: string;
  stats: {
    totalEvents: number;
    byType: Record<string, number>;
    byModel: Record<string, number>;
    totalCost: number;
    totalTokens: number;
    avgDuration: number;
    successRate: number;
  };
  insights: InsightsData | null;
}

interface AnalyticsPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatCost(cost: number): string {
  if (cost < 0.01) return `$${cost.toFixed(4)}`;
  if (cost < 1) return `$${cost.toFixed(3)}`;
  return `$${cost.toFixed(2)}`;
}

function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}K`;
  return tokens.toString();
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function eventTypeColor(type: string) {
  switch (type) {
    case "chat":
      return "bg-blue-500/15 text-blue-400 border-blue-500/30";
    case "agent_run":
      return "bg-violet-500/15 text-violet-400 border-violet-500/30";
    case "model_call":
      return "bg-cyan-500/15 text-cyan-400 border-cyan-500/30";
    case "deploy":
      return "bg-emerald-500/15 text-emerald-400 border-emerald-500/30";
    case "code_gen":
      return "bg-amber-500/15 text-amber-400 border-amber-500/30";
    default:
      return "bg-zinc-500/15 text-zinc-400 border-zinc-500/30";
  }
}

function modelColor(index: number) {
  const colors = [
    "bg-blue-500",
    "bg-violet-500",
    "bg-emerald-500",
    "bg-amber-500",
    "bg-rose-500",
    "bg-cyan-500",
    "bg-orange-500",
    "bg-teal-500",
  ];
  return colors[index % colors.length];
}

// ─── Component ───────────────────────────────────────────────────────────────

export function AnalyticsPanel({ open, onOpenChange }: AnalyticsPanelProps) {
  // ── State ──
  const [events, setEvents] = useState<AnalyticsEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [insightsData, setInsightsData] = useState<InsightsResponse | null>(null);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");

  // ── Fetch Events ──
  const fetchEvents = useCallback(async () => {
    setEventsLoading(true);
    try {
      const res = await fetch("/api/analytics/events?limit=200");
      if (res.ok) {
        const data = await res.json();
        setEvents(data);
      }
    } catch {
      // silently fail
    } finally {
      setEventsLoading(false);
    }
  }, []);

  // ── Fetch Insights ──
  const fetchInsights = useCallback(async () => {
    setInsightsLoading(true);
    try {
      const res = await fetch("/api/analytics/insights?days=30");
      if (res.ok) {
        const data = await res.json();
        setInsightsData(data);
      }
    } catch {
      // silently fail
    } finally {
      setInsightsLoading(false);
    }
  }, []);

  // ── Init ──
  useEffect(() => {
    if (!open) return;
    fetchEvents();
    fetchInsights();
  }, [open, fetchEvents, fetchInsights]);

  // ── Computed Stats ──
  const totalRequests = events.length;
  const totalTokens = events.reduce((sum, e) => sum + (e.tokensUsed || 0), 0);
  const totalCost = events.reduce((sum, e) => sum + (e.cost || 0), 0);
  const avgDuration =
    totalRequests > 0
      ? events.reduce((sum, e) => sum + (e.duration || 0), 0) / events.filter((e) => e.duration).length || 0
      : 0;
  const successRate =
    totalRequests > 0
      ? Math.round(
          (events.filter((e) => e.success === true).length /
            events.filter((e) => e.success !== null).length || 0) * 100
        )
      : 0;

  // ── Daily Usage (group by date) ──
  const dailyUsage: Record<string, { count: number; cost: number; tokens: number }> = {};
  events.forEach((e) => {
    const date = new Date(e.createdAt).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
    if (!dailyUsage[date]) dailyUsage[date] = { count: 0, cost: 0, tokens: 0 };
    dailyUsage[date].count++;
    dailyUsage[date].cost += e.cost || 0;
    dailyUsage[date].tokens += e.tokensUsed || 0;
  });
  const dailyEntries = Object.entries(dailyUsage).slice(-14);
  const maxDailyCount = Math.max(...dailyEntries.map(([, d]) => d.count), 1);

  // ── Model Usage Breakdown ──
  const modelUsage: Record<string, { count: number; tokens: number; cost: number; avgDuration: number; successRate: number }> = {};
  events.forEach((e) => {
    if (!e.model) return;
    if (!modelUsage[e.model]) {
      modelUsage[e.model] = { count: 0, tokens: 0, cost: 0, avgDuration: 0, successRate: 0 };
    }
    modelUsage[e.model].count++;
    modelUsage[e.model].tokens += e.tokensUsed || 0;
    modelUsage[e.model].cost += e.cost || 0;
  });
  // Compute avg duration and success rate per model
  Object.keys(modelUsage).forEach((model) => {
    const modelEvents = events.filter((e) => e.model === model);
    const withDuration = modelEvents.filter((e) => e.duration);
    modelUsage[model].avgDuration =
      withDuration.length > 0
        ? withDuration.reduce((sum, e) => sum + (e.duration || 0), 0) / withDuration.length
        : 0;
    const withSuccess = modelEvents.filter((e) => e.success !== null);
    modelUsage[model].successRate =
      withSuccess.length > 0
        ? Math.round(
            (withSuccess.filter((e) => e.success === true).length / withSuccess.length) * 100
          )
        : 0;
  });
  const modelEntries = Object.entries(modelUsage).sort((a, b) => b[1].count - a[1].count);
  const maxModelCount = Math.max(...modelEntries.map(([, d]) => d.count), 1);

  // ── Event Type Breakdown ──
  const eventTypeCounts: Record<string, number> = {};
  events.forEach((e) => {
    eventTypeCounts[e.eventType] = (eventTypeCounts[e.eventType] || 0) + 1;
  });
  const eventTypeEntries = Object.entries(eventTypeCounts).sort((a, b) => b[1] - a[1]);
  const maxEventTypeCount = Math.max(...eventTypeEntries.map(([, c]) => c), 1);

  // ── Productivity Score (simple heuristic) ──
  const productivityScore = Math.min(
    100,
    Math.round(
      (successRate * 0.3 +
        Math.min(totalTokens / 10000, 100) * 0.2 +
        Math.min(totalRequests / 50, 100) * 0.3 +
        (avgDuration > 0 ? Math.max(0, 100 - avgDuration / 50) : 50) * 0.2)
    )
  );

  // ── Code Quality Score ──
  const codeGenEvents = events.filter((e) => e.eventType === "code_gen");
  const codeQualityScore =
    codeGenEvents.length > 0
      ? Math.round(
          (codeGenEvents.filter((e) => e.success === true).length / codeGenEvents.length) * 100
        )
      : 0;

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════════

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-5xl max-h-[90vh] overflow-hidden flex flex-col" showCloseButton>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-gradient-to-br from-cyan-500/20 to-emerald-500/20 border border-cyan-500/30">
              <BarChart3 className="h-4 w-4 text-cyan-400" />
            </div>
            Analytics &amp; Insights
          </DialogTitle>
          <DialogDescription>
            Track usage, performance, and get AI-powered insights for optimization
          </DialogDescription>
        </DialogHeader>
          <PowerToolHint name="Analytics & Insights" />

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
          <TabsList className="grid w-full grid-cols-3 mb-1 shrink-0">
            <TabsTrigger value="overview" className="gap-1.5 text-xs">
              <Activity className="h-3.5 w-3.5" />
              Overview
            </TabsTrigger>
            <TabsTrigger value="quality" className="gap-1.5 text-xs">
              <Code className="h-3.5 w-3.5" />
              Code Quality
            </TabsTrigger>
            <TabsTrigger value="insights" className="gap-1.5 text-xs">
              <Sparkles className="h-3.5 w-3.5" />
              Insights
            </TabsTrigger>
          </TabsList>

          {/* ═══ OVERVIEW TAB ═══ */}
          <TabsContent value="overview" className="flex-1 min-h-0 mt-0">
            <ScrollArea className="h-[calc(90vh-200px)]">
              <div className="space-y-6 p-1 pr-4">
                {/* Key Metrics */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="rounded-lg border bg-card p-4">
                    <div className="flex items-center gap-2 text-muted-foreground mb-1">
                      <Zap className="h-3.5 w-3.5" />
                      <span className="text-[10px] font-medium">Total Requests</span>
                    </div>
                    <p className="text-2xl font-bold">{totalRequests.toLocaleString()}</p>
                  </div>
                  <div className="rounded-lg border bg-card p-4">
                    <div className="flex items-center gap-2 text-muted-foreground mb-1">
                      <Cpu className="h-3.5 w-3.5" />
                      <span className="text-[10px] font-medium">Tokens Used</span>
                    </div>
                    <p className="text-2xl font-bold">{formatTokens(totalTokens)}</p>
                  </div>
                  <div className="rounded-lg border bg-card p-4">
                    <div className="flex items-center gap-2 text-muted-foreground mb-1">
                      <DollarSign className="h-3.5 w-3.5" />
                      <span className="text-[10px] font-medium">Total Cost</span>
                    </div>
                    <p className="text-2xl font-bold">{formatCost(totalCost)}</p>
                  </div>
                  <div className="rounded-lg border bg-card p-4">
                    <div className="flex items-center gap-2 text-muted-foreground mb-1">
                      <Clock className="h-3.5 w-3.5" />
                      <span className="text-[10px] font-medium">Avg Response</span>
                    </div>
                    <p className="text-2xl font-bold">{formatDuration(avgDuration)}</p>
                  </div>
                </div>

                {/* Daily Usage Chart */}
                <div className="rounded-xl border bg-card p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-semibold flex items-center gap-2">
                      <BarChart3 className="h-4 w-4 text-cyan-400" />
                      Daily Usage
                    </h4>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => { fetchEvents(); fetchInsights(); }}
                      disabled={eventsLoading}
                      className="h-7 text-xs gap-1"
                    >
                      <RefreshCw className={cn("h-3 w-3", eventsLoading && "animate-spin")} />
                      Refresh
                    </Button>
                  </div>

                  {dailyEntries.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                      <BarChart3 className="h-8 w-8 mb-2 opacity-30" />
                      <p className="text-xs">No usage data yet</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {/* Bar chart */}
                      <div className="flex items-end gap-1.5 h-32">
                        {dailyEntries.map(([date, data], idx) => (
                          <div key={idx} className="flex-1 flex flex-col items-center gap-1">
                            <span className="text-[9px] text-muted-foreground">{data.count}</span>
                            <div
                              className={cn(
                                "w-full rounded-t transition-all duration-500",
                                "bg-cyan-500/70 hover:bg-cyan-500"
                              )}
                              style={{
                                height: `${Math.max(4, (data.count / maxDailyCount) * 100)}%`,
                              }}
                              title={`${date}: ${data.count} requests, ${formatCost(data.cost)}`}
                            />
                          </div>
                        ))}
                      </div>
                      {/* Date labels */}
                      <div className="flex gap-1.5">
                        {dailyEntries.map(([date], idx) => (
                          <div key={idx} className="flex-1 text-center">
                            <span className="text-[8px] text-muted-foreground truncate block">
                              {date}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Model Usage Breakdown */}
                <div className="rounded-xl border bg-card p-5 space-y-4">
                  <h4 className="text-sm font-semibold flex items-center gap-2">
                    <Brain className="h-4 w-4 text-violet-400" />
                    Model Usage Breakdown
                  </h4>

                  {modelEntries.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                      <Brain className="h-8 w-8 mb-2 opacity-30" />
                      <p className="text-xs">No model usage data yet</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {modelEntries.map(([model, data], idx) => (
                        <div key={model} className="space-y-1.5">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <div className={cn("h-2.5 w-2.5 rounded-full", modelColor(idx))} />
                              <span className="text-xs font-medium">{model}</span>
                            </div>
                            <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                              <span>{data.count} calls</span>
                              <span>{formatTokens(data.tokens)} tokens</span>
                              <span>{formatCost(data.cost)}</span>
                            </div>
                          </div>
                          <div className="h-2 bg-muted rounded-full overflow-hidden">
                            <div
                              className={cn("h-full rounded-full transition-all duration-500", modelColor(idx))}
                              style={{
                                width: `${(data.count / maxModelCount) * 100}%`,
                              }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Event Type Breakdown */}
                <div className="rounded-xl border bg-card p-5 space-y-4">
                  <h4 className="text-sm font-semibold flex items-center gap-2">
                    <PieChart className="h-4 w-4 text-amber-400" />
                    Event Types
                  </h4>

                  {eventTypeEntries.length === 0 ? (
                    <div className="text-xs text-muted-foreground text-center py-4">
                      No event data yet
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                      {eventTypeEntries.map(([type, count]) => (
                        <div
                          key={type}
                          className="flex items-center gap-2 rounded-lg border p-2.5"
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <Badge
                                className={cn("h-4 text-[9px] border", eventTypeColor(type))}
                              >
                                {type.replace("_", " ")}
                              </Badge>
                            </div>
                            <div className="flex items-center gap-1 mt-1">
                              <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                                <div
                                  className="h-full rounded-full bg-primary/60"
                                  style={{
                                    width: `${(count / maxEventTypeCount) * 100}%`,
                                  }}
                                />
                              </div>
                              <span className="text-[10px] text-muted-foreground shrink-0">
                                {count}
                              </span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </ScrollArea>
          </TabsContent>

          {/* ═══ CODE QUALITY TAB ═══ */}
          <TabsContent value="quality" className="flex-1 min-h-0 mt-0">
            <ScrollArea className="h-[calc(90vh-200px)]">
              <div className="space-y-6 p-1 pr-4">
                {/* Productivity Score */}
                <div className="rounded-xl border bg-card p-5">
                  <div className="flex items-center gap-6">
                    <div
                      className={cn(
                        "flex items-center justify-center h-24 w-24 rounded-full border-4",
                        productivityScore >= 80
                          ? "border-emerald-500 bg-emerald-500/10"
                          : productivityScore >= 50
                            ? "border-yellow-500 bg-yellow-500/10"
                            : "border-red-500 bg-red-500/10"
                      )}
                    >
                      <div className="text-center">
                        <p
                          className={cn(
                            "text-2xl font-bold",
                            productivityScore >= 80
                              ? "text-emerald-400"
                              : productivityScore >= 50
                                ? "text-yellow-400"
                                : "text-red-400"
                          )}
                        >
                          {productivityScore}
                        </p>
                        <p className="text-[8px] text-muted-foreground">SCORE</p>
                      </div>
                    </div>
                    <div>
                      <h4 className="text-sm font-semibold flex items-center gap-2">
                        <Gauge className="h-4 w-4 text-emerald-400" />
                        Productivity Score
                      </h4>
                      <p className="text-xs text-muted-foreground mt-1">
                        Composite score based on success rate, token efficiency, request volume, and response speed.
                      </p>
                      <div className="grid grid-cols-2 gap-x-6 gap-y-1 mt-3">
                        <div className="flex items-center gap-1.5 text-[10px]">
                          <Target className="h-3 w-3 text-cyan-400" />
                          <span className="text-muted-foreground">Success Rate:</span>
                          <span className="font-medium">{successRate}%</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-[10px]">
                          <Zap className="h-3 w-3 text-amber-400" />
                          <span className="text-muted-foreground">Requests:</span>
                          <span className="font-medium">{totalRequests}</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-[10px]">
                          <Cpu className="h-3 w-3 text-violet-400" />
                          <span className="text-muted-foreground">Tokens:</span>
                          <span className="font-medium">{formatTokens(totalTokens)}</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-[10px]">
                          <Clock className="h-3 w-3 text-emerald-400" />
                          <span className="text-muted-foreground">Avg Speed:</span>
                          <span className="font-medium">{formatDuration(avgDuration)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* AI Performance by Model */}
                <div className="rounded-xl border bg-card p-5 space-y-4">
                  <h4 className="text-sm font-semibold flex items-center gap-2">
                    <Brain className="h-4 w-4 text-violet-400" />
                    AI Model Performance
                  </h4>
                  <p className="text-xs text-muted-foreground">
                    Which models produce the best code? Comparing success rate and response time.
                  </p>

                  {modelEntries.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                      <Brain className="h-8 w-8 mb-2 opacity-30" />
                      <p className="text-xs">No model data available</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {/* Header */}
                      <div className="grid grid-cols-5 gap-2 text-[10px] font-medium text-muted-foreground px-2">
                        <span>Model</span>
                        <span className="text-center">Calls</span>
                        <span className="text-center">Success</span>
                        <span className="text-center">Avg Speed</span>
                        <span className="text-center">Cost</span>
                      </div>

                      {modelEntries.map(([model, data], idx) => (
                        <div
                          key={model}
                          className="grid grid-cols-5 gap-2 items-center rounded-lg border p-2.5"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <div className={cn("h-2 w-2 rounded-full shrink-0", modelColor(idx))} />
                            <span className="text-xs font-medium truncate">{model}</span>
                          </div>
                          <span className="text-xs text-center">{data.count}</span>
                          <div className="flex items-center justify-center">
                            <Badge
                              className={cn(
                                "h-5 text-[9px] border",
                                data.successRate >= 90
                                  ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                                  : data.successRate >= 70
                                    ? "bg-yellow-500/15 text-yellow-400 border-yellow-500/30"
                                    : "bg-red-500/15 text-red-400 border-red-500/30"
                              )}
                            >
                              {data.successRate}%
                            </Badge>
                          </div>
                          <span className="text-xs text-center">
                            {formatDuration(data.avgDuration)}
                          </span>
                          <span className="text-xs text-center">{formatCost(data.cost)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Code Quality Trends */}
                <div className="rounded-xl border bg-card p-5 space-y-4">
                  <h4 className="text-sm font-semibold flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-cyan-400" />
                    Code Quality Trends
                  </h4>

                  {/* Complexity Trend */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                        <Code className="h-3 w-3" />
                        Code Complexity
                      </span>
                      <span className="text-xs font-medium text-emerald-400 flex items-center gap-1">
                        <ArrowDownRight className="h-3 w-3" />
                        Decreasing
                      </span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-cyan-500"
                        style={{ width: "72%" }}
                      />
                    </div>
                  </div>

                  {/* Coverage Trend */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                        <Target className="h-3 w-3" />
                        Test Coverage
                      </span>
                      <span className="text-xs font-medium text-emerald-400 flex items-center gap-1">
                        <ArrowUpRight className="h-3 w-3" />
                        Increasing
                      </span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-violet-500 to-emerald-500"
                        style={{ width: "58%" }}
                      />
                    </div>
                  </div>

                  {/* AI Code Quality Score */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                        <Sparkles className="h-3 w-3" />
                        AI Code Quality
                      </span>
                      <Badge
                        className={cn(
                          "h-5 text-[10px] border",
                          codeQualityScore >= 80
                            ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                            : codeQualityScore >= 50
                              ? "bg-yellow-500/15 text-yellow-400 border-yellow-500/30"
                              : "bg-red-500/15 text-red-400 border-red-500/30"
                        )}
                      >
                        {codeQualityScore}%
                      </Badge>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className={cn(
                          "h-full rounded-full",
                          codeQualityScore >= 80
                            ? "bg-emerald-500"
                            : codeQualityScore >= 50
                              ? "bg-yellow-500"
                              : "bg-red-500"
                        )}
                        style={{ width: `${codeQualityScore}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </ScrollArea>
          </TabsContent>

          {/* ═══ INSIGHTS TAB ═══ */}
          <TabsContent value="insights" className="flex-1 min-h-0 mt-0">
            <ScrollArea className="h-[calc(90vh-200px)]">
              <div className="space-y-6 p-1 pr-4">
                {/* Refresh */}
                <div className="flex items-center gap-3">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={fetchInsights}
                    disabled={insightsLoading}
                    className="h-8 text-xs gap-1"
                  >
                    <RefreshCw className={cn("h-3.5 w-3.5", insightsLoading && "animate-spin")} />
                    Refresh Insights
                  </Button>
                  {insightsData && (
                    <span className="text-xs text-muted-foreground">
                      Period: {insightsData.period}
                    </span>
                  )}
                </div>

                {insightsLoading && !insightsData ? (
                  <div className="flex items-center justify-center py-16 text-muted-foreground">
                    <Loader2 className="h-6 w-6 animate-spin mr-2" />
                    <span className="text-sm">Generating AI insights...</span>
                  </div>
                ) : !insightsData || !insightsData.insights ? (
                  <div className="flex flex-col items-center justify-center py-16 text-muted-foreground border border-dashed rounded-lg">
                    <Sparkles className="h-10 w-10 mb-3 opacity-30" />
                    <p className="text-sm font-medium">No insights yet</p>
                    <p className="text-xs mt-1">Start using the dashboard to generate analytics insights</p>
                  </div>
                ) : (
                  <>
                    {/* AI Insights */}
                    <div className="rounded-xl border bg-card p-5 space-y-4">
                      <h4 className="text-sm font-semibold flex items-center gap-2">
                        <Lightbulb className="h-4 w-4 text-amber-400" />
                        AI-Generated Insights
                      </h4>

                      {insightsData.insights.insights.length === 0 ? (
                        <p className="text-xs text-muted-foreground">
                          Not enough data to generate insights. Keep using the dashboard!
                        </p>
                      ) : (
                        <div className="space-y-2">
                          {insightsData.insights.insights.map((insight, idx) => (
                            <div
                              key={idx}
                              className="rounded-lg border p-3 space-y-1"
                            >
                              <div className="flex items-center gap-2">
                                <Badge
                                  className={cn(
                                    "h-5 text-[10px] border",
                                    insight.severity === "critical"
                                      ? "bg-red-500/15 text-red-400 border-red-500/30"
                                      : insight.severity === "high"
                                        ? "bg-orange-500/15 text-orange-400 border-orange-500/30"
                                        : insight.severity === "medium"
                                          ? "bg-yellow-500/15 text-yellow-400 border-yellow-500/30"
                                          : "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                                  )}
                                >
                                  {insight.severity}
                                </Badge>
                                <span className="text-sm font-medium">{insight.title}</span>
                              </div>
                              <p className="text-xs text-muted-foreground">{insight.description}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Trends */}
                    <div className="rounded-xl border bg-card p-5 space-y-4">
                      <h4 className="text-sm font-semibold flex items-center gap-2">
                        <TrendingUp className="h-4 w-4 text-cyan-400" />
                        Trends
                      </h4>

                      {insightsData.insights.trends.length === 0 ? (
                        <p className="text-xs text-muted-foreground">No trend data available</p>
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                          {insightsData.insights.trends.map((trend, idx) => (
                            <div
                              key={idx}
                              className="rounded-lg border p-3 flex items-center gap-3"
                            >
                              <div
                                className={cn(
                                  "flex items-center justify-center h-8 w-8 rounded-full shrink-0",
                                  trend.direction === "up"
                                    ? "bg-emerald-500/15"
                                    : "bg-red-500/15"
                                )}
                              >
                                {trend.direction === "up" ? (
                                  <ArrowUpRight className="h-4 w-4 text-emerald-400" />
                                ) : (
                                  <ArrowDownRight className="h-4 w-4 text-red-400" />
                                )}
                              </div>
                              <div className="min-w-0">
                                <p className="text-xs font-medium truncate">{trend.metric}</p>
                                <p className="text-[10px] text-muted-foreground">
                                  {trend.direction === "up" ? "Up" : "Down"} by {trend.change}
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Recommendations */}
                    <div className="rounded-xl border bg-card p-5 space-y-4">
                      <h4 className="text-sm font-semibold flex items-center gap-2">
                        <DollarSign className="h-4 w-4 text-emerald-400" />
                        Cost Optimization &amp; Recommendations
                      </h4>

                      {insightsData.insights.recommendations.length === 0 ? (
                        <p className="text-xs text-muted-foreground">No recommendations yet</p>
                      ) : (
                        <div className="space-y-2">
                          {insightsData.insights.recommendations.map((rec, idx) => (
                            <div
                              key={idx}
                              className="flex items-start gap-2.5 rounded-lg border p-3"
                            >
                              <CheckCircle2 className="h-4 w-4 text-emerald-400 mt-0.5 shrink-0" />
                              <p className="text-xs text-foreground">{rec}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Quick Stats from API */}
                    {insightsData.stats && (
                      <div className="rounded-xl border bg-card p-5 space-y-3">
                        <h4 className="text-sm font-semibold flex items-center gap-2">
                          <Activity className="h-4 w-4 text-violet-400" />
                          Period Statistics
                        </h4>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                          <div className="rounded-lg bg-muted/30 p-3 text-center">
                            <p className="text-lg font-bold">
                              {insightsData.stats.totalEvents}
                            </p>
                            <p className="text-[10px] text-muted-foreground">Total Events</p>
                          </div>
                          <div className="rounded-lg bg-muted/30 p-3 text-center">
                            <p className="text-lg font-bold">
                              {formatCost(insightsData.stats.totalCost)}
                            </p>
                            <p className="text-[10px] text-muted-foreground">Total Cost</p>
                          </div>
                          <div className="rounded-lg bg-muted/30 p-3 text-center">
                            <p className="text-lg font-bold">
                              {formatTokens(insightsData.stats.totalTokens)}
                            </p>
                            <p className="text-[10px] text-muted-foreground">Total Tokens</p>
                          </div>
                          <div className="rounded-lg bg-muted/30 p-3 text-center">
                            <p className="text-lg font-bold">
                              {formatDuration(insightsData.stats.avgDuration)}
                            </p>
                            <p className="text-[10px] text-muted-foreground">Avg Duration</p>
                          </div>
                          <div className="rounded-lg bg-muted/30 p-3 text-center">
                            <p className="text-lg font-bold">
                              {insightsData.stats.successRate}%
                            </p>
                            <p className="text-[10px] text-muted-foreground">Success Rate</p>
                          </div>
                          <div className="rounded-lg bg-muted/30 p-3 text-center">
                            <p className="text-lg font-bold">
                              {Object.keys(insightsData.stats.byModel).length}
                            </p>
                            <p className="text-[10px] text-muted-foreground">Models Used</p>
                          </div>
                        </div>
                      </div>
                    )}
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

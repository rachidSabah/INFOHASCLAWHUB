"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { Separator } from "@/components/ui/separator";
import {
  Activity,
  Loader2,
  DollarSign,
  Hash,
  TrendingUp,
  BarChart3,
  Clock,
  Zap,
  ArrowUpRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ───────────────────────────────────────────────────────────────────

interface TokenCount {
  input: number;
  output: number;
  total: number;
}

interface ModelCost {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cost: number;
  color: string;
}

interface ConversationTokenSummary {
  conversationId: string;
  title: string;
  model: string;
  tokens: TokenCount;
  cost: number;
  messageCount: number;
  lastActive: string;
}

interface TimeSeriesPoint {
  timestamp: string;
  tokens: number;
  cost: number;
}

interface TokenTrackingData {
  currentTokens: TokenCount;
  modelCosts: ModelCost[];
  conversations: ConversationTokenSummary[];
  timeSeries: TimeSeriesPoint[];
  totalSpend: number;
  totalTokens: number;
}

interface TokenTrackingPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const MODEL_COLORS = [
  "bg-emerald-500/60",
  "bg-violet-500/60",
  "bg-amber-500/60",
  "bg-cyan-500/60",
  "bg-pink-500/60",
  "bg-fuchsia-500/60",
];

const MODEL_DOT_COLORS = [
  "bg-emerald-400",
  "bg-violet-400",
  "bg-amber-400",
  "bg-cyan-400",
  "bg-pink-400",
  "bg-fuchsia-400",
];

function formatTokens(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

// ─── Component ───────────────────────────────────────────────────────────────

export function TokenTrackingPanel({ open, onOpenChange }: TokenTrackingPanelProps) {
  const [activeTab, setActiveTab] = useState("live");
  const [data, setData] = useState<TokenTrackingData | null>(null);
  const [loading, setLoading] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/token-tracking");
      if (res.ok) {
        const d = await res.json();
        setData(d);
      }
    } catch {
      // silent for auto-refresh
    }
  }, []);

  const fetchInitial = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/token-tracking");
      if (res.ok) {
        const d = await res.json();
        setData(d);
      }
    } catch {
      toast.error("Failed to load token tracking data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) fetchInitial();
  }, [open, fetchInitial]);

  // Auto-refresh every 2s for live counter
  useEffect(() => {
    if (open) {
      intervalRef.current = setInterval(fetchData, 2000);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [open, fetchData]);

  const maxCost = data?.modelCosts.length
    ? Math.max(...data.modelCosts.map((m) => m.cost), 0.01)
    : 1;

  const maxTimeTokens = data?.timeSeries.length
    ? Math.max(...data.timeSeries.map((t) => t.tokens), 1)
    : 1;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-5xl max-h-[92vh] overflow-hidden flex flex-col" showCloseButton>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-gradient-to-br from-amber-500/20 to-orange-500/20 border border-amber-500/30">
              <Activity className="h-4 w-4 text-amber-400" />
            </div>
            Token Tracking
          </DialogTitle>
          <DialogDescription>
            Real-time token counter, per-model cost breakdown, and spending analytics
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
          <TabsList className="grid w-full grid-cols-3 mb-1 shrink-0">
            <TabsTrigger value="live" className="gap-1.5 text-xs">
              <Zap className="h-3.5 w-3.5" />
              Live
            </TabsTrigger>
            <TabsTrigger value="models" className="gap-1.5 text-xs">
              <BarChart3 className="h-3.5 w-3.5" />
              Models
            </TabsTrigger>
            <TabsTrigger value="history" className="gap-1.5 text-xs">
              <TrendingUp className="h-3.5 w-3.5" />
              History
            </TabsTrigger>
          </TabsList>

          {/* ═══ LIVE TAB ═══ */}
          <TabsContent value="live" className="flex-1 min-h-0 mt-0 overflow-y-auto">
            <ScrollArea className="h-[calc(90vh-200px)]">
              <div className="space-y-5 p-1 pr-4">
                {loading ? (
                  <div className="flex items-center justify-center py-12 text-muted-foreground">
                    <Loader2 className="h-5 w-5 animate-spin mr-2" />
                    Loading token data...
                  </div>
                ) : !data ? (
                  <div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
                    <Activity className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">No token data available</p>
                    <p className="text-xs mt-1">Start a conversation to track tokens</p>
                  </div>
                ) : (
                  <>
                    {/* Live Counter */}
                    <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-6 space-y-4">
                      <div className="flex items-center justify-between">
                        <h4 className="text-sm font-semibold text-amber-400 flex items-center gap-2">
                          <Zap className="h-4 w-4 animate-pulse" />
                          Live Token Counter
                        </h4>
                        <Badge className="h-5 text-[10px] border bg-amber-500/15 text-amber-400 border-amber-500/30">
                          <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse mr-1.5" />
                          Live
                        </Badge>
                      </div>
                      <div className="grid grid-cols-3 gap-4">
                        <div className="rounded-lg bg-muted/30 p-4 text-center">
                          <div className="text-2xl font-bold text-emerald-400">{formatTokens(data.currentTokens.input)}</div>
                          <div className="text-[10px] text-muted-foreground mt-1">Input Tokens</div>
                        </div>
                        <div className="rounded-lg bg-muted/30 p-4 text-center">
                          <div className="text-2xl font-bold text-violet-400">{formatTokens(data.currentTokens.output)}</div>
                          <div className="text-[10px] text-muted-foreground mt-1">Output Tokens</div>
                        </div>
                        <div className="rounded-lg bg-muted/30 p-4 text-center">
                          <div className="text-2xl font-bold">{formatTokens(data.currentTokens.total)}</div>
                          <div className="text-[10px] text-muted-foreground mt-1">Total</div>
                        </div>
                      </div>
                    </div>

                    {/* Total Spend */}
                    <div className="rounded-xl border bg-card p-5 space-y-3">
                      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        Total Spend
                      </h4>
                      <div className="flex items-center gap-3">
                        <DollarSign className="h-8 w-8 text-amber-400" />
                        <div>
                          <div className="text-3xl font-bold">${data.totalSpend.toFixed(4)}</div>
                          <div className="text-xs text-muted-foreground">{formatTokens(data.totalTokens)} total tokens</div>
                        </div>
                      </div>
                    </div>

                    {/* Conversations Summary */}
                    <div className="rounded-xl border bg-card p-5 space-y-3">
                      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        Per-Conversation Summary
                      </h4>
                      {data.conversations.length === 0 ? (
                        <div className="rounded-xl border border-dashed p-6 text-center text-muted-foreground">
                          <Hash className="h-6 w-6 mx-auto mb-2 opacity-30" />
                          <p className="text-sm">No conversations tracked</p>
                        </div>
                      ) : (
                        <div className="space-y-2 max-h-60 overflow-y-auto">
                          {data.conversations.map((conv) => (
                            <div key={conv.conversationId} className="flex items-center gap-3 rounded-lg bg-muted/30 p-3">
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-medium truncate">{conv.title}</span>
                                  <Badge variant="outline" className="h-4 text-[9px] shrink-0">{conv.model}</Badge>
                                </div>
                                <div className="flex items-center gap-3 mt-1 text-[10px] text-muted-foreground">
                                  <span>{conv.messageCount} messages</span>
                                  <span>{formatTokens(conv.tokens.total)} tokens</span>
                                  <span className="flex items-center gap-0.5">
                                    <Clock className="h-3 w-3" />
                                    {conv.lastActive}
                                  </span>
                                </div>
                              </div>
                              <div className="text-right shrink-0">
                                <div className="text-sm font-bold">${conv.cost.toFixed(4)}</div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            </ScrollArea>
          </TabsContent>

          {/* ═══ MODELS TAB ═══ */}
          <TabsContent value="models" className="flex-1 min-h-0 mt-0 overflow-y-auto">
            <ScrollArea className="h-[calc(90vh-200px)]">
              <div className="space-y-5 p-1 pr-4">
                {!data || data.modelCosts.length === 0 ? (
                  <div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
                    <BarChart3 className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">No model cost data</p>
                  </div>
                ) : (
                  <>
                    {/* Cost Breakdown Chart */}
                    <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-5 space-y-4">
                      <h4 className="text-sm font-semibold text-amber-400 flex items-center gap-2">
                        <BarChart3 className="h-4 w-4" />
                        Per-Model Cost Breakdown
                      </h4>
                      <div className="flex items-end gap-2 h-40">
                        {data.modelCosts.map((mc, i) => (
                          <div key={mc.model} className="flex-1 flex flex-col items-center gap-1">
                            <span className="text-[10px] font-bold">${mc.cost.toFixed(3)}</span>
                            <div
                              className={cn("w-full rounded-t min-w-[20px] transition-all", MODEL_COLORS[i % MODEL_COLORS.length])}
                              style={{ height: `${(mc.cost / maxCost) * 100}%` }}
                            />
                            <span className="text-[9px] text-muted-foreground truncate w-full text-center">{mc.model}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Detailed Model List */}
                    <div className="rounded-xl border bg-card p-5 space-y-3">
                      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        Model Details
                      </h4>
                      <div className="space-y-3">
                        {data.modelCosts.map((mc, i) => {
                          const totalTokens = mc.inputTokens + mc.outputTokens;
                          const pct = data.totalTokens > 0 ? (totalTokens / data.totalTokens) * 100 : 0;
                          return (
                            <div key={mc.model} className="space-y-2">
                              <div className="flex items-center gap-2">
                                <div className={cn("h-3 w-3 rounded-full", MODEL_DOT_COLORS[i % MODEL_DOT_COLORS.length])} />
                                <span className="text-xs font-medium flex-1">{mc.model}</span>
                                <span className="text-xs text-muted-foreground">{formatTokens(mc.inputTokens)} in / {formatTokens(mc.outputTokens)} out</span>
                                <span className="text-xs font-bold">${mc.cost.toFixed(4)}</span>
                              </div>
                              <div className="h-2 bg-muted rounded-full overflow-hidden">
                                <div
                                  className={cn("h-full rounded-full", MODEL_COLORS[i % MODEL_COLORS.length])}
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </>
                )}
              </div>
            </ScrollArea>
          </TabsContent>

          {/* ═══ HISTORY TAB ═══ */}
          <TabsContent value="history" className="flex-1 min-h-0 mt-0 overflow-y-auto">
            <ScrollArea className="h-[calc(90vh-200px)]">
              <div className="space-y-5 p-1 pr-4">
                {!data || data.timeSeries.length === 0 ? (
                  <div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
                    <TrendingUp className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">No spending history yet</p>
                    <p className="text-xs mt-1">Data accumulates as you use the app</p>
                  </div>
                ) : (
                  <>
                    {/* Spend Over Time Chart */}
                    <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-5 space-y-3">
                      <h4 className="text-sm font-semibold text-amber-400 flex items-center gap-2">
                        <TrendingUp className="h-4 w-4" />
                        Total Spend Over Time
                      </h4>
                      <div className="flex items-end gap-0.5 h-32">
                        {data.timeSeries.map((point, i) => (
                          <div
                            key={i}
                            className="flex-1 bg-amber-500/40 rounded-t min-w-[3px] transition-all"
                            style={{ height: `${(point.tokens / maxTimeTokens) * 100}%` }}
                            title={`${point.timestamp}: ${formatTokens(point.tokens)} tokens, $${point.cost.toFixed(4)}`}
                          />
                        ))}
                      </div>
                      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                        <span>{data.timeSeries[0]?.timestamp}</span>
                        <span>{data.timeSeries[data.timeSeries.length - 1]?.timestamp}</span>
                      </div>
                    </div>

                    {/* Stats Summary */}
                    <div className="rounded-xl border bg-card p-5 space-y-3">
                      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        Spending Summary
                      </h4>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <div className="rounded-lg bg-muted/30 p-3 text-center">
                          <div className="text-lg font-bold">${data.totalSpend.toFixed(4)}</div>
                          <div className="text-[10px] text-muted-foreground">Total Spend</div>
                        </div>
                        <div className="rounded-lg bg-muted/30 p-3 text-center">
                          <div className="text-lg font-bold">{formatTokens(data.totalTokens)}</div>
                          <div className="text-[10px] text-muted-foreground">Total Tokens</div>
                        </div>
                        <div className="rounded-lg bg-muted/30 p-3 text-center">
                          <div className="text-lg font-bold">{data.conversations.length}</div>
                          <div className="text-[10px] text-muted-foreground">Conversations</div>
                        </div>
                        <div className="rounded-lg bg-muted/30 p-3 text-center">
                          <div className="text-lg font-bold flex items-center justify-center gap-0.5 text-amber-400">
                            <ArrowUpRight className="h-4 w-4" />
                            {data.totalTokens > 0 ? `$${((data.totalSpend / data.totalTokens) * 1000).toFixed(4)}` : "$0"}
                          </div>
                          <div className="text-[10px] text-muted-foreground">Per 1K Tokens</div>
                        </div>
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

"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
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
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  FileText,
  Minimize2,
  Pin,
  PinOff,
  Loader2,
  BarChart3,
  DollarSign,
  Hash,
  Trash2,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ───────────────────────────────────────────────────────────────────

interface ContextMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  tokens: number;
  pinned: boolean;
  timestamp: string;
}

interface ContextStats {
  tokensUsed: number;
  maxTokens: number;
  messageCount: number;
  conversationId: string;
  model: string;
  costPer1kTokens: number;
  totalCost: number;
}

interface CostBreakdown {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cost: number;
  percentage: number;
}

interface ContextWindowPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function usagePercent(used: number, max: number) {
  return max > 0 ? Math.min((used / max) * 100, 100) : 0;
}

function usageColor(pct: number) {
  if (pct >= 80) return "bg-red-500";
  if (pct >= 50) return "bg-amber-500";
  return "bg-emerald-500";
}

function usageTextColor(pct: number) {
  if (pct >= 80) return "text-red-400";
  if (pct >= 50) return "text-amber-400";
  return "text-emerald-400";
}

// ─── Component ───────────────────────────────────────────────────────────────

export function ContextWindowPanel({ open, onOpenChange }: ContextWindowPanelProps) {
  const [activeTab, setActiveTab] = useState("usage");
  const [stats, setStats] = useState<ContextStats | null>(null);
  const [messages, setMessages] = useState<ContextMessage[]>([]);
  const [costs, setCosts] = useState<CostBreakdown[]>([]);
  const [loading, setLoading] = useState(false);
  const [compressing, setCompressing] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/context-manager");
      if (res.ok) {
        const data = await res.json();
        setStats(data.stats || null);
        setMessages(data.messages || []);
        setCosts(data.costBreakdown || []);
      }
    } catch {
      toast.error("Failed to load context data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) fetchData();
  }, [open, fetchData]);

  const togglePin = async (msgId: string, currentPinned: boolean) => {
    try {
      const res = await fetch("/api/context-manager/pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageId: msgId, pinned: !currentPinned }),
      });
      if (res.ok) {
        setMessages((prev) =>
          prev.map((m) => (m.id === msgId ? { ...m, pinned: !currentPinned } : m))
        );
        toast.success(currentPinned ? "Message unpinned" : "Message pinned");
      }
    } catch {
      toast.error("Failed to toggle pin");
    }
  };

  const handleCompress = async () => {
    setCompressing(true);
    try {
      const res = await fetch("/api/context-manager/compress", { method: "POST" });
      if (res.ok) {
        toast.success("Context window compressed");
        fetchData();
      } else {
        const data = await res.json();
        toast.error(data.error || "Compression failed");
      }
    } catch {
      toast.error("Failed to compress context");
    } finally {
      setCompressing(false);
    }
  };

  const pct = stats ? usagePercent(stats.tokensUsed, stats.maxTokens) : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-5xl max-h-[92vh] overflow-hidden flex flex-col" showCloseButton>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-gradient-to-br from-cyan-500/20 to-teal-500/20 border border-cyan-500/30">
              <FileText className="h-4 w-4 text-cyan-400" />
            </div>
            Context Window Manager
          </DialogTitle>
          <DialogDescription>
            Visual context usage, auto-summarization, and per-conversation cost breakdown
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
          <TabsList className="grid w-full grid-cols-3 mb-1 shrink-0">
            <TabsTrigger value="usage" className="gap-1.5 text-xs">
              <Hash className="h-3.5 w-3.5" />
              Usage
            </TabsTrigger>
            <TabsTrigger value="messages" className="gap-1.5 text-xs">
              <FileText className="h-3.5 w-3.5" />
              Messages
            </TabsTrigger>
            <TabsTrigger value="cost" className="gap-1.5 text-xs">
              <DollarSign className="h-3.5 w-3.5" />
              Cost
            </TabsTrigger>
          </TabsList>

          {/* ═══ USAGE TAB ═══ */}
          <TabsContent value="usage" className="flex-1 min-h-0 mt-0 overflow-y-auto">
            <ScrollArea className="h-[calc(90vh-200px)]">
              <div className="space-y-5 p-1 pr-4">
                {loading ? (
                  <div className="flex items-center justify-center py-12 text-muted-foreground">
                    <Loader2 className="h-5 w-5 animate-spin mr-2" />
                    Loading context data...
                  </div>
                ) : !stats ? (
                  <div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
                    <FileText className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">No context data available</p>
                    <p className="text-xs mt-1">Start a conversation to see context usage</p>
                  </div>
                ) : (
                  <>
                    {/* Main Progress Bar */}
                    <div className="rounded-xl border bg-card p-6 space-y-4">
                      <div className="flex items-center justify-between">
                        <h4 className="text-sm font-semibold">Context Window Usage</h4>
                        <Badge className={cn("h-5 text-[10px] border", usageTextColor(pct))}>
                          {pct >= 80 && <AlertTriangle className="h-3 w-3 mr-1" />}
                          {pct.toFixed(1)}%
                        </Badge>
                      </div>
                      <div className="space-y-2">
                        <div className="h-4 bg-muted rounded-full overflow-hidden">
                          <div
                            className={cn("h-full rounded-full transition-all duration-500", usageColor(pct))}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span>{stats.tokensUsed.toLocaleString()} tokens used</span>
                          <span>{stats.maxTokens.toLocaleString()} max tokens</span>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <div className="rounded-lg bg-muted/30 p-3 text-center">
                          <div className="text-lg font-bold">{stats.messageCount}</div>
                          <div className="text-[10px] text-muted-foreground">Messages</div>
                        </div>
                        <div className="rounded-lg bg-muted/30 p-3 text-center">
                          <div className={cn("text-lg font-bold", usageTextColor(pct))}>{pct.toFixed(0)}%</div>
                          <div className="text-[10px] text-muted-foreground">Used</div>
                        </div>
                        <div className="rounded-lg bg-muted/30 p-3 text-center">
                          <div className="text-lg font-bold">{((stats.maxTokens - stats.tokensUsed) / 1000).toFixed(1)}k</div>
                          <div className="text-[10px] text-muted-foreground">Remaining</div>
                        </div>
                        <div className="rounded-lg bg-muted/30 p-3 text-center">
                          <div className="text-lg font-bold">${stats.totalCost.toFixed(4)}</div>
                          <div className="text-[10px] text-muted-foreground">Total Cost</div>
                        </div>
                      </div>
                    </div>

                    {/* Compress Action */}
                    <div className="rounded-xl border bg-card p-5 space-y-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="text-sm font-semibold flex items-center gap-2">
                            <Minimize2 className="h-4 w-4 text-cyan-400" />
                            Auto-Compress
                          </h4>
                          <p className="text-xs text-muted-foreground mt-1">
                            Summarize older messages to free up context space
                          </p>
                        </div>
                        <Button
                          size="sm"
                          onClick={handleCompress}
                          disabled={compressing || pct < 50}
                          className="h-9 text-xs gap-1.5 min-w-[140px]"
                        >
                          {compressing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Minimize2 className="h-3.5 w-3.5" />}
                          Compress Now
                        </Button>
                      </div>
                      {pct < 50 && (
                        <p className="text-[10px] text-muted-foreground">Compression available when usage exceeds 50%</p>
                      )}
                    </div>
                  </>
                )}
              </div>
            </ScrollArea>
          </TabsContent>

          {/* ═══ MESSAGES TAB ═══ */}
          <TabsContent value="messages" className="flex-1 min-h-0 mt-0 overflow-y-auto">
            <ScrollArea className="h-[calc(90vh-200px)]">
              <div className="space-y-3 p-1 pr-4">
                {messages.length === 0 ? (
                  <div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
                    <FileText className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">No messages in context</p>
                  </div>
                ) : (
                  messages.map((msg) => (
                    <div
                      key={msg.id}
                      className={cn(
                        "rounded-lg border p-3 space-y-2 transition-colors",
                        msg.pinned ? "border-amber-500/30 bg-amber-500/5" : "bg-card"
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Badge
                            variant="outline"
                            className={cn(
                              "h-5 text-[10px]",
                              msg.role === "user"
                                ? "border-cyan-500/30 text-cyan-400"
                                : msg.role === "assistant"
                                  ? "border-violet-500/30 text-violet-400"
                                  : "border-zinc-500/30 text-zinc-400"
                            )}
                          >
                            {msg.role}
                          </Badge>
                          <span className="text-[10px] text-muted-foreground">{msg.tokens} tokens</span>
                          {msg.pinned && (
                            <Badge className="h-4 text-[9px] bg-amber-500/15 text-amber-400 border-amber-500/30 border">
                              pinned
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => togglePin(msg.id, msg.pinned)}
                          >
                            {msg.pinned ? (
                              <PinOff className="h-3 w-3 text-amber-400" />
                            ) : (
                              <Pin className="h-3 w-3 text-muted-foreground" />
                            )}
                          </Button>
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-2">{msg.content}</p>
                      <span className="text-[9px] text-muted-foreground">{msg.timestamp}</span>
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
          </TabsContent>

          {/* ═══ COST TAB ═══ */}
          <TabsContent value="cost" className="flex-1 min-h-0 mt-0 overflow-y-auto">
            <ScrollArea className="h-[calc(90vh-200px)]">
              <div className="space-y-5 p-1 pr-4">
                {costs.length === 0 ? (
                  <div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
                    <BarChart3 className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">No cost data available</p>
                  </div>
                ) : (
                  <>
                    {/* Cost Breakdown Chart */}
                    <div className="rounded-xl border border-cyan-500/30 bg-cyan-500/5 p-5 space-y-3">
                      <h4 className="text-sm font-semibold flex items-center gap-2 text-cyan-400">
                        <BarChart3 className="h-4 w-4" />
                        Per-Model Cost Breakdown
                      </h4>
                      <div className="space-y-3">
                        {costs.map((c, i) => {
                          const colors = [
                            "bg-cyan-500/60",
                            "bg-violet-500/60",
                            "bg-amber-500/60",
                            "bg-emerald-500/60",
                            "bg-fuchsia-500/60",
                          ];
                          return (
                            <div key={i} className="space-y-1">
                              <div className="flex items-center justify-between text-xs">
                                <span className="font-medium">{c.model}</span>
                                <span className="text-muted-foreground">
                                  {c.inputTokens.toLocaleString()} in / {c.outputTokens.toLocaleString()} out
                                </span>
                                <span className="font-bold">${c.cost.toFixed(4)}</span>
                              </div>
                              <div className="h-2.5 bg-muted rounded-full overflow-hidden">
                                <div
                                  className={cn("h-full rounded-full", colors[i % colors.length])}
                                  style={{ width: `${c.percentage}%` }}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Total Summary */}
                    <div className="rounded-xl border bg-card p-5">
                      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                        Conversation Summary
                      </h4>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="rounded-lg bg-muted/30 p-3 text-center">
                          <div className="text-lg font-bold">${costs.reduce((s, c) => s + c.cost, 0).toFixed(4)}</div>
                          <div className="text-[10px] text-muted-foreground">Total Cost</div>
                        </div>
                        <div className="rounded-lg bg-muted/30 p-3 text-center">
                          <div className="text-lg font-bold">
                            {costs.reduce((s, c) => s + c.inputTokens + c.outputTokens, 0).toLocaleString()}
                          </div>
                          <div className="text-[10px] text-muted-foreground">Total Tokens</div>
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

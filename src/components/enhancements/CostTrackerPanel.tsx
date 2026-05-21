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
  DollarSign,
  BarChart3,
  Bell,
  Plus,
  Loader2,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  CheckCircle2,
  Wallet,
  CreditCard,
  Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ───────────────────────────────────────────────────────────────────

interface Budget {
  id: string;
  name: string;
  limit: number;
  spent: number;
  period: "daily" | "weekly" | "monthly";
  currency: string;
  createdAt: string;
}

interface UsageEntry {
  id: string;
  provider: string;
  model: string;
  tokens: number;
  cost: number;
  timestamp: string;
}

interface CostAlert {
  id: string;
  budgetId: string;
  budgetName: string;
  threshold: number;
  current: number;
  triggered: boolean;
  createdAt: string;
}

interface CostTrackerPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function budgetUsagePercent(budget: Budget) {
  return budget.limit > 0 ? Math.min((budget.spent / budget.limit) * 100, 100) : 0;
}

function budgetBarColor(pct: number) {
  if (pct >= 90) return "bg-red-500";
  if (pct >= 70) return "bg-amber-500";
  return "bg-emerald-500";
}

// ─── Component ───────────────────────────────────────────────────────────────

export function CostTrackerPanel({ open, onOpenChange }: CostTrackerPanelProps) {
  const [activeTab, setActiveTab] = useState("budgets");

  // ══ Budgets Tab State ══
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [loadingBudgets, setLoadingBudgets] = useState(false);
  const [newBudgetName, setNewBudgetName] = useState("");
  const [newBudgetLimit, setNewBudgetLimit] = useState("");
  const [newBudgetPeriod, setNewBudgetPeriod] = useState<Budget["period"]>("monthly");
  const [creatingBudget, setCreatingBudget] = useState(false);

  // ══ Analytics Tab State ══
  const [usage, setUsage] = useState<UsageEntry[]>([]);
  const [loadingUsage, setLoadingUsage] = useState(false);
  const [usageFilter, setUsageFilter] = useState("all");

  // ══ Alerts Tab State ══
  const [alerts, setAlerts] = useState<CostAlert[]>([]);
  const [loadingAlerts, setLoadingAlerts] = useState(false);
  const [newAlertBudgetId, setNewAlertBudgetId] = useState("");
  const [newAlertThreshold, setNewAlertThreshold] = useState("80");
  const [creatingAlert, setCreatingAlert] = useState(false);

  // ── Fetch data on open ──
  const fetchBudgets = useCallback(async () => {
    setLoadingBudgets(true);
    try {
      const res = await fetch("/api/cost/budgets");
      if (res.ok) {
        const data = await res.json();
        setBudgets(data.budgets || []);
      }
    } catch {
      toast.error("Failed to load budgets");
    } finally {
      setLoadingBudgets(false);
    }
  }, []);

  const fetchUsage = useCallback(async () => {
    setLoadingUsage(true);
    try {
      const params = usageFilter !== "all" ? `?provider=${usageFilter}` : "";
      const res = await fetch(`/api/cost/analytics${params}`);
      if (res.ok) {
        const data = await res.json();
        setUsage(data.usage || []);
      }
    } catch {
      toast.error("Failed to load analytics");
    } finally {
      setLoadingUsage(false);
    }
  }, [usageFilter]);

  const fetchAlerts = useCallback(async () => {
    setLoadingAlerts(true);
    try {
      const res = await fetch("/api/cost/alerts");
      if (res.ok) {
        const data = await res.json();
        setAlerts(data.alerts || []);
      }
    } catch {
      toast.error("Failed to load alerts");
    } finally {
      setLoadingAlerts(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      fetchBudgets();
      fetchUsage();
      fetchAlerts();
    }
  }, [open, fetchBudgets, fetchUsage, fetchAlerts]);

  // ── Create Budget ──
  const createBudget = async () => {
    if (!newBudgetName.trim() || !newBudgetLimit) {
      toast.error("Budget name and limit are required");
      return;
    }
    setCreatingBudget(true);
    try {
      const res = await fetch("/api/cost/budgets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newBudgetName.trim(),
          limit: parseFloat(newBudgetLimit),
          period: newBudgetPeriod,
        }),
      });
      if (res.ok) {
        toast.success("Budget created");
        setNewBudgetName("");
        setNewBudgetLimit("");
        fetchBudgets();
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to create budget");
      }
    } catch {
      toast.error("Failed to create budget");
    } finally {
      setCreatingBudget(false);
    }
  };

  // ── Create Alert ──
  const createAlert = async () => {
    if (!newAlertBudgetId || !newAlertThreshold) {
      toast.error("Budget and threshold are required");
      return;
    }
    setCreatingAlert(true);
    try {
      const res = await fetch("/api/cost/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          budgetId: newAlertBudgetId,
          threshold: parseInt(newAlertThreshold, 10),
        }),
      });
      if (res.ok) {
        toast.success("Alert created");
        setNewAlertThreshold("80");
        fetchAlerts();
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to create alert");
      }
    } catch {
      toast.error("Failed to create alert");
    } finally {
      setCreatingAlert(false);
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════════

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-5xl max-h-[92vh] overflow-hidden flex flex-col" showCloseButton>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-gradient-to-br from-amber-500/20 to-yellow-500/20 border border-amber-500/30">
              <DollarSign className="h-4 w-4 text-amber-400" />
            </div>
            Cost Tracker
          </DialogTitle>
          <DialogDescription>
            Create budgets, track spending analytics, and manage cost alerts
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
          <TabsList className="grid w-full grid-cols-3 mb-1 shrink-0">
            <TabsTrigger value="budgets" className="gap-1.5 text-xs">
              <Wallet className="h-3.5 w-3.5" />
              Budgets
            </TabsTrigger>
            <TabsTrigger value="analytics" className="gap-1.5 text-xs">
              <BarChart3 className="h-3.5 w-3.5" />
              Analytics
            </TabsTrigger>
            <TabsTrigger value="alerts" className="gap-1.5 text-xs">
              <Bell className="h-3.5 w-3.5" />
              Alerts
            </TabsTrigger>
          </TabsList>

          {/* ═══ BUDGETS TAB ═══ */}
          <TabsContent value="budgets" className="flex-1 min-h-0 mt-0 overflow-y-auto">
            <ScrollArea className="h-[calc(90vh-200px)]">
              <div className="space-y-5 p-1 pr-4">
                {/* Create Budget */}
                <div className="rounded-xl border bg-card p-5 space-y-4">
                  <h4 className="text-sm font-semibold flex items-center gap-2">
                    <Plus className="h-4 w-4 text-amber-400" />
                    Create Budget
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium">Budget Name</Label>
                      <Input value={newBudgetName} onChange={(e) => setNewBudgetName(e.target.value)} placeholder="e.g., monthly-api" className="h-9" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium">Limit ($)</Label>
                      <Input type="number" value={newBudgetLimit} onChange={(e) => setNewBudgetLimit(e.target.value)} placeholder="e.g., 50" className="h-9" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium">Period</Label>
                      <Select value={newBudgetPeriod} onValueChange={(v) => setNewBudgetPeriod(v as Budget["period"])}>
                        <SelectTrigger className="h-9">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="daily">Daily</SelectItem>
                          <SelectItem value="weekly">Weekly</SelectItem>
                          <SelectItem value="monthly">Monthly</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="flex items-center justify-end">
                    <Button size="sm" onClick={createBudget} disabled={creatingBudget || !newBudgetName.trim() || !newBudgetLimit} className="h-9 text-xs gap-1.5 min-w-[150px]">
                      {creatingBudget ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                      Create Budget
                    </Button>
                  </div>
                </div>

                {/* Budgets List with Progress */}
                <div className="rounded-xl border bg-card p-5 space-y-3">
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Your Budgets</h4>
                  {loadingBudgets ? (
                    <div className="flex items-center justify-center py-8 text-muted-foreground">
                      <Loader2 className="h-5 w-5 animate-spin mr-2" />
                      Loading budgets...
                    </div>
                  ) : budgets.length === 0 ? (
                    <div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
                      <Wallet className="h-8 w-8 mx-auto mb-2 opacity-30" />
                      <p className="text-sm">No budgets found</p>
                      <p className="text-xs mt-1">Create a budget above</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {budgets.map((budget) => {
                        const pct = budgetUsagePercent(budget);
                        return (
                          <div key={budget.id} className="rounded-lg bg-muted/30 p-4 space-y-2">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <CreditCard className="h-4 w-4 text-amber-400" />
                                <span className="text-sm font-medium">{budget.name}</span>
                                <Badge variant="outline" className="h-5 text-[10px]">{budget.period}</Badge>
                              </div>
                              <div className="text-right">
                                <span className="text-sm font-bold">${budget.spent.toFixed(2)}</span>
                                <span className="text-xs text-muted-foreground"> / ${budget.limit.toFixed(2)}</span>
                              </div>
                            </div>
                            <div className="h-2.5 bg-muted rounded-full overflow-hidden">
                              <div className={cn("h-full rounded-full transition-all", budgetBarColor(pct))} style={{ width: `${pct}%` }} />
                            </div>
                            <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                              <span>{pct.toFixed(0)}% used</span>
                              <span>${(budget.limit - budget.spent).toFixed(2)} remaining</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </ScrollArea>
          </TabsContent>

          {/* ═══ ANALYTICS TAB ═══ */}
          <TabsContent value="analytics" className="flex-1 min-h-0 mt-0 overflow-y-auto">
            <ScrollArea className="h-[calc(90vh-200px)]">
              <div className="space-y-5 p-1 pr-4">
                {/* Spending Chart */}
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-5 space-y-3">
                  <h4 className="text-sm font-semibold flex items-center gap-2 text-amber-400">
                    <BarChart3 className="h-4 w-4" />
                    Spending Overview
                  </h4>
                  {usage.length > 0 ? (
                    <div className="flex items-end gap-1 h-32 px-2">
                      {usage.slice(0, 24).map((entry, i) => {
                        const maxCost = Math.max(...usage.slice(0, 24).map((u) => u.cost), 0.01);
                        return (
                          <div
                            key={i}
                            className="flex-1 rounded-t bg-amber-500/60 min-w-[4px] transition-all"
                            style={{ height: `${(entry.cost / maxCost) * 100}%` }}
                            title={`$${entry.cost.toFixed(4)}`}
                          />
                        );
                      })}
                    </div>
                  ) : (
                    <div className="h-32 flex items-center justify-center text-muted-foreground text-xs">No usage data yet</div>
                  )}
                </div>

                {/* Filter */}
                <div className="flex items-center gap-2">
                  <Label className="text-xs shrink-0">Filter Provider</Label>
                  <Select value={usageFilter} onValueChange={setUsageFilter}>
                    <SelectTrigger className="h-8 text-sm w-[140px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All</SelectItem>
                      <SelectItem value="openai">OpenAI</SelectItem>
                      <SelectItem value="anthropic">Anthropic</SelectItem>
                      <SelectItem value="zai">ZAI</SelectItem>
                      <SelectItem value="local">Local</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Usage List */}
                <div className="rounded-xl border bg-card p-5 space-y-3">
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Usage Log</h4>
                  {loadingUsage ? (
                    <div className="flex items-center justify-center py-8 text-muted-foreground">
                      <Loader2 className="h-5 w-5 animate-spin mr-2" />
                      Loading...
                    </div>
                  ) : usage.length === 0 ? (
                    <div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
                      <BarChart3 className="h-8 w-8 mx-auto mb-2 opacity-30" />
                      <p className="text-sm">No usage data</p>
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-96 overflow-y-auto">
                      {usage.map((entry) => (
                        <div key={entry.id} className="flex items-center gap-3 rounded-lg bg-muted/30 p-3">
                          <DollarSign className="h-4 w-4 text-amber-400 shrink-0" />
                          <div className="min-w-0 flex-1">
                            <span className="text-xs font-medium">{entry.provider}/{entry.model}</span>
                            <span className="text-[10px] text-muted-foreground ml-2">{entry.tokens} tokens</span>
                          </div>
                          <span className="text-xs font-bold text-amber-400">${entry.cost.toFixed(4)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </ScrollArea>
          </TabsContent>

          {/* ═══ ALERTS TAB ═══ */}
          <TabsContent value="alerts" className="flex-1 min-h-0 mt-0 overflow-y-auto">
            <ScrollArea className="h-[calc(90vh-200px)]">
              <div className="space-y-5 p-1 pr-4">
                {/* Create Alert */}
                <div className="rounded-xl border bg-card p-5 space-y-4">
                  <h4 className="text-sm font-semibold flex items-center gap-2">
                    <Plus className="h-4 w-4 text-yellow-400" />
                    Create Alert
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium">Budget</Label>
                      <Select value={newAlertBudgetId} onValueChange={setNewAlertBudgetId}>
                        <SelectTrigger className="h-9">
                          <SelectValue placeholder="Choose budget..." />
                        </SelectTrigger>
                        <SelectContent>
                          {budgets.map((b) => (
                            <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium">Threshold (%)</Label>
                      <Input type="number" value={newAlertThreshold} onChange={(e) => setNewAlertThreshold(e.target.value)} placeholder="80" min="1" max="100" className="h-9" />
                    </div>
                    <div className="flex items-end">
                      <Button size="sm" onClick={createAlert} disabled={creatingAlert || !newAlertBudgetId} className="h-9 text-xs gap-1.5 w-full">
                        {creatingAlert ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Bell className="h-3.5 w-3.5" />}
                        Create Alert
                      </Button>
                    </div>
                  </div>
                </div>

                {/* Alerts List */}
                <div className="rounded-xl border bg-card p-5 space-y-3">
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Active Alerts</h4>
                  {loadingAlerts ? (
                    <div className="flex items-center justify-center py-8 text-muted-foreground">
                      <Loader2 className="h-5 w-5 animate-spin mr-2" />
                      Loading alerts...
                    </div>
                  ) : alerts.length === 0 ? (
                    <div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
                      <Bell className="h-8 w-8 mx-auto mb-2 opacity-30" />
                      <p className="text-sm">No alerts configured</p>
                      <p className="text-xs mt-1">Create an alert above</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {alerts.map((alert) => (
                        <div key={alert.id} className={cn("rounded-lg p-3 flex items-center gap-3", alert.triggered ? "bg-red-500/5 border border-red-500/20" : "bg-muted/30")}>
                          {alert.triggered ? <AlertTriangle className="h-4 w-4 text-red-400 shrink-0" /> : <Bell className="h-4 w-4 text-amber-400 shrink-0" />}
                          <div className="min-w-0 flex-1">
                            <div className="text-xs font-medium">{alert.budgetName}</div>
                            <div className="text-[10px] text-muted-foreground">Alert at {alert.threshold}% · Current: {alert.current.toFixed(0)}%</div>
                          </div>
                          <Badge className={cn("h-5 text-[10px] border", alert.triggered ? "bg-red-500/15 text-red-400 border-red-500/30" : "bg-emerald-500/15 text-emerald-400 border-emerald-500/30")}>
                            {alert.triggered ? "Triggered" : "Monitoring"}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

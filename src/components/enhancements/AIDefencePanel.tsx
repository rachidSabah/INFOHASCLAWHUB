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
  Shield,
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  Plus,
  Loader2,
  Activity,
  BarChart3,
  Scan,
  Ban,
  Eye,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ───────────────────────────────────────────────────────────────────

type ThreatLevel = "low" | "medium" | "high" | "critical";

interface DefenceEvent {
  id: string;
  type: "input_scan" | "output_scan" | "rule_violation" | "rate_limit";
  threatLevel: ThreatLevel;
  source: string;
  message: string;
  blocked: boolean;
  timestamp: string;
}

interface DefenceRule {
  id: string;
  name: string;
  type: "blocklist" | "rate_limit" | "content_filter" | "injection_detection";
  active: boolean;
  hits: number;
  description: string;
}

interface DefenceStats {
  totalScans: number;
  threatsBlocked: number;
  activeRules: number;
  threatLevelDistribution: Record<ThreatLevel, number>;
}

interface AIDefencePanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function threatLevelColor(level: ThreatLevel) {
  switch (level) {
    case "critical":
      return "bg-red-500/15 text-red-400 border-red-500/30";
    case "high":
      return "bg-orange-500/15 text-orange-400 border-orange-500/30";
    case "medium":
      return "bg-amber-500/15 text-amber-400 border-amber-500/30";
    case "low":
      return "bg-zinc-500/15 text-zinc-400 border-zinc-500/30";
    default:
      return "bg-zinc-500/15 text-zinc-400 border-zinc-500/30";
  }
}

function threatLevelIcon(level: ThreatLevel) {
  switch (level) {
    case "critical":
      return <ShieldAlert className="h-3.5 w-3.5" />;
    case "high":
      return <AlertTriangle className="h-3.5 w-3.5" />;
    case "medium":
      return <Shield className="h-3.5 w-3.5" />;
    case "low":
      return <ShieldCheck className="h-3.5 w-3.5" />;
    default:
      return <Shield className="h-3.5 w-3.5" />;
  }
}

// ─── Component ───────────────────────────────────────────────────────────────

export function AIDefencePanel({ open, onOpenChange }: AIDefencePanelProps) {
  const [activeTab, setActiveTab] = useState("events");

  // ══ Events Tab State ══
  const [events, setEvents] = useState<DefenceEvent[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [eventFilter, setEventFilter] = useState("all");

  // ══ Rules Tab State ══
  const [rules, setRules] = useState<DefenceRule[]>([]);
  const [loadingRules, setLoadingRules] = useState(false);
  const [newRuleName, setNewRuleName] = useState("");
  const [newRuleType, setNewRuleType] = useState<DefenceRule["type"]>("content_filter");
  const [newRuleDescription, setNewRuleDescription] = useState("");
  const [creatingRule, setCreatingRule] = useState(false);
  const [togglingRuleId, setTogglingRuleId] = useState<string | null>(null);

  // ══ Stats Tab State ══
  const [stats, setStats] = useState<DefenceStats | null>(null);
  const [loadingStats, setLoadingStats] = useState(false);
  const [scanInput, setScanInput] = useState("");
  const [scanningInput, setScanningInput] = useState(false);
  const [scanResult, setScanResult] = useState<{ safe: boolean; threats: string[] } | null>(null);

  // ── Fetch data on open ──
  const fetchEvents = useCallback(async () => {
    setLoadingEvents(true);
    try {
      const params = eventFilter !== "all" ? `?type=${eventFilter}` : "";
      const res = await fetch(`/api/defence/events${params}`);
      if (res.ok) {
        const data = await res.json();
        setEvents(data.events || []);
      }
    } catch {
      toast.error("Failed to load events");
    } finally {
      setLoadingEvents(false);
    }
  }, [eventFilter]);

  const fetchRules = useCallback(async () => {
    setLoadingRules(true);
    try {
      const res = await fetch("/api/defence/rules");
      if (res.ok) {
        const data = await res.json();
        setRules(data.rules || []);
      }
    } catch {
      toast.error("Failed to load rules");
    } finally {
      setLoadingRules(false);
    }
  }, []);

  const fetchStats = useCallback(async () => {
    setLoadingStats(true);
    try {
      const res = await fetch("/api/defence/stats");
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch {
      toast.error("Failed to load stats");
    } finally {
      setLoadingStats(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      fetchEvents();
      fetchRules();
      fetchStats();
    }
  }, [open, fetchEvents, fetchRules, fetchStats]);

  // ── Create Rule ──
  const createRule = async () => {
    if (!newRuleName.trim()) {
      toast.error("Rule name is required");
      return;
    }
    setCreatingRule(true);
    try {
      const res = await fetch("/api/defence/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newRuleName.trim(),
          type: newRuleType,
          description: newRuleDescription.trim(),
        }),
      });
      if (res.ok) {
        toast.success("Defence rule created");
        setNewRuleName("");
        setNewRuleDescription("");
        fetchRules();
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to create rule");
      }
    } catch {
      toast.error("Failed to create rule");
    } finally {
      setCreatingRule(false);
    }
  };

  // ── Toggle Rule ──
  const toggleRule = async (ruleId: string, active: boolean) => {
    setTogglingRuleId(ruleId);
    try {
      const res = await fetch("/api/defence/rules/toggle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ruleId, active }),
      });
      if (res.ok) {
        toast.success(active ? "Rule enabled" : "Rule disabled");
        fetchRules();
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to toggle rule");
      }
    } catch {
      toast.error("Failed to toggle rule");
    } finally {
      setTogglingRuleId(null);
    }
  };

  // ── Scan Input ──
  const scanInputText = async () => {
    if (!scanInput.trim()) {
      toast.error("Input text is required");
      return;
    }
    setScanningInput(true);
    setScanResult(null);
    try {
      const res = await fetch("/api/defence/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: scanInput.trim() }),
      });
      if (res.ok) {
        const data = await res.json();
        setScanResult(data);
        toast.success(data.safe ? "Input is safe" : "Threats detected!");
      } else {
        const data = await res.json();
        toast.error(data.error || "Scan failed");
      }
    } catch {
      toast.error("Scan failed");
    } finally {
      setScanningInput(false);
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
            <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-gradient-to-br from-red-500/20 to-orange-500/20 border border-red-500/30">
              <Shield className="h-4 w-4 text-red-400" />
            </div>
            AI Defence
          </DialogTitle>
          <DialogDescription>
            Scan inputs/outputs, manage defence rules, and monitor threat statistics
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
          <TabsList className="grid w-full grid-cols-3 mb-1 shrink-0">
            <TabsTrigger value="events" className="gap-1.5 text-xs">
              <AlertTriangle className="h-3.5 w-3.5" />
              Events
            </TabsTrigger>
            <TabsTrigger value="rules" className="gap-1.5 text-xs">
              <Ban className="h-3.5 w-3.5" />
              Rules
            </TabsTrigger>
            <TabsTrigger value="stats" className="gap-1.5 text-xs">
              <BarChart3 className="h-3.5 w-3.5" />
              Stats
            </TabsTrigger>
          </TabsList>

          {/* ═══ EVENTS TAB ═══ */}
          <TabsContent value="events" className="flex-1 min-h-0 mt-0 overflow-y-auto">
            <ScrollArea className="h-[calc(90vh-200px)]">
              <div className="space-y-5 p-1 pr-4">
                {/* Shield Status */}
                <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-5 space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center h-12 w-12 rounded-xl bg-gradient-to-br from-red-500/20 to-orange-500/20 border border-red-500/30">
                      <Shield className="h-6 w-6 text-red-400" />
                    </div>
                    <div>
                      <h4 className="text-sm font-semibold text-red-400">Shield Status</h4>
                      <p className="text-xs text-muted-foreground">
                        {stats ? `${stats.activeRules} active rules · ${stats.threatsBlocked} threats blocked` : "Loading..."}
                      </p>
                    </div>
                  </div>
                  {/* Threat Level Meter */}
                  {stats && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                        <span>Threat Distribution</span>
                      </div>
                      <div className="flex h-3 rounded-full overflow-hidden">
                        {(["critical", "high", "medium", "low"] as ThreatLevel[]).map((level) => {
                          const count = stats.threatLevelDistribution[level] || 0;
                          const total = Object.values(stats.threatLevelDistribution).reduce((a, b) => a + b, 0);
                          const pct = total > 0 ? (count / total) * 100 : 0;
                          if (pct === 0) return null;
                          return (
                            <div
                              key={level}
                              className={cn(
                                level === "critical" ? "bg-red-500" : level === "high" ? "bg-orange-500" : level === "medium" ? "bg-amber-500" : "bg-zinc-500"
                              )}
                              style={{ width: `${pct}%` }}
                            />
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                {/* Filter */}
                <div className="flex items-center gap-2">
                  <Label className="text-xs shrink-0">Filter Type</Label>
                  <Select value={eventFilter} onValueChange={setEventFilter}>
                    <SelectTrigger className="h-8 text-sm w-[160px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Events</SelectItem>
                      <SelectItem value="input_scan">Input Scan</SelectItem>
                      <SelectItem value="output_scan">Output Scan</SelectItem>
                      <SelectItem value="rule_violation">Rule Violation</SelectItem>
                      <SelectItem value="rate_limit">Rate Limit</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Events List */}
                <div className="rounded-xl border bg-card p-5 space-y-3">
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Threat Log</h4>
                  {loadingEvents ? (
                    <div className="flex items-center justify-center py-8 text-muted-foreground">
                      <Loader2 className="h-5 w-5 animate-spin mr-2" />
                      Loading events...
                    </div>
                  ) : events.length === 0 ? (
                    <div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
                      <ShieldCheck className="h-8 w-8 mx-auto mb-2 opacity-30" />
                      <p className="text-sm">No threats detected</p>
                      <p className="text-xs mt-1">All clear</p>
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-96 overflow-y-auto">
                      {events.map((event) => (
                        <div key={event.id} className="flex items-start gap-3 rounded-lg bg-muted/30 p-3">
                          <Badge className={cn("h-5 text-[10px] border gap-1 shrink-0", threatLevelColor(event.threatLevel))}>
                            {threatLevelIcon(event.threatLevel)}
                            {event.threatLevel}
                          </Badge>
                          <div className="min-w-0 flex-1">
                            <div className="text-xs font-medium">{event.message}</div>
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-[10px] text-muted-foreground">{event.source}</span>
                              <Badge variant="outline" className="h-4 text-[9px]">{event.type.replace(/_/g, " ")}</Badge>
                              {event.blocked && (
                                <Badge className="bg-red-500/15 text-red-400 border-red-500/30 h-4 text-[9px]">Blocked</Badge>
                              )}
                            </div>
                          </div>
                          <span className="text-[10px] text-muted-foreground shrink-0">{event.timestamp}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </ScrollArea>
          </TabsContent>

          {/* ═══ RULES TAB ═══ */}
          <TabsContent value="rules" className="flex-1 min-h-0 mt-0 overflow-y-auto">
            <ScrollArea className="h-[calc(90vh-200px)]">
              <div className="space-y-5 p-1 pr-4">
                {/* Create Rule */}
                <div className="rounded-xl border bg-card p-5 space-y-4">
                  <h4 className="text-sm font-semibold flex items-center gap-2">
                    <Plus className="h-4 w-4 text-orange-400" />
                    Create Defence Rule
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium">Rule Name</Label>
                      <Input value={newRuleName} onChange={(e) => setNewRuleName(e.target.value)} placeholder="e.g., block-sql-injection" className="h-9" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium">Rule Type</Label>
                      <Select value={newRuleType} onValueChange={(v) => setNewRuleType(v as DefenceRule["type"])}>
                        <SelectTrigger className="h-9">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="blocklist">Blocklist</SelectItem>
                          <SelectItem value="rate_limit">Rate Limit</SelectItem>
                          <SelectItem value="content_filter">Content Filter</SelectItem>
                          <SelectItem value="injection_detection">Injection Detection</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">Description</Label>
                    <Textarea value={newRuleDescription} onChange={(e) => setNewRuleDescription(e.target.value)} placeholder="Describe what this rule does..." className="min-h-[60px] resize-none" />
                  </div>
                  <div className="flex items-center justify-end">
                    <Button size="sm" onClick={createRule} disabled={creatingRule || !newRuleName.trim()} className="h-9 text-xs gap-1.5 min-w-[150px]">
                      {creatingRule ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                      Create Rule
                    </Button>
                  </div>
                </div>

                {/* Rules List */}
                <div className="rounded-xl border bg-card p-5 space-y-3">
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Defence Rules</h4>
                  {loadingRules ? (
                    <div className="flex items-center justify-center py-8 text-muted-foreground">
                      <Loader2 className="h-5 w-5 animate-spin mr-2" />
                      Loading rules...
                    </div>
                  ) : rules.length === 0 ? (
                    <div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
                      <Shield className="h-8 w-8 mx-auto mb-2 opacity-30" />
                      <p className="text-sm">No defence rules</p>
                      <p className="text-xs mt-1">Create a rule above</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {rules.map((rule) => (
                        <div key={rule.id} className="flex items-center gap-3 rounded-lg bg-muted/30 p-3">
                          <div className={cn("flex items-center justify-center h-7 w-7 rounded-lg shrink-0", rule.active ? "bg-emerald-500/15 text-emerald-400" : "bg-zinc-500/15 text-zinc-400")}>
                            <Ban className="h-3.5 w-3.5" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-xs font-medium">{rule.name}</div>
                            <div className="text-[10px] text-muted-foreground">{rule.description || rule.type.replace(/_/g, " ")}</div>
                          </div>
                          <Badge variant="outline" className="h-5 text-[10px]">{rule.hits} hits</Badge>
                          <Button variant="outline" size="sm" className="h-7 text-[10px] gap-1" onClick={() => toggleRule(rule.id, !rule.active)} disabled={togglingRuleId === rule.id}>
                            {togglingRuleId === rule.id ? <Loader2 className="h-3 w-3 animate-spin" /> : rule.active ? <Ban className="h-3 w-3" /> : <Zap className="h-3 w-3" />}
                            {rule.active ? "Disable" : "Enable"}
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </ScrollArea>
          </TabsContent>

          {/* ═══ STATS TAB ═══ */}
          <TabsContent value="stats" className="flex-1 min-h-0 mt-0 overflow-y-auto">
            <ScrollArea className="h-[calc(90vh-200px)]">
              <div className="space-y-5 p-1 pr-4">
                {/* Stats Dashboard */}
                <div className="rounded-xl border border-orange-500/30 bg-orange-500/5 p-5 space-y-4">
                  <h4 className="text-sm font-semibold flex items-center gap-2 text-orange-400">
                    <BarChart3 className="h-4 w-4" />
                    Defence Statistics
                  </h4>
                  {loadingStats ? (
                    <div className="flex items-center justify-center py-8 text-muted-foreground">
                      <Loader2 className="h-5 w-5 animate-spin mr-2" />
                    </div>
                  ) : stats ? (
                    <div className="grid grid-cols-3 gap-3">
                      <div className="rounded-lg bg-muted/50 p-4 text-center">
                        <div className="text-[10px] text-muted-foreground mb-1">Total Scans</div>
                        <div className="text-2xl font-bold">{stats.totalScans}</div>
                      </div>
                      <div className="rounded-lg bg-red-500/10 p-4 text-center">
                        <div className="text-[10px] text-red-400 mb-1">Threats Blocked</div>
                        <div className="text-2xl font-bold text-red-400">{stats.threatsBlocked}</div>
                      </div>
                      <div className="rounded-lg bg-emerald-500/10 p-4 text-center">
                        <div className="text-[10px] text-emerald-400 mb-1">Active Rules</div>
                        <div className="text-2xl font-bold text-emerald-400">{stats.activeRules}</div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center text-xs text-muted-foreground py-4">No stats available</div>
                  )}
                </div>

                {/* Quick Scan */}
                <div className="rounded-xl border bg-card p-5 space-y-4">
                  <h4 className="text-sm font-semibold flex items-center gap-2">
                    <Scan className="h-4 w-4 text-red-400" />
                    Quick Scan
                  </h4>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">Input Text to Scan</Label>
                    <Textarea value={scanInput} onChange={(e) => setScanInput(e.target.value)} placeholder="Paste text to scan for threats..." className="min-h-[80px] resize-none" />
                  </div>
                  <div className="flex items-center justify-end">
                    <Button size="sm" onClick={scanInputText} disabled={scanningInput || !scanInput.trim()} className="h-9 text-xs gap-1.5 min-w-[130px]">
                      {scanningInput ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Scan className="h-3.5 w-3.5" />}
                      Scan Input
                    </Button>
                  </div>
                  {scanResult && (
                    <div className={cn("rounded-lg p-4 border", scanResult.safe ? "bg-emerald-500/5 border-emerald-500/20" : "bg-red-500/5 border-red-500/20")}>
                      <div className="flex items-center gap-2 mb-2">
                        {scanResult.safe ? <ShieldCheck className="h-4 w-4 text-emerald-400" /> : <ShieldAlert className="h-4 w-4 text-red-400" />}
                        <span className={cn("text-sm font-semibold", scanResult.safe ? "text-emerald-400" : "text-red-400")}>
                          {scanResult.safe ? "Safe" : "Threats Detected"}
                        </span>
                      </div>
                      {!scanResult.safe && scanResult.threats.length > 0 && (
                        <div className="space-y-1">
                          {scanResult.threats.map((t, i) => (
                            <div key={i} className="text-xs text-red-400 flex items-center gap-1">
                              <AlertTriangle className="h-3 w-3" />
                              {t}
                            </div>
                          ))}
                        </div>
                      )}
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

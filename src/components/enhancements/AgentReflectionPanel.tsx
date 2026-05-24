"use client";

import { useState, useEffect, useCallback } from "react";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Separator } from "@/components/ui/separator";
import {
  Brain,
  Loader2,
  ToggleLeft,
  Shield,
  BarChart3,
  TrendingUp,
  History,
  CheckCircle2,
  AlertTriangle,
  ArrowUpRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ───────────────────────────────────────────────────────────────────

type StrictnessLevel = "lenient" | "moderate" | "strict";

interface ReflectionConfig {
  enabled: boolean;
  strictness: StrictnessLevel;
  maxRounds: number;
}

interface ReflectionStats {
  totalReflections: number;
  improvementRate: number;
  avgRounds: number;
  avgImprovement: number;
}

interface ReflectionResult {
  id: string;
  agentName: string;
  originalScore: number;
  revisedScore: number;
  improvement: number;
  rounds: number;
  strictness: StrictnessLevel;
  timestamp: string;
  issues: string[];
  improvements: string[];
}

interface AgentReflectionPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function strictnessColor(s: StrictnessLevel) {
  switch (s) {
    case "lenient":
      return "bg-emerald-500/15 text-emerald-400 border-emerald-500/30";
    case "moderate":
      return "bg-amber-500/15 text-amber-400 border-amber-500/30";
    case "strict":
      return "bg-red-500/15 text-red-400 border-red-500/30";
  }
}

// ─── Component ───────────────────────────────────────────────────────────────

export function AgentReflectionPanel({ open, onOpenChange }: AgentReflectionPanelProps) {
  const [config, setConfig] = useState<ReflectionConfig>({
    enabled: false,
    strictness: "moderate",
    maxRounds: 2,
  });
  const [stats, setStats] = useState<ReflectionStats | null>(null);
  const [results, setResults] = useState<ReflectionResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/agent-reflection");
      if (res.ok) {
        const data = await res.json();
        setConfig(data.config || { enabled: false, strictness: "moderate", maxRounds: 2 });
        setStats(data.stats || null);
        setResults(data.results || []);
      }
    } catch {
      toast.error("Failed to load reflection data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) fetchData();
  }, [open, fetchData]);

  const saveConfig = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/agent-reflection/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      if (res.ok) {
        toast.success("Reflection config saved");
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to save config");
      }
    } catch {
      toast.error("Failed to save config");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl max-h-[92vh] overflow-hidden flex flex-col" showCloseButton>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-gradient-to-br from-fuchsia-500/20 to-pink-500/20 border border-fuchsia-500/30">
              <Brain className="h-4 w-4 text-fuchsia-400" />
            </div>
            Agent Self-Reflection
          </DialogTitle>
          <DialogDescription>
            LLM-based self-critique controls for improved agent output quality
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 min-h-0">
          <div className="space-y-5 p-1 pr-4">
            {loading ? (
              <div className="flex items-center justify-center py-12 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin mr-2" />
                Loading reflection settings...
              </div>
            ) : (
              <>
                {/* Enable/Disable Toggle */}
                <div className="rounded-xl border bg-card p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "flex items-center justify-center h-10 w-10 rounded-lg",
                        config.enabled ? "bg-fuchsia-500/10 border border-fuchsia-500/30" : "bg-zinc-700/30 border border-zinc-700/50"
                      )}>
                        <ToggleLeft className={cn("h-5 w-5", config.enabled ? "text-fuchsia-400" : "text-zinc-500")} />
                      </div>
                      <div>
                        <h4 className="text-sm font-semibold">Self-Reflection</h4>
                        <p className="text-xs text-muted-foreground">
                          {config.enabled ? "Agent will critique and revise its own output" : "Agent runs without self-critique"}
                        </p>
                      </div>
                    </div>
                    <Switch
                      checked={config.enabled}
                      onCheckedChange={(checked) => setConfig((prev) => ({ ...prev, enabled: checked }))}
                    />
                  </div>
                </div>

                {/* Configuration */}
                <div className="rounded-xl border bg-card p-5 space-y-5">
                  <h4 className="text-sm font-semibold flex items-center gap-2">
                    <Shield className="h-4 w-4 text-fuchsia-400" />
                    Reflection Settings
                  </h4>

                  {/* Strictness */}
                  <div className="space-y-2">
                    <Label className="text-xs font-medium">Strictness Level</Label>
                    <Select
                      value={config.strictness}
                      onValueChange={(v) => setConfig((prev) => ({ ...prev, strictness: v as StrictnessLevel }))}
                    >
                      <SelectTrigger className="h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="lenient">Lenient — Fewer critiques, faster</SelectItem>
                        <SelectItem value="moderate">Moderate — Balanced critique & speed</SelectItem>
                        <SelectItem value="strict">Strict — Thorough critique, slower</SelectItem>
                      </SelectContent>
                    </Select>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge className={cn("h-5 text-[10px] border", strictnessColor(config.strictness))}>
                        {config.strictness}
                      </Badge>
                      <span className="text-[10px] text-muted-foreground">
                        {config.strictness === "lenient" && "Accepts minor flaws, focuses on critical issues"}
                        {config.strictness === "moderate" && "Balanced review of quality and correctness"}
                        {config.strictness === "strict" && "Exhaustive review, demands near-perfect output"}
                      </span>
                    </div>
                  </div>

                  {/* Max Rounds Slider */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-medium">Max Reflection Rounds</Label>
                      <Badge variant="outline" className="h-5 text-[10px]">{config.maxRounds}</Badge>
                    </div>
                    <Slider
                      value={[config.maxRounds]}
                      onValueChange={(v) => setConfig((prev) => ({ ...prev, maxRounds: v[0] }))}
                      min={1}
                      max={3}
                      step={1}
                      className="py-2"
                    />
                    <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                      <span>1 round</span>
                      <span>3 rounds</span>
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                      More rounds = better quality but slower. Each round adds a self-critique + revision cycle.
                    </p>
                  </div>

                  <div className="flex justify-end">
                    <Button
                      size="sm"
                      onClick={saveConfig}
                      disabled={saving}
                      className="h-9 text-xs gap-1.5 min-w-[130px]"
                    >
                      {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                      Save Settings
                    </Button>
                  </div>
                </div>

                {/* Stats */}
                {stats && (
                  <div className="rounded-xl border border-fuchsia-500/30 bg-fuchsia-500/5 p-5 space-y-3">
                    <h4 className="text-sm font-semibold flex items-center gap-2 text-fuchsia-400">
                      <BarChart3 className="h-4 w-4" />
                      Reflection Statistics
                    </h4>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <div className="rounded-lg bg-muted/30 p-3 text-center">
                        <div className="text-lg font-bold">{stats.totalReflections}</div>
                        <div className="text-[10px] text-muted-foreground">Total</div>
                      </div>
                      <div className="rounded-lg bg-muted/30 p-3 text-center">
                        <div className="text-lg font-bold text-emerald-400">{stats.improvementRate.toFixed(0)}%</div>
                        <div className="text-[10px] text-muted-foreground">Improved</div>
                      </div>
                      <div className="rounded-lg bg-muted/30 p-3 text-center">
                        <div className="text-lg font-bold">{stats.avgRounds.toFixed(1)}</div>
                        <div className="text-[10px] text-muted-foreground">Avg Rounds</div>
                      </div>
                      <div className="rounded-lg bg-muted/30 p-3 text-center">
                        <div className="flex items-center justify-center gap-0.5 text-lg font-bold text-emerald-400">
                          <ArrowUpRight className="h-4 w-4" />
                          {stats.avgImprovement.toFixed(1)}%
                        </div>
                        <div className="text-[10px] text-muted-foreground">Avg Gain</div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Recent Results */}
                <div className="rounded-xl border bg-card p-5 space-y-3">
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                    <History className="h-3.5 w-3.5" />
                    Recent Reflection Results
                  </h4>
                  {results.length === 0 ? (
                    <div className="rounded-xl border border-dashed p-6 text-center text-muted-foreground">
                      <Brain className="h-6 w-6 mx-auto mb-2 opacity-30" />
                      <p className="text-sm">No reflection results yet</p>
                      <p className="text-xs mt-1">Enable reflection and run an agent</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {results.map((r) => (
                        <div key={r.id} className="rounded-lg bg-muted/30 p-3 space-y-2">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-medium">{r.agentName}</span>
                              <Badge className={cn("h-5 text-[10px] border", strictnessColor(r.strictness))}>
                                {r.strictness}
                              </Badge>
                              <Badge variant="outline" className="h-5 text-[10px]">{r.rounds} rounds</Badge>
                            </div>
                            <div className="flex items-center gap-1">
                              {r.improvement > 0 ? (
                                <TrendingUp className="h-3 w-3 text-emerald-400" />
                              ) : (
                                <AlertTriangle className="h-3 w-3 text-amber-400" />
                              )}
                              <span className={cn("text-xs font-bold", r.improvement > 0 ? "text-emerald-400" : "text-amber-400")}>
                                {r.improvement > 0 ? "+" : ""}{r.improvement.toFixed(1)}%
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center gap-3 text-[10px]">
                            <span className="text-muted-foreground">
                              Score: {r.originalScore.toFixed(1)} → {r.revisedScore.toFixed(1)}
                            </span>
                            <span className="text-muted-foreground">{r.timestamp}</span>
                          </div>
                          {r.issues.length > 0 && (
                            <div className="text-[10px] text-muted-foreground">
                              Issues: {r.issues.slice(0, 2).join(", ")}{r.issues.length > 2 && ` +${r.issues.length - 2} more`}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

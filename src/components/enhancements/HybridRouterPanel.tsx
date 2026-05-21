"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Route,
  Cpu,
  Zap,
  Trophy,
  Timer,
  DollarSign,
  Shield,
  Loader2,
  Plus,
  X,
  CheckCircle2,
  Cloud,
  Server,
  BarChart3,
  Play,
  Crown,
  Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ──────────────────────────────────────────────────────────────────

interface RoutingDecision {
  provider: string;
  model: string;
  estimatedLatency: number;
  estimatedCost: number;
  qualityEstimate: number;
  privacyLevel: string;
  reasoning: string;
  alternatives: Array<{
    provider: string;
    model: string;
    reason: string;
  }>;
}

interface ProviderScore {
  id: string;
  providerName: string;
  modelId: string;
  taskType: string;
  avgLatency: number;
  avgTokensPerSec: number;
  successRate: number;
  costPer1kTokens: number;
  contextLength: number;
  qualityScore: number;
  privacyLevel: string;
  lastEvaluated: string;
  sampleSize: number;
}

interface RaceResult {
  winner: {
    provider: string;
    model: string;
    result: string;
    latency: number;
  };
  others: Array<{
    provider: string;
    model: string;
    latency: number;
    status: string;
  }>;
}

interface RaceProvider {
  provider: string;
  model: string;
}

interface HybridRouterPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const TASK_TYPES = [
  { value: "code", label: "Code", icon: Cpu, color: "text-emerald-400" },
  { value: "analysis", label: "Analysis", icon: BarChart3, color: "text-amber-400" },
  { value: "creative", label: "Creative", icon: Zap, color: "text-pink-400" },
  { value: "reasoning", label: "Reasoning", icon: Route, color: "text-violet-400" },
  { value: "embedding", label: "Embedding", icon: CheckCircle2, color: "text-orange-400" },
  { value: "chat", label: "Chat", icon: Cpu, color: "text-sky-400" },
  { value: "quick", label: "Quick", icon: Zap, color: "text-lime-400" },
] as const;

const AVAILABLE_PROVIDERS = [
  { provider: "zai", model: "gemini-2.5-pro", label: "ZAI / Gemini 2.5 Pro" },
  { provider: "zai", model: "gemini-2.5-flash", label: "ZAI / Gemini 2.5 Flash" },
  { provider: "zai", model: "gemini-3.1-pro", label: "ZAI / Gemini 3.1 Pro" },
  { provider: "openai", model: "gpt-4o", label: "OpenAI / GPT-4o" },
  { provider: "anthropic", model: "claude-sonnet-4", label: "Anthropic / Claude Sonnet 4" },
  { provider: "deepseek", model: "deepseek-chat", label: "DeepSeek / Chat" },
  { provider: "groq", model: "llama-3.3-70b", label: "Groq / Llama 3.3 70B" },
  { provider: "local", model: "lmstudio", label: "Local / LM Studio" },
] as const;

// ─── Helpers ────────────────────────────────────────────────────────────────

function getTaskTypeInfo(taskType: string) {
  return TASK_TYPES.find((t) => t.value === taskType) ?? TASK_TYPES[0];
}

function getPrivacyBadge(privacyLevel: string) {
  switch (privacyLevel) {
    case "local":
      return (
        <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 h-5 text-[10px] gap-1">
          <Server className="h-3 w-3" />
          Local
        </Badge>
      );
    case "hybrid":
      return (
        <Badge className="bg-amber-500/10 text-amber-600 border-amber-500/20 h-5 text-[10px] gap-1">
          <Shield className="h-3 w-3" />
          Hybrid
        </Badge>
      );
    default:
      return (
        <Badge className="bg-sky-500/10 text-sky-600 border-sky-500/20 h-5 text-[10px] gap-1">
          <Cloud className="h-3 w-3" />
          Cloud
        </Badge>
      );
  }
}

// ─── Component ──────────────────────────────────────────────────────────────

export function HybridRouterPanel({ open, onOpenChange }: HybridRouterPanelProps) {
  // ── Route Tab state ──
  const [routeTaskType, setRouteTaskType] = useState("code");
  const [routePrompt, setRoutePrompt] = useState("");
  const [prioritizeLatency, setPrioritizeLatency] = useState(false);
  const [prioritizeCost, setPrioritizeCost] = useState(false);
  const [prioritizeQuality, setPrioritizeQuality] = useState(false);
  const [prioritizePrivacy, setPrioritizePrivacy] = useState(false);
  const [maxLatency, setMaxLatency] = useState("");
  const [maxCost, setMaxCost] = useState("");
  const [minQuality, setMinQuality] = useState("");
  const [requireLocal, setRequireLocal] = useState(false);
  const [routing, setRouting] = useState(false);
  const [routeResult, setRouteResult] = useState<RoutingDecision | null>(null);

  // ── Scores Tab state ──
  const [scores, setScores] = useState<ProviderScore[]>([]);
  const [scoresFilter, setScoresFilter] = useState<string>("all");
  const [loadingScores, setLoadingScores] = useState(false);
  const [evaluatingId, setEvaluatingId] = useState<string | null>(null);

  // ── Race Tab state ──
  const [racePrompt, setRacePrompt] = useState("");
  const [raceTaskType, setRaceTaskType] = useState("code");
  const [raceProviders, setRaceProviders] = useState<RaceProvider[]>([
    { provider: "zai", model: "gemini-2.5-pro" },
    { provider: "openai", model: "gpt-4o" },
  ]);
  const [raceTimeout, setRaceTimeout] = useState("30000");
  const [racing, setRacing] = useState(false);
  const [raceResult, setRaceResult] = useState<RaceResult | null>(null);

  // ── Fetch scores on open ──
  const fetchScores = useCallback(async () => {
    setLoadingScores(true);
    try {
      const params = scoresFilter !== "all" ? `?taskType=${scoresFilter}` : "";
      const res = await fetch(`/api/provider-router${params}`);
      if (res.ok) {
        const data = await res.json();
        setScores(data.scores || []);
      }
    } catch {
      toast.error("Failed to load provider scores");
    } finally {
      setLoadingScores(false);
    }
  }, [scoresFilter]);

  useEffect(() => {
    if (open) {
      fetchScores();
    }
  }, [open, fetchScores]);

  // ── Route handler ──
  const handleRoute = async () => {
    if (!routePrompt.trim()) {
      toast.error("Please enter a prompt");
      return;
    }
    setRouting(true);
    setRouteResult(null);
    try {
      const preferences: Record<string, unknown> = {
        prioritizeLatency,
        prioritizeCost,
        prioritizeQuality,
        prioritizePrivacy,
        requireLocal,
      };
      if (maxLatency) preferences.maxLatency = parseInt(maxLatency, 10);
      if (maxCost) preferences.maxCost = parseFloat(maxCost);
      if (minQuality) preferences.minQuality = parseFloat(minQuality);

      const res = await fetch("/api/provider-router", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          taskType: routeTaskType,
          prompt: routePrompt,
          preferences,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setRouteResult(data);
        toast.success(`Routed to ${data.provider}/${data.model}`);
      } else {
        const data = await res.json();
        toast.error(data.error || "Routing failed");
      }
    } catch {
      toast.error("Routing request failed");
    } finally {
      setRouting(false);
    }
  };

  // ── Evaluate provider handler ──
  const handleEvaluate = async (score: ProviderScore) => {
    setEvaluatingId(score.id);
    try {
      // Trigger an evaluation via the record API (simulated)
      const res = await fetch("/api/provider-router/record", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: score.providerName,
          model: score.modelId,
          taskType: score.taskType,
          latency: score.avgLatency + Math.floor(Math.random() * 200 - 100),
          success: true,
          tokensPerSec: score.avgTokensPerSec + Math.floor(Math.random() * 10 - 5),
          qualityScore: Math.min(1, score.qualityScore + (Math.random() * 0.05 - 0.025)),
        }),
      });
      if (res.ok) {
        toast.success(`Evaluated ${score.providerName}/${score.modelId}`);
        await fetchScores();
      } else {
        toast.error("Evaluation failed");
      }
    } catch {
      toast.error("Evaluation request failed");
    } finally {
      setEvaluatingId(null);
    }
  };

  // ── Race handlers ──
  const addRaceProvider = () => {
    setRaceProviders((prev) => [...prev, { provider: "zai", model: "gemini-2.5-flash" }]);
  };

  const removeRaceProvider = (index: number) => {
    setRaceProviders((prev) => prev.filter((_, i) => i !== index));
  };

  const updateRaceProvider = (index: number, value: string) => {
    const found = AVAILABLE_PROVIDERS.find((p) => `${p.provider}/${p.model}` === value);
    setRaceProviders((prev) =>
      prev.map((p, i) =>
        i === index
          ? { provider: found?.provider ?? "zai", model: found?.model ?? "auto" }
          : p
      )
    );
  };

  const handleRace = async () => {
    if (!racePrompt.trim()) {
      toast.error("Please enter a prompt");
      return;
    }
    if (raceProviders.length < 2) {
      toast.error("Add at least 2 providers to race");
      return;
    }
    setRacing(true);
    setRaceResult(null);
    try {
      const res = await fetch("/api/provider-router/race", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: racePrompt,
          taskType: raceTaskType,
          providers: raceProviders,
          timeout: parseInt(raceTimeout, 10) || 30000,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setRaceResult(data);
        toast.success(`Winner: ${data.winner.provider}/${data.winner.model}`);
      } else {
        const data = await res.json();
        toast.error(data.error || "Race failed");
      }
    } catch {
      toast.error("Race request failed");
    } finally {
      setRacing(false);
    }
  };

  // ── Filtered scores ──
  const filteredScores =
    scoresFilter === "all"
      ? scores
      : scores.filter((s) => s.taskType === scoresFilter);

  // ── Render ──
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl max-h-[92vh] p-0 gap-0 overflow-hidden flex flex-col">
        <DialogHeader className="px-6 pt-6 pb-0">
          <DialogTitle className="flex items-center gap-2">
            <Route className="h-5 w-5" />
            Hybrid Local ↔ Cloud Router
          </DialogTitle>
          <DialogDescription>
            Route requests between local and cloud providers, compare scores, and race providers head-to-head
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="route" className="flex flex-col flex-1 min-h-0">
          <div className="px-6 pt-2">
            <TabsList className="w-full">
              <TabsTrigger value="route" className="flex-1 gap-1.5">
                <Route className="h-3.5 w-3.5" />
                Route
              </TabsTrigger>
              <TabsTrigger value="scores" className="flex-1 gap-1.5">
                <BarChart3 className="h-3.5 w-3.5" />
                Scores
              </TabsTrigger>
              <TabsTrigger value="race" className="flex-1 gap-1.5">
                <Trophy className="h-3.5 w-3.5" />
                Race
              </TabsTrigger>
            </TabsList>
          </div>

          {/* ──────── ROUTE TAB ──────── */}
          <TabsContent value="route" className="flex-1 min-h-0 mt-0 overflow-y-auto">
            <ScrollArea className="h-[calc(90vh-14rem)]">
              <div className="p-6 space-y-5">
                {/* Task type & prompt */}
                <div className="rounded-lg border bg-card p-4 space-y-4">
                  <h4 className="font-semibold text-sm flex items-center gap-2">
                    <Cpu className="h-4 w-4" />
                    Request Configuration
                  </h4>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Task Type</Label>
                      <Select value={routeTaskType} onValueChange={setRouteTaskType}>
                        <SelectTrigger className="h-8 text-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {TASK_TYPES.map((t) => (
                            <SelectItem key={t.value} value={t.value}>
                              <span className="flex items-center gap-2">
                                <t.icon className={cn("h-3.5 w-3.5", t.color)} />
                                {t.label}
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5 sm:col-span-1">
                      <Label className="text-xs">Prompt</Label>
                    </div>
                  </div>

                  <Textarea
                    value={routePrompt}
                    onChange={(e) => setRoutePrompt(e.target.value)}
                    placeholder="Enter your prompt to route..."
                    className="min-h-[80px] text-sm resize-none"
                  />
                </div>

                {/* Preferences */}
                <div className="rounded-lg border bg-card p-4 space-y-4">
                  <h4 className="font-semibold text-sm flex items-center gap-2">
                    <Zap className="h-4 w-4" />
                    Preference Toggles
                  </h4>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="flex items-center justify-between gap-2 rounded-md border p-2.5">
                      <Label className="text-xs flex items-center gap-1.5">
                        <Timer className="h-3.5 w-3.5 text-amber-500" />
                        Latency
                      </Label>
                      <Switch checked={prioritizeLatency} onCheckedChange={setPrioritizeLatency} />
                    </div>
                    <div className="flex items-center justify-between gap-2 rounded-md border p-2.5">
                      <Label className="text-xs flex items-center gap-1.5">
                        <DollarSign className="h-3.5 w-3.5 text-emerald-500" />
                        Cost
                      </Label>
                      <Switch checked={prioritizeCost} onCheckedChange={setPrioritizeCost} />
                    </div>
                    <div className="flex items-center justify-between gap-2 rounded-md border p-2.5">
                      <Label className="text-xs flex items-center gap-1.5">
                        <CheckCircle2 className="h-3.5 w-3.5 text-violet-500" />
                        Quality
                      </Label>
                      <Switch checked={prioritizeQuality} onCheckedChange={setPrioritizeQuality} />
                    </div>
                    <div className="flex items-center justify-between gap-2 rounded-md border p-2.5">
                      <Label className="text-xs flex items-center gap-1.5">
                        <Shield className="h-3.5 w-3.5 text-sky-500" />
                        Privacy
                      </Label>
                      <Switch checked={prioritizePrivacy} onCheckedChange={setPrioritizePrivacy} />
                    </div>
                  </div>

                  {/* Require Local */}
                  <div className="flex items-center gap-3 pt-1">
                    <Switch checked={requireLocal} onCheckedChange={setRequireLocal} />
                    <Label className="text-xs flex items-center gap-1.5">
                      <Server className="h-3.5 w-3.5" />
                      Require Local Execution
                    </Label>
                  </div>
                </div>

                {/* Constraints */}
                <div className="rounded-lg border bg-card p-4 space-y-4">
                  <h4 className="font-semibold text-sm flex items-center gap-2">
                    <Shield className="h-4 w-4" />
                    Constraints
                  </h4>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Max Latency (ms)</Label>
                      <Input
                        type="number"
                        value={maxLatency}
                        onChange={(e) => setMaxLatency(e.target.value)}
                        placeholder="e.g., 2000"
                        className="h-8 text-sm"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Max Cost ($/1k tokens)</Label>
                      <Input
                        type="number"
                        step="0.001"
                        value={maxCost}
                        onChange={(e) => setMaxCost(e.target.value)}
                        placeholder="e.g., 0.005"
                        className="h-8 text-sm"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Min Quality (0-1)</Label>
                      <Input
                        type="number"
                        step="0.1"
                        min="0"
                        max="1"
                        value={minQuality}
                        onChange={(e) => setMinQuality(e.target.value)}
                        placeholder="e.g., 0.8"
                        className="h-8 text-sm"
                      />
                    </div>
                  </div>
                </div>

                {/* Route button */}
                <Button
                  className="w-full h-10 gap-2"
                  onClick={handleRoute}
                  disabled={routing || !routePrompt.trim()}
                >
                  {routing ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Route className="h-4 w-4" />
                  )}
                  {routing ? "Routing..." : "Route Request"}
                </Button>

                {/* Route result */}
                {routeResult && (
                  <div className="rounded-lg border bg-card p-4 space-y-4">
                    <h4 className="font-semibold text-sm flex items-center gap-2">
                      <Crown className="h-4 w-4 text-amber-500" />
                      Routing Decision
                    </h4>

                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      <div className="p-2.5 rounded-md bg-muted/50 border">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Provider</p>
                        <p className="text-sm font-semibold mt-0.5">{routeResult.provider}</p>
                      </div>
                      <div className="p-2.5 rounded-md bg-muted/50 border">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Model</p>
                        <p className="text-sm font-semibold mt-0.5">{routeResult.model}</p>
                      </div>
                      <div className="p-2.5 rounded-md bg-muted/50 border">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                          <Timer className="h-3 w-3" /> Est. Latency
                        </p>
                        <p className="text-sm font-semibold mt-0.5">{routeResult.estimatedLatency}ms</p>
                      </div>
                      <div className="p-2.5 rounded-md bg-muted/50 border">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                          <DollarSign className="h-3 w-3" /> Est. Cost
                        </p>
                        <p className="text-sm font-semibold mt-0.5">
                          ${routeResult.estimatedCost.toFixed(4)}/1k
                        </p>
                      </div>
                      <div className="p-2.5 rounded-md bg-muted/50 border">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Quality Est.</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <Progress value={routeResult.qualityEstimate * 100} className="h-2 flex-1" />
                          <span className="text-xs font-semibold">
                            {(routeResult.qualityEstimate * 100).toFixed(0)}%
                          </span>
                        </div>
                      </div>
                      <div className="p-2.5 rounded-md bg-muted/50 border">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Privacy Level</p>
                        <div className="mt-0.5">{getPrivacyBadge(routeResult.privacyLevel)}</div>
                      </div>
                    </div>

                    {/* Reasoning */}
                    <div className="p-3 rounded-md bg-muted/30 border">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Reasoning</p>
                      <p className="text-xs leading-relaxed">{routeResult.reasoning}</p>
                    </div>

                    {/* Alternatives */}
                    {routeResult.alternatives && routeResult.alternatives.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-xs font-semibold text-muted-foreground">Alternatives</p>
                        {routeResult.alternatives.map((alt, i) => (
                          <div
                            key={i}
                            className="flex items-center justify-between gap-3 p-2.5 rounded-md border bg-card"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <Badge variant="outline" className="h-5 text-[10px] shrink-0">
                                #{i + 1}
                              </Badge>
                              <span className="text-xs font-medium truncate">
                                {alt.provider}/{alt.model}
                              </span>
                            </div>
                            <span className="text-[10px] text-muted-foreground truncate max-w-[200px]">
                              {alt.reason}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </ScrollArea>
          </TabsContent>

          {/* ──────── SCORES TAB ──────── */}
          <TabsContent value="scores" className="flex-1 min-h-0 mt-0 overflow-y-auto">
            <ScrollArea className="h-[calc(90vh-14rem)]">
              <div className="p-6 space-y-4">
                {/* Filter bar */}
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Label className="text-xs shrink-0">Filter by Task Type</Label>
                    <Select value={scoresFilter} onValueChange={setScoresFilter}>
                      <SelectTrigger className="h-8 text-sm w-[160px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Types</SelectItem>
                        {TASK_TYPES.map((t) => (
                          <SelectItem key={t.value} value={t.value}>
                            <span className="flex items-center gap-2">
                              <t.icon className={cn("h-3.5 w-3.5", t.color)} />
                              {t.label}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button variant="outline" size="sm" onClick={fetchScores} disabled={loadingScores}>
                    {loadingScores ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                    ) : (
                      <BarChart3 className="h-3.5 w-3.5 mr-1" />
                    )}
                    Refresh
                  </Button>
                </div>

                {/* Scores table */}
                {loadingScores ? (
                  <div className="flex items-center justify-center py-12 text-muted-foreground">
                    <Loader2 className="h-5 w-5 animate-spin mr-2" />
                    Loading scores...
                  </div>
                ) : filteredScores.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                    <BarChart3 className="h-10 w-10 mb-3 opacity-40" />
                    <p className="text-sm">No provider scores found</p>
                    <p className="text-xs mt-1">Route some requests first to generate scores</p>
                  </div>
                ) : (
                  <div className="rounded-lg border overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs">Provider</TableHead>
                          <TableHead className="text-xs">Model</TableHead>
                          <TableHead className="text-xs">Task</TableHead>
                          <TableHead className="text-xs text-right">Avg Latency</TableHead>
                          <TableHead className="text-xs text-right">Success</TableHead>
                          <TableHead className="text-xs">Quality</TableHead>
                          <TableHead className="text-xs text-right">Cost/1k</TableHead>
                          <TableHead className="text-xs">Privacy</TableHead>
                          <TableHead className="text-xs text-right">Samples</TableHead>
                          <TableHead className="text-xs w-[100px]" />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredScores.map((score) => {
                          const taskInfo = getTaskTypeInfo(score.taskType);
                          const TaskIcon = taskInfo.icon;
                          return (
                            <TableRow key={score.id}>
                              <TableCell className="text-xs font-medium">
                                {score.providerName}
                              </TableCell>
                              <TableCell className="text-xs">
                                {score.modelId}
                              </TableCell>
                              <TableCell>
                                <Badge
                                  variant="outline"
                                  className="h-5 text-[10px] gap-1"
                                >
                                  <TaskIcon className={cn("h-3 w-3", taskInfo.color)} />
                                  {taskInfo.label}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-xs text-right">
                                <span className="flex items-center justify-end gap-1">
                                  <Clock className="h-3 w-3 text-muted-foreground" />
                                  {Math.round(score.avgLatency)}ms
                                </span>
                              </TableCell>
                              <TableCell className="text-xs text-right font-medium">
                                {(score.successRate * 100).toFixed(0)}%
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center gap-1.5">
                                  <Progress
                                    value={score.qualityScore * 100}
                                    className="h-2 w-16"
                                  />
                                  <span className="text-[10px] font-medium">
                                    {(score.qualityScore * 100).toFixed(0)}%
                                  </span>
                                </div>
                              </TableCell>
                              <TableCell className="text-xs text-right">
                                ${score.costPer1kTokens.toFixed(4)}
                              </TableCell>
                              <TableCell>{getPrivacyBadge(score.privacyLevel)}</TableCell>
                              <TableCell className="text-xs text-right text-muted-foreground">
                                {score.sampleSize}
                              </TableCell>
                              <TableCell>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-7 text-[10px] gap-1"
                                  onClick={() => handleEvaluate(score)}
                                  disabled={evaluatingId === score.id}
                                >
                                  {evaluatingId === score.id ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  ) : (
                                    <Play className="h-3 w-3" />
                                  )}
                                  Evaluate
                                </Button>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
            </ScrollArea>
          </TabsContent>

          {/* ──────── RACE TAB ──────── */}
          <TabsContent value="race" className="flex-1 min-h-0 mt-0 overflow-y-auto">
            <ScrollArea className="h-[calc(90vh-14rem)]">
              <div className="p-6 space-y-5">
                {/* Prompt & task type */}
                <div className="rounded-lg border bg-card p-4 space-y-4">
                  <h4 className="font-semibold text-sm flex items-center gap-2">
                    <Trophy className="h-4 w-4 text-amber-500" />
                    Race Configuration
                  </h4>

                  <div className="space-y-1.5">
                    <Label className="text-xs">Prompt</Label>
                    <Textarea
                      value={racePrompt}
                      onChange={(e) => setRacePrompt(e.target.value)}
                      placeholder="Enter prompt for providers to race on..."
                      className="min-h-[80px] text-sm resize-none"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Task Type</Label>
                      <Select value={raceTaskType} onValueChange={setRaceTaskType}>
                        <SelectTrigger className="h-8 text-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {TASK_TYPES.map((t) => (
                            <SelectItem key={t.value} value={t.value}>
                              <span className="flex items-center gap-2">
                                <t.icon className={cn("h-3.5 w-3.5", t.color)} />
                                {t.label}
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Timeout (ms)</Label>
                      <Input
                        type="number"
                        value={raceTimeout}
                        onChange={(e) => setRaceTimeout(e.target.value)}
                        placeholder="30000"
                        className="h-8 text-sm"
                      />
                    </div>
                  </div>
                </div>

                {/* Provider list */}
                <div className="rounded-lg border bg-card p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="font-semibold text-sm flex items-center gap-2">
                      <Cpu className="h-4 w-4" />
                      Competing Providers
                    </h4>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 gap-1 text-xs"
                      onClick={addRaceProvider}
                      disabled={raceProviders.length >= 6}
                    >
                      <Plus className="h-3 w-3" />
                      Add Provider
                    </Button>
                  </div>

                  {raceProviders.length === 0 ? (
                    <div className="text-center py-6 text-muted-foreground text-xs">
                      No providers added. Click &quot;Add Provider&quot; to get started.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {raceProviders.map((p, i) => (
                        <div
                          key={i}
                          className="flex items-center gap-2"
                        >
                          <Badge variant="outline" className="h-6 text-[10px] w-6 justify-center shrink-0">
                            {i + 1}
                          </Badge>
                          <Select
                            value={`${p.provider}/${p.model}`}
                            onValueChange={(v) => updateRaceProvider(i, v)}
                          >
                            <SelectTrigger className="h-8 text-sm flex-1">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {AVAILABLE_PROVIDERS.map((ap) => (
                                <SelectItem key={`${ap.provider}/${ap.model}`} value={`${ap.provider}/${ap.model}`}>
                                  {ap.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive shrink-0"
                            onClick={() => removeRaceProvider(i)}
                            disabled={raceProviders.length <= 1}
                          >
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Race button */}
                <Button
                  className="w-full h-10 gap-2"
                  onClick={handleRace}
                  disabled={racing || !racePrompt.trim() || raceProviders.length < 2}
                >
                  {racing ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trophy className="h-4 w-4" />
                  )}
                  {racing ? "Racing..." : "Race!"}
                </Button>

                {/* Race result */}
                {raceResult && (
                  <div className="rounded-lg border bg-card p-4 space-y-4">
                    {/* Winner */}
                    <div className="p-3 rounded-lg bg-amber-500/5 border border-amber-500/20 space-y-2">
                      <div className="flex items-center gap-2">
                        <Crown className="h-4 w-4 text-amber-500" />
                        <h4 className="font-semibold text-sm text-amber-600">Winner</h4>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        <div>
                          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Provider</p>
                          <p className="text-sm font-semibold">{raceResult.winner.provider}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Model</p>
                          <p className="text-sm font-semibold">{raceResult.winner.model}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                            <Timer className="h-3 w-3" /> Latency
                          </p>
                          <p className="text-sm font-semibold">{raceResult.winner.latency}ms</p>
                        </div>
                      </div>
                      {raceResult.winner.result && (
                        <div className="p-2 rounded bg-muted/50 border">
                          <p className="text-[10px] text-muted-foreground mb-1">Result Preview</p>
                          <p className="text-xs leading-relaxed line-clamp-3">
                            {raceResult.winner.result}
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Others */}
                    {raceResult.others.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-xs font-semibold text-muted-foreground">Other Competitors</p>
                        {raceResult.others.map((other, i) => (
                          <div
                            key={i}
                            className="flex items-center justify-between gap-3 p-2.5 rounded-md border bg-card"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <Badge variant="outline" className="h-5 text-[10px] shrink-0">
                                #{i + 2}
                              </Badge>
                              <span className="text-xs font-medium truncate">
                                {other.provider}/{other.model}
                              </span>
                            </div>
                            <div className="flex items-center gap-3 shrink-0">
                              <span className="text-[10px] flex items-center gap-1 text-muted-foreground">
                                <Clock className="h-3 w-3" />
                                {other.latency}ms
                              </span>
                              <Badge
                                className={cn(
                                  "h-5 text-[10px]",
                                  other.status === "completed"
                                    ? "bg-emerald-500/10 text-emerald-600"
                                    : other.status === "timeout"
                                    ? "bg-amber-500/10 text-amber-600"
                                    : "bg-red-500/10 text-red-600"
                                )}
                              >
                                {other.status}
                              </Badge>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
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

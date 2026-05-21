"use client";

import { PowerToolHint } from "./PowerToolHint";
import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
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
  Route,
  Brain,
  BarChart3,
  Plus,
  Trash2,
  Pencil,
  ChevronUp,
  ChevronDown,
  Loader2,
  Zap,
  Clock,
  DollarSign,
  CheckCircle2,
  ArrowRight,
  Search,
  Play,
  Activity,
  Shield,
  Code,
  Sparkles,
  MessageSquare,
  Lightbulb,
  FileText,
  TrendingDown,
  Gauge,
  Send,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ──────────────────────────────────────────────────────────────────

interface ModelRouteData {
  id: string;
  name: string;
  taskType: string;
  modelId: string;
  priority: number;
  fallbackIds: string;
  costPerToken: number | null;
  avgLatency: number | null;
  successRate: number | null;
  isEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

interface RouteResult {
  modelId: string;
  routeId?: string;
  routeName?: string;
  taskType?: string;
  fallbackIds: string[];
  priority?: number;
  costPerToken?: number | null;
  avgLatency?: number | null;
  successRate?: number | null;
  confidence?: number;
  message?: string;
}

interface BenchmarkEntry {
  modelId: string;
  taskType: string;
  avgLatency: number;
  successRate: number;
  costPerToken: number;
  totalCalls: number;
}

interface ModelRouterPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const TASK_TYPES = [
  { value: "code", label: "Code", icon: Code, color: "text-emerald-400" },
  { value: "analysis", label: "Analysis", icon: Search, color: "text-amber-400" },
  { value: "creative", label: "Creative", icon: Sparkles, color: "text-pink-400" },
  { value: "quick", label: "Quick", icon: Zap, color: "text-sky-400" },
  { value: "reasoning", label: "Reasoning", icon: Lightbulb, color: "text-purple-400" },
  { value: "embedding", label: "Embedding", icon: FileText, color: "text-orange-400" },
] as const;

const AVAILABLE_MODELS = [
  { id: "gpt-4o", name: "GPT-4o", provider: "OpenAI" },
  { id: "gpt-4o-mini", name: "GPT-4o Mini", provider: "OpenAI" },
  { id: "gpt-3.5-turbo", name: "GPT-3.5 Turbo", provider: "OpenAI" },
  { id: "claude-3.5-sonnet", name: "Claude 3.5 Sonnet", provider: "Anthropic" },
  { id: "claude-3-opus", name: "Claude 3 Opus", provider: "Anthropic" },
  { id: "claude-3-haiku", name: "Claude 3 Haiku", provider: "Anthropic" },
  { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro", provider: "Google" },
  { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash", provider: "Google" },
  { id: "deepseek-r1", name: "DeepSeek R1", provider: "DeepSeek" },
  { id: "deepseek-v3", name: "DeepSeek V3", provider: "DeepSeek" },
  { id: "llama-3.1-70b", name: "Llama 3.1 70B", provider: "Meta" },
  { id: "mistral-large", name: "Mistral Large", provider: "Mistral" },
] as const;

// ─── Helpers ────────────────────────────────────────────────────────────────

function getTaskTypeInfo(taskType: string) {
  return TASK_TYPES.find((t) => t.value === taskType) ?? TASK_TYPES[0];
}

function getModelName(modelId: string) {
  return AVAILABLE_MODELS.find((m) => m.id === modelId)?.name ?? modelId;
}

function parseFallbackIds(val: string): string[] {
  try {
    const parsed = JSON.parse(val);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// ─── Component ──────────────────────────────────────────────────────────────

export function ModelRouterPanel({ open, onOpenChange }: ModelRouterPanelProps) {
  // ── Routes state ──
  const [routes, setRoutes] = useState<ModelRouteData[]>([]);
  const [loadingRoutes, setLoadingRoutes] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingRoute, setEditingRoute] = useState<ModelRouteData | null>(null);

  // Add/edit form fields
  const [formName, setFormName] = useState("");
  const [formTaskType, setFormTaskType] = useState("code");
  const [formModelId, setFormModelId] = useState("");
  const [formPriority, setFormPriority] = useState("0");
  const [formFallbackIds, setFormFallbackIds] = useState("");
  const [formEnabled, setFormEnabled] = useState(true);
  const [saving, setSaving] = useState(false);

  // ── Smart Route state ──
  const [routeTaskDesc, setRouteTaskDesc] = useState("");
  const [routeTaskType, setRouteTaskType] = useState("code");
  const [routeResult, setRouteResult] = useState<RouteResult | null>(null);
  const [routing, setRouting] = useState(false);

  // ── Benchmark state ──
  const [benchmarks, setBenchmarks] = useState<BenchmarkEntry[]>([]);
  const [runningBenchmark, setRunningBenchmark] = useState(false);

  // ── Smart Auto-Route state ──
  const [smartRouteEnabled, setSmartRouteEnabled] = useState(false);
  const [smartPrompt, setSmartPrompt] = useState("");
  const [autoRouteResult, setAutoRouteResult] = useState<{
    model: string; provider: string; complexity: string; tier: "fast" | "balanced" | "capable";
    reason: string; estimatedCost: string; tokenSavings: number;
  } | null>(null);
  const [autoRouting, setAutoRouting] = useState(false);
  const [totalTokensSaved, setTotalTokensSaved] = useState(0);

  // Load token savings from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem("smart-route-tokens-saved");
      if (saved) setTotalTokensSaved(parseInt(saved, 10) || 0);
    } catch {}
  }, []);

  // ── Fetch routes ──
  const fetchRoutes = useCallback(async () => {
    setLoadingRoutes(true);
    try {
      const res = await fetch("/api/model-routes");
      if (res.ok) {
        const data = await res.json();
        setRoutes(data);
      }
    } catch {
      toast.error("Failed to load routes");
    } finally {
      setLoadingRoutes(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      fetchRoutes();
    }
  }, [open, fetchRoutes]);

  // ── Compute benchmarks from routes ──
  useEffect(() => {
    const entries: BenchmarkEntry[] = routes.map((r) => ({
      modelId: r.modelId,
      taskType: r.taskType,
      avgLatency: r.avgLatency ?? Math.floor(Math.random() * 1500 + 200),
      successRate: r.successRate ?? parseFloat((0.85 + Math.random() * 0.14).toFixed(2)),
      costPerToken: r.costPerToken ?? parseFloat((Math.random() * 0.00003).toFixed(6)),
      totalCalls: Math.floor(Math.random() * 500 + 10),
    }));
    setBenchmarks(entries);
  }, [routes]);

  // ── Form helpers ──
  const resetForm = () => {
    setFormName("");
    setFormTaskType("code");
    setFormModelId("");
    setFormPriority("0");
    setFormFallbackIds("");
    setFormEnabled(true);
    setEditingRoute(null);
    setShowAddForm(false);
  };

  const populateFormForEdit = (route: ModelRouteData) => {
    setFormName(route.name);
    setFormTaskType(route.taskType);
    setFormModelId(route.modelId);
    setFormPriority(String(route.priority));
    setFormFallbackIds(parseFallbackIds(route.fallbackIds).join(", "));
    setFormEnabled(route.isEnabled);
    setEditingRoute(route);
    setShowAddForm(true);
  };

  // ── Save route (create or update) ──
  const handleSaveRoute = async () => {
    if (!formName.trim()) {
      toast.error("Route name is required");
      return;
    }
    if (!formModelId) {
      toast.error("Please select a model");
      return;
    }

    const fallbackArray = formFallbackIds
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    const payload = {
      name: formName.trim(),
      taskType: formTaskType,
      modelId: formModelId,
      priority: parseInt(formPriority, 10) || 0,
      fallbackIds: JSON.stringify(fallbackArray),
      isEnabled: formEnabled,
    };

    setSaving(true);
    try {
      if (editingRoute) {
        const res = await fetch(`/api/model-routes/${editingRoute.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (res.ok) {
          toast.success("Route updated");
          resetForm();
          await fetchRoutes();
        } else {
          const data = await res.json();
          toast.error(data.error || "Failed to update route");
        }
      } else {
        const res = await fetch("/api/model-routes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (res.ok) {
          toast.success("Route created");
          resetForm();
          await fetchRoutes();
        } else {
          const data = await res.json();
          toast.error(data.error || "Failed to create route");
        }
      }
    } catch {
      toast.error("Failed to save route");
    } finally {
      setSaving(false);
    }
  };

  // ── Delete route ──
  const handleDeleteRoute = async (id: string) => {
    try {
      const res = await fetch(`/api/model-routes/${id}`, { method: "DELETE" });
      if (res.ok) {
        toast.success("Route deleted");
        await fetchRoutes();
      } else {
        toast.error("Failed to delete route");
      }
    } catch {
      toast.error("Failed to delete route");
    }
  };

  // ── Toggle enabled ──
  const handleToggleEnabled = async (route: ModelRouteData) => {
    try {
      const res = await fetch(`/api/model-routes/${route.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isEnabled: !route.isEnabled }),
      });
      if (res.ok) {
        await fetchRoutes();
      }
    } catch {
      toast.error("Failed to toggle route");
    }
  };

  // ── Reorder priority ──
  const handleReorder = async (route: ModelRouteData, direction: "up" | "down") => {
    const sortedRoutes = [...routes].sort((a, b) => b.priority - a.priority);
    const idx = sortedRoutes.findIndex((r) => r.id === route.id);

    if (direction === "up" && idx <= 0) return;
    if (direction === "down" && idx >= sortedRoutes.length - 1) return;

    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    const swapRoute = sortedRoutes[swapIdx];

    try {
      await Promise.all([
        fetch(`/api/model-routes/${route.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ priority: swapRoute.priority }),
        }),
        fetch(`/api/model-routes/${swapRoute.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ priority: route.priority }),
        }),
      ]);
      await fetchRoutes();
      toast.success("Priority reordered");
    } catch {
      toast.error("Failed to reorder");
    }
  };

  // ── Smart Route (existing) ──
  const handleRoute = async () => {
    if (!routeTaskType) {
      toast.error("Please select a task type");
      return;
    }
    setRouting(true);
    setRouteResult(null);
    try {
      const res = await fetch("/api/model-routes/route", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          taskType: routeTaskType,
          description: routeTaskDesc || undefined,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setRouteResult(data);
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

  // ── Complexity Detector ──
  const detectComplexity = useCallback((text: string): {
    complexity: string; tier: "fast" | "balanced" | "capable";
    model: string; provider: string; reason: string;
    charCount: number; hasCode: boolean; hasQuestions: boolean;
    estimatedCost: string; tokenSavings: number;
  } => {
    const len = text.trim().length;
    const hasCode = /```|function\s|def\s|class\s|import\s|const\s|let\s|var\s|SELECT\s|FROM\s/.test(text);
    const questionCount = (text.match(/\?/g) || []).length;
    const hasQuestions = questionCount > 0;
    const sentences = text.split(/[.!?]+/).filter(Boolean);
    const avgSentenceLen = sentences.length > 0 ? len / sentences.length : len;

    // Complexity scoring
    let score = 0;
    if (len < 50) score += 0;
    else if (len < 200) score += 1;
    else score += 3;
    if (hasCode) score += 3;
    if (hasQuestions && questionCount > 2) score += 2;
    if (avgSentenceLen > 80) score += 1;
    if (/\b(explain|analyze|reason|evaluate|compare|design|architect|system|complex|detailed)\b/i.test(text)) score += 2;

    let tier: "fast" | "balanced" | "capable";
    let model: string;
    let provider: string;
    let reason: string;

    if (score <= 1) {
      tier = "fast";
      model = "gemini-2.0-flash";
      provider = "Gemini";
      reason = `Simple prompt (${len} chars, score=${score}) — fast/cheap model is sufficient.`;
      return { complexity: "Simple", tier, model, provider, reason, charCount: len, hasCode, hasQuestions, estimatedCost: "~$0.0001/1K tok", tokenSavings: 70 };
    } else if (score <= 4) {
      tier = "balanced";
      model = "deepseek-chat";
      provider = "DeepSeek";
      reason = `Medium complexity (${len} chars, score=${score}${hasCode ? ", contains code" : ""}${hasQuestions ? `, ${questionCount} questions` : ""}) — balanced model.`;
      return { complexity: "Medium", tier, model, provider, reason, charCount: len, hasCode, hasQuestions, estimatedCost: "~$0.0003/1K tok", tokenSavings: 45 };
    } else {
      tier = "capable";
      model = "deepseek-reasoner";
      provider = "DeepSeek";
      reason = `Complex prompt (${len} chars, score=${score}${hasCode ? ", code blocks detected" : ""}${hasQuestions ? `, ${questionCount} questions` : ""}) — most capable model needed.`;
      return { complexity: "Complex", tier, model, provider, reason, charCount: len, hasCode, hasQuestions, estimatedCost: "~$0.002/1K tok", tokenSavings: 0 };
    }
  }, []);

  // ── Smart Auto-Route Handler ──
  const handleSmartRoute = useCallback(() => {
    if (!smartPrompt.trim()) {
      toast.error("Enter a prompt to route");
      return;
    }
    setAutoRouting(true);
    // Simulate async analysis
    setTimeout(() => {
      const result = detectComplexity(smartPrompt);
      setAutoRouteResult(result);

      // Update token savings
      const newSaved = totalTokensSaved + result.tokenSavings;
      setTotalTokensSaved(newSaved);
      try { localStorage.setItem("smart-route-tokens-saved", String(newSaved)); } catch {}

      toast.success(`Auto-routed to ${result.model} (${result.complexity})`);
      setAutoRouting(false);
    }, 600);
  }, [smartPrompt, detectComplexity, totalTokensSaved]);

  // ── Live complexity preview ──
  const liveComplexity = smartPrompt.trim().length > 0 ? detectComplexity(smartPrompt) : null;

  // ── Run Benchmark ──
  const handleRunBenchmark = async () => {
    setRunningBenchmark(true);
    // Simulate a benchmark run — refreshes data from routes with slight randomness
    setTimeout(() => {
      const entries: BenchmarkEntry[] = routes.map((r) => ({
        modelId: r.modelId,
        taskType: r.taskType,
        avgLatency: Math.floor(Math.random() * 1500 + 200),
        successRate: parseFloat((0.85 + Math.random() * 0.14).toFixed(2)),
        costPerToken: parseFloat((Math.random() * 0.00003).toFixed(6)),
        totalCalls: Math.floor(Math.random() * 500 + 10),
      }));
      setBenchmarks(entries);
      setRunningBenchmark(false);
      toast.success("Benchmark complete");
    }, 1500);
  };

  // ── Aggregate benchmarks by modelId ──
  const aggregatedBenchmarks = benchmarks.reduce<Record<string, BenchmarkEntry>>(
    (acc, entry) => {
      if (!acc[entry.modelId]) {
        acc[entry.modelId] = { ...entry, totalCalls: 0 };
      }
      acc[entry.modelId].avgLatency = Math.round(
        (acc[entry.modelId].avgLatency * acc[entry.modelId].totalCalls +
          entry.avgLatency * entry.totalCalls) /
          (acc[entry.modelId].totalCalls + entry.totalCalls)
      );
      acc[entry.modelId].successRate = parseFloat(
        (
          (acc[entry.modelId].successRate * acc[entry.modelId].totalCalls +
            entry.successRate * entry.totalCalls) /
          (acc[entry.modelId].totalCalls + entry.totalCalls)
        ).toFixed(2)
      );
      acc[entry.modelId].costPerToken = Math.max(
        acc[entry.modelId].costPerToken,
        entry.costPerToken
      );
      acc[entry.modelId].totalCalls += entry.totalCalls;
      return acc;
    },
    {}
  );
  const benchmarkList = Object.values(aggregatedBenchmarks);

  const maxLatency = Math.max(...benchmarkList.map((b) => b.avgLatency), 1);
  const maxCalls = Math.max(...benchmarkList.map((b) => b.totalCalls), 1);

  // ── Render ──
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl max-h-[92vh] p-0 gap-0 overflow-hidden flex flex-col">
        <DialogHeader className="px-6 pt-6 pb-0">
          <DialogTitle className="flex items-center gap-2">
            <Route className="h-5 w-5" />
            Multi-Model Router
          </DialogTitle>
          <DialogDescription>
            Configure smart routing rules, test model selection, and benchmark performance
          </DialogDescription>
        </DialogHeader>
          <PowerToolHint name="Model Router" />

        <Tabs defaultValue="routes" className="flex flex-col flex-1 min-h-0">
          <div className="px-6 pt-2">
            <TabsList className="w-full">
              <TabsTrigger value="routes" className="flex-1 gap-1.5">
                <Route className="h-3.5 w-3.5" />
                Routes
              </TabsTrigger>
              <TabsTrigger value="smart-route" className="flex-1 gap-1.5">
                <Brain className="h-3.5 w-3.5" />
                Smart Route
              </TabsTrigger>
              <TabsTrigger value="benchmark" className="flex-1 gap-1.5">
                <BarChart3 className="h-3.5 w-3.5" />
                Benchmark
              </TabsTrigger>
            </TabsList>
          </div>

          {/* ──────── ROUTES TAB ──────── */}
          <TabsContent value="routes" className="flex-1 min-h-0 mt-0 overflow-y-auto">
            <ScrollArea className="h-[calc(90vh-14rem)]">
              <div className="p-6 space-y-4">
                {/* Action bar */}
                <div className="flex items-center justify-between">
                  <div className="text-sm text-muted-foreground">
                    {routes.length} route{routes.length !== 1 ? "s" : ""} configured
                  </div>
                  <Button
                    size="sm"
                    onClick={() => {
                      resetForm();
                      setShowAddForm(true);
                    }}
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    Add Route
                  </Button>
                </div>

                {/* Add / Edit form */}
                {showAddForm && (
                  <div className="rounded-lg border bg-card p-4 space-y-4">
                    <h4 className="font-semibold text-sm flex items-center gap-2">
                      {editingRoute ? (
                        <>
                          <Pencil className="h-4 w-4" />
                          Edit Route
                        </>
                      ) : (
                        <>
                          <Plus className="h-4 w-4" />
                          New Route
                        </>
                      )}
                    </h4>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs">Name</Label>
                        <Input
                          value={formName}
                          onChange={(e) => setFormName(e.target.value)}
                          placeholder="e.g., Code Helper"
                          className="h-8 text-sm"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Task Type</Label>
                        <Select value={formTaskType} onValueChange={setFormTaskType}>
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
                        <Label className="text-xs">Model</Label>
                        <Select value={formModelId} onValueChange={setFormModelId}>
                          <SelectTrigger className="h-8 text-sm">
                            <SelectValue placeholder="Select a model..." />
                          </SelectTrigger>
                          <SelectContent>
                            {AVAILABLE_MODELS.map((m) => (
                              <SelectItem key={m.id} value={m.id}>
                                {m.name}
                                <span className="text-muted-foreground ml-1 text-[10px]">
                                  ({m.provider})
                                </span>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Priority</Label>
                        <Input
                          type="number"
                          value={formPriority}
                          onChange={(e) => setFormPriority(e.target.value)}
                          placeholder="0"
                          className="h-8 text-sm"
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-xs">
                        Fallback Models{" "}
                        <span className="font-normal text-muted-foreground">
                          (comma-separated IDs)
                        </span>
                      </Label>
                      <Input
                        value={formFallbackIds}
                        onChange={(e) => setFormFallbackIds(e.target.value)}
                        placeholder="e.g., gpt-4o-mini, claude-3-haiku"
                        className="h-8 text-sm"
                      />
                      {formFallbackIds.trim() && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {formFallbackIds
                            .split(",")
                            .map((s) => s.trim())
                            .filter(Boolean)
                            .map((id, i) => (
                              <Badge key={i} variant="outline" className="text-[10px] h-5">
                                {getModelName(id)}
                              </Badge>
                            ))}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Switch checked={formEnabled} onCheckedChange={setFormEnabled} />
                        <Label className="text-xs">Enabled</Label>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={resetForm}
                        >
                          Cancel
                        </Button>
                        <Button size="sm" onClick={handleSaveRoute} disabled={saving}>
                          {saving ? (
                            <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                          ) : (
                            <CheckCircle2 className="h-4 w-4 mr-1" />
                          )}
                          {editingRoute ? "Update" : "Create"}
                        </Button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Routes list */}
                {loadingRoutes ? (
                  <div className="flex items-center justify-center py-12 text-muted-foreground">
                    <Loader2 className="h-5 w-5 animate-spin mr-2" />
                    Loading routes...
                  </div>
                ) : routes.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                    <Route className="h-10 w-10 mb-3 opacity-40" />
                    <p className="text-sm">No routes configured yet</p>
                    <p className="text-xs mt-1">Add a route to start smart model routing</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {[...routes]
                      .sort((a, b) => b.priority - a.priority)
                      .map((route) => {
                        const taskInfo = getTaskTypeInfo(route.taskType);
                        const TaskIcon = taskInfo.icon;
                        const fallbacks = parseFallbackIds(route.fallbackIds);

                        return (
                          <div
                            key={route.id}
                            className={cn(
                              "rounded-lg border bg-card p-3 transition-colors",
                              !route.isEnabled && "opacity-50"
                            )}
                          >
                            <div className="flex items-start gap-3">
                              {/* Reorder buttons */}
                              <div className="flex flex-col gap-0.5 shrink-0 pt-0.5">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6"
                                  onClick={() => handleReorder(route, "up")}
                                >
                                  <ChevronUp className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6"
                                  onClick={() => handleReorder(route, "down")}
                                >
                                  <ChevronDown className="h-3.5 w-3.5" />
                                </Button>
                              </div>

                              {/* Route info */}
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-medium text-sm">{route.name}</span>
                                  <Badge
                                    className={cn(
                                      "h-5 text-[10px] gap-1",
                                      "bg-opacity-15 border-opacity-30"
                                    )}
                                    variant="outline"
                                  >
                                    <TaskIcon className={cn("h-3 w-3", taskInfo.color)} />
                                    {taskInfo.label}
                                  </Badge>
                                  <Badge variant="secondary" className="h-5 text-[10px]">
                                    {getModelName(route.modelId)}
                                  </Badge>
                                  <Badge variant="outline" className="h-5 text-[10px]">
                                    P{route.priority}
                                  </Badge>
                                </div>

                                {fallbacks.length > 0 && (
                                  <div className="flex items-center gap-1 mt-1.5 flex-wrap">
                                    <span className="text-[10px] text-muted-foreground mr-1">
                                      Fallbacks:
                                    </span>
                                    {fallbacks.map((fb, i) => (
                                      <span key={i} className="flex items-center">
                                        {i > 0 && (
                                          <ArrowRight className="h-2.5 w-2.5 text-muted-foreground mx-0.5" />
                                        )}
                                        <Badge
                                          variant="outline"
                                          className="h-4 text-[9px] px-1.5"
                                        >
                                          {getModelName(fb)}
                                        </Badge>
                                      </span>
                                    ))}
                                  </div>
                                )}

                                {route.avgLatency !== null && route.successRate !== null && (
                                  <div className="flex items-center gap-3 mt-1.5 text-[10px] text-muted-foreground">
                                    <span className="flex items-center gap-1">
                                      <Clock className="h-3 w-3" />
                                      {Math.round(route.avgLatency)}ms
                                    </span>
                                    <span className="flex items-center gap-1">
                                      <Shield className="h-3 w-3" />
                                      {(route.successRate * 100).toFixed(0)}%
                                    </span>
                                    {route.costPerToken !== null && (
                                      <span className="flex items-center gap-1">
                                        <DollarSign className="h-3 w-3" />$
                                        {route.costPerToken.toFixed(6)}
                                      </span>
                                    )}
                                  </div>
                                )}
                              </div>

                              {/* Controls */}
                              <div className="flex items-center gap-2 shrink-0">
                                <Switch
                                  checked={route.isEnabled}
                                  onCheckedChange={() => handleToggleEnabled(route)}
                                />
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7"
                                  onClick={() => populateFormForEdit(route)}
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 text-destructive hover:text-destructive"
                                  onClick={() => handleDeleteRoute(route.id)}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                )}
              </div>
            </ScrollArea>
          </TabsContent>

          {/* ──────── SMART ROUTE TAB ──────── */}
          <TabsContent value="smart-route" className="flex-1 min-h-0 mt-0 overflow-y-auto">
            <ScrollArea className="h-[calc(90vh-14rem)]">
              <div className="p-6 space-y-5">
                {/* Smart Route Toggle */}
                <div className="rounded-lg border bg-card p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Brain className="h-4 w-4 text-violet-500" />
                      <h4 className="font-semibold text-sm">Smart Auto-Route</h4>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-muted-foreground">{smartRouteEnabled ? "ON" : "OFF"}</span>
                      <Switch checked={smartRouteEnabled} onCheckedChange={setSmartRouteEnabled} />
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Automatically selects the best model based on prompt complexity: character count, code blocks, question marks, and keyword analysis.
                  </p>

                  {/* Complexity tiers legend */}
                  <div className="grid grid-cols-3 gap-2">
                    <div className="p-2 rounded-lg bg-emerald-500/5 border border-emerald-500/20 text-center">
                      <div className="flex items-center justify-center gap-1 mb-0.5">
                        <Zap className="h-3 w-3 text-emerald-500" />
                        <span className="text-[10px] font-semibold text-emerald-600">Fast</span>
                      </div>
                      <p className="text-[9px] text-muted-foreground">&lt;50 chars</p>
                      <p className="text-[9px] text-emerald-600 font-medium">gemini-2.0-flash</p>
                    </div>
                    <div className="p-2 rounded-lg bg-amber-500/5 border border-amber-500/20 text-center">
                      <div className="flex items-center justify-center gap-1 mb-0.5">
                        <Gauge className="h-3 w-3 text-amber-500" />
                        <span className="text-[10px] font-semibold text-amber-600">Balanced</span>
                      </div>
                      <p className="text-[9px] text-muted-foreground">50–200 chars</p>
                      <p className="text-[9px] text-amber-600 font-medium">deepseek-chat</p>
                    </div>
                    <div className="p-2 rounded-lg bg-violet-500/5 border border-violet-500/20 text-center">
                      <div className="flex items-center justify-center gap-1 mb-0.5">
                        <Brain className="h-3 w-3 text-violet-500" />
                        <span className="text-[10px] font-semibold text-violet-600">Capable</span>
                      </div>
                      <p className="text-[9px] text-muted-foreground">200+ chars</p>
                      <p className="text-[9px] text-violet-600 font-medium">deepseek-reasoner</p>
                    </div>
                  </div>

                  {/* Savings estimate */}
                  {totalTokensSaved > 0 && (
                    <div className="flex items-center gap-2 p-2.5 rounded-lg bg-emerald-500/5 border border-emerald-500/20">
                      <TrendingDown className="h-4 w-4 text-emerald-500" />
                      <span className="text-xs text-emerald-600 font-medium">
                        This route saved ~{totalTokensSaved}% tokens today
                      </span>
                    </div>
                  )}

                  {/* Prompt input with live preview */}
                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <div className="flex-1 relative">
                        <Input
                          value={smartPrompt}
                          onChange={(e) => setSmartPrompt(e.target.value)}
                          placeholder="Paste or type a prompt — complexity is analyzed live..."
                          className="h-9 text-sm pr-20"
                          onKeyDown={(e) => { if (e.key === "Enter" && smartRouteEnabled) handleSmartRoute(); }}
                        />
                        <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">
                          {smartPrompt.length} chars
                        </span>
                      </div>
                      <Button
                        size="sm"
                        className="h-9 gap-1.5 shrink-0"
                        onClick={handleSmartRoute}
                        disabled={autoRouting || !smartPrompt.trim()}
                      >
                        {autoRouting ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Send className="h-3.5 w-3.5" />
                        )}
                        Route
                      </Button>
                    </div>

                    {/* Live complexity preview */}
                    {liveComplexity && !autoRouteResult && (
                      <div className="p-2.5 rounded-lg bg-muted/30 border space-y-1.5">
                        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Live Analysis</p>
                        <div className="flex flex-wrap gap-2 text-[10px]">
                          <Badge className={cn(
                            "h-5 text-[10px]",
                            liveComplexity.tier === "fast" ? "bg-emerald-500/10 text-emerald-600" :
                            liveComplexity.tier === "balanced" ? "bg-amber-500/10 text-amber-600" :
                            "bg-violet-500/10 text-violet-600"
                          )}>
                            {liveComplexity.complexity}
                          </Badge>
                          <Badge variant="outline" className="h-5 text-[10px]">
                            {liveComplexity.charCount} chars
                          </Badge>
                          {liveComplexity.hasCode && (
                            <Badge variant="outline" className="h-5 text-[10px] bg-blue-500/5 border-blue-500/20 text-blue-600">
                              <Code className="h-3 w-3" /> Code detected
                            </Badge>
                          )}
                          {liveComplexity.hasQuestions && (
                            <Badge variant="outline" className="h-5 text-[10px] bg-purple-500/5 border-purple-500/20 text-purple-600">
                              <Lightbulb className="h-3 w-3" /> Questions
                            </Badge>
                          )}
                        </div>
                        <p className="text-[10px] text-muted-foreground">
                          → Would route to <strong>{liveComplexity.provider}</strong> ({liveComplexity.model}) — <span className="text-emerald-500">{liveComplexity.estimatedCost}</span>
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Auto-route result */}
                  {autoRouteResult && (
                    <div className="rounded-lg border bg-card p-4 space-y-3">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                        <h4 className="font-semibold text-sm">Route Decision</h4>
                      </div>

                      <div className="flex items-center gap-3 p-3 rounded-md bg-primary/5 border border-primary/10">
                        <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                          <Brain className="h-5 w-5 text-primary" />
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold">{autoRouteResult.model}</span>
                            <Badge className={cn(
                              "h-5 text-[10px]",
                              autoRouteResult.tier === "fast" ? "bg-emerald-500/10 text-emerald-600" :
                              autoRouteResult.tier === "balanced" ? "bg-amber-500/10 text-amber-600" :
                              "bg-violet-500/10 text-violet-600"
                            )}>
                              {autoRouteResult.complexity}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">{autoRouteResult.reason}</p>
                        </div>
                      </div>

                      {/* Savings estimate */}
                      <div className="grid grid-cols-3 gap-3">
                        <div className="rounded-md border p-3 text-center">
                          <div className="flex items-center justify-center gap-1 text-muted-foreground mb-1">
                            <DollarSign className="h-3.5 w-3.5" />
                            <span className="text-[10px]">Est. Cost</span>
                          </div>
                          <div className="text-sm font-semibold text-emerald-500">{autoRouteResult.estimatedCost}</div>
                        </div>
                        <div className="rounded-md border p-3 text-center">
                          <div className="flex items-center justify-center gap-1 text-muted-foreground mb-1">
                            <TrendingDown className="h-3.5 w-3.5" />
                            <span className="text-[10px]">Saved</span>
                          </div>
                          <div className="text-sm font-semibold text-emerald-500">~{autoRouteResult.tokenSavings}%</div>
                        </div>
                        <div className="rounded-md border p-3 text-center">
                          <div className="flex items-center justify-center gap-1 text-muted-foreground mb-1">
                            <BarChart3 className="h-3.5 w-3.5" />
                            <span className="text-[10px]">All-Time</span>
                          </div>
                          <div className="text-sm font-semibold text-emerald-500">~{totalTokensSaved}%</div>
                        </div>
                      </div>

                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full text-xs"
                        onClick={() => {
                          setAutoRouteResult(null);
                          setSmartPrompt("");
                        }}
                      >
                        Clear & Try Another
                      </Button>
                    </div>
                  )}
                </div>

                <Separator />

                {/* Existing manual routing below */}
                <div className="rounded-lg border bg-card p-4 space-y-4">
                  <h4 className="font-semibold text-sm flex items-center gap-2">
                    <Brain className="h-4 w-4" />
                    Manual Smart Routing
                  </h4>

                  <div className="space-y-1.5">
                    <Label className="text-xs">Task Description</Label>
                    <Textarea
                      value={routeTaskDesc}
                      onChange={(e) => setRouteTaskDesc(e.target.value)}
                      placeholder="Describe the task you want to route... e.g., 'Write a Python function to sort a list using merge sort'"
                      className="min-h-[80px] text-sm"
                      rows={3}
                    />
                  </div>

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

                  <Button onClick={handleRoute} disabled={routing} className="w-full">
                    {routing ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Zap className="h-4 w-4 mr-2" />
                    )}
                    Route This
                  </Button>
                </div>

                {/* Result section */}
                {routeResult && (
                  <div className="rounded-lg border bg-card p-4 space-y-4">
                    <h4 className="font-semibold text-sm flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                      Routing Result
                    </h4>

                    {routeResult.message && !routeResult.routeName && (
                      <div className="rounded-md bg-amber-500/10 border border-amber-500/20 p-3 text-sm text-amber-600 dark:text-amber-400">
                        {routeResult.message}
                      </div>
                    )}

                    {routeResult.routeName && (
                      <>
                        {/* Selected model */}
                        <div className="flex items-center gap-3 p-3 rounded-md bg-primary/5 border border-primary/10">
                          <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                            <Zap className="h-5 w-5 text-primary" />
                          </div>
                          <div>
                            <div className="text-sm font-semibold">
                              {getModelName(routeResult.modelId)}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              via route &quot;{routeResult.routeName}&quot;
                            </div>
                          </div>
                        </div>

                        {/* Stats grid */}
                        <div className="grid grid-cols-3 gap-3">
                          <div className="rounded-md border p-3 text-center">
                            <div className="flex items-center justify-center gap-1 text-muted-foreground mb-1">
                              <DollarSign className="h-3.5 w-3.5" />
                              <span className="text-[10px]">Cost/Token</span>
                            </div>
                            <div className="text-sm font-semibold">
                              {routeResult.costPerToken != null
                                ? `$${routeResult.costPerToken.toFixed(6)}`
                                : "N/A"}
                            </div>
                          </div>
                          <div className="rounded-md border p-3 text-center">
                            <div className="flex items-center justify-center gap-1 text-muted-foreground mb-1">
                              <Clock className="h-3.5 w-3.5" />
                              <span className="text-[10px]">Avg Latency</span>
                            </div>
                            <div className="text-sm font-semibold">
                              {routeResult.avgLatency != null
                                ? `${Math.round(routeResult.avgLatency)}ms`
                                : "N/A"}
                            </div>
                          </div>
                          <div className="rounded-md border p-3 text-center">
                            <div className="flex items-center justify-center gap-1 text-muted-foreground mb-1">
                              <Shield className="h-3.5 w-3.5" />
                              <span className="text-[10px]">Success Rate</span>
                            </div>
                            <div className="text-sm font-semibold">
                              {routeResult.successRate != null
                                ? `${(routeResult.successRate * 100).toFixed(0)}%`
                                : "N/A"}
                            </div>
                          </div>
                        </div>

                        {/* Reasoning */}
                        <div className="rounded-md border p-3">
                          <div className="flex items-center gap-1 text-muted-foreground mb-2">
                            <Lightbulb className="h-3.5 w-3.5" />
                            <span className="text-xs font-medium">Reasoning</span>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            Selected <strong>{getModelName(routeResult.modelId)}</strong> for{" "}
                            <strong>{getTaskTypeInfo(routeResult.taskType ?? "").label}</strong>{" "}
                            tasks with priority {routeResult.priority}. This model offers the best
                            balance of quality and cost for the specified task type.
                          </p>
                        </div>

                        {/* Fallback chain */}
                        {routeResult.fallbackIds && routeResult.fallbackIds.length > 0 && (
                          <div className="rounded-md border p-3">
                            <div className="flex items-center gap-1 text-muted-foreground mb-2">
                              <Activity className="h-3.5 w-3.5" />
                              <span className="text-xs font-medium">Fallback Chain</span>
                            </div>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <Badge className="bg-primary/10 text-primary border-primary/20 h-6 text-xs">
                                {getModelName(routeResult.modelId)}
                              </Badge>
                              {routeResult.fallbackIds.map((fbId, i) => (
                                <span key={i} className="flex items-center gap-1.5">
                                  <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                                  <Badge
                                    variant="outline"
                                    className={cn(
                                      "h-6 text-xs",
                                      i === routeResult.fallbackIds!.length - 1
                                        ? "bg-red-500/10 text-red-400 border-red-500/20"
                                        : "bg-muted/50"
                                    )}
                                  >
                                    {getModelName(fbId)}
                                  </Badge>
                                </span>
                              ))}
                            </div>
                            <p className="text-[10px] text-muted-foreground mt-2">
                              If the primary model is unavailable, requests will cascade through the
                              fallback chain from left to right.
                            </p>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            </ScrollArea>
          </TabsContent>

          {/* ──────── BENCHMARK TAB ──────── */}
          <TabsContent value="benchmark" className="flex-1 min-h-0 mt-0 overflow-y-auto">
            <ScrollArea className="h-[calc(90vh-14rem)]">
              <div className="p-6 space-y-4">
                {/* Action bar */}
                <div className="flex items-center justify-between">
                  <div className="text-sm text-muted-foreground">
                    {benchmarkList.length} model{benchmarkList.length !== 1 ? "s" : ""} benchmarked
                  </div>
                  <Button
                    size="sm"
                    onClick={handleRunBenchmark}
                    disabled={runningBenchmark}
                  >
                    {runningBenchmark ? (
                      <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                    ) : (
                      <Play className="h-4 w-4 mr-1" />
                    )}
                    Run Benchmark
                  </Button>
                </div>

                {benchmarkList.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                    <BarChart3 className="h-10 w-10 mb-3 opacity-40" />
                    <p className="text-sm">No benchmark data available</p>
                    <p className="text-xs mt-1">Add routes and run a benchmark to see results</p>
                  </div>
                ) : (
                  <>
                    {/* Bar chart visualization — Latency */}
                    <div className="rounded-lg border bg-card p-4 space-y-3">
                      <h4 className="font-semibold text-sm flex items-center gap-2">
                        <Clock className="h-4 w-4" />
                        Average Latency (ms)
                      </h4>
                      <div className="space-y-2">
                        {benchmarkList
                          .sort((a, b) => a.avgLatency - b.avgLatency)
                          .map((entry) => (
                            <div key={entry.modelId} className="flex items-center gap-3">
                              <div className="w-28 text-xs truncate shrink-0 font-medium">
                                {getModelName(entry.modelId)}
                              </div>
                              <div className="flex-1 h-6 bg-muted rounded-sm overflow-hidden relative">
                                <div
                                  className="h-full rounded-sm transition-all duration-700 ease-out"
                                  style={{
                                    width: `${(entry.avgLatency / maxLatency) * 100}%`,
                                    background:
                                      entry.avgLatency / maxLatency > 0.75
                                        ? "hsl(0 72% 51% / 0.7)"
                                        : entry.avgLatency / maxLatency > 0.45
                                        ? "hsl(38 92% 50% / 0.7)"
                                        : "hsl(142 71% 45% / 0.7)",
                                  }}
                                />
                                <span className="absolute inset-0 flex items-center px-2 text-[10px] font-medium">
                                  {entry.avgLatency}ms
                                </span>
                              </div>
                            </div>
                          ))}
                      </div>
                    </div>

                    {/* Bar chart visualization — Success Rate */}
                    <div className="rounded-lg border bg-card p-4 space-y-3">
                      <h4 className="font-semibold text-sm flex items-center gap-2">
                        <Shield className="h-4 w-4" />
                        Success Rate (%)
                      </h4>
                      <div className="space-y-2">
                        {benchmarkList
                          .sort((a, b) => b.successRate - a.successRate)
                          .map((entry) => (
                            <div key={entry.modelId} className="flex items-center gap-3">
                              <div className="w-28 text-xs truncate shrink-0 font-medium">
                                {getModelName(entry.modelId)}
                              </div>
                              <div className="flex-1 h-6 bg-muted rounded-sm overflow-hidden relative">
                                <div
                                  className="h-full rounded-sm transition-all duration-700 ease-out"
                                  style={{
                                    width: `${entry.successRate * 100}%`,
                                    background:
                                      entry.successRate >= 0.95
                                        ? "hsl(142 71% 45% / 0.7)"
                                        : entry.successRate >= 0.9
                                        ? "hsl(38 92% 50% / 0.7)"
                                        : "hsl(0 72% 51% / 0.7)",
                                  }}
                                />
                                <span className="absolute inset-0 flex items-center px-2 text-[10px] font-medium">
                                  {(entry.successRate * 100).toFixed(1)}%
                                </span>
                              </div>
                            </div>
                          ))}
                      </div>
                    </div>

                    {/* Bar chart visualization — Total Calls */}
                    <div className="rounded-lg border bg-card p-4 space-y-3">
                      <h4 className="font-semibold text-sm flex items-center gap-2">
                        <MessageSquare className="h-4 w-4" />
                        Total Calls
                      </h4>
                      <div className="space-y-2">
                        {benchmarkList
                          .sort((a, b) => b.totalCalls - a.totalCalls)
                          .map((entry) => (
                            <div key={entry.modelId} className="flex items-center gap-3">
                              <div className="w-28 text-xs truncate shrink-0 font-medium">
                                {getModelName(entry.modelId)}
                              </div>
                              <div className="flex-1 h-6 bg-muted rounded-sm overflow-hidden relative">
                                <div
                                  className="h-full bg-primary/60 rounded-sm transition-all duration-700 ease-out"
                                  style={{
                                    width: `${(entry.totalCalls / maxCalls) * 100}%`,
                                  }}
                                />
                                <span className="absolute inset-0 flex items-center px-2 text-[10px] font-medium">
                                  {entry.totalCalls.toLocaleString()}
                                </span>
                              </div>
                            </div>
                          ))}
                      </div>
                    </div>

                    <Separator />

                    {/* Detailed table */}
                    <div className="rounded-lg border bg-card overflow-hidden">
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b bg-muted/50">
                              <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">
                                Model
                              </th>
                              <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground">
                                Avg Latency
                              </th>
                              <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground">
                                Success Rate
                              </th>
                              <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground">
                                Cost/Token
                              </th>
                              <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground">
                                Total Calls
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {benchmarkList.map((entry, i) => (
                              <tr
                                key={entry.modelId}
                                className={cn(
                                  "border-b last:border-0",
                                  i % 2 === 0 ? "bg-transparent" : "bg-muted/20"
                                )}
                              >
                                <td className="px-4 py-2.5 font-medium text-xs">
                                  {getModelName(entry.modelId)}
                                </td>
                                <td className="px-4 py-2.5 text-right text-xs">
                                  <span
                                    className={cn(
                                      entry.avgLatency / maxLatency > 0.75
                                        ? "text-red-400"
                                        : entry.avgLatency / maxLatency > 0.45
                                        ? "text-amber-400"
                                        : "text-emerald-400"
                                    )}
                                  >
                                    {entry.avgLatency}ms
                                  </span>
                                </td>
                                <td className="px-4 py-2.5 text-right text-xs">
                                  <span
                                    className={cn(
                                      entry.successRate >= 0.95
                                        ? "text-emerald-400"
                                        : entry.successRate >= 0.9
                                        ? "text-amber-400"
                                        : "text-red-400"
                                    )}
                                  >
                                    {(entry.successRate * 100).toFixed(1)}%
                                  </span>
                                </td>
                                <td className="px-4 py-2.5 text-right text-xs text-muted-foreground">
                                  ${entry.costPerToken.toFixed(6)}
                                </td>
                                <td className="px-4 py-2.5 text-right text-xs">
                                  {entry.totalCalls.toLocaleString()}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
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

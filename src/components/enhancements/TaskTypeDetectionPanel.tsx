"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
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
  Cpu,
  Search,
  Loader2,
  Zap,
  Brain,
  Code2,
  MessageSquare,
  FileText,
  PenTool,
  BarChart3,
  ArrowRight,
  Save,
  CheckCircle2,
  Layers,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ───────────────────────────────────────────────────────────────────

type TaskType = "coding" | "creative" | "analysis" | "conversation" | "reasoning" | "extraction";

interface ClassificationResult {
  type: TaskType;
  confidence: number;
  suggestedModel: string;
  fallbackChain: string[];
  reasoning: string;
}

interface RoutingPreference {
  taskType: TaskType;
  preferredModel: string;
  fallbackModel: string;
  enabled: boolean;
}

interface TaskTypeDetectionPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function taskTypeIcon(type: TaskType) {
  switch (type) {
    case "coding":
      return <Code2 className="h-4 w-4" />;
    case "creative":
      return <PenTool className="h-4 w-4" />;
    case "analysis":
      return <BarChart3 className="h-4 w-4" />;
    case "conversation":
      return <MessageSquare className="h-4 w-4" />;
    case "reasoning":
      return <Brain className="h-4 w-4" />;
    case "extraction":
      return <FileText className="h-4 w-4" />;
  }
}

function taskTypeColor(type: TaskType) {
  switch (type) {
    case "coding":
      return "bg-emerald-500/15 text-emerald-400 border-emerald-500/30";
    case "creative":
      return "bg-pink-500/15 text-pink-400 border-pink-500/30";
    case "analysis":
      return "bg-amber-500/15 text-amber-400 border-amber-500/30";
    case "conversation":
      return "bg-cyan-500/15 text-cyan-400 border-cyan-500/30";
    case "reasoning":
      return "bg-violet-500/15 text-violet-400 border-violet-500/30";
    case "extraction":
      return "bg-fuchsia-500/15 text-fuchsia-400 border-fuchsia-500/30";
  }
}

function confidenceColor(confidence: number) {
  if (confidence >= 80) return "text-emerald-400";
  if (confidence >= 50) return "text-amber-400";
  return "text-red-400";
}

// ─── Component ───────────────────────────────────────────────────────────────

export function TaskTypeDetectionPanel({ open, onOpenChange }: TaskTypeDetectionPanelProps) {
  const [prompt, setPrompt] = useState("");
  const [result, setResult] = useState<ClassificationResult | null>(null);
  const [classifying, setClassifying] = useState(false);
  const [routingPrefs, setRoutingPrefs] = useState<RoutingPreference[]>([]);
  const [loadingPrefs, setLoadingPrefs] = useState(false);
  const [savingPrefs, setSavingPrefs] = useState(false);
  const [activeTab, setActiveTab] = useState("classify");

  const fetchRoutingPrefs = useCallback(async () => {
    setLoadingPrefs(true);
    try {
      const res = await fetch("/api/task-type/routing");
      if (res.ok) {
        const data = await res.json();
        setRoutingPrefs(data.preferences || []);
      }
    } catch {
      toast.error("Failed to load routing preferences");
    } finally {
      setLoadingPrefs(false);
    }
  }, []);

  useEffect(() => {
    if (open) fetchRoutingPrefs();
  }, [open, fetchRoutingPrefs]);

  const classifyPrompt = async () => {
    if (!prompt.trim()) {
      toast.error("Enter a prompt to classify");
      return;
    }
    setClassifying(true);
    setResult(null);
    try {
      const res = await fetch("/api/task-type", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: prompt.trim() }),
      });
      if (res.ok) {
        const data = await res.json();
        setResult(data.classification);
      } else {
        const err = await res.json();
        toast.error(err.error || "Classification failed");
      }
    } catch {
      toast.error("Failed to classify prompt");
    } finally {
      setClassifying(false);
    }
  };

  const updateRoutingPref = (taskType: TaskType, field: "preferredModel" | "fallbackModel" | "enabled", value: string | boolean) => {
    setRoutingPrefs((prev) =>
      prev.map((p) => (p.taskType === taskType ? { ...p, [field]: value } : p))
    );
  };

  const saveRoutingPrefs = async () => {
    setSavingPrefs(true);
    try {
      const res = await fetch("/api/task-type/routing", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preferences: routingPrefs }),
      });
      if (res.ok) {
        toast.success("Routing preferences saved");
      } else {
        const err = await res.json();
        toast.error(err.error || "Failed to save");
      }
    } catch {
      toast.error("Failed to save routing preferences");
    } finally {
      setSavingPrefs(false);
    }
  };

  const defaultModels = [
    "claude-3.5-sonnet",
    "gpt-4o",
    "gpt-4-turbo",
    "claude-3-haiku",
    "local-llama3",
    "gemini-pro",
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl max-h-[92vh] overflow-hidden flex flex-col" showCloseButton>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-gradient-to-br from-emerald-500/20 to-cyan-500/20 border border-emerald-500/30">
              <Cpu className="h-4 w-4 text-emerald-400" />
            </div>
            Task Type Detection
          </DialogTitle>
          <DialogDescription>
            Prompt classification for intelligent model routing
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
          <TabsList className="grid w-full grid-cols-2 mb-1 shrink-0">
            <TabsTrigger value="classify" className="gap-1.5 text-xs">
              <Search className="h-3.5 w-3.5" />
              Classify
            </TabsTrigger>
            <TabsTrigger value="routing" className="gap-1.5 text-xs">
              <Layers className="h-3.5 w-3.5" />
              Routing
            </TabsTrigger>
          </TabsList>

          {/* ═══ CLASSIFY TAB ═══ */}
          <TabsContent value="classify" className="flex-1 min-h-0 mt-0 overflow-y-auto">
            <ScrollArea className="h-[calc(90vh-200px)]">
              <div className="space-y-5 p-1 pr-4">
                {/* Input */}
                <div className="rounded-xl border bg-card p-5 space-y-4">
                  <h4 className="text-sm font-semibold flex items-center gap-2">
                    <Zap className="h-4 w-4 text-emerald-400" />
                    Test Prompt Classification
                  </h4>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">Enter a prompt</Label>
                    <Input
                      value={prompt}
                      onChange={(e) => setPrompt(e.target.value)}
                      placeholder="e.g., Write a Python function to sort a linked list..."
                      className="h-9"
                      onKeyDown={(e) => e.key === "Enter" && classifyPrompt()}
                    />
                  </div>
                  <Button
                    size="sm"
                    onClick={classifyPrompt}
                    disabled={classifying || !prompt.trim()}
                    className="h-9 text-xs gap-1.5 min-w-[150px]"
                  >
                    {classifying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
                    Classify
                  </Button>
                </div>

                {/* Result */}
                {classifying && (
                  <div className="flex items-center justify-center py-8 text-muted-foreground">
                    <Loader2 className="h-5 w-5 animate-spin mr-2" />
                    Classifying prompt...
                  </div>
                )}

                {result && !classifying && (
                  <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-5 space-y-4">
                    <h4 className="text-sm font-semibold text-emerald-400">Classification Result</h4>

                    {/* Detected Type */}
                    <div className="flex items-center gap-3">
                      <div className={cn("flex items-center justify-center h-12 w-12 rounded-lg border", taskTypeColor(result.type))}>
                        {taskTypeIcon(result.type)}
                      </div>
                      <div>
                        <div className="text-lg font-bold capitalize">{result.type}</div>
                        <div className="flex items-center gap-2">
                          <span className={cn("text-sm font-bold", confidenceColor(result.confidence))}>
                            {result.confidence.toFixed(1)}% confidence
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Confidence Bar */}
                    <div className="space-y-1">
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className={cn(
                            "h-full rounded-full transition-all",
                            result.confidence >= 80 ? "bg-emerald-500" :
                            result.confidence >= 50 ? "bg-amber-500" : "bg-red-500"
                          )}
                          style={{ width: `${result.confidence}%` }}
                        />
                      </div>
                    </div>

                    <Separator />

                    {/* Suggested Model */}
                    <div className="space-y-2">
                      <Label className="text-xs font-medium">Suggested Model</Label>
                      <div className="flex items-center gap-2">
                        <Badge className="h-6 text-xs bg-emerald-500/15 text-emerald-400 border-emerald-500/30 border">
                          {result.suggestedModel}
                        </Badge>
                      </div>
                    </div>

                    {/* Fallback Chain */}
                    <div className="space-y-2">
                      <Label className="text-xs font-medium">Fallback Chain</Label>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {result.fallbackChain.map((model, i) => (
                          <div key={i} className="flex items-center gap-1.5">
                            {i > 0 && <ArrowRight className="h-3 w-3 text-muted-foreground" />}
                            <Badge variant="outline" className="h-5 text-[10px]">{model}</Badge>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Reasoning */}
                    {result.reasoning && (
                      <div className="space-y-1">
                        <Label className="text-xs font-medium">Reasoning</Label>
                        <p className="text-xs text-muted-foreground">{result.reasoning}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </ScrollArea>
          </TabsContent>

          {/* ═══ ROUTING TAB ═══ */}
          <TabsContent value="routing" className="flex-1 min-h-0 mt-0 overflow-y-auto">
            <ScrollArea className="h-[calc(90vh-200px)]">
              <div className="space-y-5 p-1 pr-4">
                <p className="text-xs text-muted-foreground">
                  Override the default model routing for each task type. Changes apply to new conversations.
                </p>

                {loadingPrefs ? (
                  <div className="flex items-center justify-center py-8 text-muted-foreground">
                    <Loader2 className="h-5 w-5 animate-spin mr-2" />
                    Loading routing preferences...
                  </div>
                ) : routingPrefs.length === 0 ? (
                  <div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
                    <Layers className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">No routing preferences configured</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {routingPrefs.map((pref) => (
                      <div key={pref.taskType} className="rounded-xl border bg-card p-4 space-y-3">
                        <div className="flex items-center gap-3">
                          <div className={cn("flex items-center justify-center h-8 w-8 rounded-lg", taskTypeColor(pref.taskType))}>
                            {taskTypeIcon(pref.taskType)}
                          </div>
                          <span className="text-sm font-semibold capitalize">{pref.taskType}</span>
                          <Badge
                            variant={pref.enabled ? "default" : "secondary"}
                            className={cn(
                              "h-5 text-[10px] border ml-auto cursor-pointer",
                              pref.enabled
                                ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                                : "bg-zinc-500/15 text-zinc-400 border-zinc-500/30"
                            )}
                            onClick={() => updateRoutingPref(pref.taskType, "enabled", !pref.enabled)}
                          >
                            {pref.enabled ? "Enabled" : "Disabled"}
                          </Badge>
                        </div>
                        {pref.enabled && (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pl-11">
                            <div className="space-y-1.5">
                              <Label className="text-[10px] font-medium">Preferred Model</Label>
                              <Select
                                value={pref.preferredModel}
                                onValueChange={(v) => updateRoutingPref(pref.taskType, "preferredModel", v)}
                              >
                                <SelectTrigger className="h-8 text-xs">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {defaultModels.map((m) => (
                                    <SelectItem key={m} value={m}>{m}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-1.5">
                              <Label className="text-[10px] font-medium">Fallback Model</Label>
                              <Select
                                value={pref.fallbackModel}
                                onValueChange={(v) => updateRoutingPref(pref.taskType, "fallbackModel", v)}
                              >
                                <SelectTrigger className="h-8 text-xs">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {defaultModels.map((m) => (
                                    <SelectItem key={m} value={m}>{m}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex justify-end">
                  <Button
                    size="sm"
                    onClick={saveRoutingPrefs}
                    disabled={savingPrefs}
                    className="h-9 text-xs gap-1.5 min-w-[130px]"
                  >
                    {savingPrefs ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                    Save Preferences
                  </Button>
                </div>
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

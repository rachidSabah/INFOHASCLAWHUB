"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  Zap, Brain, TrendingUp, BarChart3, Timer, DollarSign, RefreshCw,
  ChevronDown, Activity, FileText, Gauge, Cpu, Layers, Loader2, Trash2,
} from "lucide-react";
import { optimizeRequest, type OptimizationResult, type PromptAnalysis } from "@/lib/optimization-engine";
import { getCacheStats, clearCache } from "@/lib/response-cache";

interface MetricCard {
  label: string;
  value: string;
  sub: string;
  icon: React.ComponentType<any>;
  color: string;
  trend?: "up" | "down" | "neutral";
}

export default function OptimizationPanel({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [testPrompt, setTestPrompt] = useState("");
  const [testModel, setTestModel] = useState("gemini-2.0-flash");
  const [result, setResult] = useState<OptimizationResult | null>(null);
  const [analysis, setAnalysis] = useState<PromptAnalysis | null>(null);
  const [cacheStats, setCacheStats] = useState({ entries: 0, cachedTokens: 0, estimatedSavings: 0, maxEntries: 100 });
  const [sessionStats, setSessionStats] = useState({ totalOptimized: 0, totalTokensSaved: 0, avgCompression: 0 });
  const [optimizing, setOptimizing] = useState(false);

  useEffect(() => { if (open) setCacheStats(getCacheStats()); }, [open]);

  const handleOptimize = useCallback(() => {
    if (!testPrompt.trim()) return;
    setOptimizing(true);
    setTimeout(() => {
      const r = optimizeRequest(testPrompt, testModel);
      const { analyzePrompt } = require("@/lib/optimization-engine");
      setResult(r);
      setAnalysis(analyzePrompt(testPrompt));
      setSessionStats(prev => ({
        totalOptimized: prev.totalOptimized + 1,
        totalTokensSaved: prev.totalTokensSaved + r.tokenSavings,
        avgCompression: prev.totalOptimized > 0
          ? (prev.avgCompression * prev.totalOptimized + (1 - r.compressionRatio)) / (prev.totalOptimized + 1)
          : (1 - r.compressionRatio),
      }));
      setOptimizing(false);
    }, 300);
  }, [testPrompt, testModel]);

  const metrics: MetricCard[] = useMemo(() => [
    { label: "Session Optimizations", value: String(sessionStats.totalOptimized), sub: "prompts optimized", icon: Zap, color: "text-amber-500" },
    { label: "Tokens Saved", value: sessionStats.totalTokensSaved.toLocaleString(), sub: `${sessionStats.totalOptimized > 0 ? Math.round(sessionStats.avgCompression * 100) : 0}% avg compression`, icon: TrendingUp, color: "text-green-500" },
    { label: "Cache Entries", value: String(cacheStats.entries), sub: `${cacheStats.cachedTokens.toLocaleString()} tokens cached`, icon: Layers, color: "text-blue-500" },
    { label: "Est. Cost Saved", value: `$${((sessionStats.totalTokensSaved / 1000) * 0.002).toFixed(4)}`, sub: "at $2/M tokens", icon: DollarSign, color: "text-emerald-500" },
  ], [sessionStats, cacheStats]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl h-[85vh] flex flex-col p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-5 py-3 border-b border-border shrink-0">
          <DialogTitle className="flex items-center gap-2 text-sm">
            <Zap className="h-4 w-4 text-amber-500" />
            Optimization Engine
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Metrics Row */}
          <div className="grid grid-cols-4 gap-3">
            {metrics.map((m) => {
              const Icon = m.icon;
              return (
                <div key={m.label} className="rounded-lg border bg-card p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <Icon className={cn("h-3.5 w-3.5", m.color)} />
                    <span className="text-[10px] text-muted-foreground font-medium">{m.label}</span>
                  </div>
                  <p className="text-xl font-bold">{m.value}</p>
                  <p className="text-[9px] text-muted-foreground">{m.sub}</p>
                </div>
              );
            })}
          </div>

          {/* Test Optimization */}
          <div className="rounded-xl border bg-card p-4 space-y-3">
            <h4 className="text-xs font-semibold flex items-center gap-1"><Gauge className="h-3.5 w-3.5 text-primary" /> Test Optimizer</h4>
            <textarea
              className="w-full min-h-[80px] rounded-md border border-input bg-background px-3 py-2 text-xs resize-none font-mono"
              placeholder="Paste a prompt to test optimization..."
              value={testPrompt}
              onChange={(e) => setTestPrompt(e.target.value)}
            />
            <div className="flex gap-2">
              <input
                className="flex-1 h-8 rounded-md border border-input bg-background px-2 text-xs"
                placeholder="Model (e.g. gemini-2.0-flash)"
                value={testModel}
                onChange={(e) => setTestModel(e.target.value)}
              />
              <Button size="sm" className="h-8 text-xs" onClick={handleOptimize} disabled={optimizing || !testPrompt.trim()}>
                {optimizing ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Zap className="h-3.5 w-3.5 mr-1" />}
                Optimize
              </Button>
            </div>
          </div>

          {/* Results */}
          {result && (
            <div className="space-y-3">
              <div className="rounded-xl border border-green-500/30 bg-green-500/5 p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-green-600">Optimization Result</span>
                  <span className="text-[10px] text-muted-foreground">{result.actions.length} actions applied</span>
                </div>
                <div className="flex gap-3 text-xs">
                  <div><span className="text-muted-foreground">Original: </span><span className="font-mono font-bold">{result.originalTokens}</span> tokens</div>
                  <div><span className="text-muted-foreground">Optimized: </span><span className="font-mono font-bold text-green-600">{result.optimizedTokens}</span> tokens</div>
                  <div><span className="text-muted-foreground">Ratio: </span><span className="font-mono font-bold">{Math.round(result.compressionRatio * 100)}%</span></div>
                  <div><span className="text-muted-foreground">Saved: </span><span className="font-mono font-bold text-amber-500">{result.tokenSavings}</span> tokens</div>
                </div>
                <div className="flex flex-wrap gap-1">
                  {result.actions.map((a, i) => (
                    <span key={i} className="text-[9px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">{a}</span>
                  ))}
                </div>
              </div>

              {analysis && (
                <div className="rounded-xl border bg-card p-3 space-y-2">
                  <h5 className="text-[10px] font-bold uppercase text-muted-foreground">Prompt Analysis</h5>
                  <div className="grid grid-cols-4 gap-2 text-[10px]">
                    <div><span className="text-muted-foreground">Intent: </span><span className="font-semibold">{analysis.intent}</span></div>
                    <div><span className="text-muted-foreground">Complexity: </span><span className={cn("font-semibold", analysis.complexity === "complex" ? "text-red-500" : analysis.complexity === "medium" ? "text-amber-500" : "text-green-500")}>{analysis.complexity}</span></div>
                    <div><span className="text-muted-foreground">Filler words: </span><span className="font-semibold">{analysis.fillerWords}</span></div>
                    <div><span className="text-muted-foreground">Est. tokens: </span><span className="font-semibold">{analysis.estimatedTokens}</span></div>
                  </div>
                  <div className="flex gap-3 text-[10px]">
                    {analysis.needsReasoning && <span className="px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-500">Reasoning</span>}
                    {analysis.needsCreativity && <span className="px-1.5 py-0.5 rounded bg-pink-500/10 text-pink-500">Creative</span>}
                    {analysis.needsCodegen && <span className="px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-500">Code</span>}
                  </div>
                </div>
              )}

              <div className="rounded-xl border bg-card p-3">
                <h5 className="text-[10px] font-bold uppercase text-muted-foreground mb-2">Optimized Prompt</h5>
                <pre className="text-xs font-mono bg-muted/30 p-3 rounded-lg max-h-40 overflow-y-auto whitespace-pre-wrap">{result.optimizedPrompt}</pre>
              </div>
            </div>
          )}

          {/* Cache Management */}
          <div className="rounded-xl border bg-card p-3">
            <div className="flex items-center justify-between mb-2">
              <h5 className="text-[10px] font-bold uppercase text-muted-foreground flex items-center gap-1">
                <Layers className="h-3 w-3" /> Response Cache
              </h5>
              <Button variant="ghost" size="sm" className="h-6 text-[10px]" onClick={() => { clearCache(); setCacheStats(getCacheStats()); toast.success("Cache cleared"); }}>
                <Trash2 className="h-3 w-3 mr-1" /> Clear
              </Button>
            </div>
            <div className="text-[10px] text-muted-foreground">
              {cacheStats.entries} entries cached ({cacheStats.cachedTokens.toLocaleString()} tokens) — 
              max {cacheStats.maxEntries} entries, 5-min TTL
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

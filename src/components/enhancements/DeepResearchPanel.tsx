"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import {
  Search,
  Loader2,
  Globe,
  FileText,
  Download,
  ChevronRight,
  Shield,
  BookOpen,
  Layers,
  Zap,
  Brain,
  Clock,
  CheckCircle2,
  ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ───────────────────────────────────────────────────────────────────

type ResearchDepth = "quick" | "standard" | "deep" | "exhaustive";

interface ResearchPhase {
  name: string;
  status: "pending" | "active" | "completed";
  progress: number;
}

interface ResearchSource {
  id: string;
  title: string;
  url: string;
  credibility: number;
  type: "academic" | "news" | "docs" | "blog" | "repo";
  snippet: string;
}

interface ResearchReport {
  id: string;
  query: string;
  depth: ResearchDepth;
  status: "running" | "completed" | "failed";
  phases: ResearchPhase[];
  sources: ResearchSource[];
  synthesis?: string;
  completedAt?: string;
}

interface DeepResearchPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function depthConfig(d: ResearchDepth) {
  switch (d) {
    case "quick":
      return { label: "Quick", time: "~30s", steps: 3, color: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" };
    case "standard":
      return { label: "Standard", time: "~2min", steps: 5, color: "bg-cyan-500/15 text-cyan-400 border-cyan-500/30" };
    case "deep":
      return { label: "Deep", time: "~5min", steps: 8, color: "bg-violet-500/15 text-violet-400 border-violet-500/30" };
    case "exhaustive":
      return { label: "Exhaustive", time: "~15min", steps: 12, color: "bg-fuchsia-500/15 text-fuchsia-400 border-fuchsia-500/30" };
  }
}

function sourceTypeIcon(t: string) {
  switch (t) {
    case "academic":
      return <BookOpen className="h-3.5 w-3.5" />;
    case "news":
      return <Globe className="h-3.5 w-3.5" />;
    case "docs":
      return <FileText className="h-3.5 w-3.5" />;
    case "repo":
      return <Layers className="h-3.5 w-3.5" />;
    default:
      return <Globe className="h-3.5 w-3.5" />;
  }
}

function credibilityColor(score: number) {
  if (score >= 80) return "text-emerald-400";
  if (score >= 50) return "text-amber-400";
  return "text-red-400";
}

// ─── Component ───────────────────────────────────────────────────────────────

export function DeepResearchPanel({ open, onOpenChange }: DeepResearchPanelProps) {
  const [query, setQuery] = useState("");
  const [depth, setDepth] = useState<ResearchDepth>("standard");
  const [activeReport, setActiveReport] = useState<ResearchReport | null>(null);
  const [pastReports, setPastReports] = useState<ResearchReport[]>([]);
  const [loading, setLoading] = useState(false);
  const [researching, setResearching] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/deep-research");
      if (res.ok) {
        const data = await res.json();
        setActiveReport(data.activeReport || null);
        setPastReports(data.pastReports || []);
      }
    } catch {
      toast.error("Failed to load research data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) fetchData();
  }, [open, fetchData]);

  // Auto-refresh for active research
  useEffect(() => {
    if (!open || !activeReport || activeReport.status !== "running") return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/deep-research/${activeReport.id}`);
        if (res.ok) {
          const data = await res.json();
          setActiveReport(data.report);
          if (data.report?.status !== "running") {
            setActiveReport(null);
            fetchData();
          }
        }
      } catch { /* silent */ }
    }, 3000);
    return () => clearInterval(interval);
  }, [open, activeReport, fetchData]);

  const startResearch = async () => {
    if (!query.trim()) {
      toast.error("Enter a research query");
      return;
    }
    setResearching(true);
    try {
      const res = await fetch("/api/deep-research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: query.trim(), depth }),
      });
      if (res.ok) {
        const data = await res.json();
        setActiveReport(data.report);
        toast.success("Research started!");
        setQuery("");
      } else {
        const err = await res.json();
        toast.error(err.error || "Failed to start research");
      }
    } catch {
      toast.error("Failed to start research");
    } finally {
      setResearching(false);
    }
  };

  const exportReport = (report: ResearchReport) => {
    if (!report.synthesis) return;
    const blob = new Blob([report.synthesis], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `research-${report.id}.md`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Report exported");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-5xl max-h-[92vh] overflow-hidden flex flex-col" showCloseButton>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-gradient-to-br from-cyan-500/20 to-blue-500/20 border border-cyan-500/30">
              <Search className="h-4 w-4 text-cyan-400" />
            </div>
            Deep Research Mode
          </DialogTitle>
          <DialogDescription>
            Iterative multi-step research with source validation and synthesis
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 min-h-0">
          <div className="space-y-5 p-1 pr-4">
            {/* Query Input */}
            <div className="rounded-xl border bg-card p-5 space-y-4">
              <h4 className="text-sm font-semibold flex items-center gap-2">
                <Brain className="h-4 w-4 text-cyan-400" />
                New Research Query
              </h4>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Research Topic</Label>
                <Textarea
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="e.g., Compare transformer architectures for code generation tasks..."
                  className="min-h-[60px] text-sm"
                />
              </div>
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                <div className="space-y-1.5 flex-1 w-full sm:w-auto">
                  <Label className="text-xs font-medium">Depth</Label>
                  <Select value={depth} onValueChange={(v) => setDepth(v as ResearchDepth)}>
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="quick">⚡ Quick (~30s)</SelectItem>
                      <SelectItem value="standard">🔍 Standard (~2min)</SelectItem>
                      <SelectItem value="deep">🧠 Deep (~5min)</SelectItem>
                      <SelectItem value="exhaustive">🔬 Exhaustive (~15min)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  size="sm"
                  onClick={startResearch}
                  disabled={researching || !query.trim()}
                  className="h-9 text-xs gap-1.5 min-w-[150px] sm:mt-5"
                >
                  {researching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
                  Start Research
                </Button>
              </div>
              <div className="flex items-center gap-2">
                <Badge className={cn("h-5 text-[10px] border", depthConfig(depth).color)}>
                  {depthConfig(depth).label}
                </Badge>
                <span className="text-[10px] text-muted-foreground">
                  {depthConfig(depth).steps} steps · {depthConfig(depth).time}
                </span>
              </div>
            </div>

            {/* Active Research */}
            {activeReport && (
              <div className="rounded-xl border border-cyan-500/30 bg-cyan-500/5 p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-cyan-400 flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Research in Progress
                  </h4>
                  <Badge className="h-5 text-[10px] border bg-cyan-500/15 text-cyan-400 border-cyan-500/30">
                    {activeReport.status}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">&quot;{activeReport.query}&quot;</p>

                {/* Phase Progress */}
                <div className="space-y-2">
                  {activeReport.phases.map((phase, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <div className={cn(
                        "flex items-center justify-center h-6 w-6 rounded-full text-[10px] font-bold border shrink-0",
                        phase.status === "active"
                          ? "border-cyan-500/50 bg-cyan-500/10 text-cyan-400 animate-pulse"
                          : phase.status === "completed"
                            ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-400"
                            : "border-zinc-700/50 bg-zinc-800/30 text-zinc-500"
                      )}>
                        {phase.status === "completed" ? <CheckCircle2 className="h-3 w-3" /> : i + 1}
                      </div>
                      <span className={cn(
                        "text-xs flex-1",
                        phase.status === "active" ? "text-cyan-400 font-medium" :
                        phase.status === "completed" ? "text-emerald-400" : "text-zinc-500"
                      )}>
                        {phase.name}
                      </span>
                      {phase.status === "active" && (
                        <Progress value={phase.progress} className="h-1.5 w-20" />
                      )}
                    </div>
                  ))}
                </div>

                {/* Live Sources */}
                {activeReport.sources.length > 0 && (
                  <div className="space-y-2">
                    <h5 className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                      <Globe className="h-3 w-3" />
                      Sources Found ({activeReport.sources.length})
                    </h5>
                    <div className="space-y-1.5 max-h-40 overflow-y-auto">
                      {activeReport.sources.slice(0, 5).map((src) => (
                        <div key={src.id} className="flex items-center gap-2 rounded bg-muted/30 p-2">
                          {sourceTypeIcon(src.type)}
                          <span className="text-[10px] font-medium truncate flex-1">{src.title}</span>
                          <span className={cn("text-[10px] font-bold", credibilityColor(src.credibility))}>
                            {src.credibility}%
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Past Reports */}
            <div className="rounded-xl border bg-card p-5 space-y-3">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Past Reports</h4>
              {loading ? (
                <div className="flex items-center justify-center py-8 text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin mr-2" />
                  Loading...
                </div>
              ) : pastReports.length === 0 ? (
                <div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
                  <Search className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">No past research reports</p>
                  <p className="text-xs mt-1">Start a research query above</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {pastReports.map((report) => (
                    <div key={report.id} className="rounded-lg bg-muted/30 p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <FileText className="h-4 w-4 text-cyan-400 shrink-0" />
                          <span className="text-xs font-medium truncate">&quot;{report.query}&quot;</span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Badge className={cn("h-5 text-[10px] border", depthConfig(report.depth).color)}>
                            {report.depth}
                          </Badge>
                          <Badge className="h-5 text-[10px] border bg-emerald-500/15 text-emerald-400 border-emerald-500/30">
                            {report.sources.length} sources
                          </Badge>
                        </div>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {report.completedAt}
                        </span>
                        {report.synthesis && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 text-[10px] gap-1"
                            onClick={() => exportReport(report)}
                          >
                            <Download className="h-3 w-3" />
                            Export
                          </Button>
                        )}
                      </div>
                      {report.synthesis && (
                        <p className="text-[10px] text-muted-foreground line-clamp-2 mt-1">{report.synthesis.slice(0, 200)}...</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PowerToolHint } from "./PowerToolHint";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  Search,
  BookOpen,
  FileText,
  ExternalLink,
  Shield,
  AlertTriangle,
  Download,
  Loader2,
  CheckCircle2,
  Trash2,
  Zap,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

interface Source {
  url: string;
  title: string;
  snippet: string;
  credibility: number;
  type: "web" | "code" | "doc" | "paper" | "repo";
  hostName?: string;
  rank?: number;
  date?: string;
}

interface CitationResult {
  id: string;
  sourceUrl?: string;
  sourceTitle: string;
  sourceType: string;
  snippet: string;
  relevanceScore: number;
  credibility: number;
}

interface ResearchResult {
  sessionId: string;
  query: string;
  findings: string;
  citations: CitationResult[];
  sources: Source[];
  confidence: number;
}

interface HallucinationFlag {
  claim: string;
  evidence: string;
  confidence: number;
}

interface ResearchSession {
  id: string;
  query: string;
  status: string;
  depth: string;
  confidence: number | null;
  createdAt: string;
  findings?: string | null;
  sources?: string;
  citations?: string;
}

interface ResearchModePanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function sourceTypeBadge(type: string) {
  switch (type) {
    case "paper":
      return "bg-violet-500/15 text-violet-400 border-violet-500/30";
    case "doc":
      return "bg-sky-500/15 text-sky-400 border-sky-500/30";
    case "repo":
      return "bg-emerald-500/15 text-emerald-400 border-emerald-500/30";
    case "code":
      return "bg-teal-500/15 text-teal-400 border-teal-500/30";
    case "web":
    default:
      return "bg-amber-500/15 text-amber-400 border-amber-500/30";
  }
}

function credibilityColor(cred: number) {
  if (cred >= 0.8) return "text-emerald-400";
  if (cred >= 0.5) return "text-yellow-400";
  return "text-red-400";
}

function credibilityBarColor(cred: number) {
  if (cred >= 0.8) return "bg-emerald-500";
  if (cred >= 0.5) return "bg-yellow-500";
  return "bg-red-500";
}

function formatConfidence(value: number | null): string {
  if (value == null) return "N/A";
  return `${(value * 100).toFixed(1)}%`;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function statusIcon(status: string) {
  switch (status) {
    case "searching":
      return <Search className="h-3.5 w-3.5 text-sky-400" />;
    case "analyzing":
      return <BookOpen className="h-3.5 w-3.5 text-amber-400" />;
    case "synthesizing":
      return <FileText className="h-3.5 w-3.5 text-violet-400" />;
    case "completed":
      return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />;
    case "failed":
      return <AlertTriangle className="h-3.5 w-3.5 text-red-400" />;
    default:
      return <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />;
  }
}

// ─── Component ───────────────────────────────────────────────────────────────

export function ResearchModePanel({ open, onOpenChange }: ResearchModePanelProps) {
  // ── Research State ──
  const [query, setQuery] = useState("");
  const [depth, setDepth] = useState<"quick" | "standard" | "deep">("standard");
  const [researching, setResearching] = useState(false);
  const [researchResult, setResearchResult] = useState<ResearchResult | null>(null);
  const [researchStatus, setResearchStatus] = useState<string | null>(null);

  // ── Hallucination Detection ──
  const [hallucinationResult, setHallucinationResult] = useState<{
    flagged: HallucinationFlag[];
    overallRisk: "low" | "medium" | "high";
  } | null>(null);
  const [detectingHallucinations, setDetectingHallucinations] = useState(false);

  // ── Verify Citations ──
  const [verifyingCitationId, setVerifyingCitationId] = useState<string | null>(null);
  const [verifiedCitations, setVerifiedCitations] = useState<Record<string, { isValid: boolean; credibilityChange: number }>>({});

  // ── History State ──
  const [sessions, setSessions] = useState<ResearchSession[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [deletingSessionId, setDeletingSessionId] = useState<string | null>(null);
  const [viewingSessionId, setViewingSessionId] = useState<string | null>(null);
  const [viewingSessionResult, setViewingSessionResult] = useState<ResearchResult | null>(null);

  // ── Active Tab ──
  const [activeTab, setActiveTab] = useState("research");

  // ── Fetch Sessions ──
  const fetchSessions = useCallback(async () => {
    setSessionsLoading(true);
    try {
      const res = await fetch("/api/research");
      if (res.ok) {
        const data = await res.json();
        setSessions(Array.isArray(data) ? data : []);
      }
    } catch {
      // silently fail
    } finally {
      setSessionsLoading(false);
    }
  }, []);

  // ── Init ──
  useEffect(() => {
    if (!open) return;
    fetchSessions();
    setHallucinationResult(null);
    setVerifiedCitations({});
  }, [open, fetchSessions]);

  // ── Start Research ──
  const handleResearch = async () => {
    if (!query.trim()) {
      toast.error("Enter a research query");
      return;
    }
    setResearching(true);
    setResearchResult(null);
    setResearchStatus("searching");
    setHallucinationResult(null);
    setVerifiedCitations({});

    // Simulate progress
    const progressTimer = setInterval(() => {
      setResearchStatus((prev) => {
        if (prev === "searching") return "analyzing";
        if (prev === "analyzing") return "synthesizing";
        return prev;
      });
    }, 3000);

    try {
      const res = await fetch("/api/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: query.trim(), depth }),
      });
      clearInterval(progressTimer);

      if (res.ok) {
        const data = await res.json();
        setResearchResult(data);
        setResearchStatus("completed");
        toast.success(`Research complete — confidence: ${formatConfidence(data.confidence)}`);
        await fetchSessions();
      } else {
        const data = await res.json();
        setResearchStatus("failed");
        toast.error(data.error || "Research failed");
      }
    } catch {
      clearInterval(progressTimer);
      setResearchStatus("failed");
      toast.error("Research failed");
    } finally {
      setResearching(false);
    }
  };

  // ── Detect Hallucinations ──
  const handleDetectHallucinations = async () => {
    if (!researchResult?.sessionId) return;
    setDetectingHallucinations(true);
    try {
      const res = await fetch(`/api/research/${researchResult.sessionId}/hallucinate`, {
        method: "POST",
      });
      if (res.ok) {
        const data = await res.json();
        setHallucinationResult(data);
        const riskLevel = data.overallRisk || "low";
        toast.success(`Hallucination check: ${data.flagged?.length || 0} flagged, risk: ${riskLevel}`);
      } else {
        const data = await res.json();
        toast.error(data.error || "Hallucination detection failed");
      }
    } catch {
      toast.error("Hallucination detection failed");
    } finally {
      setDetectingHallucinations(false);
    }
  };

  // ── Export Markdown ──
  const handleExportMarkdown = async () => {
    if (!researchResult?.sessionId) return;
    try {
      const res = await fetch(`/api/research/${researchResult.sessionId}/export`);
      if (res.ok) {
        const markdown = await res.text();
        const blob = new Blob([markdown], { type: "text/markdown" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `research-${researchResult.sessionId.slice(0, 8)}.md`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        toast.success("Markdown exported");
      } else {
        toast.error("Export failed");
      }
    } catch {
      toast.error("Export failed");
    }
  };

  // ── Verify Citation ──
  const handleVerifyCitation = async (citationId: string) => {
    setVerifyingCitationId(citationId);
    try {
      const res = await fetch(`/api/research/${researchResult?.sessionId}/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ citationId }),
      });
      if (res.ok) {
        const data = await res.json();
        setVerifiedCitations((prev) => ({
          ...prev,
          [citationId]: { isValid: data.isValid, credibilityChange: data.credibilityChange },
        }));
        toast.success(data.isValid ? "Citation verified" : "Citation may be invalid");
      } else {
        toast.error("Verification failed");
      }
    } catch {
      toast.error("Verification failed");
    } finally {
      setVerifyingCitationId(null);
    }
  };

  // ── View Session from History ──
  const viewSession = async (sessionId: string) => {
    setViewingSessionId(sessionId);
    setViewingSessionResult(null);
    try {
      const res = await fetch(`/api/research/${sessionId}`);
      if (res.ok) {
        const data = await res.json();
        const parsedSources: Source[] = (() => {
          try { return JSON.parse(data.sources || "[]"); } catch { return []; }
        })();
        const parsedCitations: CitationResult[] = (() => {
          try { return JSON.parse(data.citations || "[]"); } catch { return []; }
        })();
        const result: ResearchResult = {
          sessionId: data.id,
          query: data.query,
          findings: data.findings || "",
          citations: parsedCitations,
          sources: parsedSources,
          confidence: data.confidence || 0,
        };
        setViewingSessionResult(result);
        // Also set it as the current result so actions work
        setResearchResult(result);
        setResearchStatus("completed");
        setHallucinationResult(null);
        setVerifiedCitations({});
        setActiveTab("research");
      } else {
        toast.error("Failed to load session");
      }
    } catch {
      toast.error("Failed to load session");
    } finally {
      setViewingSessionId(null);
    }
  };

  // ── Delete Session ──
  const deleteSession = async (sessionId: string) => {
    setDeletingSessionId(sessionId);
    try {
      const res = await fetch(`/api/research/${sessionId}`, { method: "DELETE" });
      if (res.ok) {
        toast.success("Session deleted");
        await fetchSessions();
      } else {
        toast.error("Failed to delete session");
      }
    } catch {
      toast.error("Failed to delete session");
    } finally {
      setDeletingSessionId(null);
    }
  };

  // ── Render markdown-like findings ──
  const renderFindings = (text: string) => {
    return text.split("\n").map((line, i) => {
      if (line.startsWith("## ")) {
        return <h3 key={i} className="text-sm font-bold mt-3 mb-1">{line.slice(3)}</h3>;
      }
      if (line.startsWith("### ")) {
        return <h4 key={i} className="text-xs font-semibold mt-2 mb-0.5">{line.slice(4)}</h4>;
      }
      if (line.startsWith("- ")) {
        return <li key={i} className="text-xs text-muted-foreground ml-3">{line.slice(2)}</li>;
      }
      if (line.startsWith("---")) {
        return <Separator key={i} className="my-2" />;
      }
      if (line.trim() === "") {
        return <br key={i} />;
      }
      return <p key={i} className="text-xs text-foreground/80 leading-relaxed">{line}</p>;
    });
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════════

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-5xl max-h-[95vh] overflow-hidden flex flex-col" showCloseButton>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-gradient-to-br from-violet-500/20 to-purple-500/20 border border-violet-500/30">
              <Search className="h-4 w-4 text-violet-400" />
            </div>
            Deep Research &amp; Citations
          </DialogTitle>
          <DialogDescription>
            Multi-source deep research with AI synthesis, citation verification, and hallucination detection
          </DialogDescription>
        </DialogHeader>
        <PowerToolHint name="Research Mode" />

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
          <TabsList className="grid w-full grid-cols-2 mb-1 shrink-0">
            <TabsTrigger value="research" className="gap-1.5 text-xs">
              <Search className="h-3.5 w-3.5" />
              Research
            </TabsTrigger>
            <TabsTrigger value="history" className="gap-1.5 text-xs">
              <BookOpen className="h-3.5 w-3.5" />
              History
            </TabsTrigger>
          </TabsList>

          {/* ═══ RESEARCH TAB ═══ */}
          <TabsContent value="research" className="flex-1 min-h-0 mt-0 overflow-y-auto">
            <ScrollArea className="h-[calc(95vh-220px)]">
              <div className="space-y-4 p-1 pr-4">
                {/* Query Input */}
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">Research Query</Label>
                    <Textarea
                      placeholder="What would you like to research in depth? Be specific for better results..."
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      className="min-h-[80px] text-sm"
                      rows={3}
                      disabled={researching}
                    />
                  </div>

                  {/* Depth Selector */}
                  <div className="flex items-center gap-4">
                    <Label className="text-xs font-medium shrink-0">Depth:</Label>
                    <div className="flex gap-1.5">
                      {(["quick", "standard", "deep"] as const).map((d) => (
                        <Button
                          key={d}
                          size="sm"
                          variant={depth === d ? "default" : "outline"}
                          onClick={() => setDepth(d)}
                          disabled={researching}
                          className={cn(
                            "h-7 text-xs capitalize",
                            depth === d && d === "quick" && "bg-sky-500/15 text-sky-400 border-sky-500/30 hover:bg-sky-500/25",
                            depth === d && d === "standard" && "bg-amber-500/15 text-amber-400 border-amber-500/30 hover:bg-amber-500/25",
                            depth === d && d === "deep" && "bg-violet-500/15 text-violet-400 border-violet-500/30 hover:bg-violet-500/25"
                          )}
                        >
                          {d === "quick" && <Zap className="h-3 w-3 mr-1" />}
                          {d === "standard" && <Search className="h-3 w-3 mr-1" />}
                          {d === "deep" && <BookOpen className="h-3 w-3 mr-1" />}
                          {d}
                        </Button>
                      ))}
                    </div>
                  </div>

                  {/* Start Button */}
                  <Button
                    onClick={handleResearch}
                    disabled={researching || !query.trim()}
                    className="w-full h-9 text-xs gap-2"
                  >
                    {researching ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Researching...
                      </>
                    ) : (
                      <>
                        <Search className="h-4 w-4" />
                        Start Research
                      </>
                    )}
                  </Button>
                </div>

                {/* Progress Indicator */}
                {researching && researchStatus && (
                  <div className="rounded-xl border bg-card p-4">
                    <div className="flex items-center gap-3">
                      <Loader2 className="h-5 w-5 animate-spin text-violet-400" />
                      <div>
                        <p className="text-sm font-medium">
                          {researchStatus === "searching" && "Searching sources..."}
                          {researchStatus === "analyzing" && "Analyzing content..."}
                          {researchStatus === "synthesizing" && "Synthesizing findings..."}
                        </p>
                        <div className="flex gap-1 mt-2">
                          {["searching", "analyzing", "synthesizing", "completed"].map((stage) => (
                            <div
                              key={stage}
                              className={cn(
                                "h-1.5 flex-1 rounded-full transition-all",
                                ["searching", "analyzing", "synthesizing"].indexOf(researchStatus) >= ["searching", "analyzing", "synthesizing"].indexOf(stage)
                                  ? "bg-violet-500"
                                  : "bg-muted"
                              )}
                            />
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Results Area */}
                {researchResult && researchStatus === "completed" && (
                  <div className="space-y-4">
                    {/* Confidence Score */}
                    <div className="rounded-xl border bg-card p-4">
                      <div className="flex items-center gap-4">
                        <div
                          className={cn(
                            "flex items-center justify-center h-16 w-16 rounded-full border-4 text-lg font-bold",
                            researchResult.confidence >= 0.7
                              ? "border-emerald-500 text-emerald-400 bg-emerald-500/10"
                              : researchResult.confidence >= 0.4
                                ? "border-yellow-500 text-yellow-400 bg-yellow-500/10"
                                : "border-red-500 text-red-400 bg-red-500/10"
                          )}
                        >
                          {Math.round(researchResult.confidence * 100)}%
                        </div>
                        <div>
                          <h4 className="text-sm font-semibold">Confidence Score</h4>
                          <p className="text-xs text-muted-foreground mt-1">
                            Based on {researchResult.sources.length} sources, {researchResult.citations.length} citations, and source credibility
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={handleDetectHallucinations}
                        disabled={detectingHallucinations}
                        className="h-7 text-xs gap-1.5 border-violet-500/30 text-violet-400 hover:bg-violet-500/10"
                      >
                        {detectingHallucinations ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Shield className="h-3.5 w-3.5" />
                        )}
                        {detectingHallucinations ? "Detecting..." : "Detect Hallucinations"}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={handleExportMarkdown}
                        className="h-7 text-xs gap-1.5"
                      >
                        <Download className="h-3.5 w-3.5" />
                        Export Markdown
                      </Button>
                    </div>

                    {/* Findings */}
                    <div className="rounded-xl border bg-card p-4">
                      <h4 className="text-sm font-semibold flex items-center gap-2 mb-3">
                        <FileText className="h-4 w-4 text-violet-400" />
                        Findings
                      </h4>
                      <div className="max-h-72 overflow-y-auto pr-2">
                        {renderFindings(researchResult.findings)}
                      </div>
                    </div>

                    {/* Hallucination Results */}
                    {hallucinationResult && (
                      <div className="rounded-xl border bg-card p-4 space-y-3">
                        <h4 className="text-sm font-semibold flex items-center gap-2">
                          <Shield className="h-4 w-4 text-violet-400" />
                          Hallucination Detection
                          <Badge
                            className={cn(
                              "h-5 text-[10px] border",
                              hallucinationResult.overallRisk === "low"
                                ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                                : hallucinationResult.overallRisk === "medium"
                                  ? "bg-yellow-500/15 text-yellow-400 border-yellow-500/30"
                                  : "bg-red-500/15 text-red-400 border-red-500/30"
                            )}
                          >
                            {hallucinationResult.overallRisk} risk
                          </Badge>
                        </h4>
                        {hallucinationResult.flagged.length === 0 ? (
                          <div className="flex items-center gap-2 text-emerald-400 py-2">
                            <CheckCircle2 className="h-4 w-4" />
                            <span className="text-xs font-medium">No hallucinations detected</span>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {hallucinationResult.flagged.map((flag, idx) => (
                              <div key={idx} className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 space-y-1">
                                <div className="flex items-start gap-2">
                                  <AlertTriangle className="h-3.5 w-3.5 text-amber-400 shrink-0 mt-0.5" />
                                  <div>
                                    <p className="text-xs font-medium text-foreground">&quot;{flag.claim}&quot;</p>
                                    <p className="text-[10px] text-muted-foreground mt-1">{flag.evidence}</p>
                                    <div className="flex items-center gap-1 mt-1">
                                      <span className="text-[10px] text-muted-foreground">Confidence:</span>
                                      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden max-w-[80px]">
                                        <div
                                          className={cn("h-full rounded-full", flag.confidence >= 0.7 ? "bg-red-500" : flag.confidence >= 0.4 ? "bg-amber-500" : "bg-yellow-500")}
                                          style={{ width: `${flag.confidence * 100}%` }}
                                        />
                                      </div>
                                      <span className="text-[10px] font-mono text-muted-foreground">{(flag.confidence * 100).toFixed(0)}%</span>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Sources */}
                    <div className="rounded-xl border bg-card p-4">
                      <h4 className="text-sm font-semibold flex items-center gap-2 mb-3">
                        <BookOpen className="h-4 w-4 text-amber-400" />
                        Sources
                        <Badge variant="secondary" className="h-5 text-[10px]">
                          {researchResult.sources.length}
                        </Badge>
                      </h4>
                      <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                        {researchResult.sources.map((source, idx) => (
                          <div key={idx} className="rounded-lg border p-3 hover:bg-muted/20 transition-colors">
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-xs font-medium truncate">
                                    [{idx + 1}] {source.title}
                                  </span>
                                  <Badge className={cn("h-4 text-[9px] border", sourceTypeBadge(source.type))}>
                                    {source.type}
                                  </Badge>
                                </div>
                                <p className="text-[10px] text-muted-foreground mt-1 line-clamp-2">
                                  {source.snippet}
                                </p>
                              </div>
                              <div className="flex flex-col items-end gap-1 shrink-0">
                                <a
                                  href={source.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-muted-foreground hover:text-foreground transition-colors"
                                >
                                  <ExternalLink className="h-3 w-3" />
                                </a>
                                <div className="flex items-center gap-1">
                                  <div className="h-1.5 w-12 bg-muted rounded-full overflow-hidden">
                                    <div
                                      className={cn("h-full rounded-full", credibilityBarColor(source.credibility))}
                                      style={{ width: `${source.credibility * 100}%` }}
                                    />
                                  </div>
                                  <span className={cn("text-[9px] font-mono", credibilityColor(source.credibility))}>
                                    {(source.credibility * 100).toFixed(0)}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Citations */}
                    {researchResult.citations.length > 0 && (
                      <div className="rounded-xl border bg-card p-4">
                        <div className="flex items-center justify-between mb-3">
                          <h4 className="text-sm font-semibold flex items-center gap-2">
                            <FileText className="h-4 w-4 text-teal-400" />
                            Citations
                            <Badge variant="secondary" className="h-5 text-[10px]">
                              {researchResult.citations.length}
                            </Badge>
                          </h4>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              researchResult.citations.forEach((cit) => {
                                handleVerifyCitation(cit.id);
                              });
                            }}
                            disabled={!!verifyingCitationId}
                            className="h-6 text-[10px] gap-1"
                          >
                            <Shield className="h-3 w-3" />
                            Verify All
                          </Button>
                        </div>
                        <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                          {researchResult.citations.map((citation) => {
                            const verified = verifiedCitations[citation.id];
                            return (
                              <div key={citation.id} className="rounded-lg border p-3">
                                <div className="flex items-start justify-between gap-2">
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className="text-xs font-medium truncate">
                                        {citation.sourceTitle}
                                      </span>
                                      <Badge className={cn("h-4 text-[9px] border", sourceTypeBadge(citation.sourceType))}>
                                        {citation.sourceType}
                                      </Badge>
                                      {verified && (
                                        <Badge className={cn(
                                          "h-4 text-[9px] border",
                                          verified.isValid
                                            ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                                            : "bg-red-500/15 text-red-400 border-red-500/30"
                                        )}>
                                          {verified.isValid ? "Verified" : "Invalid"}
                                        </Badge>
                                      )}
                                    </div>
                                    <p className="text-[10px] text-muted-foreground mt-1 line-clamp-2">
                                      {citation.snippet}
                                    </p>
                                    <div className="flex items-center gap-3 mt-1.5">
                                      <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                                        Relevance:
                                        <span className={cn("font-mono", credibilityColor(citation.relevanceScore))}>
                                          {(citation.relevanceScore * 100).toFixed(0)}%
                                        </span>
                                      </span>
                                      <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                                        Credibility:
                                        <span className={cn("font-mono", credibilityColor(citation.credibility))}>
                                          {(citation.credibility * 100).toFixed(0)}%
                                        </span>
                                      </span>
                                    </div>
                                  </div>
                                  <div className="flex flex-col items-end gap-1 shrink-0">
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={() => handleVerifyCitation(citation.id)}
                                      disabled={verifyingCitationId === citation.id}
                                      className="h-6 w-6 p-0"
                                      title="Verify Citation"
                                    >
                                      {verifyingCitationId === citation.id ? (
                                        <Loader2 className="h-3 w-3 animate-spin" />
                                      ) : verified?.isValid ? (
                                        <CheckCircle2 className="h-3 w-3 text-emerald-400" />
                                      ) : verified && !verified.isValid ? (
                                        <AlertTriangle className="h-3 w-3 text-red-400" />
                                      ) : (
                                        <Shield className="h-3 w-3 text-muted-foreground" />
                                      )}
                                    </Button>
                                    {citation.sourceUrl && (
                                      <a
                                        href={citation.sourceUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-muted-foreground hover:text-foreground transition-colors"
                                      >
                                        <ExternalLink className="h-3 w-3" />
                                      </a>
                                    )}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </ScrollArea>
          </TabsContent>

          {/* ═══ HISTORY TAB ═══ */}
          <TabsContent value="history" className="flex-1 min-h-0 mt-0 overflow-y-auto">
            <ScrollArea className="h-[calc(95vh-220px)]">
              <div className="space-y-4 p-1 pr-4">
                <div className="flex items-center gap-2">
                  <h4 className="text-sm font-semibold">Past Research Sessions</h4>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={fetchSessions}
                    disabled={sessionsLoading}
                    className="h-7 text-xs gap-1 ml-auto"
                  >
                    <Loader2 className={cn("h-3 w-3", sessionsLoading && "animate-spin")} />
                    Refresh
                  </Button>
                </div>

                {sessionsLoading && sessions.length === 0 ? (
                  <div className="flex items-center justify-center py-16 text-muted-foreground">
                    <Loader2 className="h-6 w-6 animate-spin mr-2" />
                    <span className="text-sm">Loading sessions...</span>
                  </div>
                ) : sessions.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-muted-foreground border border-dashed rounded-lg">
                    <BookOpen className="h-10 w-10 mb-3 opacity-30" />
                    <p className="text-sm font-medium">No research history</p>
                    <p className="text-xs mt-1">Start a research session to see it here</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {sessions.map((session) => (
                      <div
                        key={session.id}
                        className="rounded-lg border bg-card p-3 hover:bg-muted/20 transition-colors cursor-pointer"
                        onClick={() => viewSession(session.id)}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-medium truncate">{session.query}</span>
                              <div className="flex items-center gap-1">
                                {statusIcon(session.status)}
                                <span className="text-[10px] text-muted-foreground capitalize">{session.status}</span>
                              </div>
                            </div>
                            <div className="flex items-center gap-3 mt-1 text-[10px] text-muted-foreground">
                              <Badge variant="outline" className="h-4 text-[9px] capitalize">
                                {session.depth}
                              </Badge>
                              {session.confidence != null && (
                                <span className={cn("font-mono", credibilityColor(session.confidence))}>
                                  {(session.confidence * 100).toFixed(0)}% confidence
                                </span>
                              )}
                              <span>{formatDate(session.createdAt)}</span>
                            </div>
                          </div>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteSession(session.id);
                            }}
                            disabled={deletingSessionId === session.id}
                            className="h-7 w-7 p-0 text-muted-foreground hover:text-red-400 shrink-0"
                          >
                            {deletingSessionId === session.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Trash2 className="h-3.5 w-3.5" />
                            )}
                          </Button>
                        </div>
                      </div>
                    ))}
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

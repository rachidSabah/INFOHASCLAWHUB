"use client";

import { PowerToolHint } from "./PowerToolHint";
import { useState, useCallback } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Search,
  GitFork,
  LayoutGrid,
  Shield,
  Play,
  Loader2,
  FileCode,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Info,
  ExternalLink,
  Eye,
  ArrowRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ──────────────────────────────────────────────────────

interface SearchResult {
  symbolName: string;
  filePath: string;
  symbolType: string;
  relevanceScore: number;
  reason: string;
  lineStart?: number;
  lineEnd?: number;
  content?: string;
}

interface DepGraphNode {
  filePath: string;
  imports: string[];
  exports: string[];
}

interface Vulnerability {
  id: string;
  severity: "critical" | "high" | "medium" | "low" | "info";
  filePath: string;
  line?: number;
  message: string;
  suggestion?: string;
  isResolved: boolean;
  createdAt: string;
}

interface VulnerabilitySummary {
  critical: number;
  high: number;
  medium: number;
  low: number;
  info: number;
  total: number;
  resolved: number;
}

interface SymbolStat {
  type: string;
  count: number;
}

interface CodebaseIntelligencePanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectPath?: string;
}

// ─── Helpers ────────────────────────────────────────────────────

function severityBadge(severity: string) {
  switch (severity) {
    case "critical":
      return (
        <Badge className="bg-red-600/15 text-red-500 border-red-500/30 h-5 text-[10px]">
          <XCircle className="h-3 w-3 mr-0.5" />
          Critical
        </Badge>
      );
    case "high":
      return (
        <Badge className="bg-red-500/15 text-red-400 border-red-400/30 h-5 text-[10px]">
          <AlertTriangle className="h-3 w-3 mr-0.5" />
          High
        </Badge>
      );
    case "medium":
      return (
        <Badge className="bg-yellow-500/15 text-yellow-400 border-yellow-500/30 h-5 text-[10px]">
          <AlertTriangle className="h-3 w-3 mr-0.5" />
          Medium
        </Badge>
      );
    case "low":
      return (
        <Badge className="bg-blue-500/15 text-blue-400 border-blue-400/30 h-5 text-[10px]">
          <Info className="h-3 w-3 mr-0.5" />
          Low
        </Badge>
      );
    case "info":
      return (
        <Badge className="bg-slate-500/15 text-slate-400 border-slate-400/30 h-5 text-[10px]">
          <Info className="h-3 w-3 mr-0.5" />
          Info
        </Badge>
      );
    default:
      return (
        <Badge variant="secondary" className="h-5 text-[10px]">
          {severity}
        </Badge>
      );
  }
}

function scoreColor(score: number): string {
  if (score >= 0.8) return "text-emerald-400";
  if (score >= 0.5) return "text-yellow-400";
  return "text-orange-400";
}

function symbolTypeIcon(type: string) {
  switch (type) {
    case "function":
      return "ƒ";
    case "class":
      return "C";
    case "variable":
      return "v";
    case "import":
      return "→";
    case "export":
      return "←";
    default:
      return "•";
  }
}

function symbolTypeColor(type: string): string {
  switch (type) {
    case "function":
      return "bg-blue-500/15 text-blue-400 border-blue-500/30";
    case "class":
      return "bg-purple-500/15 text-purple-400 border-purple-500/30";
    case "variable":
      return "bg-emerald-500/15 text-emerald-400 border-emerald-500/30";
    case "import":
      return "bg-orange-500/15 text-orange-400 border-orange-500/30";
    case "export":
      return "bg-cyan-500/15 text-cyan-400 border-cyan-500/30";
    default:
      return "bg-muted text-muted-foreground border-border";
  }
}

// ─── Component ──────────────────────────────────────────────────

export function CodebaseIntelligencePanel({
  open,
  onOpenChange,
  projectPath = "",
}: CodebaseIntelligencePanelProps) {
  // ── Search Tab State ──
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [expandedResult, setExpandedResult] = useState<string | null>(null);

  // ── Dependencies Tab State ──
  const [depGraph, setDepGraph] = useState<Record<string, DepGraphNode> | null>(null);
  const [depLoading, setDepLoading] = useState(false);
  const [impactQuery, setImpactQuery] = useState("");
  const [impactResults, setImpactResults] = useState<string[]>([]);
  const [impactLoading, setImpactLoading] = useState(false);

  // ── Architecture Tab State ──
  const [archSymbols, setArchSymbols] = useState<SymbolStat[]>([]);
  const [archFiles, setArchFiles] = useState<
    { filePath: string; symbols: { name: string; type: string; lineStart?: number }[] }[]
  >([]);
  const [archLoading, setArchLoading] = useState(false);
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());

  // ── Security Tab State ──
  const [vulnSummary, setVulnSummary] = useState<VulnerabilitySummary | null>(null);
  const [vulnerabilities, setVulnerabilities] = useState<Vulnerability[]>([]);
  const [secLoading, setSecLoading] = useState(false);
  const [resolvingIds, setResolvingIds] = useState<Set<string>>(new Set());

  // ── Search Tab Handlers ──
  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) {
      toast.error("Please enter a search query");
      return;
    }
    setSearching(true);
    setSearchResults([]);
    setExpandedResult(null);
    try {
      const res = await fetch("/api/codebase/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: searchQuery.trim(),
          projectPath: projectPath || undefined,
          limit: 20,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setSearchResults(data.results || []);
        if ((data.results || []).length === 0) {
          toast.info(data.message || "No results found");
        }
      } else {
        const data = await res.json();
        toast.error(data.error || "Search failed");
      }
    } catch {
      toast.error("Search request failed");
    } finally {
      setSearching(false);
    }
  }, [searchQuery, projectPath]);

  // ── Dependencies Tab Handlers ──
  const fetchDependencies = useCallback(async () => {
    if (!projectPath) {
      toast.error("Project path is required for dependency analysis");
      return;
    }
    setDepLoading(true);
    try {
      const res = await fetch(
        `/api/codebase/dependencies?projectPath=${encodeURIComponent(projectPath)}`
      );
      if (res.ok) {
        const data = await res.json();
        setDepGraph(data.graph || null);
        toast.success(`Loaded dependencies for ${data.files} files`);
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to load dependencies");
      }
    } catch {
      toast.error("Failed to fetch dependencies");
    } finally {
      setDepLoading(false);
    }
  }, [projectPath]);

  const handleImpactAnalysis = useCallback(async () => {
    if (!impactQuery.trim()) {
      toast.error("Enter a file or symbol to analyze impact");
      return;
    }
    if (!depGraph) {
      toast.error("Load dependency graph first");
      return;
    }
    setImpactLoading(true);
    setImpactResults([]);
    try {
      // Client-side impact analysis: find all files that import from the queried file
      const query = impactQuery.trim().toLowerCase();
      const affected: string[] = [];

      for (const [filePath, node] of Object.entries(depGraph)) {
        if (filePath.toLowerCase().includes(query)) {
          // This file is the source - find who imports from it
          const sourceExports = node.exports;
          for (const [otherPath, otherNode] of Object.entries(depGraph)) {
            if (otherPath !== filePath) {
              const hasOverlap = otherNode.imports.some((imp) =>
                sourceExports.some((exp) => imp.toLowerCase().includes(exp.toLowerCase()))
              );
              if (hasOverlap && !affected.includes(otherPath)) {
                affected.push(otherPath);
              }
            }
          }
          // Also add the file itself
          if (!affected.includes(filePath)) {
            affected.unshift(filePath);
          }
        }
      }

      if (affected.length === 0) {
        // Fallback: check if any imports reference the query
        for (const [filePath, node] of Object.entries(depGraph)) {
          if (
            node.imports.some((imp) => imp.toLowerCase().includes(query)) ||
            node.exports.some((exp) => exp.toLowerCase().includes(query))
          ) {
            affected.push(filePath);
          }
        }
      }

      setImpactResults(affected);
      if (affected.length === 0) {
        toast.info("No impacted files found for this query");
      } else {
        toast.success(`Found ${affected.length} potentially impacted files`);
      }
    } finally {
      setImpactLoading(false);
    }
  }, [impactQuery, depGraph]);

  // ── Architecture Tab Handlers ──
  const fetchArchitecture = useCallback(async () => {
    if (!projectPath) {
      toast.error("Project path is required for architecture analysis");
      return;
    }
    setArchLoading(true);
    try {
      // Reuse the dependencies API to get all symbols
      const depRes = await fetch(
        `/api/codebase/dependencies?projectPath=${encodeURIComponent(projectPath)}`
      );
      if (depRes.ok) {
        const depData = await depRes.json();
        const graph: Record<string, DepGraphNode> = depData.graph || {};

        // Build symbol stats
        const typeCounts: Record<string, number> = {};
        const fileEntries: typeof archFiles = [];

        for (const [filePath, node] of Object.entries(graph)) {
          const fileSymbols: { name: string; type: string; lineStart?: number }[] = [];

          for (const imp of node.imports) {
            fileSymbols.push({ name: imp, type: "import" });
            typeCounts["import"] = (typeCounts["import"] || 0) + 1;
          }
          for (const exp of node.exports) {
            fileSymbols.push({ name: exp, type: "export" });
            typeCounts["export"] = (typeCounts["export"] || 0) + 1;
          }

          if (fileSymbols.length > 0) {
            fileEntries.push({ filePath, symbols: fileSymbols });
          }
        }

        // Also search for more symbol data
        const searchRes = await fetch("/api/codebase/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            query: "all functions classes and variables",
            projectPath,
            limit: 50,
          }),
        });

        if (searchRes.ok) {
          const searchData = await searchRes.json();
          const results: SearchResult[] = searchData.results || [];

          // Merge search results into architecture
          for (const r of results) {
            const existing = fileEntries.find((f) => f.filePath === r.filePath);
            if (existing) {
              if (!existing.symbols.some((s) => s.name === r.symbolName)) {
                existing.symbols.push({
                  name: r.symbolName,
                  type: r.symbolType,
                  lineStart: r.lineStart,
                });
              }
            } else {
              fileEntries.push({
                filePath: r.filePath,
                symbols: [
                  { name: r.symbolName, type: r.symbolType, lineStart: r.lineStart },
                ],
              });
            }
            typeCounts[r.symbolType] = (typeCounts[r.symbolType] || 0) + 1;
          }
        }

        const stats: SymbolStat[] = Object.entries(typeCounts)
          .map(([type, count]) => ({ type, count }))
          .sort((a, b) => b.count - a.count);

        setArchSymbols(stats);
        setArchFiles(fileEntries);
        toast.success(`Mapped ${fileEntries.length} files with ${stats.reduce((s, t) => s + t.count, 0)} symbols`);
      }
    } catch {
      toast.error("Failed to load architecture");
    } finally {
      setArchLoading(false);
    }
  }, [projectPath]);

  const toggleFile = (filePath: string) => {
    setExpandedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(filePath)) next.delete(filePath);
      else next.add(filePath);
      return next;
    });
  };

  // ── Security Tab Handlers ──
  const fetchSecurity = useCallback(async () => {
    setSecLoading(true);
    try {
      const params = new URLSearchParams();
      if (projectPath) params.set("projectPath", projectPath);
      const res = await fetch(`/api/codebase/security?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setVulnSummary(data.summary || null);
        setVulnerabilities(data.vulnerabilities || []);
        toast.success(`Security scan complete: ${data.summary?.total || 0} issues found`);
      } else {
        const data = await res.json();
        toast.error(data.error || "Security scan failed");
      }
    } catch {
      toast.error("Security scan request failed");
    } finally {
      setSecLoading(false);
    }
  }, [projectPath]);

  const handleResolve = async (vulnId: string) => {
    setResolvingIds((prev) => new Set(prev).add(vulnId));
    try {
      // Use quick-actions to mark as resolved
      const res = await fetch("/api/quick-actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "resolve_vulnerability",
          params: { vulnerabilityId: vulnId },
        }),
      });
      if (res.ok) {
        toast.success("Vulnerability marked as resolved");
        setVulnerabilities((prev) =>
          prev.map((v) => (v.id === vulnId ? { ...v, isResolved: true } : v))
        );
        setVulnSummary((prev) =>
          prev ? { ...prev, resolved: prev.resolved + 1 } : null
        );
      } else {
        toast.error("Failed to resolve vulnerability");
      }
    } catch {
      toast.error("Failed to resolve vulnerability");
    } finally {
      setResolvingIds((prev) => {
        const next = new Set(prev);
        next.delete(vulnId);
        return next;
      });
    }
  };

  // ── Render ──
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-6xl max-h-[90vh] overflow-hidden flex flex-col" showCloseButton>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <LayoutGrid className="h-5 w-5" />
            Codebase Intelligence
          </DialogTitle>
          <DialogDescription>
            Semantic search, dependency analysis, architecture mapping &amp; security scanning
          </DialogDescription>
        </DialogHeader>
          <PowerToolHint name="Codebase Intelligence" />

        <Tabs defaultValue="search" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="search" className="gap-1.5 text-xs">
              <Search className="h-3.5 w-3.5" />
              Search
            </TabsTrigger>
            <TabsTrigger value="dependencies" className="gap-1.5 text-xs">
              <GitFork className="h-3.5 w-3.5" />
              Dependencies
            </TabsTrigger>
            <TabsTrigger value="architecture" className="gap-1.5 text-xs">
              <LayoutGrid className="h-3.5 w-3.5" />
              Architecture
            </TabsTrigger>
            <TabsTrigger value="security" className="gap-1.5 text-xs">
              <Shield className="h-3.5 w-3.5" />
              Security
            </TabsTrigger>
          </TabsList>

          {/* ── Search Tab ── */}
          <TabsContent value="search" className="mt-4">
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                    placeholder='e.g. "find all places where user authentication is handled"'
                    className="pl-9 h-9 text-sm"
                  />
                </div>
                <Button
                  size="sm"
                  onClick={handleSearch}
                  disabled={searching || !searchQuery.trim()}
                >
                  {searching ? (
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  ) : (
                    <Search className="h-4 w-4 mr-1" />
                  )}
                  Search
                </Button>
              </div>

              {searchResults.length > 0 && (
                <ScrollArea className="max-h-[55vh]">
                  <div className="space-y-2 pr-2">
                    {searchResults.map((result, idx) => {
                      const key = `${result.filePath}-${result.symbolName}-${idx}`;
                      const isExpanded = expandedResult === key;
                      return (
                        <div
                          key={key}
                          className={cn(
                            "rounded-lg border bg-card transition-colors",
                            isExpanded && "ring-1 ring-primary/30"
                          )}
                        >
                          <button
                            type="button"
                            className="w-full text-left p-3 hover:bg-muted/30 transition-colors"
                            onClick={() => setExpandedResult(isExpanded ? null : key)}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-mono text-sm font-medium text-foreground">
                                    {result.symbolName}
                                  </span>
                                  <Badge
                                    className={cn(
                                      "h-5 text-[10px] border",
                                      symbolTypeColor(result.symbolType)
                                    )}
                                  >
                                    {symbolTypeIcon(result.symbolType)} {result.symbolType}
                                  </Badge>
                                </div>
                                <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                                  <span className="flex items-center gap-1">
                                    <FileCode className="h-3 w-3" />
                                    {result.filePath}
                                  </span>
                                  {result.lineStart && (
                                    <span>
                                      :L{result.lineStart}
                                      {result.lineEnd ? `-${result.lineEnd}` : ""}
                                    </span>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <span
                                  className={cn(
                                    "text-xs font-mono font-semibold",
                                    scoreColor(result.relevanceScore)
                                  )}
                                >
                                  {(result.relevanceScore * 100).toFixed(0)}%
                                </span>
                                {isExpanded ? (
                                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                ) : (
                                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                                )}
                              </div>
                            </div>
                            {!isExpanded && result.reason && (
                              <p className="text-xs text-muted-foreground mt-1.5 line-clamp-1">
                                {result.reason}
                              </p>
                            )}
                          </button>

                          {isExpanded && (
                            <div className="px-3 pb-3 space-y-2">
                              <Separator />
                              {result.reason && (
                                <p className="text-xs text-muted-foreground">
                                  {result.reason}
                                </p>
                              )}
                              {result.content && (
                                <div className="bg-muted/60 rounded-md p-3 font-mono text-xs overflow-x-auto">
                                  <pre className="whitespace-pre-wrap break-all">
                                    {result.content}
                                  </pre>
                                </div>
                              )}
                              <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                                <ExternalLink className="h-3 w-3" />
                                <span>Relevance: {(result.relevanceScore * 100).toFixed(1)}%</span>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </ScrollArea>
              )}

              {searchResults.length === 0 && !searching && (
                <div className="text-center py-12 text-muted-foreground">
                  <Search className="h-10 w-10 mx-auto mb-3 opacity-20" />
                  <p className="text-sm font-medium">Semantic Code Search</p>
                  <p className="text-xs mt-1">
                    Search for functions, classes, patterns across your codebase
                  </p>
                </div>
              )}
            </div>
          </TabsContent>

          {/* ── Dependencies Tab ── */}
          <TabsContent value="dependencies" className="mt-4">
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  onClick={fetchDependencies}
                  disabled={depLoading}
                  variant="outline"
                >
                  {depLoading ? (
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  ) : (
                    <GitFork className="h-4 w-4 mr-1" />
                  )}
                  Load Dependencies
                </Button>
              </div>

              {depGraph && (
                <>
                  <div className="rounded-lg border bg-card p-4">
                    <h4 className="font-semibold text-sm mb-3 flex items-center gap-2">
                      <GitFork className="h-4 w-4" />
                      Dependency Graph
                      <Badge variant="secondary" className="text-[10px]">
                        {Object.keys(depGraph).length} files
                      </Badge>
                    </h4>
                    <ScrollArea className="max-h-[25vh]">
                      <div className="space-y-1.5 pr-2">
                        {Object.entries(depGraph).map(([filePath, node]) => (
                          <div
                            key={filePath}
                            className="flex items-center gap-3 py-1.5 px-2 rounded-md hover:bg-muted/30 text-xs"
                          >
                            <FileCode className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            <span className="font-mono truncate flex-1">{filePath}</span>
                            <div className="flex items-center gap-1 shrink-0">
                              {node.imports.length > 0 && (
                                <Badge
                                  variant="outline"
                                  className="h-4 text-[9px] px-1.5 border-orange-500/30 text-orange-400"
                                >
                                  → {node.imports.length}
                                </Badge>
                              )}
                              {node.exports.length > 0 && (
                                <Badge
                                  variant="outline"
                                  className="h-4 text-[9px] px-1.5 border-cyan-500/30 text-cyan-400"
                                >
                                  ← {node.exports.length}
                                </Badge>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  </div>

                  <Separator />

                  <div className="rounded-lg border bg-card p-4">
                    <h4 className="font-semibold text-sm mb-3 flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-yellow-400" />
                      Impact Analysis
                    </h4>
                    <p className="text-xs text-muted-foreground mb-3">
                      If I change X, what else is affected?
                    </p>
                    <div className="flex items-center gap-2">
                      <Input
                        value={impactQuery}
                        onChange={(e) => setImpactQuery(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleImpactAnalysis()}
                        placeholder="e.g. auth.ts or authenticate"
                        className="h-8 text-sm"
                      />
                      <Button
                        size="sm"
                        onClick={handleImpactAnalysis}
                        disabled={impactLoading || !impactQuery.trim()}
                      >
                        {impactLoading ? (
                          <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                        ) : (
                          <ArrowRight className="h-4 w-4 mr-1" />
                        )}
                        Analyze
                      </Button>
                    </div>

                    {impactResults.length > 0 && (
                      <div className="mt-3 space-y-1">
                        <Label className="text-xs text-muted-foreground">
                          Potentially impacted files ({impactResults.length})
                        </Label>
                        <ScrollArea className="max-h-[15vh]">
                          <div className="space-y-1 pr-2">
                            {impactResults.map((fp, idx) => (
                              <div
                                key={idx}
                                className="flex items-center gap-2 py-1 px-2 rounded-md bg-red-500/5 border border-red-500/10 text-xs"
                              >
                                <AlertTriangle className="h-3 w-3 text-yellow-400 shrink-0" />
                                <span className="font-mono truncate">{fp}</span>
                              </div>
                            ))}
                          </div>
                        </ScrollArea>
                      </div>
                    )}
                  </div>
                </>
              )}

              {!depGraph && !depLoading && (
                <div className="text-center py-12 text-muted-foreground">
                  <GitFork className="h-10 w-10 mx-auto mb-3 opacity-20" />
                  <p className="text-sm font-medium">Dependency Analysis</p>
                  <p className="text-xs mt-1">
                    Load your project&apos;s dependency graph to analyze impact of changes
                  </p>
                </div>
              )}
            </div>
          </TabsContent>

          {/* ── Architecture Tab ── */}
          <TabsContent value="architecture" className="mt-4">
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  onClick={fetchArchitecture}
                  disabled={archLoading}
                  variant="outline"
                >
                  {archLoading ? (
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  ) : (
                    <LayoutGrid className="h-4 w-4 mr-1" />
                  )}
                  Generate Architecture Map
                </Button>
              </div>

              {archSymbols.length > 0 && (
                <div className="rounded-lg border bg-card p-4">
                  <h4 className="font-semibold text-sm mb-3 flex items-center gap-2">
                    <Eye className="h-4 w-4" />
                    Symbols Overview
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {archSymbols.map((stat) => (
                      <div
                        key={stat.type}
                        className="flex items-center gap-2 rounded-md border px-3 py-1.5 bg-muted/30"
                      >
                        <Badge
                          className={cn(
                            "h-5 text-[10px] border",
                            symbolTypeColor(stat.type)
                          )}
                        >
                          {symbolTypeIcon(stat.type)} {stat.type}
                        </Badge>
                        <span className="text-sm font-semibold">{stat.count}</span>
                      </div>
                    ))}
                    <div className="flex items-center gap-2 rounded-md border px-3 py-1.5 bg-primary/5 border-primary/20">
                      <span className="text-xs font-medium text-primary">Total</span>
                      <span className="text-sm font-bold text-primary">
                        {archSymbols.reduce((s, t) => s + t.count, 0)}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {archFiles.length > 0 && (
                <div className="rounded-lg border bg-card p-4">
                  <h4 className="font-semibold text-sm mb-3 flex items-center gap-2">
                    <FileCode className="h-4 w-4" />
                    File Structure
                    <Badge variant="secondary" className="text-[10px]">
                      {archFiles.length} files
                    </Badge>
                  </h4>
                  <ScrollArea className="max-h-[35vh]">
                    <div className="space-y-0.5 pr-2">
                      {archFiles.map((file) => {
                        const isExpanded = expandedFiles.has(file.filePath);
                        return (
                          <div key={file.filePath}>
                            <button
                              type="button"
                              className="w-full flex items-center gap-2 py-1.5 px-2 rounded-md hover:bg-muted/30 text-xs text-left transition-colors"
                              onClick={() => toggleFile(file.filePath)}
                            >
                              {isExpanded ? (
                                <ChevronDown className="h-3 w-3 shrink-0" />
                              ) : (
                                <ChevronRight className="h-3 w-3 shrink-0" />
                              )}
                              <FileCode className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                              <span className="font-mono truncate flex-1">
                                {file.filePath}
                              </span>
                              <Badge variant="outline" className="h-4 text-[9px] px-1.5 shrink-0">
                                {file.symbols.length}
                              </Badge>
                            </button>
                            {isExpanded && (
                              <div className="ml-7 space-y-0.5 mb-1">
                                {file.symbols.map((sym, idx) => (
                                  <div
                                    key={`${sym.name}-${idx}`}
                                    className="flex items-center gap-2 py-1 px-2 rounded text-[11px]"
                                  >
                                    <Badge
                                      className={cn(
                                        "h-4 text-[9px] border px-1",
                                        symbolTypeColor(sym.type)
                                      )}
                                    >
                                      {symbolTypeIcon(sym.type)}
                                    </Badge>
                                    <span className="font-mono truncate">{sym.name}</span>
                                    {sym.lineStart && (
                                      <span className="text-muted-foreground ml-auto shrink-0">
                                        L{sym.lineStart}
                                      </span>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </ScrollArea>
                </div>
              )}

              {archSymbols.length === 0 && !archLoading && (
                <div className="text-center py-12 text-muted-foreground">
                  <LayoutGrid className="h-10 w-10 mx-auto mb-3 opacity-20" />
                  <p className="text-sm font-medium">Architecture Map</p>
                  <p className="text-xs mt-1">
                    Auto-generate a map of your codebase structure and symbols
                  </p>
                </div>
              )}
            </div>
          </TabsContent>

          {/* ── Security Tab ── */}
          <TabsContent value="security" className="mt-4">
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Button size="sm" onClick={fetchSecurity} disabled={secLoading}>
                  {secLoading ? (
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  ) : (
                    <Shield className="h-4 w-4 mr-1" />
                  )}
                  Run Security Scan
                </Button>
              </div>

              {vulnSummary && (
                <div className="rounded-lg border bg-card p-4">
                  <h4 className="font-semibold text-sm mb-3 flex items-center gap-2">
                    <Shield className="h-4 w-4" />
                    Scan Summary
                  </h4>
                  <div className="flex flex-wrap gap-3">
                    {vulnSummary.critical > 0 && (
                      <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-red-600/10 border border-red-500/20">
                        <XCircle className="h-3.5 w-3.5 text-red-500" />
                        <span className="text-xs font-semibold text-red-500">
                          {vulnSummary.critical} Critical
                        </span>
                      </div>
                    )}
                    {vulnSummary.high > 0 && (
                      <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-red-500/10 border border-red-400/20">
                        <AlertTriangle className="h-3.5 w-3.5 text-red-400" />
                        <span className="text-xs font-semibold text-red-400">
                          {vulnSummary.high} High
                        </span>
                      </div>
                    )}
                    {vulnSummary.medium > 0 && (
                      <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-yellow-500/10 border border-yellow-500/20">
                        <AlertTriangle className="h-3.5 w-3.5 text-yellow-400" />
                        <span className="text-xs font-semibold text-yellow-400">
                          {vulnSummary.medium} Medium
                        </span>
                      </div>
                    )}
                    {vulnSummary.low > 0 && (
                      <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-blue-500/10 border border-blue-400/20">
                        <Info className="h-3.5 w-3.5 text-blue-400" />
                        <span className="text-xs font-semibold text-blue-400">
                          {vulnSummary.low} Low
                        </span>
                      </div>
                    )}
                    {vulnSummary.info > 0 && (
                      <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-slate-500/10 border border-slate-400/20">
                        <Info className="h-3.5 w-3.5 text-slate-400" />
                        <span className="text-xs font-semibold text-slate-400">
                          {vulnSummary.info} Info
                        </span>
                      </div>
                    )}
                    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-emerald-500/10 border border-emerald-500/20">
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                      <span className="text-xs font-semibold text-emerald-400">
                        {vulnSummary.resolved}/{vulnSummary.total} Resolved
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {vulnerabilities.length > 0 && (
                <ScrollArea className="max-h-[40vh]">
                  <div className="space-y-2 pr-2">
                    {vulnerabilities.map((vuln) => (
                      <div
                        key={vuln.id}
                        className={cn(
                          "rounded-lg border bg-card p-3",
                          vuln.isResolved && "opacity-60"
                        )}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0 space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              {severityBadge(vuln.severity)}
                              {vuln.isResolved && (
                                <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30 h-5 text-[10px]">
                                  <CheckCircle2 className="h-3 w-3 mr-0.5" />
                                  Resolved
                                </Badge>
                              )}
                            </div>
                            <p className="text-sm font-medium">{vuln.message}</p>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <FileCode className="h-3 w-3" />
                              <span className="font-mono truncate">{vuln.filePath}</span>
                              {vuln.line && <span>:L{vuln.line}</span>}
                            </div>
                            {vuln.suggestion && (
                              <div className="mt-2 rounded-md bg-muted/50 p-2 text-xs text-muted-foreground">
                                <span className="font-medium text-foreground">Suggestion: </span>
                                {vuln.suggestion}
                              </div>
                            )}
                          </div>
                          {!vuln.isResolved && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 text-[10px] shrink-0"
                              onClick={() => handleResolve(vuln.id)}
                              disabled={resolvingIds.has(vuln.id)}
                            >
                              {resolvingIds.has(vuln.id) ? (
                                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                              ) : (
                                <CheckCircle2 className="h-3 w-3 mr-1" />
                              )}
                              Resolve
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}

              {!vulnSummary && !secLoading && (
                <div className="text-center py-12 text-muted-foreground">
                  <Shield className="h-10 w-10 mx-auto mb-3 opacity-20" />
                  <p className="text-sm font-medium">Security Scanner</p>
                  <p className="text-xs mt-1">
                    Scan your codebase for vulnerabilities and security issues
                  </p>
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

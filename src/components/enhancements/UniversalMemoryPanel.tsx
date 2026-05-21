"use client";

import { PowerToolHint } from "./PowerToolHint";
import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  Brain,
  Search,
  Plus,
  BarChart3,
  Trash2,
  Database,
  Tag,
  Clock,
  ArrowRight,
  Loader2,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

type MemoryType = "episodic" | "semantic" | "procedural" | "project" | "agent" | "session";
type MemoryCategory = "conversation" | "code" | "workflow" | "preference" | "error" | "success" | "research";

interface MemoryResult {
  id: string;
  type: MemoryType;
  category: MemoryCategory;
  content: string;
  summary?: string | null;
  sourceId?: string | null;
  sourceType?: string | null;
  projectId?: string | null;
  agentId?: string | null;
  tags?: string[];
  priority: number;
  relevanceScore?: number;
  accessCount: number;
  createdAt: string;
  updatedAt?: string;
  expiresAt?: string | null;
}

interface MemoryStats {
  totalMemories: number;
  byType: Record<string, number>;
  byCategory: Record<string, number>;
  averagePriority: number;
  totalLinks: number;
  oldestMemoryDate: string | null;
}

interface CompressResult {
  compressedCount: number;
  deduplicatedCount: number;
  freedBytes: number;
}

interface PruneResult {
  prunedCount: number;
}

interface UniversalMemoryPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const MEMORY_TYPES: MemoryType[] = ["episodic", "semantic", "procedural", "project", "agent", "session"];
const MEMORY_CATEGORIES: MemoryCategory[] = ["conversation", "code", "workflow", "preference", "error", "success", "research"];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function typeBadgeColor(type: string): string {
  switch (type) {
    case "episodic":
      return "bg-violet-500/15 text-violet-400 border-violet-500/30";
    case "semantic":
      return "bg-cyan-500/15 text-cyan-400 border-cyan-500/30";
    case "procedural":
      return "bg-amber-500/15 text-amber-400 border-amber-500/30";
    case "project":
      return "bg-emerald-500/15 text-emerald-400 border-emerald-500/30";
    case "agent":
      return "bg-rose-500/15 text-rose-400 border-rose-500/30";
    case "session":
      return "bg-teal-500/15 text-teal-400 border-teal-500/30";
    default:
      return "bg-zinc-500/15 text-zinc-400 border-zinc-500/30";
  }
}

function categoryBadgeColor(category: string): string {
  switch (category) {
    case "conversation":
      return "bg-blue-500/15 text-blue-400 border-blue-500/30";
    case "code":
      return "bg-emerald-500/15 text-emerald-400 border-emerald-500/30";
    case "workflow":
      return "bg-amber-500/15 text-amber-400 border-amber-500/30";
    case "preference":
      return "bg-violet-500/15 text-violet-400 border-violet-500/30";
    case "error":
      return "bg-red-500/15 text-red-400 border-red-500/30";
    case "success":
      return "bg-teal-500/15 text-teal-400 border-teal-500/30";
    case "research":
      return "bg-cyan-500/15 text-cyan-400 border-cyan-500/30";
    default:
      return "bg-zinc-500/15 text-zinc-400 border-zinc-500/30";
  }
}

function priorityColor(priority: number): string {
  if (priority >= 8) return "text-red-400";
  if (priority >= 5) return "text-amber-400";
  return "text-emerald-400";
}

function formatDate(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return "just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHrs = Math.floor(diffMins / 60);
    if (diffHrs < 24) return `${diffHrs}h ago`;
    const diffDays = Math.floor(diffHrs / 24);
    if (diffDays < 30) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  } catch {
    return dateStr;
  }
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function truncateText(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen) + "...";
}

// ─── Component ───────────────────────────────────────────────────────────────

export function UniversalMemoryPanel({ open, onOpenChange }: UniversalMemoryPanelProps) {
  // ── Active Tab ──
  const [activeTab, setActiveTab] = useState("search");

  // ── Search State ──
  const [searchQuery, setSearchQuery] = useState("");
  const [searchType, setSearchType] = useState<string>("all");
  const [searchCategory, setSearchCategory] = useState<string>("all");
  const [searchResults, setSearchResults] = useState<MemoryResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [selectedResult, setSelectedResult] = useState<MemoryResult | null>(null);
  const [contextResult, setContextResult] = useState<string | null>(null);
  const [contextLoading, setContextLoading] = useState(false);

  // ── Store State ──
  const [storeType, setStoreType] = useState<MemoryType>("semantic");
  const [storeCategory, setStoreCategory] = useState<MemoryCategory>("conversation");
  const [storeContent, setStoreContent] = useState("");
  const [storeSummary, setStoreSummary] = useState("");
  const [storeSourceId, setStoreSourceId] = useState("");
  const [storeSourceType, setStoreSourceType] = useState("");
  const [storeProjectId, setStoreProjectId] = useState("");
  const [storeAgentId, setStoreAgentId] = useState("");
  const [storeTags, setStoreTags] = useState("");
  const [storePriority, setStorePriority] = useState("5");
  const [storeTTL, setStoreTTL] = useState("");
  const [storeSaving, setStoreSaving] = useState(false);

  // ── Stats State ──
  const [stats, setStats] = useState<MemoryStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [pruning, setPruning] = useState(false);
  const [compressingFromStats, setCompressingFromStats] = useState(false);

  // ── Compress State ──
  const [compressOlderThan, setCompressOlderThan] = useState("30");
  const [compressMinAccess, setCompressMinAccess] = useState("2");
  const [compressDryRun, setCompressDryRun] = useState(false);
  const [compressLoading, setCompressLoading] = useState(false);
  const [compressResult, setCompressResult] = useState<CompressResult | null>(null);

  // ── Fetch Search Results ──
  const fetchSearchResults = useCallback(async () => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }
    setSearchLoading(true);
    setSelectedResult(null);
    setContextResult(null);
    try {
      const params = new URLSearchParams();
      params.set("query", searchQuery.trim());
      if (searchType !== "all") params.set("types", searchType);
      if (searchCategory !== "all") params.set("categories", searchCategory);
      params.set("limit", "20");
      const res = await fetch(`/api/memory/context?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setSearchResults(Array.isArray(data) ? data : data.results || []);
      } else {
        toast.error("Search failed");
      }
    } catch {
      toast.error("Search failed");
    } finally {
      setSearchLoading(false);
    }
  }, [searchQuery, searchType, searchCategory]);

  // ── Fetch Stats ──
  const fetchStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const res = await fetch("/api/memory/context/stats");
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch {
      // silently fail
    } finally {
      setStatsLoading(false);
    }
  }, []);

  // ── Init ──
  useEffect(() => {
    if (!open) return;
    fetchStats();
  }, [open, fetchStats]);

  // ── Get Context ──
  const getContext = async () => {
    if (!searchQuery.trim()) {
      toast.error("Enter a search query first");
      return;
    }
    setContextLoading(true);
    setContextResult(null);
    try {
      const params = new URLSearchParams();
      params.set("query", searchQuery.trim());
      if (searchType !== "all") params.set("types", searchType);
      if (searchCategory !== "all") params.set("categories", searchCategory);
      const res = await fetch(`/api/memory/context?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        // The context endpoint returns relevant context as a string
        const contextStr = typeof data === "string"
          ? data
          : data.context || data.result || JSON.stringify(data, null, 2);
        setContextResult(contextStr);
        toast.success("Context retrieved");
      } else {
        toast.error("Failed to get context");
      }
    } catch {
      toast.error("Failed to get context");
    } finally {
      setContextLoading(false);
    }
  };

  // ── Store Memory ──
  const storeMemory = async () => {
    if (!storeContent.trim()) {
      toast.error("Content is required");
      return;
    }
    setStoreSaving(true);
    try {
      const body: Record<string, unknown> = {
        type: storeType,
        category: storeCategory,
        content: storeContent.trim(),
        priority: parseInt(storePriority, 10) || 5,
      };
      if (storeSummary.trim()) body.summary = storeSummary.trim();
      if (storeSourceId.trim()) body.sourceId = storeSourceId.trim();
      if (storeSourceType.trim()) body.sourceType = storeSourceType.trim();
      if (storeProjectId.trim()) body.projectId = storeProjectId.trim();
      if (storeAgentId.trim()) body.agentId = storeAgentId.trim();
      if (storeTags.trim()) {
        body.tags = storeTags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean);
      }
      if (storeTTL.trim()) {
        body.ttlHours = parseInt(storeTTL, 10);
      }

      const res = await fetch("/api/memory/context", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        toast.success("Memory stored successfully");
        // Reset form
        setStoreContent("");
        setStoreSummary("");
        setStoreSourceId("");
        setStoreSourceType("");
        setStoreProjectId("");
        setStoreAgentId("");
        setStoreTags("");
        setStorePriority("5");
        setStoreTTL("");
        await fetchStats();
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to store memory");
      }
    } catch {
      toast.error("Failed to store memory");
    } finally {
      setStoreSaving(false);
    }
  };

  // ── Prune Expired ──
  const pruneExpired = async () => {
    setPruning(true);
    try {
      const res = await fetch("/api/memory/context/prune", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (res.ok) {
        const data = await res.json();
        const pruned = (data as PruneResult).prunedCount ?? data.count ?? 0;
        toast.success(`Pruned ${pruned} expired memories`);
        await fetchStats();
      } else {
        toast.error("Failed to prune expired memories");
      }
    } catch {
      toast.error("Failed to prune expired memories");
    } finally {
      setPruning(false);
    }
  };

  // ── Compress (from Stats tab) ──
  const compressFromStats = async () => {
    setCompressingFromStats(true);
    try {
      const res = await fetch("/api/memory/context/compress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ olderThanDays: 30, minAccessCount: 2 }),
      });
      if (res.ok) {
        const data = await res.json();
        const result = data as CompressResult;
        toast.success(
          `Compressed ${result.compressedCount ?? 0} memories, deduplicated ${result.deduplicatedCount ?? 0}, freed ${formatBytes(result.freedBytes ?? 0)}`
        );
        await fetchStats();
      } else {
        toast.error("Compression failed");
      }
    } catch {
      toast.error("Compression failed");
    } finally {
      setCompressingFromStats(false);
    }
  };

  // ── Compress (from Compress tab) ──
  const runCompress = async () => {
    setCompressLoading(true);
    setCompressResult(null);
    try {
      const body: Record<string, unknown> = {
        olderThanDays: parseInt(compressOlderThan, 10) || 30,
        minAccessCount: parseInt(compressMinAccess, 10) || 2,
        dryRun: compressDryRun,
      };
      const res = await fetch("/api/memory/context/compress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        const data = await res.json();
        setCompressResult(data as CompressResult);
        toast.success(compressDryRun ? "Dry run complete" : "Compression complete");
        await fetchStats();
      } else {
        const data = await res.json();
        toast.error(data.error || "Compression failed");
      }
    } catch {
      toast.error("Compression failed");
    } finally {
      setCompressLoading(false);
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
            <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-gradient-to-br from-violet-500/20 to-cyan-500/20 border border-violet-500/30">
              <Brain className="h-4 w-4 text-violet-400" />
            </div>
            Universal Context Memory
          </DialogTitle>
          <DialogDescription>
            Search, store, and manage persistent AI memory across sessions and agents
          </DialogDescription>
        </DialogHeader>
        <PowerToolHint name="Universal Context Memory" />

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
          <TabsList className="grid w-full grid-cols-4 mb-1 shrink-0">
            <TabsTrigger value="search" className="gap-1.5 text-xs">
              <Search className="h-3.5 w-3.5" />
              Search
            </TabsTrigger>
            <TabsTrigger value="store" className="gap-1.5 text-xs">
              <Plus className="h-3.5 w-3.5" />
              Store
            </TabsTrigger>
            <TabsTrigger value="stats" className="gap-1.5 text-xs">
              <BarChart3 className="h-3.5 w-3.5" />
              Stats
            </TabsTrigger>
            <TabsTrigger value="compress" className="gap-1.5 text-xs">
              <Database className="h-3.5 w-3.5" />
              Compress
            </TabsTrigger>
          </TabsList>

          {/* ═══ SEARCH TAB ═══ */}
          <TabsContent value="search" className="flex-1 min-h-0 mt-0 overflow-y-auto">
            <ScrollArea className="h-[calc(90vh-200px)]">
              <div className="space-y-4 p-1 pr-4">
                {/* Search Controls */}
                <div className="rounded-xl border bg-card p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                      <Input
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search memories..."
                        className="pl-8 h-9"
                        onKeyDown={(e) => {
                          if (e.key === "Enter") fetchSearchResults();
                        }}
                      />
                    </div>
                    <Button
                      onClick={fetchSearchResults}
                      disabled={searchLoading || !searchQuery.trim()}
                      size="sm"
                      className="h-9 text-xs gap-1.5 min-w-[100px]"
                    >
                      {searchLoading ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Search className="h-3.5 w-3.5" />
                      )}
                      Search
                    </Button>
                  </div>

                  {/* Filters */}
                  <div className="flex items-center gap-3 flex-wrap">
                    <div className="space-y-1 flex-1 min-w-[140px]">
                      <Label className="text-[10px] font-medium text-muted-foreground">Type</Label>
                      <Select value={searchType} onValueChange={setSearchType}>
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Types</SelectItem>
                          {MEMORY_TYPES.map((t) => (
                            <SelectItem key={t} value={t} className="capitalize">
                              {t}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1 flex-1 min-w-[140px]">
                      <Label className="text-[10px] font-medium text-muted-foreground">Category</Label>
                      <Select value={searchCategory} onValueChange={setSearchCategory}>
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Categories</SelectItem>
                          {MEMORY_CATEGORIES.map((c) => (
                            <SelectItem key={c} value={c} className="capitalize">
                              {c}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <Button
                      onClick={getContext}
                      disabled={contextLoading || !searchQuery.trim()}
                      variant="outline"
                      size="sm"
                      className="h-8 text-xs gap-1.5 min-w-[110px] mt-4"
                    >
                      {contextLoading ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <ArrowRight className="h-3.5 w-3.5" />
                      )}
                      Get Context
                    </Button>
                  </div>
                </div>

                {/* Context Result */}
                {contextResult && (
                  <div className="rounded-xl border bg-card p-4 space-y-2">
                    <Label className="text-xs font-medium flex items-center gap-1.5">
                      <Brain className="h-3 w-3 text-violet-400" />
                      Retrieved Context
                    </Label>
                    <div className="rounded-md bg-zinc-950 text-cyan-400 p-3 font-mono text-xs overflow-x-auto max-h-48 overflow-y-auto whitespace-pre-wrap">
                      {contextResult}
                    </div>
                  </div>
                )}

                {/* Selected Result Detail */}
                {selectedResult && (
                  <div className="rounded-xl border bg-card p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-medium flex items-center gap-1.5">
                        <Brain className="h-3 w-3 text-violet-400" />
                        Memory Detail
                      </Label>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 text-xs"
                        onClick={() => setSelectedResult(null)}
                      >
                        Close
                      </Button>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge className={cn("h-5 text-[10px] border", typeBadgeColor(selectedResult.type))}>
                        {selectedResult.type}
                      </Badge>
                      <Badge className={cn("h-5 text-[10px] border", categoryBadgeColor(selectedResult.category))}>
                        {selectedResult.category}
                      </Badge>
                      <Badge variant="outline" className="h-5 text-[10px]">
                        <Tag className="h-2.5 w-2.5 mr-1" />
                        Priority: {selectedResult.priority}
                      </Badge>
                      <Badge variant="outline" className="h-5 text-[10px]">
                        <Clock className="h-2.5 w-2.5 mr-1" />
                        {formatDate(selectedResult.createdAt)}
                      </Badge>
                    </div>
                    {selectedResult.summary && (
                      <div>
                        <Label className="text-[10px] text-muted-foreground">Summary</Label>
                        <p className="text-xs mt-0.5 bg-muted/40 rounded p-2">{selectedResult.summary}</p>
                      </div>
                    )}
                    <div>
                      <Label className="text-[10px] text-muted-foreground">Full Content</Label>
                      <div className="mt-0.5 rounded-md bg-muted/40 p-3 text-xs whitespace-pre-wrap max-h-64 overflow-y-auto">
                        {selectedResult.content}
                      </div>
                    </div>
                    {selectedResult.tags && selectedResult.tags.length > 0 && (
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <Tag className="h-3 w-3 text-muted-foreground" />
                        {selectedResult.tags.map((tag, i) => (
                          <Badge key={i} variant="secondary" className="h-5 text-[10px]">
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    )}
                    <Separator />
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-[10px] text-muted-foreground">
                      {selectedResult.sourceId && (
                        <div>
                          <span className="font-medium">Source ID:</span>{" "}
                          <span className="font-mono">{selectedResult.sourceId}</span>
                        </div>
                      )}
                      {selectedResult.sourceType && (
                        <div>
                          <span className="font-medium">Source Type:</span> {selectedResult.sourceType}
                        </div>
                      )}
                      {selectedResult.projectId && (
                        <div>
                          <span className="font-medium">Project:</span>{" "}
                          <span className="font-mono">{selectedResult.projectId}</span>
                        </div>
                      )}
                      {selectedResult.agentId && (
                        <div>
                          <span className="font-medium">Agent:</span>{" "}
                          <span className="font-mono">{selectedResult.agentId}</span>
                        </div>
                      )}
                      <div>
                        <span className="font-medium">Access Count:</span> {selectedResult.accessCount}
                      </div>
                      {selectedResult.relevanceScore !== undefined && (
                        <div>
                          <span className="font-medium">Relevance:</span>{" "}
                          {(selectedResult.relevanceScore * 100).toFixed(1)}%
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Search Results List */}
                {searchLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : searchResults.length === 0 && searchQuery.trim() ? (
                  <div className="flex flex-col items-center justify-center py-12 text-muted-foreground border border-dashed rounded-lg">
                    <Search className="h-10 w-10 mb-3 opacity-30" />
                    <p className="text-sm font-medium">No memories found</p>
                    <p className="text-xs mt-1">Try adjusting your search query or filters</p>
                  </div>
                ) : searchResults.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-muted-foreground border border-dashed rounded-lg">
                    <Brain className="h-10 w-10 mb-3 opacity-30" />
                    <p className="text-sm font-medium">Search for memories</p>
                    <p className="text-xs mt-1">Enter a query to search across all stored memories</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {searchResults.map((result) => (
                      <div
                        key={result.id}
                        className={cn(
                          "rounded-lg border p-3 cursor-pointer transition-all",
                          selectedResult?.id === result.id
                            ? "bg-card border-violet-500/40"
                            : "bg-card/50 hover:bg-card hover:border-border"
                        )}
                        onClick={() => setSelectedResult(result)}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <p className="text-xs text-foreground line-clamp-2">
                              {truncateText(result.content, 150)}
                            </p>
                            <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                              <Badge className={cn("h-4 text-[9px] border", typeBadgeColor(result.type))}>
                                {result.type}
                              </Badge>
                              <Badge className={cn("h-4 text-[9px] border", categoryBadgeColor(result.category))}>
                                {result.category}
                              </Badge>
                              <span className={cn("text-[10px] font-medium", priorityColor(result.priority))}>
                                P{result.priority}
                              </span>
                              {result.relevanceScore !== undefined && (
                                <span className="text-[10px] text-cyan-400 font-medium">
                                  {(result.relevanceScore * 100).toFixed(0)}% match
                                </span>
                              )}
                              <span className="text-[10px] text-muted-foreground">
                                {result.accessCount} accesses
                              </span>
                            </div>
                          </div>
                          <div className="shrink-0 flex items-center gap-1 text-[10px] text-muted-foreground">
                            <Clock className="h-3 w-3" />
                            {formatDate(result.createdAt)}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </ScrollArea>
          </TabsContent>

          {/* ═══ STORE TAB ═══ */}
          <TabsContent value="store" className="flex-1 min-h-0 mt-0 overflow-y-auto">
            <ScrollArea className="h-[calc(90vh-200px)]">
              <div className="space-y-4 p-1 pr-4">
                <div className="rounded-xl border bg-card p-5 space-y-4">
                  <h4 className="text-sm font-semibold flex items-center gap-2">
                    <Plus className="h-4 w-4 text-violet-400" />
                    Store New Memory
                  </h4>

                  {/* Type & Category Row */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium">Type</Label>
                      <Select value={storeType} onValueChange={(v) => setStoreType(v as MemoryType)}>
                        <SelectTrigger className="h-9">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {MEMORY_TYPES.map((t) => (
                            <SelectItem key={t} value={t} className="capitalize">
                              {t}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium">Category</Label>
                      <Select value={storeCategory} onValueChange={(v) => setStoreCategory(v as MemoryCategory)}>
                        <SelectTrigger className="h-9">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {MEMORY_CATEGORIES.map((c) => (
                            <SelectItem key={c} value={c} className="capitalize">
                              {c}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Content */}
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">
                      Content <span className="text-red-400">*</span>
                    </Label>
                    <Textarea
                      value={storeContent}
                      onChange={(e) => setStoreContent(e.target.value)}
                      placeholder="Enter the memory content to store..."
                      className="min-h-[120px] resize-y"
                    />
                  </div>

                  {/* Summary */}
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">
                      Summary <span className="text-muted-foreground">(optional)</span>
                    </Label>
                    <Textarea
                      value={storeSummary}
                      onChange={(e) => setStoreSummary(e.target.value)}
                      placeholder="Brief summary of the memory..."
                      className="min-h-[60px] resize-y"
                    />
                  </div>

                  {/* Source & Project Row */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium">Source ID</Label>
                      <Input
                        value={storeSourceId}
                        onChange={(e) => setStoreSourceId(e.target.value)}
                        placeholder="e.g. chat-abc123"
                        className="h-9 font-mono text-xs"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium">Source Type</Label>
                      <Input
                        value={storeSourceType}
                        onChange={(e) => setStoreSourceType(e.target.value)}
                        placeholder="e.g. conversation, file"
                        className="h-9 text-xs"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium">Project ID</Label>
                      <Input
                        value={storeProjectId}
                        onChange={(e) => setStoreProjectId(e.target.value)}
                        placeholder="e.g. proj-xyz"
                        className="h-9 font-mono text-xs"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium">Agent ID</Label>
                      <Input
                        value={storeAgentId}
                        onChange={(e) => setStoreAgentId(e.target.value)}
                        placeholder="e.g. agent-001"
                        className="h-9 font-mono text-xs"
                      />
                    </div>
                  </div>

                  {/* Tags, Priority, TTL Row */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium flex items-center gap-1">
                        <Tag className="h-3 w-3" />
                        Tags
                      </Label>
                      <Input
                        value={storeTags}
                        onChange={(e) => setStoreTags(e.target.value)}
                        placeholder="tag1, tag2, tag3"
                        className="h-9 text-xs"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium">Priority (1-10)</Label>
                      <Input
                        type="number"
                        min={1}
                        max={10}
                        value={storePriority}
                        onChange={(e) => setStorePriority(e.target.value)}
                        className="h-9 text-xs"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        TTL (hours)
                      </Label>
                      <Input
                        type="number"
                        min={0}
                        value={storeTTL}
                        onChange={(e) => setStoreTTL(e.target.value)}
                        placeholder="Leave empty for no expiry"
                        className="h-9 text-xs"
                      />
                    </div>
                  </div>

                  {/* Submit */}
                  <div className="flex items-center justify-end gap-2 pt-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 text-xs"
                      onClick={() => {
                        setStoreType("semantic");
                        setStoreCategory("conversation");
                        setStoreContent("");
                        setStoreSummary("");
                        setStoreSourceId("");
                        setStoreSourceType("");
                        setStoreProjectId("");
                        setStoreAgentId("");
                        setStoreTags("");
                        setStorePriority("5");
                        setStoreTTL("");
                      }}
                    >
                      Reset
                    </Button>
                    <Button
                      onClick={storeMemory}
                      disabled={storeSaving || !storeContent.trim()}
                      size="sm"
                      className="h-8 text-xs gap-1.5 min-w-[140px]"
                    >
                      {storeSaving ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Plus className="h-3.5 w-3.5" />
                      )}
                      {storeSaving ? "Storing..." : "Store Memory"}
                    </Button>
                  </div>
                </div>
              </div>
            </ScrollArea>
          </TabsContent>

          {/* ═══ STATS TAB ═══ */}
          <TabsContent value="stats" className="flex-1 min-h-0 mt-0 overflow-y-auto">
            <ScrollArea className="h-[calc(90vh-200px)]">
              <div className="space-y-4 p-1 pr-4">
                {/* Refresh */}
                <div className="flex items-center gap-3">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={fetchStats}
                    disabled={statsLoading}
                    className="h-8 text-xs gap-1"
                  >
                    <Loader2 className={cn("h-3.5 w-3.5", statsLoading && "animate-spin")} />
                    Refresh
                  </Button>
                </div>

                {statsLoading && !stats ? (
                  <div className="flex items-center justify-center py-16 text-muted-foreground">
                    <Loader2 className="h-6 w-6 animate-spin mr-2" />
                    <span className="text-sm">Loading stats...</span>
                  </div>
                ) : !stats ? (
                  <div className="flex flex-col items-center justify-center py-16 text-muted-foreground border border-dashed rounded-lg">
                    <BarChart3 className="h-10 w-10 mb-3 opacity-30" />
                    <p className="text-sm font-medium">No stats available</p>
                    <p className="text-xs mt-1">Memory statistics will appear here</p>
                  </div>
                ) : (
                  <>
                    {/* Key Metrics */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <div className="rounded-lg border bg-card p-4">
                        <div className="flex items-center gap-2 text-muted-foreground mb-1">
                          <Brain className="h-3.5 w-3.5" />
                          <span className="text-[10px] font-medium">Total Memories</span>
                        </div>
                        <p className="text-2xl font-bold">{stats.totalMemories.toLocaleString()}</p>
                      </div>
                      <div className="rounded-lg border bg-card p-4">
                        <div className="flex items-center gap-2 text-muted-foreground mb-1">
                          <BarChart3 className="h-3.5 w-3.5" />
                          <span className="text-[10px] font-medium">Avg Priority</span>
                        </div>
                        <p className="text-2xl font-bold">{stats.averagePriority.toFixed(1)}</p>
                      </div>
                      <div className="rounded-lg border bg-card p-4">
                        <div className="flex items-center gap-2 text-muted-foreground mb-1">
                          <ArrowRight className="h-3.5 w-3.5" />
                          <span className="text-[10px] font-medium">Total Links</span>
                        </div>
                        <p className="text-2xl font-bold">{stats.totalLinks.toLocaleString()}</p>
                      </div>
                      <div className="rounded-lg border bg-card p-4">
                        <div className="flex items-center gap-2 text-muted-foreground mb-1">
                          <Clock className="h-3.5 w-3.5" />
                          <span className="text-[10px] font-medium">Oldest Memory</span>
                        </div>
                        <p className="text-sm font-bold mt-1">
                          {stats.oldestMemoryDate
                            ? formatDate(stats.oldestMemoryDate)
                            : "N/A"}
                        </p>
                      </div>
                    </div>

                    {/* By Type */}
                    <div className="rounded-xl border bg-card p-5 space-y-3">
                      <h4 className="text-sm font-semibold flex items-center gap-2">
                        <Tag className="h-4 w-4 text-violet-400" />
                        Memories by Type
                      </h4>
                      <div className="flex items-center gap-2 flex-wrap">
                        {Object.entries(stats.byType).length === 0 ? (
                          <p className="text-xs text-muted-foreground">No type data</p>
                        ) : (
                          Object.entries(stats.byType).map(([type, count]) => (
                            <Badge
                              key={type}
                              className={cn("h-6 text-xs border gap-1", typeBadgeColor(type))}
                            >
                              {type}
                              <span className="font-bold">{count}</span>
                            </Badge>
                          ))
                        )}
                      </div>
                    </div>

                    {/* By Category */}
                    <div className="rounded-xl border bg-card p-5 space-y-3">
                      <h4 className="text-sm font-semibold flex items-center gap-2">
                        <Tag className="h-4 w-4 text-cyan-400" />
                        Memories by Category
                      </h4>
                      <div className="flex items-center gap-2 flex-wrap">
                        {Object.entries(stats.byCategory).length === 0 ? (
                          <p className="text-xs text-muted-foreground">No category data</p>
                        ) : (
                          Object.entries(stats.byCategory).map(([category, count]) => (
                            <Badge
                              key={category}
                              className={cn("h-6 text-xs border gap-1", categoryBadgeColor(category))}
                            >
                              {category}
                              <span className="font-bold">{count}</span>
                            </Badge>
                          ))
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="rounded-xl border bg-card p-5 space-y-3">
                      <h4 className="text-sm font-semibold flex items-center gap-2">
                        <Trash2 className="h-4 w-4 text-amber-400" />
                        Maintenance
                      </h4>
                      <div className="flex items-center gap-3 flex-wrap">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={pruneExpired}
                          disabled={pruning}
                          className="h-8 text-xs gap-1.5 min-w-[140px]"
                        >
                          {pruning ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="h-3.5 w-3.5" />
                          )}
                          {pruning ? "Pruning..." : "Prune Expired"}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={compressFromStats}
                          disabled={compressingFromStats}
                          className="h-8 text-xs gap-1.5 min-w-[140px]"
                        >
                          {compressingFromStats ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Database className="h-3.5 w-3.5" />
                          )}
                          {compressingFromStats ? "Compressing..." : "Compress"}
                        </Button>
                      </div>
                      <p className="text-[10px] text-muted-foreground">
                        Prune removes expired memories. Compress merges similar memories to save space.
                        Configure compression options in the Compress tab.
                      </p>
                    </div>
                  </>
                )}
              </div>
            </ScrollArea>
          </TabsContent>

          {/* ═══ COMPRESS TAB ═══ */}
          <TabsContent value="compress" className="flex-1 min-h-0 mt-0 overflow-y-auto">
            <ScrollArea className="h-[calc(90vh-200px)]">
              <div className="space-y-4 p-1 pr-4">
                <div className="rounded-xl border bg-card p-5 space-y-4">
                  <h4 className="text-sm font-semibold flex items-center gap-2">
                    <Database className="h-4 w-4 text-emerald-400" />
                    Memory Compression
                  </h4>
                  <p className="text-xs text-muted-foreground">
                    Compress older memories by merging similar entries and removing duplicates.
                    This reduces storage usage while preserving important context.
                  </p>

                  {/* Options */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium">Older than (days)</Label>
                      <Input
                        type="number"
                        min={1}
                        value={compressOlderThan}
                        onChange={(e) => setCompressOlderThan(e.target.value)}
                        className="h-9 text-xs"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium">Min access count</Label>
                      <Input
                        type="number"
                        min={0}
                        value={compressMinAccess}
                        onChange={(e) => setCompressMinAccess(e.target.value)}
                        className="h-9 text-xs"
                      />
                    </div>
                  </div>

                  {/* Dry Run Toggle */}
                  <div className="flex items-center justify-between rounded-lg border p-3">
                    <div>
                      <Label className="text-xs font-medium">Dry Run</Label>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        Simulate compression without making changes
                      </p>
                    </div>
                    <Switch
                      checked={compressDryRun}
                      onCheckedChange={setCompressDryRun}
                    />
                  </div>

                  {/* Compress Button */}
                  <div className="flex items-center gap-3">
                    <Button
                      onClick={runCompress}
                      disabled={compressLoading}
                      size="sm"
                      className="h-8 text-xs gap-1.5 min-w-[160px]"
                    >
                      {compressLoading ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Database className="h-3.5 w-3.5" />
                      )}
                      {compressLoading
                        ? "Compressing..."
                        : compressDryRun
                          ? "Dry Run Compress"
                          : "Compress"}
                    </Button>
                    {compressDryRun && (
                      <Badge variant="outline" className="h-5 text-[10px] text-amber-400 border-amber-500/30">
                        Dry Run Mode
                      </Badge>
                    )}
                  </div>
                </div>

                {/* Compress Results */}
                {compressResult && (
                  <div className="rounded-xl border bg-card p-5 space-y-4">
                    <h4 className="text-sm font-semibold flex items-center gap-2">
                      <BarChart3 className="h-4 w-4 text-cyan-400" />
                      Compression Results
                      {compressDryRun && (
                        <Badge variant="outline" className="h-5 text-[10px] text-amber-400 border-amber-500/30">
                          Simulated
                        </Badge>
                      )}
                    </h4>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div className="rounded-lg bg-muted/30 p-4 text-center">
                        <p className="text-2xl font-bold text-violet-400">
                          {compressResult.compressedCount ?? 0}
                        </p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">Compressed</p>
                      </div>
                      <div className="rounded-lg bg-muted/30 p-4 text-center">
                        <p className="text-2xl font-bold text-cyan-400">
                          {compressResult.deduplicatedCount ?? 0}
                        </p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">Deduplicated</p>
                      </div>
                      <div className="rounded-lg bg-muted/30 p-4 text-center">
                        <p className="text-2xl font-bold text-emerald-400">
                          {formatBytes(compressResult.freedBytes ?? 0)}
                        </p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">Freed</p>
                      </div>
                    </div>
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

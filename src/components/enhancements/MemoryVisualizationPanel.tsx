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
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Network,
  Clock,
  Grid3x3,
  Search,
  Loader2,
  Brain,
  FileText,
  Code2,
  Lightbulb,
  MessageSquare,
  GitBranch,
  Tag,
  Filter,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ───────────────────────────────────────────────────────────────────

type MemoryType = "fact" | "preference" | "instruction" | "context" | "code" | "conversation";

interface Memory {
  id: string;
  content: string;
  type: MemoryType;
  category: string;
  timestamp: string;
  tags: string[];
  linkedMemoryIds: string[];
}

interface MemoryCluster {
  category: string;
  memories: Memory[];
  color: string;
}

interface MemoryVisualizationPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function memoryTypeIcon(type: MemoryType) {
  switch (type) {
    case "fact":
      return <Lightbulb className="h-3.5 w-3.5" />;
    case "preference":
      return <MessageSquare className="h-3.5 w-3.5" />;
    case "instruction":
      return <FileText className="h-3.5 w-3.5" />;
    case "context":
      return <Brain className="h-3.5 w-3.5" />;
    case "code":
      return <Code2 className="h-3.5 w-3.5" />;
    case "conversation":
      return <MessageSquare className="h-3.5 w-3.5" />;
  }
}

function memoryTypeColor(type: MemoryType) {
  switch (type) {
    case "fact":
      return "bg-amber-500/15 text-amber-400 border-amber-500/30";
    case "preference":
      return "bg-pink-500/15 text-pink-400 border-pink-500/30";
    case "instruction":
      return "bg-cyan-500/15 text-cyan-400 border-cyan-500/30";
    case "context":
      return "bg-violet-500/15 text-violet-400 border-violet-500/30";
    case "code":
      return "bg-emerald-500/15 text-emerald-400 border-emerald-500/30";
    case "conversation":
      return "bg-fuchsia-500/15 text-fuchsia-400 border-fuchsia-500/30";
  }
}

function clusterColor(index: number) {
  const colors = [
    "bg-amber-500/10 border-amber-500/30",
    "bg-violet-500/10 border-violet-500/30",
    "bg-cyan-500/10 border-cyan-500/30",
    "bg-emerald-500/10 border-emerald-500/30",
    "bg-pink-500/10 border-pink-500/30",
    "bg-fuchsia-500/10 border-fuchsia-500/30",
  ];
  return colors[index % colors.length];
}

function clusterTextColor(index: number) {
  const colors = [
    "text-amber-400",
    "text-violet-400",
    "text-cyan-400",
    "text-emerald-400",
    "text-pink-400",
    "text-fuchsia-400",
  ];
  return colors[index % colors.length];
}

// ─── Component ───────────────────────────────────────────────────────────────

export function MemoryVisualizationPanel({ open, onOpenChange }: MemoryVisualizationPanelProps) {
  const [activeTab, setActiveTab] = useState("timeline");
  const [memories, setMemories] = useState<Memory[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<string>("all");

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/memory/visualization");
      if (res.ok) {
        const data = await res.json();
        setMemories(data.memories || []);
      }
    } catch {
      toast.error("Failed to load memory data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) fetchData();
  }, [open, fetchData]);

  const filteredMemories = memories.filter((m) => {
    const matchesSearch = searchQuery === "" ||
      m.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.tags.some((t) => t.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesType = filterType === "all" || m.type === filterType;
    return matchesSearch && matchesType;
  });

  // Group memories by category for cluster map
  const clusters: MemoryCluster[] = [];
  const categoryMap = new Map<string, Memory[]>();
  filteredMemories.forEach((m) => {
    const list = categoryMap.get(m.category) || [];
    list.push(m);
    categoryMap.set(m.category, list);
  });
  categoryMap.forEach((memories, category) => {
    clusters.push({ category, memories, color: "" });
  });

  // Build nodes for relationship graph
  const memoryMap = new Map(memories.map((m) => [m.id, m]));
  const linkedPairs: { from: Memory; to: Memory }[] = [];
  const seen = new Set<string>();
  memories.forEach((m) => {
    m.linkedMemoryIds.forEach((linkedId) => {
      const key = [m.id, linkedId].sort().join("-");
      if (!seen.has(key) && memoryMap.has(linkedId)) {
        seen.add(key);
        linkedPairs.push({ from: m, to: memoryMap.get(linkedId)! });
      }
    });
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-5xl max-h-[92vh] overflow-hidden flex flex-col" showCloseButton>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-gradient-to-br from-violet-500/20 to-fuchsia-500/20 border border-violet-500/30">
              <Network className="h-4 w-4 text-violet-400" />
            </div>
            Memory Visualization
          </DialogTitle>
          <DialogDescription>
            Timeline, cluster map, and relationship graph of stored memories
          </DialogDescription>
        </DialogHeader>

        {/* Search & Filter */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 shrink-0">
          <div className="relative flex-1 w-full sm:w-auto">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search memories..."
              className="h-9 pl-8 text-sm"
            />
          </div>
          <div className="flex items-center gap-1.5">
            <Filter className="h-3.5 w-3.5 text-muted-foreground" />
            {(["all", "fact", "preference", "instruction", "context", "code", "conversation"] as const).map((t) => (
              <Button
                key={t}
                variant={filterType === t ? "default" : "outline"}
                size="sm"
                className="h-7 text-[10px] px-2"
                onClick={() => setFilterType(t)}
              >
                {t === "all" ? "All" : t.charAt(0).toUpperCase() + t.slice(1)}
              </Button>
            ))}
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
          <TabsList className="grid w-full grid-cols-3 mb-1 shrink-0">
            <TabsTrigger value="timeline" className="gap-1.5 text-xs">
              <Clock className="h-3.5 w-3.5" />
              Timeline
            </TabsTrigger>
            <TabsTrigger value="cluster" className="gap-1.5 text-xs">
              <Grid3x3 className="h-3.5 w-3.5" />
              Cluster Map
            </TabsTrigger>
            <TabsTrigger value="graph" className="gap-1.5 text-xs">
              <Network className="h-3.5 w-3.5" />
              Graph
            </TabsTrigger>
          </TabsList>

          {/* ═══ TIMELINE TAB ═══ */}
          <TabsContent value="timeline" className="flex-1 min-h-0 mt-0 overflow-y-auto">
            <ScrollArea className="h-[calc(90vh-280px)]">
              <div className="p-1 pr-4">
                {loading ? (
                  <div className="flex items-center justify-center py-12 text-muted-foreground">
                    <Loader2 className="h-5 w-5 animate-spin mr-2" />
                    Loading memories...
                  </div>
                ) : filteredMemories.length === 0 ? (
                  <div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
                    <Clock className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">No memories found</p>
                  </div>
                ) : (
                  <div className="relative pl-6">
                    {/* Timeline line */}
                    <div className="absolute left-2.5 top-0 bottom-0 w-0.5 bg-violet-500/20" />
                    <div className="space-y-3">
                      {filteredMemories.map((m) => (
                        <div key={m.id} className="relative flex items-start gap-3">
                          {/* Timeline dot */}
                          <div className={cn(
                            "absolute -left-3.5 top-2 h-4 w-4 rounded-full border-2 border-background flex items-center justify-center",
                            memoryTypeColor(m.type)
                          )}>
                            <div className="h-1.5 w-1.5 rounded-full bg-current" />
                          </div>
                          {/* Content */}
                          <div className="flex-1 rounded-lg border bg-card p-3 space-y-1.5 ml-2">
                            <div className="flex items-center gap-2">
                              <Badge className={cn("h-5 text-[10px] border gap-1", memoryTypeColor(m.type))}>
                                {memoryTypeIcon(m.type)}
                                {m.type}
                              </Badge>
                              <span className="text-[10px] text-muted-foreground">{m.timestamp}</span>
                            </div>
                            <p className="text-xs text-muted-foreground">{m.content}</p>
                            {m.tags.length > 0 && (
                              <div className="flex items-center gap-1 flex-wrap">
                                <Tag className="h-3 w-3 text-muted-foreground" />
                                {m.tags.map((tag) => (
                                  <Badge key={tag} variant="outline" className="h-4 text-[9px]">{tag}</Badge>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </ScrollArea>
          </TabsContent>

          {/* ═══ CLUSTER MAP TAB ═══ */}
          <TabsContent value="cluster" className="flex-1 min-h-0 mt-0 overflow-y-auto">
            <ScrollArea className="h-[calc(90vh-280px)]">
              <div className="p-1 pr-4">
                {clusters.length === 0 ? (
                  <div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
                    <Grid3x3 className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">No clusters found</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {clusters.map((cluster, i) => (
                      <div
                        key={cluster.category}
                        className={cn("rounded-xl border p-4 space-y-2", clusterColor(i))}
                      >
                        <h4 className={cn("text-sm font-semibold flex items-center gap-2", clusterTextColor(i))}>
                          <Grid3x3 className="h-4 w-4" />
                          {cluster.category}
                          <Badge variant="outline" className="h-5 text-[10px] ml-auto">
                            {cluster.memories.length}
                          </Badge>
                        </h4>
                        <div className="space-y-1.5">
                          {cluster.memories.slice(0, 5).map((m) => (
                            <div key={m.id} className="rounded bg-muted/30 p-2 flex items-center gap-2">
                              <div className={cn("h-2 w-2 rounded-full shrink-0", memoryTypeColor(m.type).split(" ")[0])} />
                              <span className="text-[10px] truncate">{m.content}</span>
                            </div>
                          ))}
                          {cluster.memories.length > 5 && (
                            <p className="text-[10px] text-muted-foreground text-center">
                              +{cluster.memories.length - 5} more
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </ScrollArea>
          </TabsContent>

          {/* ═══ RELATIONSHIP GRAPH TAB ═══ */}
          <TabsContent value="graph" className="flex-1 min-h-0 mt-0 overflow-y-auto">
            <ScrollArea className="h-[calc(90vh-280px)]">
              <div className="p-1 pr-4 space-y-4">
                {filteredMemories.length === 0 ? (
                  <div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
                    <Network className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">No memories to visualize</p>
                  </div>
                ) : (
                  <>
                    {/* Graph Visualization */}
                    <div className="rounded-xl border border-violet-500/30 bg-violet-500/5 p-6 min-h-[300px] relative overflow-hidden">
                      <h4 className="text-sm font-semibold text-violet-400 mb-4 flex items-center gap-2">
                        <GitBranch className="h-4 w-4" />
                        Relationship Graph
                      </h4>
                      {/* Simple node-edge diagram */}
                      <div className="flex flex-wrap gap-4 justify-center">
                        {filteredMemories.slice(0, 20).map((m, i) => {
                          const hasLinks = m.linkedMemoryIds.length > 0;
                          return (
                            <div
                              key={m.id}
                              className={cn(
                                "flex flex-col items-center gap-1 p-2 rounded-lg border min-w-[80px] max-w-[120px]",
                                hasLinks ? "border-violet-500/30 bg-violet-500/10" : "border-zinc-700/50 bg-zinc-800/30"
                              )}
                            >
                              <div className={cn("h-6 w-6 rounded-full flex items-center justify-center", memoryTypeColor(m.type))}>
                                {memoryTypeIcon(m.type)}
                              </div>
                              <span className="text-[9px] text-center truncate w-full">{m.content.slice(0, 30)}</span>
                              {hasLinks && (
                                <div className="flex gap-0.5">
                                  {m.linkedMemoryIds.slice(0, 3).map((_, li) => (
                                    <div key={li} className="h-1 w-1 rounded-full bg-violet-400" />
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                      {linkedPairs.length > 0 && (
                        <div className="mt-4 text-center">
                          <Separator className="mb-3" />
                          <p className="text-[10px] text-muted-foreground">
                            {linkedPairs.length} links between {new Set(linkedPairs.flatMap((p) => [p.from.id, p.to.id])).size} memories
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Links Detail */}
                    {linkedPairs.length > 0 && (
                      <div className="rounded-xl border bg-card p-5 space-y-3">
                        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Connections</h4>
                        <div className="space-y-1.5 max-h-40 overflow-y-auto">
                          {linkedPairs.slice(0, 15).map((pair, i) => (
                            <div key={i} className="flex items-center gap-2 text-[10px]">
                              <Badge className={cn("h-4 text-[9px] border", memoryTypeColor(pair.from.type))}>
                                {pair.from.type}
                              </Badge>
                              <span className="truncate max-w-[100px]">{pair.from.content.slice(0, 25)}</span>
                              <GitBranch className="h-3 w-3 text-violet-400 shrink-0" />
                              <Badge className={cn("h-4 text-[9px] border", memoryTypeColor(pair.to.type))}>
                                {pair.to.type}
                              </Badge>
                              <span className="truncate max-w-[100px]">{pair.to.content.slice(0, 25)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
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

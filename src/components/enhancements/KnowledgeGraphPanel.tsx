"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
  Network,
  Plus,
  Loader2,
  Circle,
  ArrowRightLeft,
  Search,
  Sparkles,
  GitBranch,
  Route,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ───────────────────────────────────────────────────────────────────

interface Entity {
  id: string;
  name: string;
  type: string;
  properties: Record<string, string>;
  createdAt: string;
}

interface Relation {
  id: string;
  sourceId: string;
  sourceName: string;
  targetId: string;
  targetName: string;
  type: string;
  weight: number;
}

interface PathResult {
  path: Array<{ id: string; name: string; type: string }>;
  totalWeight: number;
}

interface KnowledgeGraphPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function entityTypeColor(type: string) {
  const colors: Record<string, string> = {
    person: "bg-purple-500/15 text-purple-400 border-purple-500/30",
    concept: "bg-fuchsia-500/15 text-fuchsia-400 border-fuchsia-500/30",
    project: "bg-violet-500/15 text-violet-400 border-violet-500/30",
    technology: "bg-pink-500/15 text-pink-400 border-pink-500/30",
    document: "bg-indigo-500/15 text-indigo-400 border-indigo-500/30",
  };
  return colors[type] || "bg-zinc-500/15 text-zinc-400 border-zinc-500/30";
}

// ─── Component ───────────────────────────────────────────────────────────────

export function KnowledgeGraphPanel({ open, onOpenChange }: KnowledgeGraphPanelProps) {
  const [activeTab, setActiveTab] = useState("entities");

  // ══ Entities Tab State ══
  const [entities, setEntities] = useState<Entity[]>([]);
  const [loadingEntities, setLoadingEntities] = useState(false);
  const [newEntityName, setNewEntityName] = useState("");
  const [newEntityType, setNewEntityType] = useState("concept");
  const [creatingEntity, setCreatingEntity] = useState(false);

  // ══ Relations Tab State ══
  const [relations, setRelations] = useState<Relation[]>([]);
  const [loadingRelations, setLoadingRelations] = useState(false);
  const [newRelSourceId, setNewRelSourceId] = useState("");
  const [newRelTargetId, setNewRelTargetId] = useState("");
  const [newRelType, setNewRelType] = useState("related_to");
  const [newRelWeight, setNewRelWeight] = useState("1.0");
  const [creatingRelation, setCreatingRelation] = useState(false);

  // ══ Explore Tab State ══
  const [fromEntityId, setFromEntityId] = useState("");
  const [toEntityId, setToEntityId] = useState("");
  const [pathResult, setPathResult] = useState<PathResult | null>(null);
  const [findingPath, setFindingPath] = useState(false);
  const [autoExtracting, setAutoExtracting] = useState(false);
  const [extractText, setExtractText] = useState("");

  // ── Fetch data on open ──
  const fetchEntities = useCallback(async () => {
    setLoadingEntities(true);
    try {
      const res = await fetch("/api/knowledge-graph/entities");
      if (res.ok) {
        const data = await res.json();
        setEntities(data.entities || []);
      }
    } catch {
      toast.error("Failed to load entities");
    } finally {
      setLoadingEntities(false);
    }
  }, []);

  const fetchRelations = useCallback(async () => {
    setLoadingRelations(true);
    try {
      const res = await fetch("/api/knowledge-graph/relations");
      if (res.ok) {
        const data = await res.json();
        setRelations(data.relations || []);
      }
    } catch {
      toast.error("Failed to load relations");
    } finally {
      setLoadingRelations(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      fetchEntities();
      fetchRelations();
    }
  }, [open, fetchEntities, fetchRelations]);

  // ── Create Entity ──
  const createEntity = async () => {
    if (!newEntityName.trim()) {
      toast.error("Entity name is required");
      return;
    }
    setCreatingEntity(true);
    try {
      const res = await fetch("/api/knowledge-graph/entities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newEntityName.trim(), type: newEntityType }),
      });
      if (res.ok) {
        toast.success("Entity created");
        setNewEntityName("");
        fetchEntities();
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to create entity");
      }
    } catch {
      toast.error("Failed to create entity");
    } finally {
      setCreatingEntity(false);
    }
  };

  // ── Create Relation ──
  const createRelation = async () => {
    if (!newRelSourceId || !newRelTargetId) {
      toast.error("Source and target entities are required");
      return;
    }
    setCreatingRelation(true);
    try {
      const res = await fetch("/api/knowledge-graph/relations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceId: newRelSourceId,
          targetId: newRelTargetId,
          type: newRelType,
          weight: parseFloat(newRelWeight),
        }),
      });
      if (res.ok) {
        toast.success("Relation created");
        setNewRelSourceId("");
        setNewRelTargetId("");
        fetchRelations();
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to create relation");
      }
    } catch {
      toast.error("Failed to create relation");
    } finally {
      setCreatingRelation(false);
    }
  };

  // ── Find Path ──
  const findPath = async () => {
    if (!fromEntityId || !toEntityId) {
      toast.error("Source and target entities are required");
      return;
    }
    setFindingPath(true);
    setPathResult(null);
    try {
      const res = await fetch("/api/knowledge-graph/path", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fromId: fromEntityId, toId: toEntityId }),
      });
      if (res.ok) {
        const data = await res.json();
        setPathResult(data);
        toast.success("Path found");
      } else {
        const data = await res.json();
        toast.error(data.error || "No path found");
      }
    } catch {
      toast.error("Path finding failed");
    } finally {
      setFindingPath(false);
    }
  };

  // ── Auto Extract ──
  const autoExtract = async () => {
    if (!extractText.trim()) {
      toast.error("Text is required for extraction");
      return;
    }
    setAutoExtracting(true);
    try {
      const res = await fetch("/api/knowledge-graph/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: extractText.trim() }),
      });
      if (res.ok) {
        toast.success("Entities and relations extracted");
        setExtractText("");
        fetchEntities();
        fetchRelations();
      } else {
        const data = await res.json();
        toast.error(data.error || "Auto-extraction failed");
      }
    } catch {
      toast.error("Auto-extraction failed");
    } finally {
      setAutoExtracting(false);
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
            <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-gradient-to-br from-purple-500/20 to-fuchsia-500/20 border border-purple-500/30">
              <Network className="h-4 w-4 text-purple-400" />
            </div>
            Knowledge Graph
          </DialogTitle>
          <DialogDescription>
            Create entities and relations, traverse the graph, find paths, and auto-extract knowledge
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
          <TabsList className="grid w-full grid-cols-3 mb-1 shrink-0">
            <TabsTrigger value="entities" className="gap-1.5 text-xs">
              <Circle className="h-3.5 w-3.5" />
              Entities
            </TabsTrigger>
            <TabsTrigger value="relations" className="gap-1.5 text-xs">
              <ArrowRightLeft className="h-3.5 w-3.5" />
              Relations
            </TabsTrigger>
            <TabsTrigger value="explore" className="gap-1.5 text-xs">
              <Route className="h-3.5 w-3.5" />
              Explore
            </TabsTrigger>
          </TabsList>

          {/* ═══ ENTITIES TAB ═══ */}
          <TabsContent value="entities" className="flex-1 min-h-0 mt-0 overflow-y-auto">
            <ScrollArea className="h-[calc(90vh-200px)]">
              <div className="space-y-5 p-1 pr-4">
                {/* Create Entity */}
                <div className="rounded-xl border bg-card p-5 space-y-4">
                  <h4 className="text-sm font-semibold flex items-center gap-2">
                    <Plus className="h-4 w-4 text-purple-400" />
                    Create Entity
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium">Entity Name</Label>
                      <Input value={newEntityName} onChange={(e) => setNewEntityName(e.target.value)} placeholder="e.g., React" className="h-9" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium">Type</Label>
                      <Select value={newEntityType} onValueChange={setNewEntityType}>
                        <SelectTrigger className="h-9">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="concept">Concept</SelectItem>
                          <SelectItem value="person">Person</SelectItem>
                          <SelectItem value="project">Project</SelectItem>
                          <SelectItem value="technology">Technology</SelectItem>
                          <SelectItem value="document">Document</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="flex items-center justify-end">
                    <Button size="sm" onClick={createEntity} disabled={creatingEntity || !newEntityName.trim()} className="h-9 text-xs gap-1.5 min-w-[150px]">
                      {creatingEntity ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                      Create Entity
                    </Button>
                  </div>
                </div>

                {/* Entity Graph Visualization */}
                <div className="rounded-xl border border-purple-500/30 bg-purple-500/5 p-5 space-y-3">
                  <h4 className="text-sm font-semibold flex items-center gap-2 text-purple-400">
                    <Network className="h-4 w-4" />
                    Graph Visualization
                  </h4>
                  <div className="flex flex-wrap gap-3 justify-center py-4">
                    {entities.slice(0, 12).map((entity, i) => (
                      <div key={entity.id} className="flex items-center gap-1">
                        <div className={cn("h-10 w-10 rounded-full flex items-center justify-center text-xs font-bold border", entityTypeColor(entity.type))}>
                          {entity.name.charAt(0).toUpperCase()}
                        </div>
                        {i < entities.length - 1 && i < 11 && (
                          <ArrowRightLeft className="h-3 w-3 text-purple-400/50 mx-1" />
                        )}
                      </div>
                    ))}
                    {entities.length === 0 && (
                      <div className="text-xs text-muted-foreground py-4">No entities yet</div>
                    )}
                  </div>
                </div>

                {/* Entities List */}
                <div className="rounded-xl border bg-card p-5 space-y-3">
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Entities ({entities.length})</h4>
                  {loadingEntities ? (
                    <div className="flex items-center justify-center py-8 text-muted-foreground">
                      <Loader2 className="h-5 w-5 animate-spin mr-2" />
                      Loading...
                    </div>
                  ) : entities.length === 0 ? (
                    <div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
                      <Network className="h-8 w-8 mx-auto mb-2 opacity-30" />
                      <p className="text-sm">No entities found</p>
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-96 overflow-y-auto">
                      {entities.map((entity) => (
                        <div key={entity.id} className="flex items-center gap-3 rounded-lg bg-muted/30 p-3">
                          <div className={cn("h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold border", entityTypeColor(entity.type))}>
                            {entity.name.charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0 flex-1">
                            <span className="text-sm font-medium">{entity.name}</span>
                          </div>
                          <Badge className={cn("h-5 text-[10px] border", entityTypeColor(entity.type))}>
                            {entity.type}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </ScrollArea>
          </TabsContent>

          {/* ═══ RELATIONS TAB ═══ */}
          <TabsContent value="relations" className="flex-1 min-h-0 mt-0 overflow-y-auto">
            <ScrollArea className="h-[calc(90vh-200px)]">
              <div className="space-y-5 p-1 pr-4">
                {/* Create Relation */}
                <div className="rounded-xl border bg-card p-5 space-y-4">
                  <h4 className="text-sm font-semibold flex items-center gap-2">
                    <ArrowRightLeft className="h-4 w-4 text-fuchsia-400" />
                    Create Relation
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium">Source Entity</Label>
                      <Select value={newRelSourceId} onValueChange={setNewRelSourceId}>
                        <SelectTrigger className="h-9">
                          <SelectValue placeholder="Choose source..." />
                        </SelectTrigger>
                        <SelectContent>
                          {entities.map((e) => (
                            <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium">Target Entity</Label>
                      <Select value={newRelTargetId} onValueChange={setNewRelTargetId}>
                        <SelectTrigger className="h-9">
                          <SelectValue placeholder="Choose target..." />
                        </SelectTrigger>
                        <SelectContent>
                          {entities.map((e) => (
                            <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium">Relation Type</Label>
                      <Select value={newRelType} onValueChange={setNewRelType}>
                        <SelectTrigger className="h-9">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="related_to">Related To</SelectItem>
                          <SelectItem value="depends_on">Depends On</SelectItem>
                          <SelectItem value="part_of">Part Of</SelectItem>
                          <SelectItem value="created_by">Created By</SelectItem>
                          <SelectItem value="uses">Uses</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium">Weight</Label>
                      <Input type="number" step="0.1" value={newRelWeight} onChange={(e) => setNewRelWeight(e.target.value)} className="h-9" />
                    </div>
                  </div>
                  <div className="flex items-center justify-end">
                    <Button size="sm" onClick={createRelation} disabled={creatingRelation || !newRelSourceId || !newRelTargetId} className="h-9 text-xs gap-1.5 min-w-[150px]">
                      {creatingRelation ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowRightLeft className="h-3.5 w-3.5" />}
                      Create Relation
                    </Button>
                  </div>
                </div>

                {/* Relations List */}
                <div className="rounded-xl border bg-card p-5 space-y-3">
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Relations ({relations.length})</h4>
                  {loadingRelations ? (
                    <div className="flex items-center justify-center py-8 text-muted-foreground">
                      <Loader2 className="h-5 w-5 animate-spin mr-2" />
                      Loading...
                    </div>
                  ) : relations.length === 0 ? (
                    <div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
                      <ArrowRightLeft className="h-8 w-8 mx-auto mb-2 opacity-30" />
                      <p className="text-sm">No relations found</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {relations.map((rel) => (
                        <div key={rel.id} className="flex items-center gap-2 rounded-lg bg-muted/30 p-3">
                          <span className="text-xs font-medium">{rel.sourceName}</span>
                          <ArrowRightLeft className="h-3.5 w-3.5 text-fuchsia-400 shrink-0" />
                          <Badge variant="outline" className="h-5 text-[10px] shrink-0">{rel.type}</Badge>
                          <ArrowRightLeft className="h-3.5 w-3.5 text-fuchsia-400 shrink-0" />
                          <span className="text-xs font-medium">{rel.targetName}</span>
                          <span className="text-[10px] text-muted-foreground ml-auto">w: {rel.weight}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </ScrollArea>
          </TabsContent>

          {/* ═══ EXPLORE TAB ═══ */}
          <TabsContent value="explore" className="flex-1 min-h-0 mt-0 overflow-y-auto">
            <ScrollArea className="h-[calc(90vh-200px)]">
              <div className="space-y-5 p-1 pr-4">
                {/* Find Path */}
                <div className="rounded-xl border bg-card p-5 space-y-4">
                  <h4 className="text-sm font-semibold flex items-center gap-2">
                    <Route className="h-4 w-4 text-purple-400" />
                    Find Path
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium">From Entity</Label>
                      <Select value={fromEntityId} onValueChange={setFromEntityId}>
                        <SelectTrigger className="h-9">
                          <SelectValue placeholder="Choose start..." />
                        </SelectTrigger>
                        <SelectContent>
                          {entities.map((e) => (
                            <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium">To Entity</Label>
                      <Select value={toEntityId} onValueChange={setToEntityId}>
                        <SelectTrigger className="h-9">
                          <SelectValue placeholder="Choose end..." />
                        </SelectTrigger>
                        <SelectContent>
                          {entities.map((e) => (
                            <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="flex items-center justify-end">
                    <Button size="sm" onClick={findPath} disabled={findingPath || !fromEntityId || !toEntityId} className="h-9 text-xs gap-1.5 min-w-[130px]">
                      {findingPath ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
                      Find Path
                    </Button>
                  </div>
                </div>

                {/* Path Result */}
                {pathResult && (
                  <div className="rounded-xl border border-purple-500/30 bg-purple-500/5 p-5 space-y-3">
                    <h4 className="text-sm font-semibold flex items-center gap-2 text-purple-400">
                      <GitBranch className="h-4 w-4" />
                      Path Found (weight: {pathResult.totalWeight.toFixed(2)})
                    </h4>
                    <div className="flex items-center flex-wrap gap-2">
                      {pathResult.path.map((node, i) => (
                        <div key={node.id} className="flex items-center gap-2">
                          <div className={cn("h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold border", entityTypeColor(node.type))}>
                            {node.name.charAt(0).toUpperCase()}
                          </div>
                          <span className="text-xs font-medium">{node.name}</span>
                          {i < pathResult.path.length - 1 && <ArrowRightLeft className="h-3.5 w-3.5 text-purple-400" />}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Auto Extract */}
                <div className="rounded-xl border bg-card p-5 space-y-4">
                  <h4 className="text-sm font-semibold flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-fuchsia-400" />
                    Auto-Extract Knowledge
                  </h4>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">Paste text to extract entities and relations</Label>
                    <Textarea value={extractText} onChange={(e) => setExtractText(e.target.value)} placeholder="Paste article, documentation, or any text..." className="min-h-[100px] resize-none" />
                  </div>
                  <div className="flex items-center justify-end">
                    <Button size="sm" onClick={autoExtract} disabled={autoExtracting || !extractText.trim()} className="h-9 text-xs gap-1.5 min-w-[160px]">
                      {autoExtracting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                      Auto-Extract
                    </Button>
                  </div>
                </div>
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

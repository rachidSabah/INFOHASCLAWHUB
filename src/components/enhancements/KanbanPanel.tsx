"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  Layout, Plus, Trash2, RefreshCw, Loader2, CheckCircle2, Circle,
  Clock, Calendar, User, PlusCircle, MinusCircle, AlertTriangle,
  GitBranch, Link2, FileText, X, Rocket, FolderOpen, Play, Activity,
  Zap, ListChecks, ArrowRight, Bot, XCircle, StopCircle,
} from "lucide-react";

interface KanbanCard {
  id: string; columnId: string; title: string; description?: string;
  priority: string; labels?: string; assignee?: string; status: string;
  subtasks?: string; gitBranch?: string; prLink?: string; order: number;
  tokenUsage?: string; dueDate?: string; logs?: string; artifacts?: string;
}

interface KanbanColumn { id: string; name: string; color?: string; cards: KanbanCard[]; }

interface KanbanBoard { id: string; name: string; columns: KanbanColumn[]; }

interface Agent { id: string; name: string; avatar?: string; }

interface OrchestratorTask {
  id: string; cardId: string; milestoneId: string;
  title: string; description: string; agentName: string; agentRole: string;
  status: string; priority: string; labels: string[]; result?: string; retries: number;
}
interface OrchestratorMilestone { id: string; name: string; description: string; order: number; tasks: string[]; }
interface OrchestratorStatus {
  projectId: string; prompt: string; workspacePath: string; boardId: string;
  status: string; category: string; currentTask: string | null;
  startedAt: string; completedAt: string | null; milestones: OrchestratorMilestone[];
  tasks: OrchestratorTask[]; completedTasks: number; totalTasks: number;
  logs?: { timestamp: string; level: string; message: string; taskId?: string; agentName?: string }[];
}

const COLUMN_COLORS: Record<string, string> = {
  "Backlog": "#6b7280", "Planning": "#3b82f6", "In Progress": "#f59e0b",
  "Multi-Agent Execution": "#8b5cf6", "Review": "#f97316", "Testing": "#06b6d4",
  "Completed": "#10b981", "Failed": "#ef4444",
};

const PRIORITY_COLORS: Record<string, string> = {
  critical: "bg-red-500/10 text-red-500 border-red-500/20",
  high: "bg-orange-500/10 text-orange-500 border-orange-500/20",
  medium: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  low: "bg-green-500/10 text-green-500 border-green-500/20",
};

const LABEL_PALETTE = [
  "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
  "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",
  "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  "bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-300",
  "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300",
  "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300",
  "bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300",
];

function getLabelColor(label: string): string {
  let hash = 0;
  for (let i = 0; i < label.length; i++) { hash = label.charCodeAt(i) + ((hash << 5) - hash); }
  return LABEL_PALETTE[Math.abs(hash) % LABEL_PALETTE.length];
}

interface CardEditState {
  title: string; description: string; priority: string; labels: string;
  assignee: string; dueDate: string;
}

interface Props { open: boolean; onOpenChange: (open: boolean) => void; }

export function KanbanPanel({ open, onOpenChange }: Props) {
  const [board, setBoard] = useState<KanbanBoard | null>(null);
  const [loading, setLoading] = useState(false);
  const [newCardTitle, setNewCardTitle] = useState<Record<string, string>>({});
  const [selectedCard, setSelectedCard] = useState<KanbanCard | null>(null);
  const [cardOpen, setCardOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("details");
  const [agents, setAgents] = useState<Agent[]>([]);
  const [editing, setEditing] = useState<CardEditState>({ title: "", description: "", priority: "medium", labels: "", assignee: "", dueDate: "" });
  const [localSubtasks, setLocalSubtasks] = useState<{ title: string; done: boolean }[]>([]);
  const [newSubtask, setNewSubtask] = useState("");
  const [metaGitBranch, setMetaGitBranch] = useState("");
  const [metaPrLink, setMetaPrLink] = useState("");
  const [metaTokenUsage, setMetaTokenUsage] = useState("");
  const [metaLogs, setMetaLogs] = useState("");
  const [metaArtifacts, setMetaArtifacts] = useState<string[]>([]);
  const [newArtifact, setNewArtifact] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [dragCardId, setDragCardId] = useState<string | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Orchestrator / Autonomous Dev state
  const [orchView, setOrchView] = useState(false);
  const [orchTab, setOrchTab] = useState("setup");
  const [orchPrompt, setOrchPrompt] = useState("");
  const [orchWorkspace, setOrchWorkspace] = useState("");
  const [orchStarting, setOrchStarting] = useState(false);
  const [orchProject, setOrchProject] = useState<OrchestratorStatus | null>(null);
  const orchPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchBoard = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/kanban/boards");
      if (!res.ok) throw new Error("Failed");
      const boards = await res.json();
      if (boards.length === 0) {
        const createRes = await fetch("/api/kanban/boards", { method: "POST" });
        if (createRes.ok) {
          const refetch = await fetch("/api/kanban/boards");
          const newBoards = await refetch.json();
          if (newBoards.length > 0) {
            const b = newBoards[0];
            setBoard({ ...b, columns: b.columns.map((c: any) => ({ ...c, cards: c.cards || [] })) });
          }
        }
      } else {
        const b = boards[0];
        setBoard({ ...b, columns: b.columns.map((c: any) => ({ ...c, cards: c.cards || [] })) });
      }
    } catch (e) { console.error("Kanban fetch error:", e); }
    setLoading(false);
  }, []);

  const fetchAgents = useCallback(async () => {
    try {
      const res = await fetch("/api/agents");
      if (res.ok) { const data = await res.json(); setAgents(data); }
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    if (open) { fetchBoard(); fetchAgents(); }
  }, [open, fetchBoard, fetchAgents]);

  useEffect(() => {
    if (open && !cardOpen && !orchView) {
      intervalRef.current = setInterval(() => { fetchBoard(); }, 5000);
    }
    return () => { if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; } };
  }, [open, cardOpen, orchView, fetchBoard]);

  const parseSubtasks = (raw?: string): { title: string; done: boolean }[] => {
    try { return JSON.parse(raw || "[]"); } catch { return []; }
  };

  const parseLabels = (raw?: string): string[] => {
    try { return JSON.parse(raw || "[]"); } catch { return []; }
  };

  const parseArtifacts = (raw?: string): string[] => {
    try { return JSON.parse(raw || "[]"); } catch { return []; }
  };

  const subtaskProgress = (raw?: string): number => {
    const subs = parseSubtasks(raw);
    if (subs.length === 0) return 0;
    return Math.round((subs.filter(s => s.done).length / subs.length) * 100);
  };

  const subtaskDoneCount = (raw?: string): number => parseSubtasks(raw).filter(s => s.done).length;

  const populateEditing = useCallback((card: KanbanCard) => {
    setEditing({
      title: card.title || "",
      description: card.description || "",
      priority: card.priority || "medium",
      labels: parseLabels(card.labels).join(", "),
      assignee: card.assignee || "",
      dueDate: card.dueDate || "",
    });
    setLocalSubtasks(parseSubtasks(card.subtasks));
    setMetaGitBranch(card.gitBranch || "");
    setMetaPrLink(card.prLink || "");
    setMetaTokenUsage(card.tokenUsage || "");
    setMetaLogs(card.logs || "");
    setMetaArtifacts(parseArtifacts(card.artifacts));
    setDeleteConfirm(false);
    setActiveTab("details");
  }, []);

  const openCard = (card: KanbanCard) => {
    setSelectedCard(card);
    populateEditing(card);
    setCardOpen(true);
  };

  const createCard = async (columnId: string) => {
    const title = newCardTitle[columnId]?.trim();
    if (!title) return;
    try {
      const col = board?.columns.find(c => c.id === columnId);
      const status = col?.name.toLowerCase().replace(/\s+/g, "-") || "backlog";
      const res = await fetch("/api/kanban/cards", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ columnId, title, priority: "medium", labels: "[]", status }),
      });
      if (res.ok) { setNewCardTitle(p => ({ ...p, [columnId]: "" })); fetchBoard(); }
    } catch { toast.error("Failed to create card"); }
  };

  const moveCard = async (cardId: string, targetColumnId: string) => {
    try {
      await fetch(`/api/kanban/cards/${cardId}/move`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetColumnId }),
      });
      fetchBoard();
    } catch { toast.error("Failed to move card"); }
  };

  const saveCard = async () => {
    if (!selectedCard) return;
    setSaving(true);
    try {
      const body: Record<string, any> = {};
      body.title = editing.title;
      body.description = editing.description;
      body.priority = editing.priority;
      body.labels = JSON.stringify(editing.labels.split(",").map(l => l.trim()).filter(Boolean));
      body.assignee = editing.assignee || null;
      body.dueDate = editing.dueDate || null;
      body.subtasks = JSON.stringify(localSubtasks);
      body.gitBranch = metaGitBranch || null;
      body.prLink = metaPrLink || null;
      body.tokenUsage = metaTokenUsage || null;
      body.logs = metaLogs || null;
      body.artifacts = JSON.stringify(metaArtifacts.filter(Boolean));
      const res = await fetch(`/api/kanban/cards/${selectedCard.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        const updated = await res.json();
        setSelectedCard(updated);
        toast.success("Card saved");
        fetchBoard();
      }
    } catch { toast.error("Failed to save card"); }
    setSaving(false);
  };

  const deleteCard = async () => {
    if (!selectedCard) return;
    try {
      await fetch(`/api/kanban/cards/${selectedCard.id}`, { method: "DELETE" });
      setCardOpen(false); setSelectedCard(null); fetchBoard();
      toast.success("Card deleted");
    } catch { toast.error("Failed to delete"); }
  };

  const toggleSubtask = (idx: number) => {
    setLocalSubtasks(prev => prev.map((s, i) => i === idx ? { ...s, done: !s.done } : s));
  };

  const addSubtask = () => {
    const t = newSubtask.trim();
    if (!t) return;
    setLocalSubtasks(prev => [...prev, { title: t, done: false }]);
    setNewSubtask("");
  };

  const removeSubtask = (idx: number) => {
    setLocalSubtasks(prev => prev.filter((_, i) => i !== idx));
  };

  const addArtifact = () => {
    const a = newArtifact.trim();
    if (!a) return;
    setMetaArtifacts(prev => [...prev, a]);
    setNewArtifact("");
  };

  const removeArtifact = (idx: number) => {
    setMetaArtifacts(prev => prev.filter((_, i) => i !== idx));
  };

  const handleDragStart = (cardId: string) => {
    setDragCardId(cardId);
  };

  const handleDragOver = (e: React.DragEvent, columnId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverColumn(columnId);
  };

  const handleDragLeave = () => {
    setDragOverColumn(null);
  };

  const handleDrop = (columnId: string) => {
    setDragOverColumn(null);
    if (dragCardId && columnId) {
      moveCard(dragCardId, columnId);
      setDragCardId(null);
    }
  };

  const handleDragEnd = () => {
    setDragCardId(null);
    setDragOverColumn(null);
  };

  const formatDate = (d?: string): string => {
    if (!d) return "";
    const date = new Date(d);
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  const isDueSoon = (d?: string): boolean => {
    if (!d) return false;
    const due = new Date(d);
    const now = new Date();
    const diff = due.getTime() - now.getTime();
    return diff < 86400000 * 2 && diff > 0;
  };

  const isOverdue = (d?: string): boolean => {
    if (!d) return false;
    return new Date(d) < new Date();
  };

  const agentForCard = (assigneeId?: string): Agent | undefined => {
    return agents.find(a => a.id === assigneeId || a.name === assigneeId);
  };

  // ── Orchestrator / Autonomous Dev Handlers ──────────────────────────

  const fetchOrchStatus = useCallback(async (projectId: string) => {
    try {
      const res = await fetch(`/api/orchestrator/status/${projectId}`);
      if (res.ok) {
        const data: OrchestratorStatus = await res.json();
        setOrchProject(data);
        if (data.boardId) fetchBoard();
        if (data.status === "completed" || data.status === "failed") {
          if (orchPollRef.current) { clearInterval(orchPollRef.current); orchPollRef.current = null; }
        }
      }
    } catch {}
  }, [fetchBoard]);

  const handleStartOrchestrator = async () => {
    if (!orchPrompt.trim()) { toast.error("Please enter a project prompt"); return; }
    if (!orchWorkspace.trim()) { toast.error("Please enter a workspace path"); return; }
    setOrchStarting(true);
    try {
      const res = await fetch("/api/orchestrator/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: orchPrompt.trim(), workspacePath: orchWorkspace.trim() }),
      });
      if (res.ok) {
        const data = await res.json();
        toast.success("Autonomous Dev project started!");
        setOrchTab("live");
        setOrchPrompt("");
        if (orchPollRef.current) clearInterval(orchPollRef.current);
        orchPollRef.current = setInterval(() => fetchOrchStatus(data.projectId), 2500);
        fetchOrchStatus(data.projectId);
      } else {
        const err = await res.json();
        toast.error(err.error || "Failed to start project");
      }
    } catch {
      toast.error("Failed to start orchestrator");
    } finally {
      setOrchStarting(false);
    }
  };

  const handleStopOrchestrator = () => {
    if (orchPollRef.current) { clearInterval(orchPollRef.current); orchPollRef.current = null; }
    if (orchProject) {
      fetch(`/api/orchestrator/status/${orchProject.projectId}`, { method: "DELETE" }).catch(() => {});
    }
    toast.info("Project polling stopped");
    setOrchProject(null);
    setOrchView(false);
  };

  useEffect(() => {
    return () => { if (orchPollRef.current) clearInterval(orchPollRef.current); };
  }, []);

  // ── Render ──────────────────────────────────────────────────────────

  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[95vw] max-h-[92vh] overflow-hidden flex flex-col bg-background">
        <DialogHeader className="shrink-0 px-6 pt-6 pb-3">
          <DialogTitle className="flex items-center gap-2">
            <Layout className="h-5 w-5 text-teal-500" />
            {orchView ? "Autonomous Dev" : "Kanban Board"}
            <div className="flex items-center gap-1 ml-auto">
              {!orchView && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-[10px] gap-1 border-purple-500/30 text-purple-400 hover:bg-purple-500/10"
                  onClick={() => setOrchView(true)}
                >
                  <Rocket className="h-3 w-3" />
                  Autonomous Dev
                </Button>
              )}
              {orchView && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-[10px] gap-1"
                  onClick={() => { handleStopOrchestrator(); }}
                >
                  <Layout className="h-3 w-3" />
                  Back to Board
                </Button>
              )}
              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={fetchBoard} disabled={loading}>
                {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
              </Button>
            </div>
          </DialogTitle>
        </DialogHeader>

        {!orchView ? (
          <>
            {/* ─── KANBAN BOARD ──────────────────────────────────── */}
            <div className="flex-1 flex gap-2 overflow-x-auto px-3 pb-3 min-h-0">
              {loading && !board && (
                <div className="flex items-center justify-center w-full">
                  <Loader2 className="h-8 w-8 animate-spin text-teal-500" />
                </div>
              )}
              {board?.columns.map(col => (
                <div
                  key={col.id}
                  className={cn(
                    "flex flex-col min-w-[240px] max-w-[300px] bg-muted/20 rounded-xl border border-border/50 transition-all",
                    dragOverColumn === col.id && "border-teal-500 border-2 bg-teal-500/5"
                  )}
                  onDragOver={(e) => handleDragOver(e, col.id)}
                  onDragLeave={handleDragLeave}
                  onDrop={() => handleDrop(col.id)}
                >
                  <div className="flex items-center gap-2 px-3 py-2 border-b border-border/30 shrink-0">
                    <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: col.color || COLUMN_COLORS[col.name] || "#888" }} />
                    <span className="text-[11px] font-bold truncate">{col.name}</span>
                    <Badge variant="outline" className="text-[9px] h-4 ml-auto">{col.cards.length}</Badge>
                  </div>
                  <ScrollArea className="flex-1 min-h-0 px-2 py-1">
                    <div className="space-y-1.5">
                      {col.cards.map(card => {
                        const doneCount = subtaskDoneCount(card.subtasks);
                        const totalSubs = parseSubtasks(card.subtasks).length;
                        const agent = agentForCard(card.assignee);
                        return (
                          <div
                            key={card.id}
                            draggable
                            onDragStart={() => handleDragStart(card.id)}
                            onDragEnd={handleDragEnd}
                            className={cn(
                              "group relative bg-background rounded-lg border border-border/50 p-2 cursor-pointer hover:border-teal-500/30 transition-colors",
                              dragCardId === card.id && "opacity-40"
                            )}
                            onClick={() => openCard(card)}
                          >
                            <p className="text-[11px] font-medium leading-tight mb-1.5 pr-4">{card.title}</p>
                            <div className="flex items-center gap-1 flex-wrap mb-1">
                              {card.priority && (
                                <Badge className={cn("text-[9px] h-4 border px-1", PRIORITY_COLORS[card.priority] || "")}>
                                  {card.priority}
                                </Badge>
                              )}
                              {parseLabels(card.labels).slice(0, 2).map((l, i) => (
                                <span key={i} className={cn("text-[8px] px-1.5 py-0.5 rounded-full", getLabelColor(l))}>{l}</span>
                              ))}
                              {parseLabels(card.labels).length > 2 && (
                                <span className="text-[8px] text-muted-foreground">+{parseLabels(card.labels).length - 2}</span>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5 text-[9px] text-muted-foreground">
                              {agent && (
                                <Avatar className="h-4 w-4 shrink-0">
                                  <AvatarFallback className="text-[7px]">{agent.name?.slice(0, 2).toUpperCase()}</AvatarFallback>
                                </Avatar>
                              )}
                              {totalSubs > 0 && (
                                <span className="flex items-center gap-0.5">
                                  <CheckCircle2 className="h-3 w-3 text-muted-foreground" />
                                  {doneCount}/{totalSubs}
                                </span>
                              )}
                              {card.dueDate && (
                                <span className={cn(
                                  "flex items-center gap-0.5 ml-auto",
                                  isOverdue(card.dueDate) ? "text-red-500" : isDueSoon(card.dueDate) ? "text-amber-500" : ""
                                )}>
                                  <Calendar className="h-3 w-3" />
                                  {formatDate(card.dueDate)}
                                </span>
                              )}
                            </div>
                            {totalSubs > 0 && (
                              <div className="mt-1.5 h-1 w-full bg-muted rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-teal-500 rounded-full transition-all"
                                  style={{ width: `${subtaskProgress(card.subtasks)}%` }}
                                />
                              </div>
                            )}
                            <select
                              className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 text-[9px] border rounded p-0.5 bg-background z-10"
                              value=""
                              onChange={(e) => {
                                e.stopPropagation();
                                if (e.target.value) { moveCard(card.id, e.target.value); e.target.value = ""; }
                              }}
                            >
                              <option value="">Move</option>
                              {board.columns.filter(c => c.id !== col.id).map(c => (
                                <option key={c.id} value={c.id}>{c.name}</option>
                              ))}
                            </select>
                          </div>
                        );
                      })}
                    </div>
                  </ScrollArea>
                  <div className="p-2 border-t border-border/30 shrink-0">
                    <div className="flex gap-1">
                      <Input
                        className="h-7 text-[10px]"
                        placeholder={`Add to ${col.name}...`}
                        value={newCardTitle[col.id] || ""}
                        onChange={(e) => setNewCardTitle(p => ({ ...p, [col.id]: e.target.value }))}
                        onKeyDown={(e) => { if (e.key === "Enter") createCard(col.id); }}
                      />
                      <Button size="icon" className="h-7 w-7 shrink-0" onClick={() => createCard(col.id)}>
                        <Plus className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Card Detail Modal */}
            <Dialog open={cardOpen} onOpenChange={(o) => { if (!o) { setCardOpen(false); setSelectedCard(null); } }}>
              <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-hidden flex flex-col">
                <DialogHeader className="shrink-0">
                  <DialogTitle className="text-sm flex items-center gap-2">
                    <Input
                      className="h-7 text-xs font-semibold border-0 border-b-2 border-transparent focus:border-teal-500 rounded-none px-0"
                      value={editing.title}
                      onChange={(e) => setEditing(prev => ({ ...prev, title: e.target.value }))}
                      placeholder="Card title"
                    />
                    <Button
                      size="icon"
                      variant={deleteConfirm ? "destructive" : "ghost"}
                      className="h-6 w-6 shrink-0"
                      onClick={() => { if (deleteConfirm) { deleteCard(); } else { setDeleteConfirm(true); } }}
                    >
                      {deleteConfirm ? <AlertTriangle className="h-3.5 w-3.5" /> : <Trash2 className="h-3.5 w-3.5" />}
                    </Button>
                    {deleteConfirm && (
                      <Button size="icon" variant="ghost" className="h-6 w-6 shrink-0" onClick={() => setDeleteConfirm(false)}>
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </DialogTitle>
                  {deleteConfirm && (
                    <DialogDescription className="text-[10px] text-destructive">Click the alert icon again to confirm deletion.</DialogDescription>
                  )}
                </DialogHeader>
                <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
                  <TabsList className="grid grid-cols-3 mb-2 shrink-0">
                    <TabsTrigger value="details" className="text-[10px]">Details</TabsTrigger>
                    <TabsTrigger value="subtasks" className="text-[10px]">Subtasks</TabsTrigger>
                    <TabsTrigger value="meta" className="text-[10px]">Meta</TabsTrigger>
                  </TabsList>

                  <TabsContent value="details" className="flex-1 min-h-0 overflow-y-auto space-y-3 px-0.5">
                    <div className="space-y-1.5">
                      <Label className="text-[10px] font-bold">Description</Label>
                      <Textarea
                        className="h-20 text-[11px] resize-none"
                        value={editing.description}
                        onChange={(e) => setEditing(prev => ({ ...prev, description: e.target.value }))}
                        placeholder="Add a description..."
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-[10px] font-bold">Priority</Label>
                      <Select value={editing.priority} onValueChange={(v) => setEditing(prev => ({ ...prev, priority: v }))}>
                        <SelectTrigger className="h-7 text-[10px] w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="low" className="text-[10px]">Low</SelectItem>
                          <SelectItem value="medium" className="text-[10px]">Medium</SelectItem>
                          <SelectItem value="high" className="text-[10px]">High</SelectItem>
                          <SelectItem value="critical" className="text-[10px]">Critical</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-[10px] font-bold">Labels (comma-separated)</Label>
                      <Input
                        className="h-7 text-[10px]"
                        value={editing.labels}
                        onChange={(e) => setEditing(prev => ({ ...prev, labels: e.target.value }))}
                        placeholder="backend, api, urgent"
                      />
                      <div className="flex flex-wrap gap-1">
                        {editing.labels.split(",").map(l => l.trim()).filter(Boolean).map((l, i) => (
                          <Badge key={i} variant="outline" className={cn("text-[9px] h-4", getLabelColor(l))}>{l}</Badge>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-[10px] font-bold">Agent Assignee</Label>
                      <Select value={editing.assignee} onValueChange={(v) => setEditing(prev => ({ ...prev, assignee: v }))}>
                        <SelectTrigger className="h-7 text-[10px] w-full">
                          <SelectValue placeholder="Unassigned" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="" className="text-[10px]">None</SelectItem>
                          {agents.map(a => (
                            <SelectItem key={a.id} value={a.id} className="text-[10px]">{a.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-[10px] font-bold">Due Date</Label>
                      <Input
                        type="date"
                        className="h-7 text-[10px]"
                        value={editing.dueDate}
                        onChange={(e) => setEditing(prev => ({ ...prev, dueDate: e.target.value }))}
                      />
                    </div>
                  </TabsContent>

                  <TabsContent value="subtasks" className="flex-1 min-h-0 overflow-y-auto space-y-3 px-0.5">
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <Label className="text-[10px] font-bold">Progress</Label>
                        <span className="text-[9px] text-muted-foreground">
                          {localSubtasks.filter(s => s.done).length}/{localSubtasks.length} done
                        </span>
                      </div>
                      <Progress
                        value={localSubtasks.length > 0 ? Math.round((localSubtasks.filter(s => s.done).length / localSubtasks.length) * 100) : 0}
                        indicatorClassName="bg-teal-500"
                      />
                    </div>
                    <div className="space-y-1">
                      {localSubtasks.map((sub, i) => (
                        <div key={i} className="flex items-center gap-2 text-xs py-1 group">
                          <button onClick={() => toggleSubtask(i)} className="shrink-0">
                            {sub.done ? <CheckCircle2 className="h-4 w-4 text-teal-500" /> : <Circle className="h-4 w-4 text-muted-foreground" />}
                          </button>
                          <span className={cn("flex-1", sub.done && "line-through text-muted-foreground")}>{sub.title}</span>
                          <button onClick={() => removeSubtask(i)} className="opacity-0 group-hover:opacity-100 text-destructive">
                            <MinusCircle className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                    <div className="flex gap-1">
                      <Input
                        className="h-7 text-[10px] flex-1"
                        placeholder="New subtask..."
                        value={newSubtask}
                        onChange={(e) => setNewSubtask(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") addSubtask(); }}
                      />
                      <Button size="icon" className="h-7 w-7 shrink-0" onClick={addSubtask}>
                        <PlusCircle className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TabsContent>

                  <TabsContent value="meta" className="flex-1 min-h-0 overflow-y-auto space-y-3 px-0.5">
                    <div className="space-y-1.5">
                      <Label className="text-[10px] font-bold flex items-center gap-1"><GitBranch className="h-3 w-3" />Git Branch</Label>
                      <Input className="h-7 text-[10px]" value={metaGitBranch} onChange={(e) => setMetaGitBranch(e.target.value)} placeholder="feature/auth-system" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-[10px] font-bold flex items-center gap-1"><Link2 className="h-3 w-3" />PR Link</Label>
                      <Input className="h-7 text-[10px]" value={metaPrLink} onChange={(e) => setMetaPrLink(e.target.value)} placeholder="https://github.com/..." />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-[10px] font-bold flex items-center gap-1"><Clock className="h-3 w-3" />Token Usage</Label>
                      <Input className="h-7 text-[10px]" value={metaTokenUsage} onChange={(e) => setMetaTokenUsage(e.target.value)} placeholder="12,450 tokens" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-[10px] font-bold flex items-center gap-1"><FileText className="h-3 w-3" />Logs / Output</Label>
                      <Textarea className="h-24 text-[10px] resize-none font-mono" value={metaLogs}
                        onChange={(e) => setMetaLogs(e.target.value)} placeholder="Execution logs and output..." />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-[10px] font-bold">Artifacts</Label>
                      <div className="space-y-1">
                        {metaArtifacts.map((a, i) => (
                          <div key={i} className="flex items-center gap-2 text-[10px] bg-muted/30 rounded px-2 py-1 group">
                            <span className="flex-1 truncate">{a}</span>
                            <button onClick={() => removeArtifact(i)} className="opacity-0 group-hover:opacity-100 text-destructive">
                              <X className="h-3 w-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                      <div className="flex gap-1">
                        <Input className="h-7 text-[10px] flex-1" placeholder="Add artifact..." value={newArtifact}
                          onChange={(e) => setNewArtifact(e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter") addArtifact(); }} />
                        <Button size="icon" className="h-7 w-7 shrink-0" onClick={addArtifact}>
                          <PlusCircle className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  </TabsContent>
                </Tabs>
                <DialogFooter className="shrink-0 pt-2">
                  <Button size="sm" className="h-7 text-[10px]" onClick={saveCard} disabled={saving}>
                    {saving && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
                    Save Changes
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </>
        ) : (
          <>
            {/* ─── AUTONOMOUS DEV VIEW ──────────────────────────────── */}
            <Tabs value={orchTab} onValueChange={setOrchTab} className="flex-1 flex flex-col min-h-0 px-3 pb-3">
              <TabsList className="w-full grid grid-cols-2 mb-3 shrink-0">
                <TabsTrigger value="setup" className="gap-1.5 text-[10px]">
                  <Zap className="h-3.5 w-3.5" />
                  Setup Project
                </TabsTrigger>
                <TabsTrigger value="live" className="gap-1.5 text-[10px]">
                  <Activity className="h-3.5 w-3.5" />
                  Live Execution
                </TabsTrigger>
              </TabsList>

              {/* Setup Tab */}
              <TabsContent value="setup" className="flex-1 overflow-y-auto mt-0">
                <ScrollArea className="max-h-[65vh]">
                  <div className="space-y-4 p-1">
                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm flex items-center gap-2">
                          <Rocket className="h-4 w-4 text-purple-400" />
                          Multi-Agent Autonomous Dev
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="space-y-1.5">
                          <Label className="text-xs font-medium">Project Prompt</Label>
                          <Textarea
                            value={orchPrompt}
                            onChange={(e) => setOrchPrompt(e.target.value)}
                            placeholder="Describe your project: e.g. 'Create a SaaS landing page with auth and Stripe billing' or 'Build a CRM with contact management and deal pipeline'..."
                            className="min-h-[100px] text-sm resize-none"
                            rows={4}
                          />
                          <p className="text-[10px] text-muted-foreground">
                            The orchestrator will analyze intent, generate a plan, create Kanban cards, and spawn 10 AI agents to build your project.
                          </p>
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs font-medium flex items-center gap-1.5">
                            <FolderOpen className="h-3.5 w-3.5" />
                            Workspace Path
                          </Label>
                          <Input
                            value={orchWorkspace}
                            onChange={(e) => setOrchWorkspace(e.target.value)}
                            placeholder="C:\Users\piopi\projects\new-project"
                            className="h-9 text-sm font-mono"
                          />
                        </div>
                        <Separator />
                        <div className="space-y-2">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Agent Team</p>
                          <p className="text-[10px] text-muted-foreground">
                            10 specialized agents will be auto-assigned based on your project type:
                          </p>
                          <div className="grid grid-cols-2 gap-1">
                            {[
                              ["Navigator", "PM"],
                              ["Blueprint", "Architect"],
                              ["Prism", "UI/UX"],
                              ["Vertex", "Frontend"],
                              ["Core", "Backend"],
                              ["Harbor", "DevOps"],
                              ["Stratum", "Database"],
                              ["Probe", "QA/Testing"],
                              ["Cipher", "Security"],
                              ["Refine", "Code Review"],
                            ].map(([name, role]) => (
                              <div key={name} className="flex items-center gap-1.5 text-[10px] px-2 py-1 rounded bg-muted/30">
                                <Bot className="h-3 w-3 text-purple-400 shrink-0" />
                                <span className="font-medium">{name}</span>
                                <span className="text-muted-foreground">({role})</span>
                              </div>
                            ))}
                          </div>
                        </div>
                        <Separator />
                        <Button
                          className="w-full"
                          onClick={handleStartOrchestrator}
                          disabled={orchStarting || !orchPrompt.trim() || !orchWorkspace.trim()}
                        >
                          {orchStarting ? (
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          ) : (
                            <Play className="h-4 w-4 mr-2" />
                          )}
                          Start Project
                        </Button>
                      </CardContent>
                    </Card>
                  </div>
                </ScrollArea>
              </TabsContent>

              {/* Live Execution Tab */}
              <TabsContent value="live" className="flex-1 overflow-y-auto mt-0">
                {!orchProject ? (
                  <div className="flex flex-col items-center justify-center h-full min-h-[300px] text-center gap-3 p-8">
                    <Rocket className="h-12 w-12 text-muted-foreground/30" />
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">No Active Project</p>
                      <p className="text-xs text-muted-foreground/70 mt-1">
                        Go to Setup to start a new autonomous development project.
                      </p>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => setOrchTab("setup")}>
                      <Zap className="h-3.5 w-3.5 mr-1.5" />
                      Go to Setup
                    </Button>
                  </div>
                ) : (
                  <ScrollArea className="max-h-[62vh]">
                    <div className="space-y-4 p-1">
                      {/* Status Card */}
                      <Card>
                        <CardContent className="p-4">
                          <div className="flex items-center gap-2 mb-3">
                            <h3 className="text-sm font-semibold truncate flex-1">{orchProject.prompt.slice(0, 60)}...</h3>
                            <Badge className={cn(
                              "text-[10px]",
                              orchProject.status === "completed" ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" :
                              orchProject.status === "failed" ? "bg-red-500/15 text-red-400 border-red-500/30" :
                              orchProject.status === "executing" ? "bg-amber-500/15 text-amber-400 border-amber-500/30" :
                              "bg-sky-500/15 text-sky-400 border-sky-500/30"
                            )}>
                              {orchProject.status === "executing" && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                              {orchProject.status}
                            </Badge>
                            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => {
                              if (orchPollRef.current) clearInterval(orchPollRef.current);
                              orchPollRef.current = setInterval(() => fetchOrchStatus(orchProject.projectId), 2500);
                              fetchOrchStatus(orchProject.projectId);
                            }}>
                              <RefreshCw className="h-3 w-3" />
                            </Button>
                          </div>
                          <div className="flex items-center gap-4 text-[10px] text-muted-foreground mb-3">
                            <span>Category: <Badge variant="outline" className="text-[9px]">{orchProject.category}</Badge></span>
                            <span>Board: <code className="text-[9px]">{orchProject.boardId?.slice(0, 8)}...</code></span>
                          </div>
                          <div className="space-y-1">
                            <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                              <span>Progress</span>
                              <span>{orchProject.completedTasks}/{orchProject.totalTasks} tasks</span>
                            </div>
                            <div className="h-2 bg-muted rounded-full overflow-hidden">
                              <div
                                className={cn(
                                  "h-full rounded-full transition-all duration-700",
                                  orchProject.status === "completed" ? "bg-emerald-500" :
                                  orchProject.status === "failed" ? "bg-red-500" : "bg-purple-500"
                                )}
                                style={{ width: `${orchProject.totalTasks > 0 ? Math.round((orchProject.completedTasks / orchProject.totalTasks) * 100) : 0}%` }}
                              />
                            </div>
                          </div>
                        </CardContent>
                      </Card>

                      {/* Milestones + Tasks */}
                      {orchProject.milestones.map((milestone, mi) => {
                        const milestoneTasks = orchProject.tasks.filter(t => t.milestoneId === milestone.id);
                        return (
                          <Card key={milestone.id}>
                            <CardHeader className="pb-2">
                              <CardTitle className="text-xs font-medium flex items-center gap-2">
                                <ListChecks className="h-3.5 w-3.5 text-purple-400" />
                                Milestone {mi + 1}: {milestone.name}
                                <Badge variant="outline" className="text-[9px] ml-auto">
                                  {milestoneTasks.filter(t => t.status === "completed").length}/{milestoneTasks.length}
                                </Badge>
                              </CardTitle>
                            </CardHeader>
                            <CardContent className="pt-0 pb-3">
                              <p className="text-[10px] text-muted-foreground mb-2">{milestone.description}</p>
                              <div className="space-y-1">
                                {milestoneTasks.map((task) => (
                                  <div key={task.id} className={cn(
                                    "flex items-start gap-2 px-2.5 py-2 rounded-md border text-[10px]",
                                    task.status === "completed" ? "border-emerald-500/20 bg-emerald-500/5" :
                                    task.status === "running" ? "border-amber-500/20 bg-amber-500/5" :
                                    task.status === "failed" ? "border-red-500/20 bg-red-500/5" :
                                    "border-border"
                                  )}>
                                    <div className="shrink-0 mt-0.5">
                                      {task.status === "completed" ? (
                                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                                      ) : task.status === "running" ? (
                                        <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-400" />
                                      ) : task.status === "failed" ? (
                                        <XCircle className="h-3.5 w-3.5 text-red-400" />
                                      ) : (
                                        <Circle className="h-3.5 w-3.5 text-muted-foreground" />
                                      )}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-1.5">
                                        <span className={cn("font-medium", task.status === "completed" && "line-through text-muted-foreground")}>
                                          {task.title}
                                        </span>
                                        <Badge className="text-[8px] h-3.5 bg-purple-500/10 text-purple-400 border-purple-500/20">
                                          {task.agentName}
                                        </Badge>
                                        <Badge className={cn("text-[8px] h-3.5", PRIORITY_COLORS[task.priority] || "")}>
                                          {task.priority}
                                        </Badge>
                                      </div>
                                      {task.status === "running" && (
                                        <p className="text-[9px] text-amber-400 mt-0.5">Executing...</p>
                                      )}
                                      {task.status === "failed" && task.retries > 0 && (
                                        <p className="text-[9px] text-red-400 mt-0.5">Failed after {task.retries} retries</p>
                                      )}
                                      {task.result && (
                                        <p className="text-[9px] text-muted-foreground mt-0.5 truncate">{task.result.slice(0, 120)}</p>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </CardContent>
                          </Card>
                        );
                      })}

                      {/* Logs */}
                      {orchProject.logs && orchProject.logs.length > 0 && (
                        <Card>
                          <CardHeader className="pb-2">
                            <CardTitle className="text-xs font-medium flex items-center gap-1.5">
                              <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                              Logs ({orchProject.logs.length})
                            </CardTitle>
                          </CardHeader>
                          <CardContent className="pt-0 pb-3">
                            <ScrollArea className="max-h-[200px]">
                              <div className="space-y-0.5 font-mono">
                                {orchProject.logs.slice(-30).reverse().map((log, i) => (
                                  <div key={i} className={cn(
                                    "text-[9px] px-2 py-0.5 rounded",
                                    log.level === "error" ? "text-red-400 bg-red-500/5" :
                                    log.level === "warn" ? "text-amber-400 bg-amber-500/5" :
                                    "text-muted-foreground"
                                  )}>
                                    <span className="opacity-50">{new Date(log.timestamp).toLocaleTimeString()} </span>
                                    {log.agentName && <span className="text-purple-400">[{log.agentName}] </span>}
                                    {log.message}
                                  </div>
                                ))}
                              </div>
                            </ScrollArea>
                          </CardContent>
                        </Card>
                      )}
                    </div>
                  </ScrollArea>
                )}
              </TabsContent>
            </Tabs>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

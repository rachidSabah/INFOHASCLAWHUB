"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Layout, Plus, Trash2, ChevronRight, RefreshCw, Loader2, CheckCircle2, Circle, Clock } from "lucide-react";

interface KanbanCard { id: string; columnId: string; title: string; description?: string; priority: string; labels?: string; assignee?: string; status: string; subtasks?: string; gitBranch?: string; prLink?: string; order: number; }
interface KanbanColumn { id: string; name: string; color?: string; cards: KanbanCard[]; }
interface KanbanBoard { id: string; name: string; columns: KanbanColumn[]; }

const COLORS: Record<string, string> = {
  "Backlog": "#6b7280", "Planning": "#3b82f6", "In Progress": "#f59e0b", "Multi-Agent": "#8b5cf6",
  "Review": "#f97316", "Testing": "#06b6d4", "Completed": "#10b981", "Failed": "#ef4444",
};

const PRIORITY_COLORS: Record<string, string> = {
  critical: "bg-red-500/10 text-red-500 border-red-500/20",
  high: "bg-orange-500/10 text-orange-500 border-orange-500/20",
  medium: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  low: "bg-muted/50 text-muted-foreground",
};

interface Props { open: boolean; onOpenChange: (open: boolean) => void; }

export function KanbanPanel({ open, onOpenChange }: Props) {
  const [board, setBoard] = useState<KanbanBoard | null>(null);
  const [loading, setLoading] = useState(false);
  const [newCardTitle, setNewCardTitle] = useState<Record<string, string>>({});
  const [selectedCard, setSelectedCard] = useState<KanbanCard | null>(null);
  const [cardOpen, setCardOpen] = useState(false);

  const fetchBoard = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/kanban/boards");
      if (!res.ok) throw new Error("Failed");
      const boards = await res.json();
      if (boards.length > 0) {
        const b = boards[0];
        setBoard({ ...b, columns: b.columns.map((c: any) => ({ ...c, cards: c.cards || [] })) });
      }
    } catch { setLoading(false); }
    setLoading(false);
  }, []);

  useEffect(() => { if (open) fetchBoard(); }, [open, fetchBoard]);

  const createCard = async (columnId: string) => {
    const title = newCardTitle[columnId]?.trim();
    if (!title) return;
    try {
      const res = await fetch("/api/kanban/cards", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ columnId, title, priority: "medium", labels: "[]" }),
      });
      if (res.ok) { setNewCardTitle(p => ({ ...p, [columnId]: "" })); fetchBoard(); }
    } catch { toast.error("Failed to create card"); }
  };

  const moveCard = async (cardId: string, targetColumnId: string) => {
    try {
      await fetch(`/api/kanban/cards/${cardId}/move`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetColumnId, targetOrder: 0 }),
      });
      fetchBoard();
    } catch { toast.error("Failed to move card"); }
  };

  const deleteCard = async (cardId: string) => {
    try {
      await fetch(`/api/kanban/cards/${cardId}`, { method: "DELETE" });
      setCardOpen(false); setSelectedCard(null); fetchBoard();
      toast.success("Card deleted");
    } catch { toast.error("Failed to delete"); }
  };

  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[95vw] max-h-[92vh] overflow-hidden flex flex-col bg-background">
        <DialogHeader className="shrink-0 px-6 pt-6 pb-3">
          <DialogTitle className="flex items-center gap-2">
            <Layout className="h-5 w-5 text-teal-500" />
            Kanban Board
            <Button size="sm" variant="ghost" className="h-7 text-xs ml-auto" onClick={fetchBoard} disabled={loading}>
              {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
            </Button>
          </DialogTitle>
        </DialogHeader>
        <div className="flex-1 flex gap-2 overflow-x-auto px-3 pb-3 min-h-0">
          {loading && !board && (
            <div className="flex items-center justify-center w-full"><Loader2 className="h-8 w-8 animate-spin text-teal-500" /></div>
          )}
          {board?.columns.map(col => (
            <div key={col.id} className="flex flex-col min-w-[220px] max-w-[280px] bg-muted/20 rounded-xl border border-border/50">
              <div className="flex items-center gap-2 px-3 py-2 border-b border-border/30 shrink-0">
                <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: col.color || COLORS[col.name] || "#888" }} />
                <span className="text-[11px] font-bold truncate">{col.name}</span>
                <Badge variant="outline" className="text-[9px] h-4 ml-auto">{col.cards.length}</Badge>
              </div>
              <ScrollArea className="flex-1 min-h-0 px-2 py-1">
                <div className="space-y-1.5">
                  {col.cards.map(card => (
                    <div key={card.id} className="group relative bg-background rounded-lg border border-border/50 p-2 cursor-pointer hover:border-teal-500/30 transition-colors" onClick={() => { setSelectedCard(card); setCardOpen(true); }}>
                      <p className="text-[11px] font-medium leading-tight mb-1">{card.title}</p>
                      <div className="flex items-center gap-1 flex-wrap">
                        {card.priority && (
                          <Badge className={cn("text-[9px] h-4 border", PRIORITY_COLORS[card.priority] || "")}>{card.priority}</Badge>
                        )}
                        {card.labels && JSON.parse(card.labels || "[]").slice(0, 2).map((l: string, i: number) => (
                          <span key={i} className="text-[8px] px-1.5 py-0.5 rounded-full bg-muted/50 text-muted-foreground">{l}</span>
                        ))}
                      </div>
                      {/* Move dropdown */}
                      <select className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 text-[9px] border rounded p-0.5 bg-background z-10" value="" onChange={(e) => { if (e.target.value) { moveCard(card.id, e.target.value); e.target.value = ""; } }}>
                        <option value="">Move</option>
                        {board.columns.filter(c => c.id !== col.id).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </div>
                  ))}
                </div>
              </ScrollArea>
              <div className="p-2 border-t border-border/30 shrink-0">
                <div className="flex gap-1">
                  <Input className="h-7 text-[10px]" placeholder="Add card..." value={newCardTitle[col.id] || ""}
                    onChange={(e) => setNewCardTitle(p => ({ ...p, [col.id]: e.target.value }))}
                    onKeyDown={(e) => { if (e.key === "Enter") createCard(col.id); }} />
                  <Button size="icon" className="h-7 w-7 shrink-0" onClick={() => createCard(col.id)}>
                    <Plus className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Card Detail Modal */}
        <Dialog open={cardOpen} onOpenChange={setCardOpen}>
          <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-hidden flex flex-col">
            <DialogHeader>
              <DialogTitle className="text-sm flex items-center gap-2">
                {selectedCard?.title}
                <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive ml-auto" onClick={() => selectedCard && deleteCard(selectedCard.id)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </DialogTitle>
            </DialogHeader>
            {selectedCard && (
              <Tabs defaultValue="details" className="flex-1 flex flex-col min-h-0">
                <TabsList className="grid grid-cols-3 mb-2 shrink-0">
                  <TabsTrigger value="details" className="text-[10px]">Details</TabsTrigger>
                  <TabsTrigger value="subtasks" className="text-[10px]">Subtasks</TabsTrigger>
                  <TabsTrigger value="meta" className="text-[10px]">Meta</TabsTrigger>
                </TabsList>
                <TabsContent value="details" className="flex-1 min-h-0 overflow-y-auto space-y-2">
                  <div className="space-y-1"><label className="text-[10px] font-bold">Description</label><p className="text-xs text-muted-foreground">{selectedCard.description || "No description"}</p></div>
                  <div className="space-y-1"><label className="text-[10px] font-bold">Priority</label><Badge className={cn("text-xs", PRIORITY_COLORS[selectedCard.priority] || "")}>{selectedCard.priority}</Badge></div>
                  <div className="space-y-1"><label className="text-[10px] font-bold">Labels</label><div className="flex flex-wrap gap-1">{(JSON.parse(selectedCard.labels || "[]") as string[]).map((l, i) => <Badge key={i} variant="outline" className="text-[10px]">{l}</Badge>)}</div></div>
                </TabsContent>
                <TabsContent value="subtasks" className="flex-1 min-h-0 overflow-y-auto">
                  <div className="space-y-1">
                    {selectedCard.subtasks ? (JSON.parse(selectedCard.subtasks) as { title: string; done: boolean }[]).map((s, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs">
                        {s.done ? <CheckCircle2 className="h-3.5 w-3.5 text-green-500" /> : <Circle className="h-3.5 w-3.5 text-muted-foreground" />}
                        <span className={s.done ? "line-through text-muted-foreground" : ""}>{s.title}</span>
                      </div>
                    )) : <p className="text-xs text-muted-foreground">No subtasks</p>}
                  </div>
                </TabsContent>
                <TabsContent value="meta" className="flex-1 min-h-0 overflow-y-auto space-y-2">
                  <div><label className="text-[10px] font-bold">Status</label><p className="text-xs">{selectedCard.status}</p></div>
                  {selectedCard.gitBranch && <div><label className="text-[10px] font-bold">Git Branch</label><code className="text-[10px] bg-muted px-1 rounded">{selectedCard.gitBranch}</code></div>}
                  {selectedCard.prLink && <div><label className="text-[10px] font-bold">PR Link</label><p className="text-xs text-blue-500 truncate">{selectedCard.prLink}</p></div>}
                  {selectedCard.assignee && <div><label className="text-[10px] font-bold">Assignee</label><p className="text-xs">{selectedCard.assignee}</p></div>}
                </TabsContent>
              </Tabs>
            )}
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
  );
}

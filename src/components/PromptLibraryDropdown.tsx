"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { usePromptStore } from "@/lib/stores";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  Sparkles, Search, Plus, Trash2, Tag, Copy, ChevronDown, BookOpen, Star, Clock, X,
} from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";

const CATEGORIES = ["Development", "Education", "Creative", "Productivity", "Security", "Design", "Language", "General"];

interface PromptItem {
  id: string;
  title: string;
  content: string;
  description?: string;
  category?: string;
  createdAt?: string;
}

export default function PromptLibraryDropdown({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { prompts, addPrompt, removePrompt } = usePromptStore();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [newPrompt, setNewPrompt] = useState({ title: "", content: "", description: "", category: "General" });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showFavorites, setShowFavorites] = useState(false);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [recentIds, setRecentIds] = useState<string[]>([]);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const saved = typeof window !== "undefined" ? localStorage.getItem("clawhub_fav_prompts") : null;
    if (saved) { try { setFavorites(JSON.parse(saved)); } catch {} }
    const rec = typeof window !== "undefined" ? localStorage.getItem("clawhub_recent_prompts") : null;
    if (rec) { try { setRecentIds(JSON.parse(rec)); } catch {} }
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) onOpenChange(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onOpenChange]);

  const filtered = useMemo(() => {
    let list = prompts;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(p =>
        p.title.toLowerCase().includes(q) ||
        p.content.toLowerCase().includes(q) ||
        (p.category || "").toLowerCase().includes(q)
      );
    }
    if (selectedCategory) list = list.filter(p => p.category === selectedCategory);
    if (showFavorites) list = list.filter(p => favorites.includes(p.id));
    return list;
  }, [prompts, searchQuery, selectedCategory, showFavorites, favorites]);

  const byCategory = useMemo(() => {
    const map = new Map<string, PromptItem[]>();
    for (const p of filtered) {
      const cat = p.category || "General";
      const arr = map.get(cat) || [];
      arr.push(p);
      map.set(cat, arr);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  const recentPrompts = recentIds.map(id => prompts.find(p => p.id === id)).filter(Boolean) as PromptItem[];
  const favPrompts = favorites.map(id => prompts.find(p => p.id === id)).filter(Boolean) as PromptItem[];

  const handleUsePrompt = (content: string, id: string) => {
    const next = [id, ...recentIds.filter(i => i !== id)].slice(0, 10);
    setRecentIds(next);
    localStorage.setItem("clawhub_recent_prompts", JSON.stringify(next));
    const input = document.querySelector<HTMLTextAreaElement>("textarea.chat-input");
    if (input) {
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")?.set;
      nativeInputValueSetter?.call(input, content);
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.focus();
    }
    onOpenChange(false);
  };

  const toggleFavorite = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const next = favorites.includes(id) ? favorites.filter(i => i !== id) : [id, ...favorites];
    setFavorites(next);
    localStorage.setItem("clawhub_fav_prompts", JSON.stringify(next));
  };

  const handleAddPrompt = async () => {
    if (!newPrompt.title || !newPrompt.content) return;
    setIsSubmitting(true);
    try {
      const res = await fetch("/api/prompts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newPrompt),
      });
      if (res.ok) {
        const data = await res.json();
        addPrompt(data);
        setAddDialogOpen(false);
        setNewPrompt({ title: "", content: "", description: "", category: "General" });
        toast.success("Prompt saved");
      }
    } catch { toast.error("Failed to save"); }
    finally { setIsSubmitting(false); }
  };

  const handleDeletePrompt = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await fetch(`/api/prompts/${id}`, { method: "DELETE" });
      removePrompt(id);
      toast.success("Prompt deleted");
    } catch { toast.error("Delete failed"); }
  };

  const handleCopy = (content: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(content);
    toast.success("Copied to clipboard");
  };

  if (!open) return null;

  return (
    <>
      <div ref={dropdownRef} className="absolute top-full right-0 mt-1 w-96 bg-popover border border-border rounded-xl shadow-xl z-50 animate-fade-in overflow-hidden">
        {/* Header */}
        <div className="p-3 border-b border-border flex items-center gap-2 bg-muted/20">
          <BookOpen className="h-3.5 w-3.5 text-primary" />
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Prompt Library</span>
          <div className="flex-1" />
          <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => setAddDialogOpen(true)}>
            <Plus className="h-3.5 w-3.5" />
          </Button>
          <span className="text-[9px] text-muted-foreground">{prompts.length} prompts</span>
        </div>

        {/* Search + Filters */}
        <div className="p-2 border-b border-border space-y-2">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
            <Input
              placeholder="Search prompts..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-7 text-[11px] pl-7"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery("")} className="absolute right-2 top-1/2 -translate-y-1/2">
                <X className="h-3 w-3 text-muted-foreground" />
              </button>
            )}
          </div>
          <div className="flex gap-1 flex-wrap">
            {CATEGORIES.slice(0, 7).map(cat => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(selectedCategory === cat ? null : cat)}
                className={cn(
                  "px-2 py-0.5 rounded-full text-[9px] font-medium transition-colors border",
                  selectedCategory === cat
                    ? "bg-primary/10 text-primary border-primary/30"
                    : "border-border text-muted-foreground hover:border-primary/20 hover:text-foreground"
                )}
              >
                {cat}
              </button>
            ))}
            <button
              onClick={() => { setShowFavorites(!showFavorites); setSelectedCategory(null); }}
              className={cn(
                "px-2 py-0.5 rounded-full text-[9px] font-medium transition-colors border flex items-center gap-1",
                showFavorites ? "bg-amber-500/10 text-amber-600 border-amber-500/30" : "border-border text-muted-foreground hover:border-amber-500/20"
              )}
            >
              <Star className="h-2.5 w-2.5" /> Favorites
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-1.5 max-h-[60vh] overflow-y-auto space-y-1">
          {/* Recent */}
          {recentPrompts.length > 0 && !searchQuery && !selectedCategory && !showFavorites && (
            <div>
              <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground px-2 py-1 flex items-center gap-1">
                <Clock className="h-2.5 w-2.5" /> Recent
              </p>
              {recentPrompts.slice(0, 3).map(p => (
                <PromptCard
                  key={p.id}
                  prompt={p}
                  isFavorite={favorites.includes(p.id)}
                  onUse={() => handleUsePrompt(p.content, p.id)}
                  onToggleFav={(e) => toggleFavorite(p.id, e)}
                  onDelete={(e) => handleDeletePrompt(p.id, e)}
                  onCopy={(e) => handleCopy(p.content, e)}
                />
              ))}
            </div>
          )}

          {/* Favorites */}
          {favPrompts.length > 0 && showFavorites && !searchQuery && (
            <div>
              <p className="text-[9px] font-bold uppercase tracking-wider text-amber-500 px-2 py-1 flex items-center gap-1">
                <Star className="h-2.5 w-2.5" /> Favorites
              </p>
              {favPrompts.map(p => (
                <PromptCard key={p.id} prompt={p} isFavorite onUse={() => handleUsePrompt(p.content, p.id)} onToggleFav={(e) => toggleFavorite(p.id, e)} onDelete={(e) => handleDeletePrompt(p.id, e)} onCopy={(e) => handleCopy(p.content, e)} />
              ))}
            </div>
          )}

          {/* Categorized */}
          {byCategory.map(([cat, items], i) => (
            <div key={cat}>
              {i > 0 && <div className="border-t border-border/50 my-1 mx-2" />}
              <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground px-2 py-1">{cat}</p>
              {items.map(p => (
                <PromptCard
                  key={p.id}
                  prompt={p}
                  isFavorite={favorites.includes(p.id)}
                  onUse={() => handleUsePrompt(p.content, p.id)}
                  onToggleFav={(e) => toggleFavorite(p.id, e)}
                  onDelete={(e) => handleDeletePrompt(p.id, e)}
                  onCopy={(e) => handleCopy(p.content, e)}
                />
              ))}
            </div>
          ))}

          {filtered.length === 0 && (
            <div className="px-4 py-10 text-center">
              <Sparkles className="h-8 w-8 mx-auto text-muted-foreground/30 mb-2" />
              <p className="text-xs text-muted-foreground">{searchQuery ? "No matches" : "No prompts yet"}</p>
              <Button variant="outline" size="sm" className="mt-2 h-7 text-[10px]" onClick={() => setAddDialogOpen(true)}>
                <Plus className="h-3 w-3 mr-1" /> Create Prompt
              </Button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-2 border-t border-border bg-muted/10 flex gap-1">
          <Button variant="ghost" size="sm" className="h-7 text-[10px] flex-1" onClick={() => setAddDialogOpen(true)}>
            <Plus className="h-3 w-3 mr-1" /> New
          </Button>
          <Button variant="ghost" size="sm" className="h-7 text-[10px] flex-1" onClick={() => { setShowFavorites(!showFavorites); }}>
            <Star className="h-3 w-3 mr-1" /> {showFavorites ? "Show All" : "Favorites"}
          </Button>
        </div>
      </div>

      {/* Add Dialog */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Prompt</DialogTitle>
            <DialogDescription>Create a reusable prompt for your library.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-4">
            <Input placeholder="Title" value={newPrompt.title} onChange={(e) => setNewPrompt({...newPrompt, title: e.target.value})} className="text-sm" />
            <div className="flex gap-2">
              <select
                value={newPrompt.category}
                onChange={(e) => setNewPrompt({...newPrompt, category: e.target.value})}
                className="flex-1 h-9 rounded-md border border-input bg-background px-3 text-sm"
              >
                {CATEGORIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <Input placeholder="Description" value={newPrompt.description} onChange={(e) => setNewPrompt({...newPrompt, description: e.target.value})} className="text-sm" />
            <textarea
              className="w-full min-h-[100px] rounded-md border border-input bg-background px-3 py-2 text-sm resize-none"
              placeholder="Prompt content... Use {placeholders} for dynamic input."
              value={newPrompt.content}
              onChange={(e) => setNewPrompt({...newPrompt, content: e.target.value})}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setAddDialogOpen(false)}>Cancel</Button>
            <Button size="sm" disabled={!newPrompt.title || !newPrompt.content || isSubmitting} onClick={handleAddPrompt}>
              {isSubmitting ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function PromptCard({
  prompt,
  isFavorite,
  onUse,
  onToggleFav,
  onDelete,
  onCopy,
}: {
  prompt: PromptItem;
  isFavorite: boolean;
  onUse: () => void;
  onToggleFav: (e: React.MouseEvent) => void;
  onDelete: (e: React.MouseEvent) => void;
  onCopy: (e: React.MouseEvent) => void;
}) {
  return (
    <div
      onClick={onUse}
      className="group flex flex-col gap-1 px-2.5 py-2 rounded-lg hover:bg-accent/50 cursor-pointer transition-all border border-transparent hover:border-border mx-1"
    >
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold truncate">{prompt.title}</span>
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <span onClick={onCopy} className="p-0.5 hover:bg-muted rounded cursor-pointer" title="Copy"><Copy className="h-2.5 w-2.5 text-muted-foreground" /></span>
          <span onClick={onToggleFav} className={cn("p-0.5 hover:bg-muted rounded cursor-pointer", isFavorite && "text-amber-500")} title={isFavorite ? "Unfavorite" : "Favorite"}>
            <Star className="h-2.5 w-2.5" />
          </span>
          <span onClick={onDelete} className="p-0.5 hover:bg-destructive/10 rounded cursor-pointer" title="Delete"><Trash2 className="h-2.5 w-2.5 text-red-500" /></span>
        </div>
      </div>
      <p className="text-[10px] text-muted-foreground line-clamp-2 leading-relaxed">
        {prompt.description || prompt.content.slice(0, 80)}
      </p>
      {prompt.category && (
        <span className="text-[8px] text-muted-foreground/60 uppercase tracking-wider">{prompt.category}</span>
      )}
    </div>
  );
}

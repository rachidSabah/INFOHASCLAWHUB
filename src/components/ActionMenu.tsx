"use client";

import { useState, useRef, useEffect } from "react";
import { MoreHorizontal, Star, Pencil, Download, Trash2 } from "lucide-react";

interface ActionMenuProps {
  isFavorite: boolean;
  onToggleFavorite: () => void;
  onRename: () => void;
  onExportMarkdown: () => void;
  onExportJSON: () => void;
  onDelete: () => void;
}

export function ActionMenu({
  isFavorite, onToggleFavorite, onRename,
  onExportMarkdown, onExportJSON, onDelete,
}: ActionMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={ref} className="relative shrink-0 flex items-center ml-auto" onClick={(e) => e.stopPropagation()}>
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
        className="inline-flex items-center justify-center h-7 w-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
        title="Actions"
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 w-48 rounded-xl border border-border bg-popover shadow-lg py-1 animate-in fade-in zoom-in-95 duration-150">
          <button
            onClick={(e) => { e.stopPropagation(); setOpen(false); onToggleFavorite(); }}
            className="flex items-center gap-2 w-full px-3 py-2 text-xs hover:bg-accent transition-colors text-left"
          >
            <Star className={`h-3.5 w-3.5 ${isFavorite ? "text-amber-500 fill-amber-500" : "text-amber-500"}`} />
            {isFavorite ? "Remove from Favorites" : "Add to Favorites"}
          </button>

          <button
            onClick={(e) => { e.stopPropagation(); setOpen(false); onRename(); }}
            className="flex items-center gap-2 w-full px-3 py-2 text-xs hover:bg-accent transition-colors text-left"
          >
            <Pencil className="h-3.5 w-3.5" /> Rename
          </button>

          <div className="h-px bg-border my-1" />

          <button
            onClick={(e) => { e.stopPropagation(); setOpen(false); onExportMarkdown(); }}
            className="flex items-center gap-2 w-full px-3 py-2 text-xs hover:bg-accent transition-colors text-left"
          >
            <Download className="h-3.5 w-3.5 text-emerald-500" /> Export Markdown
          </button>

          <button
            onClick={(e) => { e.stopPropagation(); setOpen(false); onExportJSON(); }}
            className="flex items-center gap-2 w-full px-3 py-2 text-xs hover:bg-accent transition-colors text-left"
          >
            <Download className="h-3.5 w-3.5 text-emerald-500" /> Export JSON
          </button>

          <div className="h-px bg-border my-1" />

          <button
            onClick={(e) => { e.stopPropagation(); setOpen(false); onDelete(); }}
            className="flex items-center gap-2 w-full px-3 py-2 text-xs text-destructive hover:bg-destructive/10 transition-colors text-left"
          >
            <Trash2 className="h-3.5 w-3.5" /> Delete
          </button>
        </div>
      )}
    </div>
  );
}

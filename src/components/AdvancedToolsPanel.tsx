"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  Sparkles, Wifi, LayoutTemplate, Activity, Search, GitBranch, Cpu, Code2, Puzzle,
  Shield, Radio, Bot, Workflow, Users, Brain, Network, Lock, AlertTriangle,
  DollarSign, Target, Wrench, FileCheck, Rocket, ChevronDown, Zap, Star, Clock, Pin,
} from "lucide-react";

export interface AdvancedTool {
  key: string;
  label: string;
  description: string;
  icon: React.ComponentType<any>;
  color: string;
  category: string;
  onOpen: () => void;
}

interface CategoryGroup {
  name: string;
  tools: AdvancedTool[];
}

export function useToolsWithCategories(tools: AdvancedTool[]): CategoryGroup[] {
  const categories = new Map<string, AdvancedTool[]>();
  for (const tool of tools) {
    const cat = categories.get(tool.category) || [];
    cat.push(tool);
    categories.set(tool.category, cat);
  }
  return Array.from(categories.entries()).map(([name, tools]) => ({ name, tools }));
}

export default function AdvancedToolsDropdown({
  tools,
  open,
  onOpenChange,
}: {
  tools: AdvancedTool[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [search, setSearch] = useState("");
  const [recentKeys, setRecentKeys] = useState<string[]>([]);
  const [pinnedKeys, setPinnedKeys] = useState<string[]>([]);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const saved = typeof window !== "undefined" ? localStorage.getItem("clawhub_recent_tools") : null;
    if (saved) { try { setRecentKeys(JSON.parse(saved)); } catch {} }
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        onOpenChange(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onOpenChange]);

  const markRecent = (key: string) => {
    const next = [key, ...recentKeys.filter(k => k !== key)].slice(0, 8);
    setRecentKeys(next);
    localStorage.setItem("clawhub_recent_tools", JSON.stringify(next));
  };

  const togglePin = (key: string) => {
    const next = pinnedKeys.includes(key)
      ? pinnedKeys.filter(k => k !== key)
      : [key, ...pinnedKeys];
    setPinnedKeys(next);
  };

  const filtered = search.trim()
    ? tools.filter(t =>
        t.label.toLowerCase().includes(search.toLowerCase()) ||
        t.description.toLowerCase().includes(search.toLowerCase()) ||
        t.category.toLowerCase().includes(search.toLowerCase())
      )
    : tools;

  const categories = useToolsWithCategories(filtered);
  const recentTools = recentKeys.map(k => tools.find(t => t.key === k)).filter(Boolean) as AdvancedTool[];
  const pinnedTools = pinnedKeys.map(k => tools.find(t => t.key === k)).filter(Boolean) as AdvancedTool[];

  const handleToolClick = (tool: AdvancedTool) => {
    markRecent(tool.key);
    tool.onOpen();
    onOpenChange(false);
  };

  if (!open) return null;

  return (
    <div ref={dropdownRef} className="absolute top-full right-0 mt-1 w-80 bg-popover border border-border rounded-xl shadow-xl z-50 animate-fade-in overflow-hidden">
      {/* Header */}
      <div className="p-2 border-b border-border flex items-center gap-2 bg-muted/20">
        <Rocket className="h-3.5 w-3.5 text-orange-500" />
        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Advanced Tools</span>
        <div className="flex-1" />
        <span className="text-[10px] text-muted-foreground">{tools.length} tools</span>
      </div>

      {/* Search */}
      <div className="px-2 pt-2">
        <Input
          placeholder="Search tools..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-7 text-[11px]"
        />
      </div>

      <div className="p-1.5 space-y-0.5 max-h-[65vh] overflow-y-auto">
        {/* Pinned */}
        {pinnedTools.length > 0 && !search && (
          <>
            <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground px-2 py-1 flex items-center gap-1">
              <Pin className="h-2.5 w-2.5" /> Pinned
            </p>
            <div className="space-y-0.5 mb-2">
              {pinnedTools.map(t => <ToolButton key={t.key} tool={t} pinned onTogglePin={() => togglePin(t.key)} onClick={() => handleToolClick(t)} />)}
            </div>
          </>
        )}

        {/* Recent */}
        {recentTools.length > 0 && !search && (
          <>
            <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground px-2 py-1 flex items-center gap-1">
              <Clock className="h-2.5 w-2.5" /> Recent
            </p>
            <div className="space-y-0.5 mb-2">
              {recentTools.slice(0, 4).map(t => <ToolButton key={t.key} tool={t} onClick={() => handleToolClick(t)} />)}
            </div>
          </>
        )}

        {/* Categories */}
        {categories.map((cat, i) => (
          <div key={cat.name}>
            {i > 0 && <div className="border-t border-border my-1" />}
            <CategorySection
              name={cat.name}
              tools={cat.tools}
              onToolClick={handleToolClick}
              pinnedKeys={pinnedKeys}
              onTogglePin={togglePin}
            />
          </div>
        ))}

        {filtered.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-6">No tools match "{search}"</p>
        )}
      </div>
    </div>
  );
}

function CategorySection({
  name,
  tools,
  onToolClick,
  pinnedKeys,
  onTogglePin,
}: {
  name: string;
  tools: AdvancedTool[];
  onToolClick: (tool: AdvancedTool) => void;
  pinnedKeys: string[];
  onTogglePin: (key: string) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <>
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="w-full flex items-center gap-1 px-2 py-1 text-[9px] font-bold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
      >
        <ChevronDown className={cn("h-2.5 w-2.5 transition-transform", collapsed && "-rotate-90")} />
        {name}
        <span className="text-[8px] opacity-50 ml-1">({tools.length})</span>
      </button>
      {!collapsed && (
        <div className="space-y-0.5 ml-1">
          {tools.map(t => (
            <ToolButton
              key={t.key}
              tool={t}
              pinned={pinnedKeys.includes(t.key)}
              onClick={() => onToolClick(t)}
              onTogglePin={() => onTogglePin(t.key)}
            />
          ))}
        </div>
      )}
    </>
  );
}

function ToolButton({
  tool,
  pinned,
  onClick,
  onTogglePin,
}: {
  tool: AdvancedTool;
  pinned?: boolean;
  onClick: () => void;
  onTogglePin?: () => void;
}) {
  const Icon = tool.icon;
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md text-xs transition-colors text-left hover:bg-muted group"
    >
      <Icon className={cn("h-3.5 w-3.5 shrink-0", tool.color)} />
      <div className="flex-1 min-w-0">
        <span className="font-medium">{tool.label}</span>
        <p className="text-[10px] text-muted-foreground truncate">{tool.description}</p>
      </div>
      {pinned && <Pin className="h-3 w-3 text-amber-500 shrink-0" />}
      {onTogglePin && (
        <span
          onClick={(e) => { e.stopPropagation(); onTogglePin(); }}
          className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-muted-foreground/10 rounded shrink-0 cursor-pointer"
          title={pinned ? "Unpin" : "Pin"}
        >
          <Pin className={cn("h-2.5 w-2.5", pinned ? "text-amber-500" : "text-muted-foreground")} />
        </span>
      )}
    </button>
  );
}

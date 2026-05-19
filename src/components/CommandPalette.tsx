"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import {
  MessageSquare, Settings, PanelLeft, Monitor, Stethoscope,
  BarChart3, Sun, Moon, Download, RotateCcw, ArrowUpCircle,
  Search, Users, Wrench, Brain, BookOpen, CalendarClock,
  GitCompare, Zap, Terminal, Plus
} from "lucide-react";
import { useChatStore, useUIStore, useSettingsStore, useAgentStore } from "@/lib/stores";
import { useTheme } from "@/components/ThemeProvider";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const actions = [
  { id: "new-chat", label: "New Chat", icon: Plus, category: "Chat", action: "newChat" },
  { id: "toggle-sidebar", label: "Toggle Sidebar", icon: PanelLeft, category: "View", action: "toggleSidebar" },
  { id: "settings", label: "Open Settings", icon: Settings, category: "View", shortcut: "Ctrl+," },
  { id: "system-monitor", label: "System Monitor", icon: Monitor, category: "Tools", action: "systemMonitor" },
  { id: "doctor", label: "Doctor Diagnostics", icon: Stethoscope, category: "Tools", action: "doctor" },
  { id: "token-dashboard", label: "Token Dashboard", icon: BarChart3, category: "Tools", action: "tokenDashboard" },
  { id: "toggle-dark", label: "Toggle Dark Mode", icon: Moon, category: "View", action: "toggleDark" },
  { id: "check-updates", label: "Check for Updates", icon: ArrowUpCircle, category: "System", action: "checkUpdates" },
  { id: "clear-cache", label: "Clear Cache & Reload", icon: RotateCcw, category: "System", action: "clearCache" },
  { id: "import-agents", label: "Import Agent Library", icon: Download, category: "Agents", action: "importAgents" },
  { id: "scheduler", label: "Scheduled Tasks", icon: CalendarClock, category: "Tools", action: "scheduler" },
  { id: "consensus", label: "Model Consensus", icon: GitCompare, category: "Tools", action: "consensus" },
];

export function CommandPalette({ open, onOpenChange }: Props) {
  const { setActiveConversationId, conversations } = useChatStore();
  const { setSettingsOpen } = useUIStore();
  const { theme, setTheme } = useTheme();

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "p" && (e.metaKey || e.ctrlKey))) {
        e.preventDefault();
        onOpenChange(!open);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, [open, onOpenChange]);

  const runAction = useCallback((actionId: string) => {
    onOpenChange(false);
    switch (actionId) {
      case "newChat":
        setActiveConversationId(null);
        break;
      case "toggleSidebar":
        useUIStore.getState().toggleSidebar();
        break;
      case "settings":
        setSettingsOpen(true);
        break;
      case "systemMonitor":
        (window as any).__clawhub_openSystemMonitor?.();
        break;
      case "doctor":
        (window as any).__clawhub_openDoctor?.();
        break;
      case "tokenDashboard":
        (window as any).__clawhub_openTokenDashboard?.();
        break;
      case "toggleDark":
        setTheme(theme === "dark" ? "light" : "dark");
        break;
      case "checkUpdates":
        (window as any).__clawhub_checkUpdates?.();
        break;
      case "clearCache":
        localStorage.clear();
        sessionStorage.clear();
        if ("caches" in window) {
          caches.keys().then((keys) => keys.forEach((k) => caches.delete(k)));
        }
        toast.success("Cache cleared. Reloading...");
        setTimeout(() => window.location.reload(), 800);
        break;
      case "importAgents":
        fetch("/api/agents/seed", { method: "POST" })
          .then(() => toast.success("Agents imported"))
          .catch(() => toast.error("Import failed"));
        break;
      case "scheduler":
        (window as any).__clawhub_openScheduler?.();
        break;
      case "consensus":
        (window as any).__clawhub_openConsensus?.();
        break;
    }
  }, [onOpenChange, setActiveConversationId, setSettingsOpen, theme, setTheme]);

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Type a command or search..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>

        {conversations.length > 0 && (
          <CommandGroup heading="Conversations">
            {conversations.slice(0, 8).map((c) => (
              <CommandItem
                key={c.id}
                value={`chat-${c.title}`}
                onSelect={() => {
                  setActiveConversationId(c.id);
                  onOpenChange(false);
                }}
              >
                <MessageSquare className="h-4 w-4 mr-2" />
                <span className="truncate">{c.title}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {actions.map((action) => (
          <CommandItem
            key={action.id}
            value={action.label}
            onSelect={() => runAction(action.id)}
          >
            <action.icon className="h-4 w-4 mr-2" />
            <span>{action.label}</span>
            {action.shortcut && (
              <kbd className="ml-auto text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded font-mono">
                {action.shortcut}
              </kbd>
            )}
          </CommandItem>
        ))}
      </CommandList>
    </CommandDialog>
  );
}

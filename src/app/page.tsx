"use client";

import { useEffect, useCallback, useState } from "react";
import { useTheme } from "next-themes";
import { ChatSidebar } from "@/components/ChatSidebar";
import { PromptSidebar } from "@/components/PromptSidebar";
import { TopBar } from "@/components/TopBar";
import { ChatWindow } from "@/components/ChatWindow";
import { ChatInput } from "@/components/ChatInput";
import { SettingsPanel } from "@/components/SettingsPanel";
import { OnboardingWizard } from "@/components/OnboardingWizard";
import { UpdateChecker } from "@/components/UpdateChecker";
import { SchedulerBackground } from "@/components/SchedulerBackground";
import { CommandPalette } from "@/components/CommandPalette";
import ArtifactPreviewPanel from "@/components/enhancements/ArtifactPreviewPanel";
import { useArtifactPreviewStore } from "@/lib/artifact-store";
import { useChatStore, useSettingsStore, useUIStore, useAgentStore, useSkillStore, usePromptStore } from "@/lib/stores";
import { cn } from "@/lib/utils";
import { X, MessageSquare } from "lucide-react";

function DashboardContent() {
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(320);
  const [sidebarReady, setSidebarReady] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  // Load saved width after hydration to prevent mismatch
  useEffect(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("clawhub_sidebar_width");
      if (saved) setSidebarWidth(parseInt(saved));
      setSidebarReady(true);
    }
  }, []);

  useEffect(() => {
    const onboarded = localStorage.getItem("clawhub_onboarded");
    if (onboarded !== "true") {
      setShowOnboarding(true);
    }
  }, []);
  const {
    conversations,
    activeConversationId,
    setActiveConversationId,
    setConversations,
    setMessages,
    removeConversation,
  } = useChatStore();
  const { setAgents } = useAgentStore();
  const { setSkills } = useSkillStore();
  const { setPrompts } = usePromptStore();
  const { settings, setSettings } = useSettingsStore();
  const { sidebarOpen } = useUIStore();
  const { theme, setTheme } = useTheme();

  // Load settings on mount
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const res = await fetch("/api/settings");
        if (res.ok) {
          const data = await res.json();
          setSettings(data);
          if (data.theme && data.theme !== "system") {
            setTheme(data.theme);
          }
        }
      } catch {}
    };
    loadSettings();
  }, [setSettings, setTheme]);

  // Load conversations on mount
  useEffect(() => {
    const loadConversations = async () => {
      try {
        const res = await fetch(`/api/conversations?t=${Date.now()}`);
        if (res.ok) {
          const data = await res.json();
          setConversations(data);
        }
      } catch {}
    };
    loadConversations();
  }, [setConversations]);

  // Load agents on mount + auto-seed if empty
  useEffect(() => {
    const loadAgents = async () => {
      try {
        const res = await fetch(`/api/agents?t=${Date.now()}`);
        if (res.ok) {
          const data = await res.json();
          setAgents(data);
          // Auto-seed agents if none exist (first run)
          if (data.length === 0) {
            try {
              await fetch("/api/agents/seed", { method: "POST" });
              const reload = await fetch(`/api/agents?t=${Date.now() + 1}`);
              if (reload.ok) setAgents(await reload.json());
            } catch {}
          }
          // Auto-seed plugins on every load
          try { await fetch("/api/plugins/seed", { method: "POST" }); } catch {}
        }
      } catch {}
    };
    loadAgents();
  }, [setAgents]);

  // Load skills on mount
  useEffect(() => {
    const loadSkills = async () => {
      try {
        const res = await fetch(`/api/skills?t=${Date.now()}`);
        if (res.ok) {
          const data = await res.json();
          setSkills(data);
        }
      } catch {}
    };
    loadSkills();
  }, [setSkills]);

  // Load prompts on mount
  useEffect(() => {
    const loadPrompts = async () => {
      try {
        const res = await fetch(`/api/prompts?t=${Date.now()}`);
        if (res.ok) {
          const data = await res.json();
          setPrompts(data);
        }
      } catch {}
    };
    loadPrompts();
  }, [setPrompts]);

  // Load messages when active conversation changes
  const loadMessages = useCallback(async () => {
    if (!activeConversationId) return;
    try {
      const res = await fetch(`/api/conversations/${activeConversationId}/messages`);
      if (res.ok) {
        const data = await res.json();
        setMessages(data);
      }
    } catch {}
  }, [activeConversationId, setMessages]);

  useEffect(() => {
    loadMessages();
  }, [loadMessages]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd/Ctrl + N: New chat
      if ((e.metaKey || e.ctrlKey) && e.key === "n") {
        e.preventDefault();
        setActiveConversationId(null);
        // Focus the input
        setTimeout(() => {
          const textarea = document.querySelector<HTMLTextAreaElement>("textarea.chat-input");
          textarea?.focus();
        }, 100);
      }
      // Cmd/Ctrl + B: Toggle sidebar
      if ((e.metaKey || e.ctrlKey) && e.key === "b") {
        e.preventDefault();
        useUIStore.getState().toggleSidebar();
      }
      // Cmd/Ctrl + ,: Open settings
      if ((e.metaKey || e.ctrlKey) && e.key === ",") {
        e.preventDefault();
        useUIStore.getState().setSettingsOpen(true);
      }
      // Escape: Close settings (only if open)
      if (e.key === "Escape" && useUIStore.getState().settingsOpen) {
        e.preventDefault();
        useUIStore.getState().setSettingsOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [setActiveConversationId]);

  return (
    <div className="h-screen flex overflow-hidden bg-background">
      {/* Sidebar */}
      <div
        className={cn(
          "relative shrink-0 transition-all duration-300 ease-in-out overflow-x-hidden select-none",
          sidebarOpen ? "" : "w-0"
        )}
        style={{ width: sidebarOpen ? sidebarWidth : 0 }}
        suppressHydrationWarning
      >
        <div className="h-full overflow-y-auto overflow-x-hidden" style={{ width: sidebarWidth }} suppressHydrationWarning>
          <ChatSidebar />
        </div>
        {/* Resize handle */}
        {sidebarOpen && (
          <div
            className={cn(
              "absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-primary/30 transition-colors z-50",
              isDragging && "bg-primary/50 w-1"
            )}
            onMouseDown={(e) => {
              e.preventDefault();
              setIsDragging(true);
              const startX = e.clientX;
              const startWidth = sidebarWidth;
              const onMove = (ev: MouseEvent) => {
                const newWidth = Math.max(250, Math.min(600, startWidth + (ev.clientX - startX)));
                setSidebarWidth(newWidth);
                localStorage.setItem("clawhub_sidebar_width", String(newWidth));
              };
              const onUp = () => {
                setIsDragging(false);
                document.removeEventListener("mousemove", onMove);
                document.removeEventListener("mouseup", onUp);
              };
              document.addEventListener("mousemove", onMove);
              document.addEventListener("mouseup", onUp);
            }}
          />
        )}
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <TopBar />
        
        {/* Horizontal Scrolling Chat Tabs */}
        {conversations.length > 0 && (
          <div className="border-b border-border bg-card/25 h-9 px-3 overflow-x-auto scrollbar-none shrink-0 shadow-sm">
            <div className="flex items-center gap-1 min-w-max h-full">
            {conversations.map((conv) => {
              const isActive = activeConversationId === conv.id;
              return (
                <div
                  key={conv.id}
                  className={cn(
                    "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium cursor-pointer transition-all duration-200 shrink-0 select-none border border-transparent whitespace-nowrap",
                    isActive
                      ? "bg-primary text-primary-foreground border-primary/20 shadow-sm"
                      : "bg-muted/30 hover:bg-muted/60 text-muted-foreground hover:text-foreground border-border/10"
                  )}
                  onClick={() => setActiveConversationId(conv.id)}
                >
                  <MessageSquare className="h-3 w-3 opacity-70 shrink-0" />
                  <span className="truncate max-w-[100px] font-semibold">{conv.title}</span>
                  <span
                    className={cn(
                      "hover:bg-black/10 rounded-full p-0.5 transition-colors shrink-0",
                      isActive ? "hover:bg-white/20" : "hover:bg-muted/60"
                    )}
                    onClick={async (e) => {
                      e.stopPropagation();
                      removeConversation(conv.id);
                      await fetch(`/api/conversations/${conv.id}`, { method: "DELETE" }).catch(() => {});
                    }}
                  >
                    <X className="h-2.5 w-2.5" />
                  </span>
                </div>
              );
            })}
            </div>
          </div>
        )}

        <ChatWindow />
        <ChatInput />
      </div>

      {/* Artifact Preview Panel */}
      <ArtifactPreviewPanel />

      {/* Prompt Sidebar — moved to top bar Prompt Library dropdown */}
      {/* <div className="shrink-0 hidden xl:block h-full">
        <PromptSidebar />
      </div> */}

      {/* Settings Dialog */}
      <SettingsPanel />

      {showOnboarding && (
        <OnboardingWizard onComplete={() => setShowOnboarding(false)} />
      )}

      <UpdateChecker />
      <SchedulerBackground />
      <CommandPalette open={commandPaletteOpen} onOpenChange={setCommandPaletteOpen} />
    </div>
  );
}

export default function DashboardPage() {
  return (
    <DashboardContent />
  );
}

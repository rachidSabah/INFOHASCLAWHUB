import { create } from "zustand";

export interface PreviewTab {
  id: string;
  title: string;
  type: "document" | "code" | "sandbox" | "spreadsheet" | "presentation" | "diagram" | "markdown" | "html" | "canvas" | "image" | "chart" | "website" | "sql" | "yaml" | "xml" | "json" | "mermaid" | "latex" | "python" | "typescript" | "javascript" | "css" | "shell";
  content: string;
  metadata?: Record<string, any>;
  isPinned: boolean;
  isStreaming: boolean;
  createdAt: number;
}

interface ArtifactPreviewState {
  isOpen: boolean;
  width: number;
  tabs: PreviewTab[];
  activeTabId: string | null;
  isFullscreen: boolean;
  isFloating: boolean;
  floatingPosition: { x: number; y: number; w: number; h: number };

  setOpen: (open: boolean) => void;
  setWidth: (w: number) => void;
  addTab: (tab: PreviewTab) => void;
  updateTab: (id: string, updates: Partial<PreviewTab>) => void;
  removeTab: (id: string) => void;
  setActiveTab: (id: string | null) => void;
  appendContent: (id: string, chunk: string) => void;
  togglePin: (id: string) => void;
  setFullscreen: (fs: boolean) => void;
  setFloating: (fl: boolean) => void;
  autoOpen: (tab: PreviewTab) => void;
  closeAll: () => void;
}

export const useArtifactPreviewStore = create<ArtifactPreviewState>((set, get) => ({
  isOpen: false,
  width: 500,
  tabs: [],
  activeTabId: null,
  isFullscreen: false,
  isFloating: false,
  floatingPosition: { x: 100, y: 100, w: 600, h: 500 },

  setOpen: (open) => set({ isOpen: open }),
  setWidth: (w) => set({ width: w }),
  addTab: (tab) =>
    set((s) => ({
      tabs: [...s.tabs, tab],
      activeTabId: tab.id,
      isOpen: true,
    })),
  updateTab: (id, updates) =>
    set((s) => ({
      tabs: s.tabs.map((t) => (t.id === id ? { ...t, ...updates } : t)),
    })),
  removeTab: (id) =>
    set((s) => {
      const tabs = s.tabs.filter((t) => t.id !== id);
      return {
        tabs,
        activeTabId: s.activeTabId === id ? (tabs[0]?.id || null) : s.activeTabId,
        isOpen: tabs.length > 0,
      };
    }),
  setActiveTab: (id) => set({ activeTabId: id }),
  appendContent: (id, chunk) =>
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.id === id ? { ...t, content: t.content + chunk } : t
      ),
    })),
  togglePin: (id) =>
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.id === id ? { ...t, isPinned: !t.isPinned } : t
      ),
    })),
  setFullscreen: (fs) => set({ isFullscreen: fs }),
  setFloating: (fl) => set({ isFloating: fl }),
  autoOpen: (tab) => {
    const existing = get().tabs.find((t) => t.type === tab.type && t.title === tab.title);
    if (existing) {
      set({ activeTabId: existing.id, isOpen: true });
    } else {
      set((s) => ({
        tabs: [...s.tabs, tab],
        activeTabId: tab.id,
        isOpen: true,
      }));
    }
  },
  closeAll: () => set({ isOpen: false, tabs: [], activeTabId: null, isFullscreen: false }),
}));

import { create } from "zustand";
import type { Conversation, Message, AppSettings, Agent, ModelGroup, Skill, Prompt } from "@/lib/types";
import { DEFAULT_SETTINGS, AVAILABLE_MODEL_GROUPS } from "@/lib/types";

export interface UpdateCommitInfo {
  sha: string;
  message: string;
  date: string;
}

interface UpdateStoreState {
  updateAvailable: boolean;
  updateDialogOpen: boolean;
  currentCommit: string;
  latestCommit: string;
  commits: UpdateCommitInfo[];
  checking: boolean;
  applying: boolean;
  updateApplied: boolean;
  setUpdateState: (state: Partial<Omit<UpdateStoreState, "setUpdateState">>) => void;
}

export const useUpdateStore = create<UpdateStoreState>((set) => ({
  updateAvailable: false,
  updateDialogOpen: false,
  currentCommit: "",
  latestCommit: "",
  commits: [],
  checking: false,
  applying: false,
  updateApplied: false,
  setUpdateState: (state) => set(state),
}));

interface UIState {
  sidebarOpen: boolean;
  settingsOpen: boolean;
  modelSelectorOpen: boolean;
  editingMessageId: string | null;
  isGenerating: boolean;
  setSidebarOpen: (open: boolean) => void;
  toggleSidebar: () => void;
  setSettingsOpen: (open: boolean) => void;
  setModelSelectorOpen: (open: boolean) => void;
  setEditingMessageId: (id: string | null) => void;
  setIsGenerating: (generating: boolean) => void;
}

export const useUIStore = create<UIState>((set) => ({
  sidebarOpen: true,
  settingsOpen: false,
  modelSelectorOpen: false,
  editingMessageId: null,
  isGenerating: false,
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  setSettingsOpen: (open) => set({ settingsOpen: open }),
  setModelSelectorOpen: (open) => set({ modelSelectorOpen: open }),
  setEditingMessageId: (id) => set({ editingMessageId: id }),
  setIsGenerating: (generating) => set({ isGenerating: generating }),
}));

interface ChatState {
  conversations: Conversation[];
  activeConversationId: string | null;
  messages: Message[];
  streamingContent: string;
  setActiveConversationId: (id: string | null) => void;
  setConversations: (conversations: Conversation[]) => void;
  setMessages: (messages: Message[]) => void;
  addConversation: (conversation: Conversation) => void;
  removeConversation: (id: string) => void;
  updateConversation: (id: string, data: Partial<Conversation>) => void;
  addMessage: (message: Message) => void;
  updateMessage: (id: string, content: string) => void;
  editMessage: (id: string, content: string) => void;
  removeMessage: (id: string) => void;
  deleteMessagesFrom: (messageId: string) => void;
  setStreamingContent: (content: string) => void;
  appendStreamingContent: (chunk: string) => void;
  clearStreamingContent: () => void;
  getActiveConversation: () => Conversation | undefined;
}

export const useChatStore = create<ChatState>((set, get) => ({
  conversations: [],
  activeConversationId: null,
  messages: [],
  streamingContent: "",
  setActiveConversationId: (id) => set({ activeConversationId: id, messages: [], streamingContent: "" }),
  setConversations: (conversations) => set({ conversations }),
  setMessages: (messages) => set({ messages }),
  addConversation: (conversation) =>
    set((s) => ({ conversations: [conversation, ...s.conversations] })),
  removeConversation: (id) =>
    set((s) => {
      const isActive = s.activeConversationId === id;
      return {
        conversations: s.conversations.filter((c) => c.id !== id),
        ...(isActive ? { activeConversationId: null, messages: [], streamingContent: "" } : {}),
      };
    }),
  updateConversation: (id, data) =>
    set((s) => ({
      conversations: s.conversations.map((c) => (c.id === id ? { ...c, ...data } : c)),
    })),
  addMessage: (message) =>
    set((s) => ({ messages: [...s.messages, message] })),
  updateMessage: (id, content) =>
    set((s) => ({
      messages: s.messages.map((m) => (m.id === id ? { ...m, content } : m)),
    })),
  editMessage: (id, content) =>
    set((s) => ({
      messages: s.messages.map((m) =>
        m.id === id ? { ...m, content, edited: true } : m
      ),
    })),
  removeMessage: (id) =>
    set((s) => ({ messages: s.messages.filter((m) => m.id !== id) })),
  deleteMessagesFrom: (messageId) =>
    set((s) => {
      const idx = s.messages.findIndex((m) => m.id === messageId);
      if (idx === -1) return s;
      return { messages: s.messages.slice(0, idx) };
    }),
  setStreamingContent: (content) => set({ streamingContent: content }),
  appendStreamingContent: (chunk) =>
    set((s) => ({ streamingContent: s.streamingContent + chunk })),
  clearStreamingContent: () => set({ streamingContent: "" }),
  getActiveConversation: () => {
    const s = get();
    return s.conversations.find((c) => c.id === s.activeConversationId);
  },
}));

interface SettingsState {
  settings: AppSettings;
  modelGroups: ModelGroup[];
  setSettings: (settings: AppSettings) => void;
  updateSetting: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;
  setModelGroups: (groups: ModelGroup[]) => void;
  fetchModels: () => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: DEFAULT_SETTINGS,
  modelGroups: AVAILABLE_MODEL_GROUPS,
  setSettings: (settings) => set({ settings }),
  updateSetting: (key, value) =>
    set((s) => ({ settings: { ...s.settings, [key]: value } })),
  setModelGroups: (groups) => set({ modelGroups: groups }),
  fetchModels: async () => {
    try {
      const res = await fetch("/api/models");
      if (res.ok) {
        const dynamicGroups = await res.json();
        // Merge with static groups, deduplicating by group name
        const staticGroupNames = new Set(AVAILABLE_MODEL_GROUPS.map(g => g.name));
        const newDynamicGroups = Array.isArray(dynamicGroups)
          ? dynamicGroups.filter((g: any) => !staticGroupNames.has(g.name))
          : [];
        // Deduplicate models across all groups by model ID
        const seenModelIds = new Set<string>();
        const allGroups = [...AVAILABLE_MODEL_GROUPS, ...newDynamicGroups].map(group => ({
          ...group,
          models: group.models.filter((m: any) => {
            if (seenModelIds.has(m.id)) return false;
            seenModelIds.add(m.id);
            return true;
          })
        })).filter(group => group.models.length > 0);
        set({ modelGroups: allGroups });
      }
    } catch {
      // Providers may be offline — models fallback to built-in list
    }
  },
}));

interface AgentState {
  agents: Agent[];
  activeAgentId: string | null;
  setAgents: (agents: Agent[]) => void;
  setActiveAgentId: (id: string | null) => void;
  addAgent: (agent: Agent) => void;
  updateAgent: (id: string, data: Partial<Agent>) => void;
  removeAgent: (id: string) => void;
}

export const useAgentStore = create<AgentState>((set) => ({
  agents: [],
  activeAgentId: null,
  setAgents: (agents) => set({ agents }),
  setActiveAgentId: (id) => set({ activeAgentId: id }),
  addAgent: (agent) => set((s) => ({ agents: [agent, ...s.agents] })),
  updateAgent: (id, data) =>
    set((s) => ({
      agents: s.agents.map((a) => (a.id === id ? { ...a, ...data } : a)),
    })),
  removeAgent: (id) =>
    set((s) => ({
      agents: s.agents.filter((a) => a.id !== id),
      activeAgentId: s.activeAgentId === id ? null : s.activeAgentId,
    })),
}));

interface SkillState {
  skills: Skill[];
  activeSkillId: string | null;
  setSkills: (skills: Skill[]) => void;
  setActiveSkillId: (id: string | null) => void;
  addSkill: (skill: Skill) => void;
  removeSkill: (id: string) => void;
}

export const useSkillStore = create<SkillState>((set) => ({
  skills: [],
  activeSkillId: null,
  setSkills: (skills) => set({ skills }),
  setActiveSkillId: (id) => set({ activeSkillId: id }),
  addSkill: (skill) => set((s) => ({ skills: [skill, ...s.skills] })),
  removeSkill: (id) =>
    set((s) => ({
      skills: s.skills.filter((sk) => sk.id !== id),
      activeSkillId: s.activeSkillId === id ? null : s.activeSkillId,
    })),
}));

interface PromptState {
  prompts: Prompt[];
  setPrompts: (prompts: Prompt[]) => void;
  addPrompt: (prompt: Prompt) => void;
  updatePrompt: (id: string, data: Partial<Prompt>) => void;
  removePrompt: (id: string) => void;
}

export const usePromptStore = create<PromptState>((set) => ({
  prompts: [],
  setPrompts: (prompts) => set({ prompts }),
  addPrompt: (prompt) => set((s) => ({ prompts: [prompt, ...s.prompts] })),
  updatePrompt: (id, data) =>
    set((s) => ({
      prompts: s.prompts.map((p) => (p.id === id ? { ...p, ...data } : p)),
    })),
  removePrompt: (id) =>
    set((s) => ({
      prompts: s.prompts.filter((p) => p.id !== id),
    })),
}));

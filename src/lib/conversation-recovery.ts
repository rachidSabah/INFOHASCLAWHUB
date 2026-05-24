/**
 * ClawHub Conversation State Recovery
 * 
 * Provides automatic conversation state persistence and recovery.
 * Uses the existing Conversation + Message models from Prisma
 * along with client-side localStorage for UI state.
 * 
 * Features:
 * - Auto-save draft messages
 * - Recovery after browser crash/refresh
 * - Scroll position and UI state restoration (client-side)
 * - Active model/workspace preservation
 */

import { db } from "@/lib/db";

// ── Types ──────────────────────────────────────────────────────────────────

export interface ConversationUIState {
  conversationId: string;
  activeModel: string;
  activeProviderId: string | null;
  workspacePath: string | null;
  scrollPosition: number;
  draftMessage: string;
  isGenerating: boolean;
  lastActivityAt: string;
  pinnedMessages: string[];
  expandedArtifacts: string[];
  sidebarOpen: boolean;
  activeTab: string;
}

export interface RecoveryResult {
  recovered: boolean;
  conversationId: string | null;
  activeModel: string;
  workspacePath: string | null;
  messageCount: number;
  lastActivityAt: string;
  draftMessage: string;
}

// ── Server-side Recovery ───────────────────────────────────────────────────

/**
 * Get the most recently active conversation for auto-recovery.
 * Uses the existing Conversation + Message models.
 */
export async function getLastActiveConversation(): Promise<RecoveryResult> {
  try {
    const lastConversation = await db.conversation.findFirst({
      orderBy: { updatedAt: "desc" },
      include: {
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { createdAt: true },
        },
      },
    });

    if (!lastConversation) {
      return {
        recovered: false,
        conversationId: null,
        activeModel: "gemini-2.0-flash",
        workspacePath: null,
        messageCount: 0,
        lastActivityAt: new Date().toISOString(),
        draftMessage: "",
      };
    }

    // Count messages in the conversation
    const messageCount = await db.message.count({
      where: { conversationId: lastConversation.id },
    });

    return {
      recovered: true,
      conversationId: lastConversation.id,
      activeModel: lastConversation.model,
      workspacePath: null, // Will be restored from client-side storage
      messageCount,
      lastActivityAt: lastConversation.updatedAt.toISOString(),
      draftMessage: "", // Draft stored client-side
    };
  } catch (error) {
    console.error("[ConversationRecovery] Failed to get last active:", error);
    return {
      recovered: false,
      conversationId: null,
      activeModel: "gemini-2.0-flash",
      workspacePath: null,
      messageCount: 0,
      lastActivityAt: new Date().toISOString(),
      draftMessage: "",
    };
  }
}

/**
 * Recover a specific conversation by ID.
 */
export async function recoverConversation(conversationId: string): Promise<RecoveryResult | null> {
  try {
    const conversation = await db.conversation.findUnique({
      where: { id: conversationId },
      include: {
        messages: {
          select: { id: true },
        },
      },
    });

    if (!conversation) return null;

    return {
      recovered: true,
      conversationId: conversation.id,
      activeModel: conversation.model,
      workspacePath: null,
      messageCount: conversation.messages.length,
      lastActivityAt: conversation.updatedAt.toISOString(),
      draftMessage: "",
    };
  } catch (error) {
    console.error("[ConversationRecovery] Failed to recover:", error);
    return null;
  }
}

/**
 * Get recent conversations for quick recovery.
 */
export async function getRecentConversations(limit: number = 10): Promise<Array<{
  id: string;
  title: string;
  model: string;
  messageCount: number;
  updatedAt: string;
}>> {
  try {
    const conversations = await db.conversation.findMany({
      orderBy: { updatedAt: "desc" },
      take: limit,
      include: {
        messages: {
          select: { id: true },
        },
      },
    });

    return conversations.map(c => ({
      id: c.id,
      title: c.title,
      model: c.model,
      messageCount: c.messages.length,
      updatedAt: c.updatedAt.toISOString(),
    }));
  } catch (error) {
    console.error("[ConversationRecovery] Failed to get recent:", error);
    return [];
  }
}

// ── Client-side State Helpers ──────────────────────────────────────────────

/**
 * Key for storing UI state in localStorage.
 */
export const UI_STATE_KEY = "clawhub_ui_state";

/**
 * Get the default UI state.
 */
export function getDefaultUIState(): ConversationUIState {
  return {
    conversationId: "",
    activeModel: "gemini-2.0-flash",
    activeProviderId: null,
    workspacePath: null,
    scrollPosition: 0,
    draftMessage: "",
    isGenerating: false,
    lastActivityAt: new Date().toISOString(),
    pinnedMessages: [],
    expandedArtifacts: [],
    sidebarOpen: true,
    activeTab: "chat",
  };
}

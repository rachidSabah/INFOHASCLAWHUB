"use client";

import { useState, useRef, useEffect, useCallback, type KeyboardEvent } from "react";
import { useChatStore, useUIStore, useSettingsStore, useAgentStore, usePromptStore } from "@/lib/stores";
import { useArtifactPreviewStore } from "@/lib/artifact-store";
import { detectArtifact, shouldAutoOpen } from "@/lib/artifact-detector";
import { stripToolCallXml } from "@/lib/tool-call-utils";
import { optimizeRequest } from "@/lib/optimization-engine";
import { getCachedResponse, setCachedResponse } from "@/lib/response-cache";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Send,
  Paperclip,
  Square,
  X,
  FileText,
  ChevronLeft,
  ChevronRight,
  Play,
  Globe,
  CalendarClock,
  GitCompare,
  MessageCircle,
  Zap,
} from "lucide-react";
import { SearchPanel } from "@/components/SearchPanel";
import { cn } from "@/lib/utils";
import type { Attachment } from "@/lib/types";
import { VoiceInput } from "@/components/VoiceInput";
import { CodeRunner } from "@/components/CodeRunner";
import { SchedulerPanel } from "@/components/SchedulerPanel";
import { ModelConsensus } from "@/components/ModelConsensus";
import { WhatsAppPanel } from "@/components/WhatsAppPanel";
import { AgentRunnerPanel } from "@/components/AgentRunnerPanel";

/**
 * Robustly strip tool call JSON from content using brace-matching.
 * Handles nested objects that regex can't handle.
 */
function stripToolCallJson(content: string): string {
  let result = content;
  
  // Pattern: {"name": "...", "arguments": {...}} or {"name": "...", "args": {...}}
  // Use iterative brace-matching to handle nested objects
  const searchPatterns = [`{"name":`, `{"name ':`];
  
  for (const pattern of searchPatterns) {
    let searchFrom = 0;
    while (true) {
      const startIdx = result.indexOf(pattern, searchFrom);
      if (startIdx === -1) break;
      
      // Check if this looks like a tool call by looking for "arguments" or "args" nearby
      const nearby = result.substring(startIdx, Math.min(startIdx + 200, result.length));
      if (!nearby.includes('"arguments"') && !nearby.includes('"args"') && !nearby.includes('"params"')) {
        searchFrom = startIdx + pattern.length;
        continue;
      }
      
      // Find matching closing brace
      let depth = 0;
      let inString = false;
      let escape = false;
      let endIdx = -1;
      
      for (let i = startIdx; i < result.length; i++) {
        const ch = result[i];
        if (escape) { escape = false; continue; }
        if (ch === '\\' && inString) { escape = true; continue; }
        if (ch === '"') { inString = !inString; continue; }
        if (inString) continue;
        if (ch === '{') depth++;
        else if (ch === '}') {
          depth--;
          if (depth === 0) { endIdx = i; break; }
        }
      }
      
      if (endIdx !== -1) {
        // Remove the tool call JSON
        result = result.substring(0, startIdx) + result.substring(endIdx + 1);
        // Don't advance searchFrom — re-check from same position
      } else {
        searchFrom = startIdx + pattern.length;
      }
    }
  }
  
  // Also strip standalone tool result JSON objects that leaked through
  // Pattern: {"url": "...", "textContent": "..."} or {"path": "...", "content": "..."}
  const toolResultPatterns = [
    /\{"url"\s*:\s*"[^"]*"\s*,\s*"(textContent|title|description|fetched)"\s*:[^}]*(?:\{[^}]*\}[^}]*)*\}/g,
    /\{"path"\s*:\s*"[^"]*"\s*,\s*"(content|files|written|replacements)"\s*:[^}]*(?:\{[^}]*\}[^}]*)*\}/g,
    /\{"query"\s*:\s*"[^"]*"\s*,\s*"(results|source)"\s*:[^}]*(?:\{[^}]*\}[^}]*)*\}/g,
    /\{"expression"\s*:\s*"[^"]*"\s*,\s*"result"\s*:[^}]*(?:\{[^}]*\}[^}]*)*\}/g,
  ];
  for (const pattern of toolResultPatterns) {
    result = result.replace(pattern, "");
  }
  
  return result;
}

const STANDARD_PROMPTS = [
  { title: "💡 Explain Code", content: "Can you explain this code in detail and break down how it works?" },
  { title: "🧪 Write Unit Tests", content: "Please write robust unit tests for this code using standard best practices." },
  { title: "♻️ Refactor Code", content: "How would you refactor this code to make it more elegant, clean, and performant?" },
  { title: "🐞 Fix Bug", content: "I am experiencing an issue. Can you help me find the bug in this code and fix it?" },
  { title: "🚀 Optimize Performance", content: "Can you optimize this code for maximum efficiency and speed?" },
  { title: "📚 Document Code", content: "Please add clear, concise, and helpful docstrings/comments to this code." }
];

export function ChatInput() {
  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [codeRunnerOpen, setCodeRunnerOpen] = useState(false);
  const [consensusOpen, setConsensusOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [schedulerOpen, setSchedulerOpen] = useState(false);
  const [whatsappOpen, setWhatsappOpen] = useState(false);
  const [runnerOpen, setRunnerOpen] = useState(false);

  const {
    activeConversationId,
    addConversation,
    addMessage,
    appendStreamingContent,
    clearStreamingContent,
    setStreamingContent,
    messages,
  } = useChatStore();
  const uiStore = useUIStore();
  const { settings } = useSettingsStore();
  const { activeAgentId } = useAgentStore();
  const { prompts } = usePromptStore();
  const activeConversation = useChatStore.getState().getActiveConversation();

  const allPrompts = [...prompts.map(p => ({ title: `⭐ ${p.title}`, content: p.content })), ...STANDARD_PROMPTS];

  const promptsScrollRef = useRef<HTMLDivElement>(null);
  const scrollPrompts = (direction: "left" | "right") => {
    if (promptsScrollRef.current) {
      const amount = direction === "left" ? -200 : 200;
      promptsScrollRef.current.scrollBy({ left: amount, behavior: "smooth" });
    }
  };

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      textarea.style.height = Math.min(textarea.scrollHeight, 200) + "px";
    }
  }, [input]);

  const handleSend = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed && attachments.length === 0) return;
    if (uiStore.isGenerating) return;

    let convId = activeConversationId;
    const model = activeConversation?.model || settings.defaultModel;
    const systemPrompt = activeConversation?.systemPrompt || settings.systemPrompt || undefined;

    // Create conversation if none active
    if (!convId) {
      try {
        const res = await fetch("/api/conversations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: trimmed.substring(0, 60) || "New Chat",
            model,
            systemPrompt: systemPrompt || null,
          }),
        });
        const newConv = await res.json();
        convId = newConv.id;
        addConversation(newConv);
        useChatStore.getState().setActiveConversationId(convId);
      } catch {
        return;
      }
    }

    // Save user message (include file references in content for display)
    const fileNames = attachments.map(a => a.name).join(", ");
    const displayContent = trimmed || (fileNames ? `[Attached: ${fileNames}]` : "");
    
    const userMessage = {
      id: crypto.randomUUID(),
      conversationId: convId!,
      role: "user" as const,
      content: displayContent,
      attachments: attachments.length > 0 ? JSON.stringify(attachments) : null,
      metadata: null,
      edited: false,
      createdAt: new Date().toISOString(),
    };

    try {
      const res = await fetch(`/api/conversations/${convId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role: "user",
          content: displayContent,
          agentId: activeAgentId,
          attachments: attachments.length > 0 ? attachments : undefined,
        }),
      });
      if (!res.ok) throw new Error("Failed to save user message");
      const savedMsg = await res.json();
      addMessage(savedMsg);
    } catch {
      addMessage(userMessage);
    }

    // Clear input
    setInput("");
    setAttachments([]);
    uiStore.setIsGenerating(true);
    abortRef.current = false;

    try {
      const history = useChatStore.getState().messages.map((m) => {
        const msg: any = { role: m.role, content: m.content };
        // Include reasoning_content from metadata for DeepSeek thinking models
        // This is required by the API: "reasoning_content in thinking mode must be passed back"
        try {
          const meta = m.metadata ? (typeof m.metadata === 'string' ? JSON.parse(m.metadata) : m.metadata) : null;
          if (meta?.reasoning_content) {
            msg.reasoning_content = meta.reasoning_content;
          }
        } catch {}
        return msg;
      });

      const response = await fetch("/api/gemini/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: optimizeRequest(trimmed, model).optimizedPrompt,
          model,
          systemPrompt,
          agentId: activeAgentId,
          conversationHistory: history,
          files: attachments,
          apiKey: settings.apiKey || undefined,
          workspacePath: settings.workspacePath || "",
        }),
      });

      if (!response.ok) throw new Error("Failed to send message");

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let fullContent = "";

      let collectedToolCalls: any[] = [];

      while (reader && !abortRef.current) {
        const { done, value } = await reader.read();
        if (done) break;
        const text = decoder.decode(value, { stream: true });
        const lines = text.split("\n");

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.type === "chunk") {
                fullContent += data.content;
                setStreamingContent(fullContent);
                // Use the robust stripToolCallXml from tools.ts instead of fragile regexes
                // It properly handles nested JSON, XML tags, and code blocks
                let cleanContent = stripToolCallXml(fullContent)
                  .replace(/⚙️\s*\*\*\[Executed System Action\]\*\*:[\s\S]*?```/g, "")
                  .replace(/\n{3,}/g, "\n\n")
                  .trim();
                // Use robust brace-matching to strip tool call JSON that survived stripToolCallXml
                cleanContent = stripToolCallJson(cleanContent);
                // Strip tool result JSON objects that leak through
                cleanContent = cleanContent.replace(/\{"(url|path|query|expression|stdout|error)"\s*:[^}]*(?:\{[^}]*\}[^}]*)*\}/g, "");
                cleanContent = cleanContent.replace(/\n{3,}/g, "\n\n").trim();
                // Only detect artifacts in non-tool-execution content
                const isToolExecution = cleanContent.includes('⚙️') || cleanContent.includes('[Executed System Action]');
                // Skip artifact detection if content is just tool call data
                const isJustToolData = cleanContent.trim().startsWith('{"name":') || 
                  cleanContent.trim().startsWith('{"url":') ||
                  cleanContent.trim().startsWith('{"path":') ||
                  cleanContent.trim().startsWith('{"query":') ||
                  cleanContent.trim().startsWith('{"expression":') ||
                  cleanContent.trim().startsWith('Tool:') ||
                  cleanContent.trim().length < 20;
                const detected = (isToolExecution || isJustToolData) ? null : detectArtifact(cleanContent, data.content);
                if (!isToolExecution && shouldAutoOpen(detected, cleanContent.length)) {
                  const store = useArtifactPreviewStore.getState();
                  if (!store.isOpen) {
                    const previewTab = {
                      id: `auto-${Date.now()}`,
                      title: detected!.title,
                      type: detected!.type,
                      content: cleanContent,
                      isPinned: false,
                      isStreaming: true,
                      createdAt: Date.now(),
                    };
                    store.addTab(previewTab);
                  } else {
                    const active = store.tabs.find(t => t.id === store.activeTabId);
                    if (active) {
                      store.updateTab(active.id, { content: cleanContent, isStreaming: true });
                    }
                  }
                }
              } else if (data.type === "tool_call") {
                const { setStreamingContent } = useChatStore.getState();
                setStreamingContent(fullContent + `\n\n*Running tool: ${data.toolName}...*`);
              } else if (data.type === "tool_result") {
                useChatStore.getState().setStreamingContent(fullContent);
                collectedToolCalls.push({
                  name: data.toolName,
                  result: data.result,
                  status: data.status,
                  timestamp: data.timestamp,
                });
                const resultStr = typeof data.result === "string" ? data.result : JSON.stringify(data.result);
                const fileMatch = resultStr.match(/(\S+\.(docx|pdf|xlsx|pptx|csv|png|jpg|svg|html))\b/i);
                const isBrowser = data.toolName === "agent-browser" || resultStr.includes("playwright") || resultStr.includes("browser_context") || resultStr.includes("Page opened");
                
                // Handle web_fetch results — create a website preview artifact
                if (data.toolName === "web_fetch" && data.status === "success") {
                  try {
                    const fetchResult = JSON.parse(resultStr);
                    if (fetchResult.textContent || fetchResult.title) {
                      const store = useArtifactPreviewStore.getState();
                      const existing = store.tabs.find(t => t.id === store.activeTabId);
                      const websiteTab = {
                        title: fetchResult.title || fetchResult.url || "Website Preview",
                        type: "website" as const,
                        content: resultStr, // Keep raw JSON for WebsiteView to parse
                        metadata: { url: fetchResult.url, title: fetchResult.title, description: fetchResult.description, indicators: fetchResult.indicators },
                        isStreaming: false,
                      };
                      if (existing) {
                        store.updateTab(existing.id, websiteTab);
                      } else {
                        store.addTab({
                          id: `website-${Date.now()}`,
                          ...websiteTab,
                          isPinned: false,
                          createdAt: Date.now(),
                        });
                      }
                    }
                  } catch {}
                }
                
                if (isBrowser && data.status === "success") {
                  const store = useArtifactPreviewStore.getState();
                  store.addTab({
                    id: `browser-${Date.now()}`,
                    title: "Browser Preview",
                    type: "code",
                    content: resultStr,
                    isPinned: false,
                    isStreaming: false,
                    createdAt: Date.now(),
                  });
                }
                if (fileMatch && data.status === "success") {
                  let fileName = fileMatch[1];
                  fileName = fileName.replace(/^.*[\\\/]/, "").replace(/\r/g, "");
                  const ext = fileMatch[2].toLowerCase();
                  let cleanText = "";
                  const jsonMatch = resultStr.match(/"stdout"\s*:\s*"((?:[^"\\]|\\[\\\/bfnrt"]|\\u[0-9a-fA-F]{4})*)"/);
                  if (jsonMatch) {
                    cleanText = jsonMatch[1]
                      .replace(/\\r\\n/g, "\n")
                      .replace(/\\r/g, "")
                      .replace(/\\n/g, "\n")
                      .replace(/\\"/g, '"')
                      .replace(/\\u([0-9a-fA-F]{4})/g, (_, c) => String.fromCharCode(parseInt(c, 16)))
                      .trim();
                  }
                  const store = useArtifactPreviewStore.getState();
                  const existing = store.tabs.find(t => t.id === store.activeTabId);
                  if (existing) {
                    store.updateTab(existing.id, {
                      title: fileName,
                      type: ext === "xlsx" || ext === "csv" ? "spreadsheet" : ext === "pptx" ? "presentation" : ext === "docx" ? "document" : "code",
                      content: cleanText || fullContent,
                      isStreaming: false,
                    });
                  } else {
                    store.addTab({
                      id: `file-${Date.now()}`,
                      title: fileName,
                      type: ext === "xlsx" || ext === "csv" ? "spreadsheet" : ext === "pptx" ? "presentation" : ext === "docx" ? "document" : "code",
                      content: cleanText || fullContent,
                      isPinned: false,
                      isStreaming: false,
                      createdAt: Date.now(),
                    });
                  }
                }
              } else if (data.type === "done") {
                clearStreamingContent();
                const store = useArtifactPreviewStore.getState();
                const active = store.tabs.find(t => t.id === store.activeTabId);
                if (active) {
                  let cleanContent = stripToolCallXml(fullContent)
                    .replace(/⚙️\s*\*\*\[Executed System Action\]\*\*:[\s\S]*?```/g, "")
                    .replace(/\n{3,}/g, "\n\n")
                    .trim();
                  // Use robust brace-matching to strip tool call JSON that survived stripToolCallXml
                  cleanContent = stripToolCallJson(cleanContent);
                  cleanContent = cleanContent.replace(/\{"(url|path|query|expression|stdout|error)"\s*:[^}]*(?:\{[^}]*\}[^}]*)*\}/g, "");
                  cleanContent = cleanContent.replace(/\n{3,}/g, "\n\n").trim();
                  store.updateTab(active.id, { content: cleanContent, isStreaming: false });
                }
                try {
                  const res = await fetch(`/api/conversations/${convId}/messages`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      role: "assistant",
                      content: fullContent,
                      agentId: activeAgentId,
                      metadata: { model, duration: data.duration, tokens: data.tokens, cost: data.cost, ...(data.reasoningContent ? { reasoning_content: data.reasoningContent } : {}) },
                      toolCalls: data.toolCalls || collectedToolCalls,
                    }),
                  });
                  if (!res.ok) throw new Error("Failed to save assistant message");
                  const assistantMsg = await res.json();
                  addMessage(assistantMsg);
                } catch {
                  addMessage({
                    id: crypto.randomUUID(),
                    conversationId: convId!,
                    role: "assistant",
                    content: fullContent,
                    attachments: null,
                    metadata: null,
                    createdAt: new Date().toISOString(),
                  });
                }
              } else if (data.type === "error") {
                clearStreamingContent();
                addMessage({
                  id: crypto.randomUUID(),
                  conversationId: convId!,
                  role: "assistant",
                  content: `**Error:** ${data.error}`,
                  attachments: null,
                  metadata: null,
                  createdAt: new Date().toISOString(),
                });
              }
            } catch {}
          }
        }
      }

      // Handle abort
      if (abortRef.current) {
        clearStreamingContent();
        if (fullContent) {
          addMessage({
            id: crypto.randomUUID(),
            conversationId: convId!,
            role: "assistant",
            content: fullContent + "\n\n*[Generation stopped]*",
            attachments: null,
            metadata: null,
            edited: false,
            createdAt: new Date().toISOString(),
          });
        }
      }
    } catch (error) {
      clearStreamingContent();
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      addMessage({
        id: crypto.randomUUID(),
        conversationId: convId!,
        role: "assistant",
        content: `**Error:** Failed to get response. ${errorMsg}`,
        attachments: null,
        metadata: null,
        edited: false,
        createdAt: new Date().toISOString(),
      });
    } finally {
      uiStore.setIsGenerating(false);
    }
  }, [input, attachments, activeConversationId, messages, settings, uiStore, activeConversation]);

  const handleStop = () => {
    abortRef.current = true;
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && settings.sendOnEnter) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);
    const formData = new FormData();
    for (let i = 0; i < files.length; i++) {
      formData.append("files", files[i]);
    }

    try {
      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (data.files) {
        setAttachments((prev) => [...prev, ...data.files]);
        toast.success(`${files.length} file(s) attached successfully`);
      } else {
        toast.error("Failed to upload files");
      }
    } catch {
      toast.error("Error uploading files");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const removeAttachment = (index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  return (
    <TooltipProvider delayDuration={300}>
      <div className="border-t border-border bg-card/30 backdrop-blur-sm">
        <div className="max-w-3xl mx-auto w-full px-4 py-3">
          {/* Horizontal Scrolling Quick Prompts Bar */}
          <div className="flex items-center gap-1 mb-1.5 border-b border-border/40 pb-1.5 select-none relative group/prompts">
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 shrink-0 rounded-full hover:bg-primary/10 hover:text-primary"
              onClick={() => scrollPrompts("left")}
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <div 
              ref={promptsScrollRef}
              className="flex-1 flex items-center gap-1.5 overflow-x-auto scrollbar-none scroll-smooth"
            >
              {allPrompts.map((p, idx) => (
                <Button
                  key={idx}
                  variant="outline"
                  size="sm"
                  className="h-7 px-2.5 text-[11px] rounded-full shrink-0 font-medium bg-background/50 hover:bg-primary/10 hover:text-primary transition-all duration-200 border-border/60 hover:border-primary/20"
                  onClick={() => {
                    setInput((prev) => (prev ? prev + "\n" + p.content : p.content));
                    textareaRef.current?.focus();
                  }}
                >
                  {p.title}
                </Button>
              ))}
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 shrink-0 rounded-full hover:bg-primary/10 hover:text-primary"
              onClick={() => scrollPrompts("right")}
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>

          {/* Attachments Preview */}
          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-2">
              {attachments.map((att, i) => (
                <div
                  key={i}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-muted text-xs"
                >
                  <FileText className="h-3 w-3 text-muted-foreground" />
                  <span className="truncate max-w-[120px]">{att.name}</span>
                  <button
                    onClick={() => removeAttachment(i)}
                    className="ml-1 hover:text-destructive"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Input Area */}
          <div className="flex items-end gap-2">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={handleFileUpload}
            />

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 shrink-0"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading || uiStore.isGenerating}
                >
                  <Paperclip className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">Attach files</TooltipContent>
            </Tooltip>

            <VoiceInput
              onTranscript={(text) =>
                setInput((prev) => (prev ? prev + " " + text : text))
              }
              disabled={uiStore.isGenerating}
            />

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 shrink-0"
                  onClick={() => setCodeRunnerOpen(true)}
                >
                  <Play className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">Code runner</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className={cn("h-9 w-9 shrink-0", searchOpen && "text-primary")}
                  onClick={() => setSearchOpen(!searchOpen)}
                >
                  <Globe className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">Search web</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className={cn("h-9 w-9 shrink-0", consensusOpen && "text-primary")}
                  onClick={() => setConsensusOpen(true)}
                >
                  <GitCompare className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">Compare models</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className={cn("h-9 w-9 shrink-0", schedulerOpen && "text-primary")}
                  onClick={() => setSchedulerOpen(true)}
                >
                  <CalendarClock className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">Scheduled tasks</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className={cn("h-9 w-9 shrink-0", whatsappOpen && "text-primary")}
                  onClick={() => setWhatsappOpen(true)}
                >
                  <MessageCircle className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">WhatsApp</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className={cn("h-9 w-9 shrink-0", runnerOpen && "text-primary")}
                  onClick={() => setRunnerOpen(true)}
                >
                  <Zap className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">Agent runner</TooltipContent>
            </Tooltip>

            <div className="flex-1 relative">
              <Textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Message Gemini..."
                className="chat-input min-h-[40px] max-h-[200px] resize-none rounded-xl px-4 py-2.5 text-sm bg-background border-border pr-12"
                rows={1}
                disabled={uiStore.isGenerating}
              />
            </div>

            {uiStore.isGenerating ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="destructive"
                    size="icon"
                    className="h-9 w-9 shrink-0 rounded-xl"
                    onClick={handleStop}
                  >
                    <Square className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top">Stop generation</TooltipContent>
              </Tooltip>
            ) : (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="icon"
                    className="h-9 w-9 shrink-0 rounded-xl"
                    onClick={handleSend}
                    disabled={!input.trim() && attachments.length === 0}
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top">Send message (Enter)</TooltipContent>
              </Tooltip>
            )}
          </div>

          <div className="flex items-center justify-center mt-1.5">
            <p className="text-[10px] text-muted-foreground/60">
              {settings.sendOnEnter ? "Enter to send, Shift+Enter for new line" : "Ctrl+Enter to send"}
            </p>
          </div>
        </div>

        <SearchPanel
          open={searchOpen}
          onClose={() => setSearchOpen(false)}
        />

        <SchedulerPanel
          open={schedulerOpen}
          onOpenChange={setSchedulerOpen}
        />

        <AgentRunnerPanel
          open={runnerOpen}
          onOpenChange={setRunnerOpen}
          prefillAgentId={activeAgentId}
        />

        <ModelConsensus
          open={consensusOpen}
          onOpenChange={setConsensusOpen}
        />

        <WhatsAppPanel
          open={whatsappOpen}
          onOpenChange={setWhatsappOpen}
        />

        <CodeRunner open={codeRunnerOpen} onOpenChange={setCodeRunnerOpen} />
      </div>
    </TooltipProvider>
  );
}

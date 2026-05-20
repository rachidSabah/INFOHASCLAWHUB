"use client";

import { PowerToolHint } from "./PowerToolHint";
import { useState, useRef, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Terminal,
  Bot,
  Send,
  Loader2,
  Folder,
  GitBranch,
  Play,
  Trash2,
  Lightbulb,
  Wrench,
  History,
  MessageSquare,
  Sparkles,
  AlertTriangle,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ──────────────────────────────────────────────────────

interface CommandEntry {
  id: string;
  cwd: string;
  command: string;
  stdout: string;
  stderr: string;
  code: number;
  timestamp: number;
  aiAnnotation?: string;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  relatedCommandId?: string;
}

interface AIPairTerminalPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultCwd?: string;
}

// ─── Quick Commands ─────────────────────────────────────────────

const QUICK_COMMANDS = [
  { label: "ls", cmd: "ls", icon: Folder },
  { label: "git status", cmd: "git status", icon: GitBranch },
  { label: "npm run dev", cmd: "npm run dev", icon: Play },
  { label: "npm test", cmd: "npm test", icon: Play },
  { label: "clear", cmd: "clear", icon: Trash2 },
];

// ─── Helpers ────────────────────────────────────────────────────

function generateId(): string {
  return Math.random().toString(36).slice(2, 10);
}

function hasError(entry: CommandEntry): boolean {
  return entry.code !== 0 || entry.stderr.length > 0;
}

function getRelativeTime(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60000) return "just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
}

// ─── Component ──────────────────────────────────────────────────

export function AIPairTerminalPanel({
  open,
  onOpenChange,
  defaultCwd = "",
}: AIPairTerminalPanelProps) {
  // ── Terminal State ──
  const [commandHistory, setCommandHistory] = useState<CommandEntry[]>([]);
  const [commandText, setCommandText] = useState("");
  const [cwd, setCwd] = useState(defaultCwd);
  const [executing, setExecuting] = useState(false);
  const [cmdStack, setCmdStack] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  // ── AI Chat State ──
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [aiInput, setAiInput] = useState("");
  const [aiLoading, setAiLoading] = useState(false);

  // ── Command History Panel ──
  const [showHistory, setShowHistory] = useState(false);

  // ── Refs ──
  const terminalEndRef = useRef<HTMLDivElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const cmdInputRef = useRef<HTMLInputElement>(null);

  // ── Auto-scroll ──
  useEffect(() => {
    if (terminalEndRef.current) {
      terminalEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [commandHistory]);

  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [chatMessages]);

  // ── Execute Command ──
  const executeCommand = useCallback(
    async (cmd: string) => {
      const trimmed = cmd.trim();
      if (!trimmed) return;

      if (trimmed === "clear") {
        setCommandHistory([]);
        setCommandText("");
        return;
      }

      setCmdStack((prev) => [...prev, trimmed]);
      setHistoryIndex(-1);
      setExecuting(true);

      const entryId = generateId();

      try {
        const res = await fetch("/api/local/cmd", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ command: trimmed, cwd }),
        });

        const data = await res.json();

        const entry: CommandEntry = {
          id: entryId,
          cwd,
          command: trimmed,
          stdout: data.stdout || "",
          stderr: data.stderr || "",
          code: data.code ?? 0,
          timestamp: Date.now(),
        };

        setCommandHistory((prev) => [...prev, entry]);

        // Handle cd command
        if (trimmed.toLowerCase().startsWith("cd ")) {
          const target = trimmed.slice(3).trim();
          if (target && !data.stderr && data.code === 0) {
            setCwd((prev) => {
              if (target === "..") {
                const parts = prev.split("/");
                return parts.length > 1 ? parts.slice(0, -1).join("/") || "/" : prev;
              }
              return target.startsWith("/") ? target : `${prev}/${target}`.replace(/\/+/g, "/");
            });
          }
        }
      } catch (err: any) {
        setCommandHistory((prev) => [
          ...prev,
          {
            id: entryId,
            cwd,
            command: trimmed,
            stdout: "",
            stderr: err.message || "Request failed",
            code: 1,
            timestamp: Date.now(),
          },
        ]);
      } finally {
        setExecuting(false);
        setCommandText("");
      }
    },
    [cwd]
  );

  // ── Terminal Input Handlers ──
  const handleCmdSubmit = () => {
    if (!commandText.trim() || executing) return;
    executeCommand(commandText);
  };

  const handleCmdKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleCmdSubmit();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (cmdStack.length > 0) {
        const newIdx = historyIndex < cmdStack.length - 1 ? historyIndex + 1 : historyIndex;
        setHistoryIndex(newIdx);
        setCommandText(cmdStack[cmdStack.length - 1 - newIdx]);
      }
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (historyIndex > 0) {
        const newIdx = historyIndex - 1;
        setHistoryIndex(newIdx);
        setCommandText(cmdStack[cmdStack.length - 1 - newIdx]);
      } else {
        setHistoryIndex(-1);
        setCommandText("");
      }
    }
  };

  // ── AI Chat ──
  const sendAIMessage = useCallback(
    async (message: string, context?: string) => {
      if (!message.trim()) return;

      const userMsg: ChatMessage = {
        id: generateId(),
        role: "user",
        content: message.trim(),
        timestamp: Date.now(),
      };
      setChatMessages((prev) => [...prev, userMsg]);
      setAiLoading(true);

      try {
        const lastCmd = commandHistory[commandHistory.length - 1];
        const res = await fetch("/api/quick-actions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: context || "ai_terminal_assistant",
            params: {
              question: message.trim(),
              terminalContext: {
                lastCommand: lastCmd
                  ? {
                      command: lastCmd.command,
                      stdout: lastCmd.stdout.slice(-500),
                      stderr: lastCmd.stderr.slice(-500),
                      exitCode: lastCmd.code,
                    }
                  : null,
                recentCommands: commandHistory.slice(-5).map((c) => ({
                  command: c.command,
                  exitCode: c.code,
                })),
                cwd,
              },
            },
          }),
        });

        if (res.ok) {
          const data = await res.json();
          const aiMsg: ChatMessage = {
            id: generateId(),
            role: "assistant",
            content: data.message || data.result || "I couldn't process that request.",
            timestamp: Date.now(),
            relatedCommandId: lastCmd?.id,
          };
          setChatMessages((prev) => [...prev, aiMsg]);
        } else {
          const aiMsg: ChatMessage = {
            id: generateId(),
            role: "assistant",
            content: "Sorry, I encountered an error processing your request. Please try again.",
            timestamp: Date.now(),
          };
          setChatMessages((prev) => [...prev, aiMsg]);
        }
      } catch {
        const aiMsg: ChatMessage = {
          id: generateId(),
          role: "assistant",
          content: "Failed to reach the AI service. Check your connection.",
          timestamp: Date.now(),
        };
        setChatMessages((prev) => [...prev, aiMsg]);
      } finally {
        setAiLoading(false);
      }
    },
    [commandHistory, cwd]
  );

  const handleAiSubmit = () => {
    if (!aiInput.trim() || aiLoading) return;
    sendAIMessage(aiInput);
    setAiInput("");
  };

  // ── AI Quick Actions ──
  const handleExplainLastCommand = () => {
    const lastCmd = commandHistory[commandHistory.length - 1];
    if (!lastCmd) {
      toast.error("No command to explain");
      return;
    }
    sendAIMessage(
      `Explain what this command does and its output:\n\`${lastCmd.command}\``,
      "explain_command"
    );
  };

  const handleSuggestFix = () => {
    const lastCmd = commandHistory[commandHistory.length - 1];
    if (!lastCmd || !hasError(lastCmd)) {
      toast.error("No error detected in the last command");
      return;
    }
    sendAIMessage(
      `The command \`${lastCmd.command}\` failed with exit code ${lastCmd.code}.\nError: ${lastCmd.stderr.slice(0, 300)}\n\nSuggest a fix.`,
      "suggest_fix"
    );
  };

  const handleNLToCommand = async () => {
    if (!aiInput.trim()) return;
    setAiLoading(true);
    try {
      const res = await fetch("/api/quick-actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "nl_to_command",
          params: {
            naturalLanguage: aiInput.trim(),
            cwd,
            os: "linux",
          },
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const command = data.data?.command || data.result || data.message;
        if (command) {
          setCommandText(command);
          toast.success("Command generated! Press Enter to execute.");
          cmdInputRef.current?.focus();
        }
      } else {
        toast.error("Failed to generate command");
      }
    } catch {
      toast.error("Failed to generate command");
    } finally {
      setAiLoading(false);
      setAiInput("");
    }
  };

  const lastCommand = commandHistory[commandHistory.length - 1];
  const lastCommandHasError = lastCommand ? hasError(lastCommand) : false;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-6xl max-h-[92vh] overflow-hidden flex flex-col" showCloseButton>
        <DialogHeader className="px-6 pt-6 pb-2">
          <DialogTitle className="flex items-center gap-2">
            <Terminal className="h-5 w-5" />
            AI Pair Terminal
          </DialogTitle>
          <DialogDescription>
            Terminal with AI assistance — explain commands, fix errors, and generate commands from natural language
          </DialogDescription>
        </DialogHeader>
          <PowerToolHint name="AI Pair Terminal" />

        {/* ── Split View ── */}
        <div className="flex flex-col md:flex-row flex-1 min-h-0 border-t">
          {/* ── Left: Terminal ── */}
          <div className="flex flex-col flex-1 min-w-0 border-r">
            {/* Terminal Header */}
            <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/30">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Terminal className="h-3.5 w-3.5" />
                <span className="font-mono truncate max-w-[200px]" title={cwd}>
                  {cwd || "No workspace"}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => setShowHistory(!showHistory)}
                  title="Command history"
                >
                  <History className="h-3 w-3" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => setCommandHistory([])}
                  title="Clear terminal"
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </div>

            {/* Command History Sidebar (toggle) */}
            {showHistory && (
              <div className="border-b bg-muted/20 max-h-[20vh]">
                <ScrollArea className="h-full">
                  <div className="p-2 space-y-1">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                        Command History
                      </span>
                      <Badge variant="secondary" className="text-[9px] h-4">
                        {commandHistory.length}
                      </Badge>
                    </div>
                    {commandHistory.length === 0 && (
                      <p className="text-[10px] text-muted-foreground py-2 text-center">
                        No commands yet
                      </p>
                    )}
                    {commandHistory.map((entry) => (
                      <button
                        key={entry.id}
                        type="button"
                        className="w-full text-left flex items-center gap-2 py-1 px-1.5 rounded text-[10px] hover:bg-muted/50 transition-colors"
                        onClick={() => {
                          setCommandText(entry.command);
                          cmdInputRef.current?.focus();
                        }}
                      >
                        <span className={cn(
                          "shrink-0",
                          entry.code === 0 ? "text-emerald-400" : "text-red-400"
                        )}>
                          {entry.code === 0 ? "✓" : "✗"}
                        </span>
                        <span className="font-mono truncate flex-1">{entry.command}</span>
                        <span className="text-muted-foreground shrink-0">
                          {getRelativeTime(entry.timestamp)}
                        </span>
                      </button>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            )}

            {/* Terminal Output */}
            <div className="flex-1 min-h-0 bg-zinc-950 dark:bg-zinc-950">
              <ScrollArea className="h-full">
                <div className="p-3 font-mono text-xs space-y-1 select-text text-zinc-200">
                  {commandHistory.length === 0 && (
                    <div className="text-zinc-500 py-8 text-center select-none">
                      <Terminal className="h-8 w-8 mx-auto mb-2 opacity-30" />
                      <p>AI Pair Terminal — type a command or ask the AI</p>
                      <p className="text-[10px] mt-1 text-zinc-600">
                        Try: &quot;deploy to staging&quot; or run commands directly
                      </p>
                    </div>
                  )}
                  {commandHistory.map((entry) => (
                    <div key={entry.id} className="space-y-0.5">
                      <div className="flex items-center gap-1.5 text-cyan-400">
                        <Folder className="h-3 w-3" />
                        <span className="text-[10px] opacity-70">{entry.cwd}</span>
                        <span className="text-white font-semibold">&gt;</span>
                        <span className="text-cyan-300">{entry.command}</span>
                      </div>
                      {entry.stdout && (
                        <pre className="whitespace-pre-wrap break-all text-emerald-400 pl-4 leading-relaxed">
                          {entry.stdout}
                        </pre>
                      )}
                      {entry.stderr && (
                        <pre className="whitespace-pre-wrap break-all text-red-400 pl-4 leading-relaxed">
                          {entry.stderr}
                        </pre>
                      )}
                      {entry.code !== 0 && (
                        <div className="text-[10px] text-red-500 pl-4">
                          Exit code: {entry.code}
                        </div>
                      )}
                      {entry.aiAnnotation && (
                        <div className="mt-1 ml-4 px-2 py-1 rounded bg-blue-500/10 border border-blue-500/20 text-blue-300 text-[10px]">
                          <Bot className="h-2.5 w-2.5 inline mr-1" />
                          {entry.aiAnnotation}
                        </div>
                      )}
                    </div>
                  ))}
                  {executing && (
                    <div className="flex items-center gap-1.5 text-zinc-500">
                      <span className="animate-pulse">Executing...</span>
                    </div>
                  )}
                  <div ref={terminalEndRef} />
                </div>
              </ScrollArea>
            </div>

            {/* Quick Commands */}
            <div className="p-2 border-t border-border/60 bg-muted/20">
              <div className="flex gap-1 flex-wrap mb-2">
                {QUICK_COMMANDS.map((qc) => {
                  const Icon = qc.icon;
                  return (
                    <Button
                      key={qc.label}
                      variant="outline"
                      size="sm"
                      className="h-6 text-[10px] px-2 gap-1 bg-background/50"
                      onClick={() => executeCommand(qc.cmd)}
                      disabled={executing}
                    >
                      <Icon className="h-2.5 w-2.5" />
                      {qc.label}
                    </Button>
                  );
                })}
              </div>

              {/* Command Input */}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleCmdSubmit();
                }}
                className="flex items-center gap-2"
              >
                <span className="text-cyan-400 font-mono text-xs font-bold shrink-0">&gt;</span>
                <Input
                  ref={cmdInputRef}
                  value={commandText}
                  onChange={(e) => setCommandText(e.target.value)}
                  onKeyDown={handleCmdKeyDown}
                  placeholder="Enter command..."
                  className="h-7 text-xs font-mono bg-background/70 border-border/50"
                  disabled={executing}
                  autoFocus
                />
                <Button
                  type="submit"
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 shrink-0"
                  disabled={executing || !commandText.trim()}
                >
                  <Play className="h-3.5 w-3.5" />
                </Button>
              </form>
            </div>
          </div>

          {/* ── Right: AI Chat ── */}
          <div className="flex flex-col flex-1 min-w-0">
            {/* AI Header */}
            <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/30">
              <div className="flex items-center gap-2 text-xs">
                <Bot className="h-3.5 w-3.5 text-primary" />
                <span className="font-medium">AI Assistant</span>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-6 text-[10px] px-2 gap-1"
                  onClick={handleExplainLastCommand}
                  disabled={!lastCommand || aiLoading}
                >
                  <Lightbulb className="h-2.5 w-2.5" />
                  Explain Last
                </Button>
                {lastCommandHasError && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-6 text-[10px] px-2 gap-1 border-yellow-500/30 text-yellow-400 hover:bg-yellow-500/10"
                    onClick={handleSuggestFix}
                    disabled={aiLoading}
                  >
                    <Wrench className="h-2.5 w-2.5" />
                    Suggest Fix
                  </Button>
                )}
              </div>
            </div>

            {/* AI Error Alert */}
            {lastCommandHasError && (
              <div className="px-3 py-2 border-b bg-red-500/5">
                <div className="flex items-center gap-2 text-xs text-red-400">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">
                    Last command exited with code {lastCommand.code}
                    {lastCommand.stderr && `: ${lastCommand.stderr.slice(0, 60)}`}
                  </span>
                  <Button
                    variant="link"
                    size="sm"
                    className="h-auto p-0 text-[10px] text-red-400 underline shrink-0"
                    onClick={handleSuggestFix}
                  >
                    Fix it
                  </Button>
                </div>
              </div>
            )}

            {/* Chat Messages */}
            <div className="flex-1 min-h-0 bg-background">
              <ScrollArea className="h-full">
                <div className="p-3 space-y-3">
                  {chatMessages.length === 0 && (
                    <div className="text-center py-8 text-muted-foreground">
                      <Sparkles className="h-8 w-8 mx-auto mb-2 opacity-20" />
                      <p className="text-sm font-medium">AI Pair Assistant</p>
                      <p className="text-xs mt-1 max-w-[240px] mx-auto">
                        Ask about terminal output, get explanations, or type a natural language
                        command like &quot;deploy to staging&quot;
                      </p>
                      <div className="mt-4 flex flex-col gap-1.5 max-w-[240px] mx-auto">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-[10px] gap-1.5"
                          onClick={handleExplainLastCommand}
                          disabled={!lastCommand || aiLoading}
                        >
                          <Lightbulb className="h-3 w-3" />
                          Explain last command
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-[10px] gap-1.5"
                          onClick={() => sendAIMessage("What should I do next?", "next_steps")}
                          disabled={aiLoading}
                        >
                          <MessageSquare className="h-3 w-3" />
                          What should I do next?
                        </Button>
                      </div>
                    </div>
                  )}

                  {chatMessages.map((msg) => (
                    <div
                      key={msg.id}
                      className={cn(
                        "rounded-lg p-3 text-sm",
                        msg.role === "user"
                          ? "bg-primary/5 border border-primary/10 ml-4"
                          : "bg-muted/30 border mr-4"
                      )}
                    >
                      <div className="flex items-center gap-1.5 mb-1.5">
                        {msg.role === "user" ? (
                          <span className="text-[10px] font-medium text-primary">You</span>
                        ) : (
                          <Bot className="h-3 w-3 text-primary" />
                        )}
                        <span className="text-[9px] text-muted-foreground ml-auto">
                          {getRelativeTime(msg.timestamp)}
                        </span>
                      </div>
                      <div className="whitespace-pre-wrap break-words text-xs leading-relaxed">
                        {msg.content}
                      </div>
                      {msg.role === "assistant" && msg.relatedCommandId && (
                        <div className="mt-2 flex items-center gap-1 text-[9px] text-muted-foreground">
                          <ChevronRight className="h-2.5 w-2.5" />
                          Related to command in terminal
                        </div>
                      )}
                    </div>
                  ))}

                  {aiLoading && (
                    <div className="rounded-lg p-3 bg-muted/30 border mr-4">
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        <span>AI is thinking...</span>
                      </div>
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </div>
              </ScrollArea>
            </div>

            {/* AI Input */}
            <div className="p-2 border-t bg-muted/20 space-y-2">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleAiSubmit();
                }}
                className="flex items-center gap-2"
              >
                <Input
                  value={aiInput}
                  onChange={(e) => setAiInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleAiSubmit();
                    }
                  }}
                  placeholder='Ask AI about terminal output or type "deploy to staging"...'
                  className="h-8 text-xs"
                  disabled={aiLoading}
                />
                <Button
                  type="submit"
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 shrink-0"
                  disabled={aiLoading || !aiInput.trim()}
                >
                  <Send className="h-3.5 w-3.5" />
                </Button>
              </form>

              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-6 text-[10px] px-2 gap-1 flex-1"
                  onClick={handleNLToCommand}
                  disabled={aiLoading || !aiInput.trim()}
                >
                  <Sparkles className="h-2.5 w-2.5" />
                  Generate Command
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-6 text-[10px] px-2 gap-1 flex-1"
                  onClick={handleExplainLastCommand}
                  disabled={!lastCommand || aiLoading}
                >
                  <Lightbulb className="h-2.5 w-2.5" />
                  Explain
                </Button>
                {lastCommandHasError && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-6 text-[10px] px-2 gap-1 flex-1 border-yellow-500/30 text-yellow-400 hover:bg-yellow-500/10"
                    onClick={handleSuggestFix}
                    disabled={aiLoading}
                  >
                    <Wrench className="h-2.5 w-2.5" />
                    Fix Error
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

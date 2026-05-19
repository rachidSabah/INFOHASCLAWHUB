"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useSettingsStore } from "@/lib/stores";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { Terminal, Trash2, Folder, GitBranch, Play } from "lucide-react";

interface CommandEntry {
  id: number;
  cwd: string;
  command: string;
  stdout: string;
  stderr: string;
  code: number;
}

const QUICK_COMMANDS = [
  { label: "dir", cmd: "dir" },
  { label: "git status", cmd: "git status" },
  { label: "npm run dev", cmd: "npm run dev" },
];

export function TerminalPanel() {
  const { settings } = useSettingsStore();
  const [history, setHistory] = useState<CommandEntry[]>([]);
  const [commandText, setCommandText] = useState("");
  const [cwd, setCwd] = useState<(string | null)[]>([]);
  const [executing, setExecuting] = useState(false);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [commandStack, setCommandStack] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const nextId = useRef(0);

  const resolvedCwd = cwd[cwd.length - 1] || settings.workspacePath || "";

  useEffect(() => {
    if (settings.workspacePath) {
      setCwd([settings.workspacePath]);
    }
  }, [settings.workspacePath]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [history]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === "l") {
        e.preventDefault();
        setHistory([]);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const executeCommand = useCallback(
    async (cmd: string, displayCwd: string) => {
      const trimmed = cmd.trim();
      if (!trimmed) return;

      setCommandStack((prev) => [...prev, trimmed]);
      setHistoryIndex(-1);
      setExecuting(true);

      try {
        const res = await fetch("/api/local/cmd", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ command: trimmed, cwd: displayCwd }),
        });

        const data = await res.json();

        const entry: CommandEntry = {
          id: nextId.current++,
          cwd: displayCwd,
          command: trimmed,
          stdout: data.stdout || "",
          stderr: data.stderr || "",
          code: data.code ?? 0,
        };

        setHistory((prev) => [...prev, entry]);

        if (trimmed.toLowerCase().startsWith("cd ")) {
          const target = trimmed.slice(3).trim();
          if (target && !data.stderr && data.code === 0) {
            setCwd((prev) => {
              const resolved = target === ".."
                ? prev.length > 1 ? prev[prev.length - 2] : prev[0]
                : target;
              return [...prev, resolved || target];
            });
          }
        }
      } catch (err: any) {
        setHistory((prev) => [
          ...prev,
          {
            id: nextId.current++,
            cwd: displayCwd,
            command: trimmed,
            stdout: "",
            stderr: err.message || "Request failed",
            code: 1,
          },
        ]);
      } finally {
        setExecuting(false);
      }
    },
    []
  );

  const handleSubmit = () => {
    if (!commandText.trim() || executing) return;
    const cmd = commandText;
    setCommandText("");
    executeCommand(cmd, resolvedCwd);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSubmit();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (commandStack.length > 0) {
        const newIdx = historyIndex < commandStack.length - 1 ? historyIndex + 1 : historyIndex;
        setHistoryIndex(newIdx);
        setCommandText(commandStack[commandStack.length - 1 - newIdx]);
      }
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (historyIndex > 0) {
        const newIdx = historyIndex - 1;
        setHistoryIndex(newIdx);
        setCommandText(commandStack[commandStack.length - 1 - newIdx]);
      } else {
        setHistoryIndex(-1);
        setCommandText("");
      }
    }
  };

  const clearHistory = () => setHistory([]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border/60 bg-background/50">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Terminal className="h-3.5 w-3.5" />
          <span className="font-mono truncate max-w-[180px]" title={resolvedCwd}>
            {resolvedCwd || "No workspace set"}
          </span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={clearHistory}
          title="Clear terminal"
        >
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>

      <div className="flex-1 min-h-0">
        <ScrollArea className="h-full">
          <div ref={scrollRef} className="p-3 pb-2 font-mono text-xs space-y-1 select-text">
            {history.length === 0 && (
              <div className="text-muted-foreground py-8 text-center select-none">
                <Terminal className="h-8 w-8 mx-auto mb-2 opacity-30" />
                <p>Type a command to get started</p>
                <p className="text-[10px] mt-1">Ctrl+L to clear</p>
              </div>
            )}
            {history.map((entry) => (
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
              </div>
            ))}
            {executing && (
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <span className="animate-pulse">Executing...</span>
              </div>
            )}
          </div>
        </ScrollArea>
      </div>

      <div className="p-2 border-t border-border/60 space-y-2">
        <div className="flex gap-1 flex-wrap">
          {QUICK_COMMANDS.map((qc) => (
            <Button
              key={qc.label}
              variant="outline"
              size="sm"
              className="h-6 text-[10px] px-2 gap-1 bg-background/50"
              onClick={() => executeCommand(qc.cmd, resolvedCwd)}
              disabled={executing}
            >
              {qc.label === "dir" && <Folder className="h-2.5 w-2.5" />}
              {qc.label === "git status" && <GitBranch className="h-2.5 w-2.5" />}
              {qc.label === "npm run dev" && <Play className="h-2.5 w-2.5" />}
              {qc.label}
            </Button>
          ))}
          <Button
            variant="outline"
            size="sm"
            className="h-6 text-[10px] px-2 bg-background/50"
            onClick={clearHistory}
          >
            clear
          </Button>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSubmit();
          }}
          className="flex items-center gap-2"
        >
          <span className="text-cyan-400 font-mono text-xs font-bold shrink-0">&gt;</span>
          <Input
            ref={inputRef}
            value={commandText}
            onChange={(e) => setCommandText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Enter command..."
            className="h-7 text-xs font-mono bg-background/70 border-border/50"
            disabled={executing}
            autoFocus
          />
        </form>
      </div>
    </div>
  );
}

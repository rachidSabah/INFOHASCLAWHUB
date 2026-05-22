"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useArtifactPreviewStore, type PreviewTab } from "@/lib/artifact-store";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  X, Download, Copy, Code2, Eye, ChevronLeft, ChevronRight, ExternalLink, Maximize2, Minimize2, ArrowLeft,
} from "lucide-react";
import SandboxPreview from "./SandboxPreview";
import { toast } from "sonner";

const PANEL_WIDTH = "55vw";

function getLanguage(tab: PreviewTab): string {
  const c = tab.content || "";
  if (c.includes("<!DOCTYPE") || c.includes("<html")) return "html";
  if (c.includes("import React") || c.includes("useState") || c.includes("export default")) return "jsx";
  if (c.includes("import ") && c.includes("from ")) return "typescript";
  if (/def |print\(|import \w+/.test(c)) return "python";
  if (/func |package main/.test(c)) return "go";
  if (/function|const |let |var /.test(c)) return "javascript";
  return "text";
}

function extractPureCode(content: string): string {
  const match = content.match(/```[\w]*\n([\s\S]*?)```/);
  return match?.[1]?.trim() || content.trim();
}

function hasPreview(tab: PreviewTab): boolean {
  const c = tab.content || "";
  return c.includes("<!DOCTYPE") || c.includes("<html") || tab.type === "html" || tab.type === "code";
}

function CodeView({ tab }: { tab: PreviewTab }) {
  const code = extractPureCode(tab.content);
  const lines = code.split("\n");
  const lang = getLanguage(tab);

  return (
    <div className="flex h-full bg-[#1e1e1e] overflow-hidden">
      <div className="w-10 shrink-0 bg-[#1e1e1e] text-right pr-2 py-3 font-mono text-[11px] text-gray-600 select-none overflow-hidden">
        {lines.map((_, i) => (
          <div key={i} className="leading-5 h-5">{i + 1}</div>
        ))}
      </div>
      <div className="flex-1 overflow-auto">
        <pre className="font-mono text-[13px] leading-5 p-3 text-[#d4d4d4] whitespace-pre-wrap break-words min-h-full">
          <code className={`language-${lang}`}>{code}</code>
        </pre>
      </div>
    </div>
  );
}

function PreviewView({ tab }: { tab: PreviewTab }) {
  const code = extractPureCode(tab.content);
  if (code.includes("<!DOCTYPE") || code.includes("<html")) {
    return (
      <iframe
        className="w-full h-full border-0 bg-white"
        srcDoc={code}
        sandbox="allow-scripts allow-same-origin"
        title={tab.title}
      />
    );
  }
  return <SandboxPreview code={code} type={hasPreview(tab) ? "html" : "code"} />;
}

export default function ArtifactPreviewPanel() {
  const {
    isOpen, tabs, activeTabId, isFullscreen, width,
    setOpen, setWidth, setActiveTab, removeTab,
    setFullscreen, closeAll,
  } = useArtifactPreviewStore();

  const [activeView, setActiveView] = useState<"code" | "preview">("code");
  const [history, setHistory] = useState<string[]>([]);
  const [historyIdx, setHistoryIdx] = useState(-1);
  const panelRef = useRef<HTMLDivElement>(null);

  const activeTab = tabs.find((t) => t.id === activeTabId) || null;
  const showPreviewTab = activeTab ? hasPreview(activeTab) : false;

  useEffect(() => { if (activeTabId) setActiveView("code"); }, [activeTabId]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        if (isFullscreen) setFullscreen(false);
        else setOpen(false);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [isOpen, isFullscreen, setOpen, setFullscreen]);

  useEffect(() => {
    if (activeTabId && activeTabId !== history[historyIdx]) {
      setHistory(prev => [...prev.slice(0, historyIdx + 1), activeTabId]);
      setHistoryIdx(prev => prev + 1);
    }
  }, [activeTabId]);

  const navigateHistory = (dir: number) => {
    const newIdx = historyIdx + dir;
    if (newIdx >= 0 && newIdx < history.length) {
      setHistoryIdx(newIdx);
      setActiveTab(history[newIdx]);
    }
  };

  const handleCopy = () => {
    if (!activeTab) return;
    navigator.clipboard.writeText(extractPureCode(activeTab.content));
    toast.success("Copied to clipboard");
  };

  const handleDownload = () => {
    if (!activeTab) return;
    const code = extractPureCode(activeTab.content);
    const ext = getLanguage(activeTab);
    const extMap: Record<string, string> = { html: "html", jsx: "jsx", typescript: "ts", javascript: "js", python: "py", go: "go", text: "txt" };
    const filename = `${activeTab.title.replace(/[^a-zA-Z0-9._-]/g, "_")}.${extMap[ext] || ext}`;
    const blob = new Blob([code], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
    toast.success("Downloaded " + filename);
  };

  if (!activeTab) return null;

  return (
    <>
      {isFullscreen && (
        <div className="fixed inset-0 z-50 bg-background flex flex-col">
          <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-card shrink-0 h-11">
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setFullscreen(false)}>
              <Minimize2 className="h-3.5 w-3.5 mr-1" /> Exit Fullscreen
            </Button>
            <div className="flex-1" />
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setOpen(false)}>
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
          <div className="flex-1 overflow-hidden">
            {activeView === "code" ? <CodeView tab={activeTab} /> : <PreviewView tab={activeTab} />}
          </div>
        </div>
      )}

      <div
        ref={panelRef}
        className={cn(
          "fixed top-0 right-0 h-full z-40 bg-background flex flex-col",
          "shadow-[-4px_0_24px_rgba(0,0,0,0.15)] border-l border-border",
          "md:relative md:shadow-none md:border-l md:border-border",
          isOpen ? "w-full md:shrink-0" : "translate-x-full md:hidden",
        )}
        style={{ width: isOpen ? (isFullscreen ? "100vw" : `min(${PANEL_WIDTH}, ${width}px)`) : 0, minWidth: isOpen ? 320 : 0, transition: "width 300ms ease-in-out, transform 300ms ease-in-out" }}
      >
        {/* Sticky Header */}
        <div className="flex items-center gap-2 px-3 h-11 border-b border-border bg-card shrink-0">
          <button onClick={() => setOpen(false)} className="md:hidden p-1 hover:bg-muted rounded">
            <ArrowLeft className="h-4 w-4" />
          </button>

          <div className="flex items-center gap-2 min-w-0 flex-1">
            <span className="text-sm font-semibold truncate text-primary">
              {activeTab.title || "Artifact"}
            </span>
          </div>

          <div className="flex items-center gap-0.5">
            <button
              onClick={() => navigateHistory(-1)}
              disabled={historyIdx <= 0}
              className="p-1 rounded hover:bg-muted disabled:opacity-30"
              title="Previous"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => navigateHistory(1)}
              disabled={historyIdx >= history.length - 1}
              className="p-1 rounded hover:bg-muted disabled:opacity-30"
              title="Next"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="flex items-center gap-0.5 bg-muted/50 rounded-lg p-0.5">
            <button
              onClick={() => setActiveView("code")}
              className={cn("flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-medium transition-colors", activeView === "code" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground")}
            >
              <Code2 className="h-3 w-3" /> Code
            </button>
            {showPreviewTab && (
              <button
                onClick={() => setActiveView("preview")}
                className={cn("flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-medium transition-colors", activeView === "preview" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground")}
              >
                <Eye className="h-3 w-3" /> Preview
              </button>
            )}
          </div>

          <div className="flex items-center gap-0.5">
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={handleCopy} title="Copy code">
              <Copy className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={handleDownload} title="Download">
              <Download className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setFullscreen(true)} title="Fullscreen">
              <Maximize2 className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setOpen(false)} title="Close (Esc)">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Tab bar for multiple artifacts */}
        {tabs.length > 1 && (
          <div className="flex items-center gap-0.5 px-2 py-1.5 border-b border-border/50 bg-muted/10 overflow-x-auto scrollbar-none shrink-0">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-medium transition-colors shrink-0 max-w-[140px]",
                  activeTabId === tab.id ? "bg-primary/10 text-primary border border-primary/20" : "hover:bg-muted text-muted-foreground border border-transparent"
                )}
              >
                <span className="truncate">{tab.title.slice(0, 25)}</span>
                {tab.isStreaming && <span className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse shrink-0" />}
                <span onClick={(e) => { e.stopPropagation(); removeTab(tab.id); }} className="ml-0.5 hover:bg-destructive/10 rounded p-0.5 shrink-0 cursor-pointer">
                  <X className="h-2.5 w-2.5" />
                </span>
              </button>
            ))}
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-hidden">
          {activeView === "code" ? <CodeView tab={activeTab} /> : <PreviewView tab={activeTab} />}
        </div>
      </div>

      {/* Overlay for mobile */}
      {isOpen && <div className="fixed inset-0 bg-black/30 z-30 md:hidden" onClick={() => setOpen(false)} />}
    </>
  );
}

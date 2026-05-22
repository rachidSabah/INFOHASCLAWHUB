"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useArtifactPreviewStore, type PreviewTab } from "@/lib/artifact-store";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  X, Download, Copy, Code2, Eye, ChevronLeft, ChevronRight, Maximize2, ArrowLeft, Loader2,
  FileText, FileSpreadsheet, File,
} from "lucide-react";
import { toast } from "sonner";

const ACCENT = "#f97316";

function getLanguage(tab: PreviewTab): string {
  const c = tab.content || "";
  if (c.includes("<!DOCTYPE") || c.includes("<html")) return "html";
  if (c.includes("import React") || c.includes("useState") || c.includes("export default")) return "jsx";
  if (c.includes("import ") && c.includes("from ")) return "typescript";
  if (/def |print\(|import \w+/.test(c)) return "python";
  if (/func |package main/.test(c)) return "go";
  if (/function|const |let |var /.test(c)) return "javascript";
  if (/^@|#\{|\$scope|\.class\b|\bcolor:|\.\w+\s*\{/.test(c)) return "css";
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

function isBinaryFile(tab: PreviewTab): boolean {
  const title = tab.title.toLowerCase();
  return title.endsWith(".docx") || title.endsWith(".pdf") || title.endsWith(".xlsx") ||
    title.endsWith(".pptx") || title.endsWith(".png") || title.endsWith(".jpg");
}

function getFileIcon(tab: PreviewTab): React.ComponentType<any> {
  const t = tab.title.toLowerCase();
  if (t.endsWith(".docx")) return FileText;
  if (t.endsWith(".xlsx") || t.endsWith(".csv")) return FileSpreadsheet;
  return File;
}

function CodeView({ tab }: { tab: PreviewTab }) {
  const code = extractPureCode(tab.content);
  const lines = code.split("\n");
  const lang = getLanguage(tab);
  const binary = isBinaryFile(tab);

  if (binary || !code.trim() || code.length < 5) {
    const Icon = getFileIcon(tab);
    const ext = tab.title.split(".").pop()?.toUpperCase() || "FILE";
    return (
      <div className="flex h-full bg-[#1e1e2e] items-center justify-center">
        <div className="text-center space-y-4 px-6">
          <Icon className="h-16 w-16 mx-auto text-gray-500" />
          <h3 className="text-lg font-semibold text-gray-200">{tab.title}</h3>
          <p className="text-sm text-gray-400">
            {ext} file created successfully<br />
            {code.includes("**") && <span className="text-gray-500 mt-2 block">{code.replace(/\*\*/g, "").split("\n").slice(0, 3).join("\n")}</span>}
          </p>
          <button
            onClick={() => {
              const { toast: t } = require("sonner");
              const match = tab.content.match(/\/?uploads?\/(\S+)/) || tab.title.match(/(.+)/);
              const link = document.createElement("a");
              link.href = `/api/generate`;
              link.download = tab.title;
              const payload = {
                type: ext === "DOCX" ? "docx" : ext === "XLSX" ? "xlsx" : ext === "PPTX" ? "pptx" : "pdf",
                data: { title: tab.title, content: `Generated file: ${tab.title}` },
                filename: tab.title,
              };
              fetch("/api/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
                .then(r => r.blob()).then(b => {
                  const u = URL.createObjectURL(b); const a = document.createElement("a");
                  a.href = u; a.download = tab.title; a.click(); URL.revokeObjectURL(u);
                });
            }}
            className="px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors"
            style={{ background: ACCENT }}
          >
            <Download className="h-4 w-4 inline mr-2" />
            Download {ext}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full bg-[#1e1e2e] overflow-hidden">
      <div className="w-12 shrink-0 bg-[#1e1e2e] text-right text-[#636d83] font-mono text-[13px] leading-[1.6] select-none overflow-hidden border-r border-white/[0.06]">
        <div className="py-4">
          {lines.map((_, i) => (
            <div key={i} className="pr-3">{i + 1}</div>
          ))}
        </div>
      </div>
      <div className="flex-1 overflow-auto code-scroll-area">
        <pre className="font-mono text-[14px] leading-[1.6] text-[#cdd6f4] whitespace-pre-wrap break-words min-h-full m-0 p-4">
          <code className={`language-${lang}`}>{code}</code>
        </pre>
      </div>
      <style>{`
        .code-scroll-area::-webkit-scrollbar { width: 6px; height: 6px; }
        .code-scroll-area::-webkit-scrollbar-track { background: transparent; }
        .code-scroll-area::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.12); border-radius: 3px; }
        .code-scroll-area::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.2); }
      `}</style>
    </div>
  );
}

function PreviewView({ tab }: { tab: PreviewTab }) {
  const code = extractPureCode(tab.content);
  const [loading, setLoading] = useState(true);

  if (code.includes("<!DOCTYPE") || code.includes("<html")) {
    return (
      <div className="relative w-full h-full">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-white z-10">
            <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
          </div>
        )}
        <iframe
          className="w-full h-full border-0 bg-white"
          srcDoc={code}
          sandbox="allow-scripts"
          title={tab.title}
          onLoad={() => setLoading(false)}
        />
      </div>
    );
  }
  return (
    <div className="w-full h-full overflow-auto bg-white">
      <div className="prose prose-sm max-w-none p-6 font-mono text-sm whitespace-pre-wrap">{code}</div>
    </div>
  );
}

export default function ArtifactPreviewPanel() {
  const {
    isOpen, tabs, activeTabId, isFullscreen, width,
    setOpen, setWidth, setActiveTab, removeTab,
    setFullscreen,
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
    toast.success("Copied");
  };

  const handleDownload = () => {
    if (!activeTab) return;
    const code = extractPureCode(activeTab.content);
    const lang = getLanguage(activeTab);
    const extMap: Record<string, string> = { html: "html", jsx: "jsx", typescript: "ts", javascript: "js", python: "py", go: "go", css: "css", text: "txt" };
    const ext = extMap[lang] || "txt";
    const filename = activeTab.title.replace(/[^a-zA-Z0-9._-]/g, "_") + "." + ext;
    const blob = new Blob([code], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
    toast.success(filename);
  };

  if (!activeTab) return null;

  const lang = getLanguage(activeTab);
  const title = activeTab.title.replace(/^Code Artifact - |^Artifact - |^Document - |^Response - /, "") + "." + lang;

  const btnBase = "h-8 w-8 p-0 rounded-md hover:bg-white/10 transition-colors";
  const hasPrev = historyIdx > 0;
  const hasNext = historyIdx < history.length - 1;

  return (
    <>
      {isFullscreen && (
        <div className="fixed inset-0 z-50 bg-background flex flex-col">
          <div className="flex items-center gap-2 px-3 h-10 border-b border-border bg-card shrink-0" style={{ padding: "10px 12px" }}>
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setFullscreen(false)}>Exit Fullscreen</Button>
            <div className="flex-1" />
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setOpen(false)}><X className="h-3.5 w-3.5" /></Button>
          </div>
          <div className="flex-1 overflow-hidden">
            {activeView === "code" ? <CodeView tab={activeTab} /> : <PreviewView tab={activeTab} />}
          </div>
        </div>
      )}

      <div
        ref={panelRef}
        className={cn(
          "fixed top-0 right-0 h-full z-40 bg-background flex flex-col border-l border-border shadow-[-2px_0_8px_rgba(0,0,0,0.06)]",
          "md:static md:h-full",
          !isOpen && "translate-x-full md:hidden"
        )}
        style={{
          width: isOpen ? (isFullscreen ? "100vw" : `min(55vw, ${width}px)`) : 0,
          minWidth: isOpen ? 320 : 0,
          maxWidth: isOpen ? undefined : 0,
          transition: "width 300ms cubic-bezier(0.4,0,0.2,1), transform 300ms cubic-bezier(0.4,0,0.2,1)",
          overflow: "hidden",
          flexShrink: isOpen ? 0 : undefined,
        }}
      >
        {/* Header — sticky, aligned */}
        <div className="flex items-center shrink-0 border-b border-border bg-card" style={{ padding: "10px 12px", gap: 8, minHeight: 48 }}>
          {/* Mobile back */}
          <button onClick={() => setOpen(false)} className="md:hidden h-7 w-7 flex items-center justify-center rounded hover:bg-muted shrink-0">
            <ArrowLeft className="h-4 w-4" />
          </button>

          {/* Title */}
          <span className="text-sm font-semibold truncate min-w-0 shrink-0 max-w-[200px]" style={{ color: ACCENT, fontSize: 14, fontWeight: 600 }}>
            {title}
          </span>

          {/* Nav arrows */}
          <div className="flex items-center shrink-0" style={{ gap: 2 }}>
            <button onClick={() => navigateHistory(-1)} disabled={!hasPrev} className="h-7 w-7 flex items-center justify-center rounded hover:bg-muted disabled:opacity-30 shrink-0">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button onClick={() => navigateHistory(1)} disabled={!hasNext} className="h-7 w-7 flex items-center justify-center rounded hover:bg-muted disabled:opacity-30 shrink-0">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <div className="flex-1" />

          {/* Code/Preview tabs */}
          <div className="flex items-center shrink-0 rounded-lg bg-muted/30 p-0.5" style={{ gap: 4 }}>
            <button
              onClick={() => setActiveView("code")}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-md text-[13px] font-medium transition-colors duration-150"
              style={{
                color: activeView === "code" ? "#fff" : "#9ca3af",
                background: activeView === "code" ? "rgba(255,255,255,0.08)" : "transparent",
                borderBottom: activeView === "code" ? `2px solid ${ACCENT}` : "2px solid transparent",
              }}
            >
              <Code2 className="h-3.5 w-3.5" /> Code
            </button>
            {showPreviewTab && (
              <button
                onClick={() => setActiveView("preview")}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-md text-[13px] font-medium transition-colors duration-150"
                style={{
                  color: activeView === "preview" ? "#fff" : "#9ca3af",
                  background: activeView === "preview" ? "rgba(255,255,255,0.08)" : "transparent",
                  borderBottom: activeView === "preview" ? `2px solid ${ACCENT}` : "2px solid transparent",
                }}
              >
                <Eye className="h-3.5 w-3.5" /> Preview
              </button>
            )}
          </div>

          <div className="flex items-center shrink-0" style={{ gap: 8, marginLeft: 8 }}>
            <Button variant="ghost" size="icon" className={btnBase} onClick={handleCopy} title="Copy code"><Copy className="h-4 w-4" /></Button>
            <Button variant="ghost" size="icon" className={btnBase} onClick={handleDownload} title="Download"><Download className="h-4 w-4" /></Button>
            <Button variant="ghost" size="icon" className={btnBase} onClick={() => setFullscreen(true)} title="Fullscreen"><Maximize2 className="h-4 w-4" /></Button>
            <Button variant="ghost" size="icon" className={btnBase} onClick={() => setOpen(false)} title="Close (Esc)"><X className="h-4 w-4" /></Button>
          </div>
        </div>

        {/* Multi-tab bar */}
        {tabs.length > 1 && (
          <div className="flex items-center gap-0.5 px-2 py-1 border-b border-border/50 bg-muted/10 overflow-x-auto scrollbar-none shrink-0">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium transition-colors shrink-0 max-w-[150px] border border-transparent",
                  activeTabId === tab.id ? "bg-primary/10 text-primary border-primary/20" : "hover:bg-muted text-muted-foreground"
                )}
              >
                <span className="truncate">{tab.title.slice(0, 25)}</span>
                <span onClick={(e) => { e.stopPropagation(); removeTab(tab.id); }} className="ml-0.5 hover:bg-destructive/10 rounded p-0.5 cursor-pointer"><X className="h-2.5 w-2.5" /></span>
              </button>
            ))}
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-hidden">
          {activeView === "code" ? <CodeView tab={activeTab} /> : <PreviewView tab={activeTab} />}
        </div>
      </div>

      {/* Mobile overlay */}
      {isOpen && <div className="fixed inset-0 bg-black/30 z-30 md:hidden" onClick={() => setOpen(false)} />}
    </>
  );
}

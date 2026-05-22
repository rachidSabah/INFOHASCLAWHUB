"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useArtifactPreviewStore, type PreviewTab } from "@/lib/artifact-store";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  X, Download, Copy, Code2, Eye, ChevronLeft, ChevronRight, Maximize2, ArrowLeft, Loader2,
  FileText, FileSpreadsheet, File, Share2,
} from "lucide-react";
import { toast } from "sonner";

const ACCENT = "#f97316";
const PANEL_WIDTH = "min(60vw, 800px)";

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
  return true;
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
          <p className="text-sm text-gray-400">{ext} file created successfully</p>
          <button onClick={() => {
            const payload = { type: ext === "DOCX" ? "docx" : ext === "XLSX" ? "xlsx" : ext === "PPTX" ? "pptx" : "pdf", data: { title: tab.title, content: `Generated file: ${tab.title}` }, filename: tab.title };
            fetch("/api/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
              .then(r => r.blob()).then(b => { const u = URL.createObjectURL(b); const a = document.createElement("a"); a.href = u; a.download = tab.title; a.click(); URL.revokeObjectURL(u); });
          }} className="px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors" style={{ background: ACCENT }}>
            <Download className="h-4 w-4 inline mr-2" />Download {ext}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full bg-[#1e1e2e] overflow-hidden">
      <div className="w-12 shrink-0 bg-[#1e1e2e] text-right text-[#636d83] font-mono text-[13px] leading-[1.6] select-none overflow-hidden border-r border-white/[0.06]">
        <div className="py-4">
          {lines.map((_, i) => (<div key={i} className="pr-3">{i + 1}</div>))}
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
        {loading && <div className="absolute inset-0 flex items-center justify-center bg-white z-10"><Loader2 className="h-8 w-8 animate-spin text-gray-400" /></div>}
        <iframe className="w-full h-full border-0 bg-white" srcDoc={code} sandbox="allow-scripts" title={tab.title} onLoad={() => setLoading(false)} />
      </div>
    );
  }

  const lines = code.split("\n");
  return (
    <div className="w-full h-full overflow-auto bg-white">
      <div className="p-6 max-w-4xl mx-auto">
        {lines.map((line, i) => {
          const trimmed = line.trim();
          if (!trimmed) return <div key={i} className="h-3" />;
          if (trimmed.startsWith("**") && trimmed.endsWith("**") && trimmed.length < 60) return <h3 key={i} className="text-base font-bold text-gray-900 mb-1 mt-4">{trimmed.replace(/\*\*/g, "")}</h3>;
          if (/^[A-Z\s]{5,}$/.test(trimmed) && trimmed.length > 10) return <h2 key={i} className="text-lg font-bold text-gray-900 mb-2 mt-5 border-b border-gray-200 pb-1">{trimmed}</h2>;
          if (trimmed.startsWith("•") || trimmed.startsWith("-") || trimmed.startsWith("*")) return <div key={i} className="flex gap-2 text-sm text-gray-700 ml-2 mb-0.5"><span className="shrink-0 text-gray-400">•</span><span>{trimmed.replace(/^[•\-*]\s*/, "")}</span></div>;
          if (/^[0-9]+[.)]\s/.test(trimmed)) return <div key={i} className="flex gap-2 text-sm text-gray-700 ml-2 mb-0.5"><span className="shrink-0 text-gray-400">{trimmed.match(/^[0-9]+[.)]/)?.[0]}</span><span>{trimmed.replace(/^[0-9]+[.)]\s*/, "")}</span></div>;
          if (trimmed.endsWith(":") && trimmed.length < 40) return <h4 key={i} className="text-sm font-semibold text-gray-800 mt-3 mb-1">{trimmed}</h4>;
          return <p key={i} className="text-sm text-gray-700 leading-relaxed mb-1">{line}</p>;
        })}
      </div>
    </div>
  );
}

export default function ArtifactPreviewPanel() {
  const { isOpen, tabs, activeTabId, isFullscreen, width, setOpen, setActiveTab, removeTab, setFullscreen } = useArtifactPreviewStore();
  const [activeView, setActiveView] = useState<"code" | "preview">("code");
  const [history, setHistory] = useState<string[]>([]);
  const [historyIdx, setHistoryIdx] = useState(-1);
  const activeTab = tabs.find((t) => t.id === activeTabId) || null;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape" && isOpen) { isFullscreen ? setFullscreen(false) : setOpen(false); } };
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
    if (newIdx >= 0 && newIdx < history.length) { setHistoryIdx(newIdx); setActiveTab(history[newIdx]); }
  };

  const handleCopy = () => { if (!activeTab) return; navigator.clipboard.writeText(extractPureCode(activeTab.content)); toast.success("Copied"); };
  const handleDownload = () => {
    if (!activeTab) return;
    const code = extractPureCode(activeTab.content);
    const lang = getLanguage(activeTab);
    const extMap: Record<string, string> = { html: "html", jsx: "jsx", typescript: "ts", javascript: "js", python: "py", go: "go", css: "css", text: "txt" };
    const blob = new Blob([code], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = activeTab.title.replace(/[^a-zA-Z0-9._-]/g, "_") + "." + (extMap[lang] || "txt"); a.click();
    URL.revokeObjectURL(url);
    toast.success("Downloaded");
  };
  const handleShare = async () => {
    if (!activeTab) return;
    try {
      const res = await fetch("/api/artifacts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: activeTab.title, type: activeTab.type, content: activeTab.content }) });
      const data = await res.json();
      const sr = await fetch(`/api/artifacts/${data.id}/share`, { method: "POST" });
      const sd = await sr.json();
      await navigator.clipboard.writeText(`${window.location.origin}/api/share/${sd.shareToken}`);
      toast.success("Share link copied");
    } catch { toast.error("Share failed"); }
  };

  if (!activeTab) return null;

  const title = activeTab.title.replace(/^Code Artifact - |^Artifact - |^Document - |^Response - /, "");
  const hasPrev = historyIdx > 0;
  const hasNext = historyIdx < history.length - 1;

  return (
    <>
      {isFullscreen && (
        <div className="fixed inset-0 z-50 bg-background flex flex-col">
          <div className="flex items-center gap-2 px-3 h-11 border-b border-border bg-card shrink-0">
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setFullscreen(false)}>Exit Fullscreen</Button>
            <div className="flex-1" />
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setOpen(false)}><X className="h-4 w-4" /></Button>
          </div>
          <div className="flex-1 overflow-hidden">{activeView === "code" ? <CodeView tab={activeTab} /> : <PreviewView tab={activeTab} />}</div>
        </div>
      )}

      <div
        className={cn("md:static md:h-full z-40 bg-background flex flex-col border-l border-border", !isOpen && "hidden md:hidden")}
        style={{
          width: isOpen ? (isFullscreen ? "100vw" : PANEL_WIDTH) : 0,
          minWidth: isOpen ? 380 : 0,
          flexShrink: isOpen ? 0 : "unset",
          transition: "width 300ms cubic-bezier(0.4,0,0.2,1)",
        }}
      >
        {/* Header */}
        <div className="flex items-center gap-2 px-3 h-11 border-b border-border bg-card shrink-0 overflow-hidden">
          <button onClick={() => setOpen(false)} className="md:hidden h-7 w-7 flex items-center justify-center rounded hover:bg-muted shrink-0"><ArrowLeft className="h-4 w-4" /></button>

          <div className="flex items-center gap-1 shrink-0">
            <button onClick={() => navigateHistory(-1)} disabled={!hasPrev} className="h-6 w-6 flex items-center justify-center rounded hover:bg-muted disabled:opacity-30"><ChevronLeft className="h-3.5 w-3.5" /></button>
            <button onClick={() => navigateHistory(1)} disabled={!hasNext} className="h-6 w-6 flex items-center justify-center rounded hover:bg-muted disabled:opacity-30"><ChevronRight className="h-3.5 w-3.5" /></button>
          </div>

          <span className="text-sm font-semibold min-w-0 flex-1 truncate" style={{ color: ACCENT }}>{title}</span>

          <div className="flex items-center rounded-lg bg-muted/30 p-0.5 shrink-0">
            <button onClick={() => setActiveView("code")} className={cn("flex items-center gap-1 px-3 py-1 rounded-md text-[12px] font-medium transition-colors duration-150", activeView === "code" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground")}>
              <Code2 className="h-3.5 w-3.5" />Code
            </button>
            <button onClick={() => setActiveView("preview")} className={cn("flex items-center gap-1 px-3 py-1 rounded-md text-[12px] font-medium transition-colors duration-150", activeView === "preview" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground")}>
              <Eye className="h-3.5 w-3.5" />Preview
            </button>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleCopy} title="Copy"><Copy className="h-3.5 w-3.5" /></Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleShare} title="Share"><Share2 className="h-3.5 w-3.5" /></Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleDownload} title="Download"><Download className="h-3.5 w-3.5" /></Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setFullscreen(true)} title="Fullscreen"><Maximize2 className="h-3.5 w-3.5" /></Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setOpen(false)} title="Close"><X className="h-4 w-4 text-red-500" /></Button>
          </div>
        </div>

        {tabs.length > 1 && (
          <div className="flex items-center gap-0.5 px-2 py-1 border-b border-border/50 bg-muted/10 overflow-x-auto scrollbar-none shrink-0">
            {tabs.map((tab) => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={cn("flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium shrink-0 max-w-[140px] border border-transparent", activeTabId === tab.id ? "bg-primary/10 text-primary border-primary/20" : "hover:bg-muted text-muted-foreground")}>
                <span className="truncate">{tab.title.slice(0, 25)}</span>
                <span onClick={(e) => { e.stopPropagation(); removeTab(tab.id); }} className="ml-0.5 hover:bg-destructive/10 rounded p-0.5 cursor-pointer"><X className="h-2.5 w-2.5" /></span>
              </button>
            ))}
          </div>
        )}

        <div className="flex-1 overflow-hidden">
          {activeView === "code" ? <CodeView tab={activeTab} /> : <PreviewView tab={activeTab} />}
        </div>
      </div>
    </>
  );
}

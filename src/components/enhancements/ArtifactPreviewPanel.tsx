"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useArtifactPreviewStore, type PreviewTab } from "@/lib/artifact-store";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  X, Download, Copy, Code2, Eye, ChevronLeft, ChevronRight, Maximize2, ArrowLeft, Loader2,
  FileText, FileSpreadsheet, File, Share2, Play, Terminal, RefreshCw, Monitor,
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

function canSandbox(tab: PreviewTab): boolean {
  const code = extractPureCode(tab.content);
  const lang = getLanguage(tab);
  // Anything that can be rendered as HTML/CSS/JS
  return lang === "html" || lang === "jsx" || lang === "javascript" || lang === "css" ||
    code.includes("<div") || code.includes("<html") || code.includes("<body") ||
    code.includes("document.") || code.includes("console.") ||
    code.includes("style=") || code.includes("class=") ||
    tab.type === "sandbox" || tab.type === "html" || tab.type === "canvas";
}

/**
 * Build a complete HTML document from code that might be:
 * - Full HTML document
 * - HTML fragment
 * - CSS only
 * - JavaScript only
 * - Mixed HTML/CSS/JS
 */
function buildSandboxHtml(code: string): string {
  // If it's already a full HTML document, use as-is
  if (code.includes("<!DOCTYPE") || code.includes("<html")) {
    // Inject console capture if not already present
    if (!code.includes("__sandbox_console")) {
      const consoleScript = `<script>
(function() {
  const origLog = console.log;
  const origError = console.error;
  const origWarn = console.warn;
  const origInfo = console.info;
  function send(type, args) {
    try {
      const msg = Array.from(args).map(a => {
        try { return typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a); }
        catch(e) { return String(a); }
      }).join(' ');
      window.parent.postMessage({ __sandbox_console: true, type, message: msg }, '*');
    } catch(e) {}
  }
  console.log = function() { send('log', arguments); origLog.apply(console, arguments); };
  console.error = function() { send('error', arguments); origError.apply(console, arguments); };
  console.warn = function() { send('warn', arguments); origWarn.apply(console, arguments); };
  console.info = function() { send('info', arguments); origInfo.apply(console, arguments); };
  window.onerror = function(msg, src, line, col, err) {
    send('error', [msg + (line ? ' (line ' + line + ')' : '')]);
    return false;
  };
})();
</script>`;
      if (code.includes("<head>")) {
        return code.replace("<head>", "<head>" + consoleScript);
      }
      return code.replace("<html", consoleScript + "<html");
    }
    return code;
  }

  const lang = (() => {
    if (/^[\s\S]*<div|^[\s\S]*<span|^[\s\S]*<p|^[\s\S]*<h[1-6]/i.test(code)) return "html";
    if (/^[\s\S]*\.\w+\s*\{|^[\s\S]*@\w+|^[\s\S]*:root|^[\s\S]*body\s*\{/i.test(code)) return "css";
    if (/^[\s\S]*(function |const |let |var |class |=>)/i.test(code)) return "javascript";
    return "mixed";
  })();

  // Wrap in a complete HTML document with console capture
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Sandbox</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 16px; color: #1a1a2e; background: #fafafa; }
  pre { background: #f0f0f0; padding: 8px; border-radius: 6px; overflow-x: auto; font-size: 13px; }
  input, button, select, textarea { font-family: inherit; }
</style>
<script>
(function() {
  const origLog = console.log;
  const origError = console.error;
  const origWarn = console.warn;
  const origInfo = console.info;
  function send(type, args) {
    try {
      const msg = Array.from(args).map(a => {
        try { return typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a); }
        catch(e) { return String(a); }
      }).join(' ');
      window.parent.postMessage({ __sandbox_console: true, type, message: msg }, '*');
    } catch(e) {}
  }
  console.log = function() { send('log', arguments); origLog.apply(console, arguments); };
  console.error = function() { send('error', arguments); origError.apply(console, arguments); };
  console.warn = function() { send('warn', arguments); origWarn.apply(console, arguments); };
  console.info = function() { send('info', arguments); origInfo.apply(console, arguments); };
  window.onerror = function(msg, src, line, col, err) {
    send('error', [msg + (line ? ' (line ' + line + ')' : '')]);
    return false;
  };
})();
</script>
${lang === "css" ? `<style>${code}</style>` : ""}
</head>
<body>
${lang === "javascript" ? `<script>${code}<\/script>` : ""}
${lang === "html" || lang === "mixed" ? code : ""}
${lang === "css" ? '<div style="text-align:center;color:#888;padding:40px;font-size:14px;">CSS Sandbox — styles applied to this page</div>' : ""}
</body>
</html>`;
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
            const actualContent = tab.content || code;
            const payload = { type: ext === "DOCX" ? "docx" : ext === "XLSX" ? "xlsx" : ext === "PPTX" ? "pptx" : "pdf", data: { title: tab.title, content: actualContent }, filename: tab.title };
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

interface ConsoleEntry {
  type: "log" | "error" | "warn" | "info";
  message: string;
  timestamp: number;
}

function SandboxView({ tab }: { tab: PreviewTab }) {
  const code = extractPureCode(tab.content);
  const [loading, setLoading] = useState(true);
  const [consoleEntries, setConsoleEntries] = useState<ConsoleEntry[]>([]);
  const [showConsole, setShowConsole] = useState(true);
  const [sandboxKey, setSandboxKey] = useState(0);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const sandboxHtml = buildSandboxHtml(code);

  // Listen for console messages from the iframe
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event.data?.__sandbox_console) {
        setConsoleEntries(prev => [...prev.slice(-200), {
          type: event.data.type,
          message: event.data.message,
          timestamp: Date.now(),
        }]);
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  // Clear console on re-run
  useEffect(() => {
    setConsoleEntries([]);
    setLoading(true);
  }, [sandboxKey]);

  const handleRerun = useCallback(() => {
    setSandboxKey(k => k + 1);
  }, []);

  const consoleErrorCount = consoleEntries.filter(e => e.type === "error").length;

  return (
    <div className="flex flex-col h-full bg-[#1e1e2e]">
      {/* Sandbox toolbar */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-white/[0.06] shrink-0">
        <Monitor className="h-3.5 w-3.5 text-emerald-400" />
        <span className="text-[11px] font-medium text-emerald-400 uppercase tracking-wider">Sandbox</span>
        <div className="flex-1" />
        <button
          onClick={handleRerun}
          className="flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium text-gray-300 hover:bg-white/[0.08] transition-colors"
          title="Re-run code"
        >
          <RefreshCw className="h-3 w-3" />Re-run
        </button>
        <button
          onClick={() => setShowConsole(!showConsole)}
          className={cn(
            "flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium transition-colors",
            showConsole ? "bg-white/[0.08] text-gray-200" : "text-gray-400 hover:bg-white/[0.06]"
          )}
          title="Toggle console"
        >
          <Terminal className="h-3 w-3" />Console
          {consoleErrorCount > 0 && (
            <span className="ml-1 px-1.5 py-0 rounded-full bg-red-500/20 text-red-400 text-[10px] font-bold">{consoleErrorCount}</span>
          )}
        </button>
      </div>

      {/* iframe sandbox */}
      <div className="flex-1 relative overflow-hidden">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-white z-10">
            <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
          </div>
        )}
        <iframe
          ref={iframeRef}
          key={sandboxKey}
          className="w-full h-full border-0 bg-white"
          srcDoc={sandboxHtml}
          sandbox="allow-scripts allow-modals"
          title={`Sandbox: ${tab.title}`}
          onLoad={() => setLoading(false)}
        />
      </div>

      {/* Console panel */}
      {showConsole && (
        <div className="shrink-0 border-t border-white/[0.06] bg-[#181825] max-h-[200px] flex flex-col">
          <div className="flex items-center px-3 py-1 border-b border-white/[0.04] shrink-0">
            <Terminal className="h-3 w-3 text-gray-500 mr-1.5" />
            <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wider">Console</span>
            <div className="flex-1" />
            <button
              onClick={() => setConsoleEntries([])}
              className="text-[10px] text-gray-500 hover:text-gray-300 transition-colors"
            >
              Clear
            </button>
          </div>
          <div className="overflow-y-auto text-[12px] font-mono leading-[1.5] console-scroll-area" style={{ maxHeight: 160 }}>
            {consoleEntries.length === 0 ? (
              <div className="px-3 py-2 text-gray-600 italic text-[11px]">Console output will appear here...</div>
            ) : (
              consoleEntries.map((entry, i) => (
                <div
                  key={i}
                  className={cn(
                    "px-3 py-0.5 border-b border-white/[0.02] flex gap-2",
                    entry.type === "error" ? "bg-red-900/10 text-red-400" :
                    entry.type === "warn" ? "bg-yellow-900/10 text-yellow-400" :
                    entry.type === "info" ? "text-blue-300" :
                    "text-gray-300"
                  )}
                >
                  <span className="shrink-0 text-[10px] opacity-50 w-4 text-right">
                    {entry.type === "error" ? "✕" : entry.type === "warn" ? "⚠" : entry.type === "info" ? "ℹ" : "›"}
                  </span>
                  <span className="whitespace-pre-wrap break-all min-w-0 flex-1">{entry.message}</span>
                </div>
              ))
            )}
          </div>
          <style>{`
            .console-scroll-area::-webkit-scrollbar { width: 5px; }
            .console-scroll-area::-webkit-scrollbar-track { background: transparent; }
            .console-scroll-area::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 3px; }
          `}</style>
        </div>
      )}
    </div>
  );
}

export default function ArtifactPreviewPanel() {
  const { isOpen, tabs, activeTabId, isFullscreen, width, setOpen, setActiveTab, removeTab, setFullscreen } = useArtifactPreviewStore();
  const [activeView, setActiveView] = useState<"code" | "preview" | "sandbox">("code");
  const [history, setHistory] = useState<string[]>([]);
  const [historyIdx, setHistoryIdx] = useState(-1);
  const activeTab = tabs.find((t) => t.id === activeTabId) || null;

  const sandboxAvailable = activeTab ? canSandbox(activeTab) : false;

  useEffect(() => {
    if (activeTabId && activeTab) {
      const isDoc = isBinaryFile(activeTab) || activeTab.type === "document" || activeTab.type === "markdown";
      // Auto-select sandbox for HTML/code content
      if (sandboxAvailable && (activeTab.type === "sandbox" || activeTab.type === "html" || activeTab.type === "canvas")) {
        setActiveView("sandbox");
      } else if (isDoc) {
        setActiveView("preview");
      } else {
        setActiveView("code");
      }
    }
  }, [activeTabId, sandboxAvailable]);

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
    const isBinary = isBinaryFile(activeTab);
    if (isBinary) {
      const ext = activeTab.title.split(".").pop()?.toUpperCase() || "DOCX";
      const payload = {
        type: ext === "DOCX" ? "docx" : ext === "XLSX" ? "xlsx" : ext === "PPTX" ? "pptx" : "pdf",
        data: { title: activeTab.title, content: activeTab.content },
        filename: activeTab.title,
      };
      fetch("/api/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
        .then(r => r.blob()).then(b => { const u = URL.createObjectURL(b); const a = document.createElement("a"); a.href = u; a.download = activeTab.title; a.click(); URL.revokeObjectURL(u); toast.success("Downloaded"); })
        .catch(() => toast.error("Download failed"));
      return;
    }
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

  const renderContent = () => {
    switch (activeView) {
      case "code": return <CodeView tab={activeTab} />;
      case "preview": return <PreviewView tab={activeTab} />;
      case "sandbox": return <SandboxView tab={activeTab} />;
    }
  };

  return (
    <>
      {isFullscreen && (
        <div className="fixed inset-0 z-50 bg-background flex flex-col">
          <div className="flex items-center gap-2 px-3 h-11 border-b border-border bg-card shrink-0">
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setFullscreen(false)}>Exit Fullscreen</Button>
            <div className="flex-1" />
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setOpen(false)}><X className="h-4 w-4" /></Button>
          </div>
          <div className="flex-1 overflow-hidden">{renderContent()}</div>
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

          {/* View toggle: Code | Preview | Sandbox */}
          <div className="flex items-center rounded-lg bg-muted/30 p-0.5 shrink-0">
            <button onClick={() => setActiveView("code")} className={cn("flex items-center gap-1 px-2.5 py-1 rounded-md text-[12px] font-medium transition-colors duration-150", activeView === "code" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground")}>
              <Code2 className="h-3.5 w-3.5" />Code
            </button>
            <button onClick={() => setActiveView("preview")} className={cn("flex items-center gap-1 px-2.5 py-1 rounded-md text-[12px] font-medium transition-colors duration-150", activeView === "preview" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground")}>
              <Eye className="h-3.5 w-3.5" />Preview
            </button>
            {sandboxAvailable && (
              <button onClick={() => setActiveView("sandbox")} className={cn("flex items-center gap-1 px-2.5 py-1 rounded-md text-[12px] font-medium transition-colors duration-150", activeView === "sandbox" ? "bg-emerald-500/10 shadow-sm text-emerald-500" : "text-muted-foreground")}>
                <Play className="h-3.5 w-3.5" />Sandbox
              </button>
            )}
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
          {renderContent()}
        </div>
      </div>
    </>
  );
}

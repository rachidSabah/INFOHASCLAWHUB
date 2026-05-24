"use client";

import dynamic from "next/dynamic";
import { useState, useRef, useCallback, useEffect } from "react";
import { useArtifactPreviewStore, type PreviewTab } from "@/lib/artifact-store";
import {
  detectArtifactType,
  getExportFormats,
  exportArtifact,
  type ArtifactVersion,
} from "@/lib/artifact-system-v2";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  X, Download, Copy, Code2, Eye, ChevronLeft, ChevronRight, Maximize2, ArrowLeft, Loader2,
  FileText, FileSpreadsheet, File, Share2, Play, Terminal, RefreshCw, Monitor,
  History, ChevronDown, Clock, RotateCcw, FileDown,
  Globe, BarChart3, PenTool, Database, TerminalSquare, FileCode, Image, Layers,
  Pencil, Save,
} from "lucide-react";
import { toast } from "sonner";

const ACCENT = "#f97316";
const PANEL_WIDTH = "min(60vw, 800px)";

// ── Dynamic import for Monaco Editor (client-only, heavy) ──
const MonacoEditor = dynamic(() => import("@monaco-editor/react").then((mod) => mod.default), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full text-gray-400 gap-2">
      <Loader2 className="h-4 w-4 animate-spin" />
      <span className="text-sm">Loading editor...</span>
    </div>
  ),
});

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

/** Map detected language / tab type to Monaco-compatible language identifier */
function getMonacoLanguage(tab: PreviewTab): string {
  const c = tab.content || "";
  const title = tab.title.toLowerCase();
  const t = tab.type;

  // Detect by tab type first
  if (t === "markdown" || t === "document") return "markdown";
  if (t === "sql") return "sql";
  if (t === "yaml") return "yaml";
  if (t === "xml") return "xml";
  if (t === "json") return "json";

  // Detect by file extension in title
  if (title.endsWith(".json")) return "json";
  if (title.endsWith(".md") || title.endsWith(".markdown")) return "markdown";
  if (title.endsWith(".sql")) return "sql";
  if (title.endsWith(".yml") || title.endsWith(".yaml")) return "yaml";
  if (title.endsWith(".xml")) return "xml";
  if (title.endsWith(".sh") || title.endsWith(".bash") || title.endsWith(".zsh")) return "shell";
  if (title.endsWith(".ts") || title.endsWith(".tsx")) return "typescript";
  if (title.endsWith(".js") || title.endsWith(".jsx")) return "javascript";
  if (title.endsWith(".py")) return "python";
  if (title.endsWith(".css") || title.endsWith(".scss")) return "css";
  if (title.endsWith(".html")) return "html";
  if (title.endsWith(".go")) return "go";

  // Detect by content patterns
  const trimmed = c.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    try { JSON.parse(trimmed); return "json"; } catch {}
  }
  if (/^---[\s\S]*?---/.test(trimmed)) return "yaml"; // YAML front matter
  if (/^<\?xml/.test(trimmed)) return "xml";
  if (/^#!\/bin\/|^#!\/usr\/bin\/env/.test(trimmed)) return "shell";
  if (/^SELECT |^INSERT |^UPDATE |^DELETE |^CREATE TABLE|^ALTER TABLE/i.test(trimmed)) return "sql";
  if (/^#\s/.test(trimmed) && /\n##\s/.test(trimmed)) return "markdown";

  // Fall back to the existing getLanguage and map to Monaco IDs
  const lang = getLanguage(tab);
  const monacoMap: Record<string, string> = {
    html: "html",
    jsx: "javascript",
    typescript: "typescript",
    python: "python",
    go: "go",
    javascript: "javascript",
    css: "css",
    text: "plaintext",
  };
  return monacoMap[lang] || "plaintext";
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
  // Never sandbox JSON tool calls or tool results
  const c = tab.content || "";
  const trimmed = c.trim();
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try { 
      const parsed = JSON.parse(trimmed);
      // This is a tool call JSON (has name + arguments) — not sandboxable
      if (parsed.name && parsed.arguments) return false;
      // This is a tool result JSON — not sandboxable unless it's HTML
      if (parsed.path || parsed.stdout || parsed.error) return false;
      // But if it has HTML content inside, it might be sandboxable
      if (parsed.html || parsed.content?.includes('<!DOCTYPE') || parsed.content?.includes('<html')) return true;
      return false; 
    } catch {}
  }
  const code = extractPureCode(c);
  const lang = getLanguage(tab);
  // Anything that can be rendered as HTML/CSS/JS
  return lang === "html" || lang === "jsx" || lang === "javascript" || lang === "css" ||
    code.includes("<div") || code.includes("<html") || code.includes("<body") ||
    code.includes("document.") || code.includes("console.") ||
    code.includes("style=") || code.includes("class=") ||
    tab.type === "sandbox" || tab.type === "html" || tab.type === "canvas";
}

function isWebsitePreview(tab: PreviewTab): boolean {
  return tab.type === "website" || 
    (tab.metadata?.url !== undefined) ||
    (tab.title.toLowerCase().includes("website") && tab.content.includes("textContent"));
}

/** Get a Lucide icon component based on the tab/artifact type */
function getTabTypeIcon(tab: PreviewTab): React.ComponentType<any> {
  const detected = detectArtifactType(extractPureCode(tab.content || ""));
  const typeKey = tab.type === "document" ? "markdown" : tab.type === "spreadsheet" ? "csv" : tab.type === "diagram" ? "mermaid" : tab.type === "sandbox" ? "html" : detected.type;
  const iconMap: Record<string, React.ComponentType<any>> = {
    html: Globe, react: Code2, code: FileCode, markdown: FileText,
    svg: Image, mermaid: BarChart3, latex: PenTool, chart: BarChart3,
    json: Database, csv: FileSpreadsheet, sql: Database, python: TerminalSquare,
    typescript: FileCode, javascript: FileCode, css: PenTool, shell: TerminalSquare,
    yaml: FileText, xml: FileCode, website: Globe, canvas: Layers,
    image: Image, presentation: Layers,
  };
  return iconMap[typeKey] || FileCode;
}

/** Format a relative time string from an ISO date */
function formatRelativeTime(isoDate: string): string {
  const now = Date.now();
  const then = new Date(isoDate).getTime();
  const diffMs = now - then;
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return "just now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 30) return `${diffDay}d ago`;
  return new Date(isoDate).toLocaleDateString();
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

// ── Monaco Editor View (professional code editing) ──
function MonacoEditorView({
  tab,
  onSave,
}: {
  tab: PreviewTab;
  onSave: (content: string) => void;
}) {
  const code = extractPureCode(tab.content);
  const language = getMonacoLanguage(tab);
  const [content, setContent] = useState(code);
  const [isDirty, setIsDirty] = useState(false);
  const editorRef = useRef<any>(null);

  // Sync content when tab changes externally
  useEffect(() => {
    const newCode = extractPureCode(tab.content);
    if (newCode !== content && !isDirty) {
      setContent(newCode);
    }
  }, [tab.content, tab.id, content, isDirty]);

  const handleSave = useCallback(() => {
    onSave(content);
    setIsDirty(false);
  }, [content, onSave]);

  // Ctrl+S / Cmd+S save shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        if (isDirty) handleSave();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [isDirty, handleSave]);

  const handleEditorMount = (editor: any) => {
    editorRef.current = editor;
  };

  // Don't render for binary files or very short content
  if (isBinaryFile(tab) || !code.trim() || code.length < 5) {
    return <CodeView tab={tab} />;
  }

  return (
    <div className="flex flex-col h-full">
      {/* Editor status bar */}
      <div className="flex items-center justify-between px-3 py-1 bg-[#1e1e2e] border-b border-white/[0.06] shrink-0">
        <span className="text-xs text-gray-400">
          {language} • {content.split("\n").length} lines
        </span>
        {isDirty && (
          <button
            onClick={handleSave}
            className="flex items-center gap-1.5 px-3 py-1 rounded text-xs font-medium text-white transition-colors hover:opacity-90"
            style={{ background: ACCENT }}
          >
            <Save className="h-3 w-3" />
            Save (Ctrl+S)
          </button>
        )}
      </div>
      {/* Monaco editor */}
      <div className="flex-1 min-h-0">
        <MonacoEditor
          height="100%"
          language={language}
          theme="vs-dark"
          value={content}
          onMount={handleEditorMount}
          onChange={(val) => {
            setContent(val || "");
            setIsDirty(true);
          }}
          options={{
            minimap: { enabled: false },
            fontSize: 14,
            wordWrap: "on",
            scrollBeyondLastLine: false,
            padding: { top: 16 },
            lineNumbers: "on",
            renderLineHighlight: "all",
            bracketPairColorization: { enabled: true },
            automaticLayout: true,
            tabSize: 2,
          }}
        />
      </div>
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

/**
 * Website preview view — renders fetched web content as a nicely formatted page
 * Similar to Claude's artifact preview for web fetch results
 */
function buildWebsiteHtml(pageData: any, pageTitle: string, pageUrl: string, pageDescription: string, indicators: string[]): string {
  const pageContent = pageData.textContent || pageData.content || pageData.description || "";
  // Show error state if there's no content but there is an error
  if (!pageContent && pageData.error) {
    return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>Error</title>
<style>body{font-family:system-ui;padding:40px;color:#666;}h2{color:#f97316;}</style>
</head><body><h2>Unable to fetch page</h2><p>${pageData.error}</p>
${pageData.hint ? `<p style="color:#999;font-size:14px;">${pageData.hint}</p>` : ''}
${pageUrl ? `<p><a href="${pageUrl}" target="_blank" style="color:#3b82f6;">Visit site directly →</a></p>` : ''}
</body></html>`;
  }
  const contentLines = pageContent.split('\n').filter((l: string) => l.trim()).slice(0, 100);
  const contentHtml = contentLines.map((line: string) => {
    const trimmed = line.trim();
    if (trimmed.startsWith('#')) return `<h2>${trimmed.replace(/^#+\s*/, '')}</h2>`;
    return `<p>${trimmed}</p>`;
  }).join('\n');

  const urlHtml = pageUrl ? `<div class="url">${pageUrl}</div>` : '';
  const descHtml = pageDescription ? `<div class="meta">${pageDescription}</div>` : '';
  const tagsHtml = indicators.length > 0 
    ? `<div class="tags">${indicators.map(t => `<span class="tag">${t}</span>`).join('')}</div>` 
    : '';
  const statsHtml = pageData.contentLength 
    ? `<div class="stats"><div class="stat"><div class="value">${(pageData.contentLength / 1024).toFixed(1)}KB</div><div class="label">Page Size</div></div>${indicators.length > 0 ? `<div class="stat"><div class="value">${indicators.length}</div><div class="label">Technologies</div></div>` : ''}</div>` 
    : '';
  const descParaHtml = pageDescription ? `<p class="description">${pageDescription}</p>` : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${pageTitle}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #1a1a2e; background: #ffffff; line-height: 1.6; }
  .header { background: linear-gradient(135deg, #f97316 0%, #ea580c 100%); color: white; padding: 20px 24px; }
  .header h1 { font-size: 20px; font-weight: 700; margin-bottom: 4px; }
  .header .url { font-size: 12px; opacity: 0.85; word-break: break-all; }
  .header .meta { font-size: 12px; opacity: 0.75; margin-top: 8px; }
  .tags { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 8px; }
  .tag { background: rgba(255,255,255,0.2); padding: 2px 8px; border-radius: 12px; font-size: 11px; }
  .content { padding: 20px 24px; max-width: 800px; }
  .content p { margin-bottom: 10px; font-size: 14px; color: #374151; }
  .content h2 { font-size: 16px; font-weight: 600; margin: 16px 0 8px; color: #111827; }
  .description { font-style: italic; color: #6b7280; margin-bottom: 16px; padding-bottom: 16px; border-bottom: 1px solid #e5e7eb; }
  .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 12px; margin: 16px 0; }
  .stat { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px; text-align: center; }
  .stat .value { font-size: 18px; font-weight: 700; color: #f97316; }
  .stat .label { font-size: 11px; color: #6b7280; margin-top: 2px; }
</style>
</head>
<body>
<div class="header">
  <h1>${pageTitle}</h1>
  ${urlHtml}
  ${descHtml}
  ${tagsHtml}
</div>
<div class="content">
  ${statsHtml}
  ${descParaHtml}
  <div>${contentHtml}</div>
</div>
</body>
</html>`;
}

function WebsiteView({ tab }: { tab: PreviewTab }) {
  const url = tab.metadata?.url || "";
  const title = tab.metadata?.title || tab.title;
  
  // Try to parse the content as JSON (web_fetch result)
  let pageData: any = {};
  const rawContent = tab.content || "";
  try {
    pageData = JSON.parse(rawContent);
    // Handle tool call JSON — this means the artifact captured a tool call, not a result
    // Show a helpful message instead of raw JSON
    if (pageData.name === "web_fetch" && pageData.arguments) {
      const fetchUrl = pageData.arguments.url || "";
      pageData = { 
        url: fetchUrl, 
        textContent: `Fetching ${fetchUrl}...`,
        title: `Loading: ${fetchUrl}`,
        error: "Preview not yet available — the tool call was captured but the result hasn't been received yet. The preview will update when the tool result arrives."
      };
    } else if (pageData.name && pageData.arguments) {
      // Generic tool call — not a web result
      pageData = { 
        textContent: "", 
        title: `Tool: ${pageData.name}`,
        error: `This artifact captured a tool call to "${pageData.name}" instead of its result. The preview will update when the tool result arrives.`
      };
    }
  } catch {
    // Content might be text with embedded JSON
    // Try multiple patterns to extract web_fetch result data
    const jsonPatterns = [
      /\{[\s\S]*"textContent"[\s\S]*\}/,  // Standard web_fetch result
      /\{[\s\S]*"url"[\s\S]*"title"[\s\S]*\}/,  // URL + title result
      /\{[\s\S]*"html"[\s\S]*\}/,  // HTML content result
    ];
    for (const pattern of jsonPatterns) {
      const jsonMatch = rawContent.match(pattern);
      if (jsonMatch) {
        try { pageData = JSON.parse(jsonMatch[0]); break; } catch {}
      }
    }
    if (!pageData.textContent && !pageData.title) {
      pageData = { textContent: rawContent, title: title };
    }
  }

  const pageTitle = pageData.title || title;
  const pageDescription = pageData.description || "";
  const pageUrl = pageData.url || url;
  const indicators: string[] = pageData.indicators || [];

  const previewHtml = buildWebsiteHtml(pageData, pageTitle, pageUrl, pageDescription, indicators);

  return (
    <div className="flex flex-col h-full bg-white">
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-gray-200 bg-gray-50 shrink-0">
        <Monitor className="h-3.5 w-3.5 text-orange-500" />
        <span className="text-[11px] font-medium text-gray-500 uppercase tracking-wider">Website Preview</span>
        {pageUrl && (
          <a href={pageUrl} target="_blank" rel="noopener noreferrer" className="text-[11px] text-blue-500 hover:underline truncate ml-2">
            {pageUrl}
          </a>
        )}
      </div>
      <div className="flex-1 overflow-hidden">
        <iframe
          className="w-full h-full border-0"
          srcDoc={previewHtml}
          sandbox="allow-same-origin allow-scripts"
          title={`Preview: ${pageTitle}`}
        />
      </div>
    </div>
  );
}

export default function ArtifactPreviewPanel() {
  const { isOpen, tabs, activeTabId, isFullscreen, width, setOpen, setActiveTab, removeTab, setFullscreen, updateTab } = useArtifactPreviewStore();
  const [activeView, setActiveView] = useState<"code" | "preview" | "sandbox" | "website" | "split">("code");
  const [isEditing, setIsEditing] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const [historyIdx, setHistoryIdx] = useState(-1);
  const activeTab = tabs.find((t) => t.id === activeTabId) || null;

  // Version history state
  const [showHistory, setShowHistory] = useState(false);
  const [versions, setVersions] = useState<ArtifactVersion[]>([]);
  const [loadingVersions, setLoadingVersions] = useState(false);

  // Export state
  const [showExport, setShowExport] = useState(false);

  const sandboxAvailable = activeTab ? canSandbox(activeTab) : false;
  const websiteAvailable = activeTab ? isWebsitePreview(activeTab) : false;

  // Detected artifact info for the type indicator
  const detectedArtifact = activeTab ? detectArtifactType(extractPureCode(activeTab.content || "")) : null;

  // Close dropdowns when clicking outside
  const historyRef = useRef<HTMLDivElement>(null);
  const exportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (historyRef.current && !historyRef.current.contains(e.target as Node)) setShowHistory(false);
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) setShowExport(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    if (activeTabId && activeTab) {
      // Auto-select website view for web fetch results
      if (websiteAvailable) {
        setActiveView("website");
      } else if (sandboxAvailable && (activeTab.type === "sandbox" || activeTab.type === "html" || activeTab.type === "canvas")) {
        setActiveView("sandbox");
      } else if (isBinaryFile(activeTab) || activeTab.type === "document" || activeTab.type === "markdown") {
        setActiveView("preview");
      } else {
        setActiveView("code");
      }
      // Close dropdowns on tab switch
      setShowHistory(false);
      setShowExport(false);
      setIsEditing(false);
    }
  }, [activeTabId, sandboxAvailable, websiteAvailable]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape" && isOpen) { if (isFullscreen) { setFullscreen(false); } else { setOpen(false); } } };
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

  // ── Version History Handlers ──
  const handleLoadVersions = useCallback(async () => {
    if (!activeTab) return;
    if (showHistory) { setShowHistory(false); return; }
    setShowHistory(true);
    setShowExport(false);
    setLoadingVersions(true);
    try {
      const res = await fetch(`/api/artifacts/versions?artifactId=${encodeURIComponent(activeTab.id)}`);
      const data = await res.json();
      setVersions(data.versions || []);
    } catch {
      setVersions([]);
    } finally {
      setLoadingVersions(false);
    }
  }, [activeTab, showHistory]);

  const handleRollbackVersion = useCallback(async (version: ArtifactVersion) => {
    if (!activeTab) return;
    try {
      const res = await fetch("/api/artifacts/versions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "rollback", artifactId: activeTab.id, versionId: version.id }),
      });
      const data = await res.json();
      if (data.success) {
        // Update the tab content with the rolled-back version
        updateTab(activeTab.id, { content: version.content });
        toast.success(`Rolled back to v${version.version}`);
        setShowHistory(false);
      } else {
        toast.error("Rollback failed");
      }
    } catch {
      toast.error("Rollback failed");
    }
  }, [activeTab, updateTab]);

  // ── Export Handlers ──
  const handleExport = useCallback((format: string) => {
    if (!activeTab) return;
    const code = extractPureCode(activeTab.content);
    const detected = detectArtifactType(code);
    const result = exportArtifact(code, detected.type, activeTab.title);
    const blob = new Blob([result.content], { type: result.mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = result.filename;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported as ${format.toUpperCase()}`);
    setShowExport(false);
  }, [activeTab]);

  // ── Monaco Editor Save Handler ──
  const handleEditorSave = useCallback(async (content: string) => {
    if (!activeTab) return;
    updateTab(activeTab.id, { content });
    try {
      await fetch("/api/artifacts/versions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save",
          artifactId: activeTab.id,
          content,
          message: "Manual edit",
        }),
      });
      toast.success("Saved & version created");
    } catch {
      toast.success("Saved locally");
    }
  }, [activeTab, updateTab]);

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
  const exportFormats = getExportFormats(detectedArtifact?.type || "code");

  const renderContent = () => {
    switch (activeView) {
      case "code": return isEditing
        ? <MonacoEditorView tab={activeTab} onSave={handleEditorSave} />
        : <CodeView tab={activeTab} />;
      case "preview": return <PreviewView tab={activeTab} />;
      case "sandbox": return <SandboxView tab={activeTab} />;
      case "website": return <WebsiteView tab={activeTab} />;
      case "split": return (
        <div className="flex h-full">
          <div className="w-1/2 border-r border-white/[0.06] overflow-hidden">
            <MonacoEditorView tab={activeTab} onSave={handleEditorSave} />
          </div>
          <div className="w-1/2 overflow-hidden">
            {canSandbox(activeTab) ? <SandboxView tab={activeTab} /> : <PreviewView tab={activeTab} />}
          </div>
        </div>
      );
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

          {/* View toggle: Code | Preview | Website | Sandbox */}
          <div className="flex items-center rounded-lg bg-muted/30 p-0.5 shrink-0">
            <button onClick={() => { setActiveView("code"); }} className={cn("flex items-center gap-1 px-2.5 py-1 rounded-md text-[12px] font-medium transition-colors duration-150", activeView === "code" && !isEditing ? "bg-background shadow-sm text-foreground" : activeView === "code" && isEditing ? "bg-orange-500/10 shadow-sm text-orange-500" : "text-muted-foreground")}>
              <Code2 className="h-3.5 w-3.5" />Code
            </button>
            <button onClick={() => setActiveView("preview")} className={cn("flex items-center gap-1 px-2.5 py-1 rounded-md text-[12px] font-medium transition-colors duration-150", activeView === "preview" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground")}>
              <Eye className="h-3.5 w-3.5" />Preview
            </button>
            {websiteAvailable && (
              <button onClick={() => setActiveView("website")} className={cn("flex items-center gap-1 px-2.5 py-1 rounded-md text-[12px] font-medium transition-colors duration-150", activeView === "website" ? "bg-orange-500/10 shadow-sm text-orange-500" : "text-muted-foreground")}>
                <Monitor className="h-3.5 w-3.5" />Website
              </button>
            )}
            {sandboxAvailable && (
              <button onClick={() => setActiveView("sandbox")} className={cn("flex items-center gap-1 px-2.5 py-1 rounded-md text-[12px] font-medium transition-colors duration-150", activeView === "sandbox" ? "bg-emerald-500/10 shadow-sm text-emerald-500" : "text-muted-foreground")}>
                <Play className="h-3.5 w-3.5" />Sandbox
              </button>
            )}
            <button onClick={() => setActiveView("split")} className={cn("flex items-center gap-1 px-2.5 py-1 rounded-md text-[12px] font-medium transition-colors duration-150", activeView === "split" ? "bg-violet-500/10 shadow-sm text-violet-500" : "text-muted-foreground")} title="Split: Editor + Live Preview">
              <Layers className="h-3.5 w-3.5" />Split
            </button>
          </div>

          {/* Edit toggle — only visible when in Code view */}
          {activeView === "code" && (
            <button
              onClick={() => setIsEditing(!isEditing)}
              className={cn(
                "flex items-center gap-1 px-2 py-1 rounded-md text-[12px] font-medium transition-colors duration-150 shrink-0",
                isEditing
                  ? "bg-orange-500/15 text-orange-500 shadow-sm"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
              title={isEditing ? "Switch to read-only view" : "Edit in Monaco Editor"}
            >
              <Pencil className="h-3.5 w-3.5" />
              {isEditing ? "Editing" : "Edit"}
            </button>
          )}

          <div className="flex items-center gap-1 shrink-0">
            {/* Version History Button */}
            <div className="relative" ref={historyRef}>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleLoadVersions} title="Version History">
                <History className="h-3.5 w-3.5" />
              </Button>
              {showHistory && (
                <div className="absolute right-0 top-full mt-1 w-64 rounded-lg border border-border bg-popover shadow-lg z-50 overflow-hidden">
                  <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-muted/30">
                    <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-[12px] font-semibold text-foreground">Version History</span>
                  </div>
                  <div className="max-h-72 overflow-y-auto">
                    {loadingVersions ? (
                      <div className="flex items-center justify-center py-6">
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                        <span className="ml-2 text-[12px] text-muted-foreground">Loading...</span>
                      </div>
                    ) : versions.length === 0 ? (
                      <div className="px-3 py-6 text-center">
                        <Clock className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
                        <p className="text-[12px] text-muted-foreground">No versions saved yet.</p>
                        <p className="text-[11px] text-muted-foreground/70 mt-1">Versions are created when artifacts are auto-saved.</p>
                      </div>
                    ) : (
                      versions.map((v) => (
                        <button
                          key={v.id}
                          onClick={() => handleRollbackVersion(v)}
                          className="w-full flex items-start gap-2 px-3 py-2 hover:bg-muted/50 transition-colors text-left group border-b border-border/30 last:border-0"
                        >
                          <div className="shrink-0 mt-0.5">
                            <div className="h-5 w-5 rounded-full bg-primary/10 flex items-center justify-center">
                              <span className="text-[9px] font-bold text-primary">{v.version}</span>
                            </div>
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-[12px] font-medium text-foreground truncate">{v.message}</div>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-[10px] text-muted-foreground">{formatRelativeTime(v.createdAt)}</span>
                              <span className="text-[10px] text-muted-foreground">·</span>
                              <span className="text-[10px] text-muted-foreground">{v.tokenCount} tokens</span>
                            </div>
                          </div>
                          <RotateCcw className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity mt-1 shrink-0" />
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Export Button */}
            <div className="relative" ref={exportRef}>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setShowExport(!showExport); setShowHistory(false); }} title="Export">
                <FileDown className="h-3.5 w-3.5" />
              </Button>
              {showExport && (
                <div className="absolute right-0 top-full mt-1 w-52 rounded-lg border border-border bg-popover shadow-lg z-50 overflow-hidden">
                  <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-muted/30">
                    <FileDown className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-[12px] font-semibold text-foreground">Export As</span>
                  </div>
                  <div className="py-1">
                    {exportFormats.map((fmt) => (
                      <button
                        key={fmt.format}
                        onClick={() => handleExport(fmt.format)}
                        className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-muted/50 transition-colors text-left"
                      >
                        <span className="text-[14px]">{fmt.icon}</span>
                        <span className="text-[12px] font-medium text-foreground">{fmt.label}</span>
                        <span className="ml-auto text-[10px] text-muted-foreground uppercase">.{fmt.format}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleCopy} title="Copy"><Copy className="h-3.5 w-3.5" /></Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleShare} title="Share"><Share2 className="h-3.5 w-3.5" /></Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleDownload} title="Download"><Download className="h-3.5 w-3.5" /></Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setFullscreen(true)} title="Fullscreen"><Maximize2 className="h-3.5 w-3.5" /></Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setOpen(false)} title="Close"><X className="h-4 w-4 text-red-500" /></Button>
          </div>
        </div>

        {/* Enhanced Tab Bar */}
        {tabs.length > 0 && (
          <div className="flex items-center gap-0.5 px-2 py-1 border-b border-border/50 bg-muted/10 shrink-0">
            <div className="flex items-center gap-0.5 overflow-x-auto scrollbar-none flex-1">
              {tabs.map((tab) => {
                const TabIcon = getTabTypeIcon(tab);
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    onAuxClick={(e) => { if (e.button === 1) { e.preventDefault(); removeTab(tab.id); } }}
                    className={cn(
                      "group flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium shrink-0 max-w-[160px] border border-transparent transition-colors",
                      activeTabId === tab.id ? "bg-primary/10 text-primary border-primary/20" : "hover:bg-muted text-muted-foreground"
                    )}
                  >
                    <TabIcon className="h-3 w-3 shrink-0 text-muted-foreground" />
                    {/* Streaming indicator */}
                    {tab.isStreaming && (
                      <span className="relative flex h-2 w-2 shrink-0">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75" />
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-orange-500" />
                      </span>
                    )}
                    <span className="truncate">{tab.title.slice(0, 25)}</span>
                    {/* Close button — visible on hover or always for active tab */}
                    <span
                      onClick={(e) => { e.stopPropagation(); removeTab(tab.id); }}
                      className={cn(
                        "ml-0.5 rounded p-0.5 cursor-pointer transition-opacity",
                        activeTabId === tab.id ? "opacity-60 hover:opacity-100 hover:bg-destructive/10" : "opacity-0 group-hover:opacity-60 hover:!opacity-100 hover:bg-destructive/10"
                      )}
                    >
                      <X className="h-2.5 w-2.5" />
                    </span>
                  </button>
                );
              })}
            </div>
            {tabs.length > 3 && (
              <span className="text-[10px] text-muted-foreground shrink-0 ml-1 px-1.5 py-0.5 rounded bg-muted/50">
                {tabs.length} tabs
              </span>
            )}
          </div>
        )}

        {/* Artifact Type Indicator */}
        {detectedArtifact && (
          <div className="flex items-center gap-2 px-3 py-1 border-b border-border/30 bg-muted/5 shrink-0">
            {(() => {
              const TypeIcon = getTabTypeIcon(activeTab);
              return <TypeIcon className="h-3 w-3 text-muted-foreground shrink-0" />;
            })()}
            <span className="text-[11px] font-medium text-muted-foreground capitalize">{detectedArtifact.type}</span>
            <span className="text-[10px] text-muted-foreground/60">·</span>
            <span className="text-[10px] px-1.5 py-0 rounded bg-muted/40 text-muted-foreground font-mono uppercase">.{detectedArtifact.exportFormat}</span>
            <span className="text-[10px] text-muted-foreground/60">·</span>
            <span className="text-[10px] text-muted-foreground/70">{detectedArtifact.mimeType}</span>
            {activeTab.isStreaming && (
              <>
                <span className="text-[10px] text-muted-foreground/60">·</span>
                <span className="flex items-center gap-1 text-[10px] text-orange-500">
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-orange-500" />
                  </span>
                  streaming
                </span>
              </>
            )}
          </div>
        )}

        <div className="flex-1 overflow-hidden">
          {renderContent()}
        </div>
      </div>
    </>
  );
}

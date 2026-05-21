"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useArtifactPreviewStore, type PreviewTab } from "@/lib/artifact-store";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  X, Minimize2, Maximize2, Download, Share2, Copy, Pin, PinOff,
  ChevronLeft, ChevronRight, PanelRight, ExternalLink, GripVertical,
  FileText, Code2, Sheet, Presentation, GitFork, Image, BarChart3, History, Plus, Pencil,
} from "lucide-react";
import SandboxPreview from "./SandboxPreview";
import { toast } from "sonner";
import { handleDownloadMessage } from "@/lib/artifact-actions";

const MIN_WIDTH = 320;
const MAX_WIDTH = 900;
const DEFAULT_WIDTH = 500;

const TYPE_ICONS: Record<string, React.ComponentType<any>> = {
  document: FileText,
  code: Code2,
  sandbox: Code2,
  spreadsheet: Sheet,
  presentation: Presentation,
  diagram: GitFork,
  markdown: FileText,
  html: Code2,
  chart: BarChart3,
  canvas: Image,
  image: Image,
};

const TYPE_LABELS: Record<string, string> = {
  document: "Document",
  code: "Code",
  sandbox: "Sandbox",
  spreadsheet: "Sheet",
  presentation: "Slides",
  diagram: "Diagram",
  markdown: "Document",
  html: "Preview",
  chart: "Chart",
  canvas: "Canvas",
  image: "Image",
};

export default function ArtifactPreviewPanel() {
  const {
    isOpen, tabs, activeTabId, isFullscreen, width,
    setOpen, setWidth, setActiveTab, removeTab, togglePin,
    setFullscreen, closeAll,
  } = useArtifactPreviewStore();

  const [isDragging, setIsDragging] = useState(false);
  const [editingContent, setEditingContent] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const dragStartRef = useRef(0);
  const widthRef = useRef(width);

  const activeTab = tabs.find((t) => t.id === activeTabId) || null;

  useEffect(() => {
    widthRef.current = width;
  }, [width]);

  const onResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    dragStartRef.current = e.clientX;
    const onMove = (ev: MouseEvent) => {
      const delta = dragStartRef.current - ev.clientX;
      const newWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, widthRef.current + delta));
      setWidth(newWidth);
      dragStartRef.current = ev.clientX;
      widthRef.current = newWidth;
    };
    const onUp = () => {
      setIsDragging(false);
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, [setWidth]);

  const handleDownload = (tab: PreviewTab) => {
    const format = tab.type === "spreadsheet" ? "xlsx"
      : tab.type === "presentation" ? "pptx"
      : tab.type === "code" || tab.type === "html" ? "html"
      : "docx";

    if (format === "html" || format === "md") {
      const ext = format === "md" ? "md" : "html";
      const blob = new Blob([tab.content], { type: format === "md" ? "text/markdown" : "text/html" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `${tab.title}.${ext}`; a.click();
      URL.revokeObjectURL(url);
    } else {
      const payload = {
        type: format as string,
        data: {
          title: tab.title,
          content: tab.content,
          sections: [{ heading: "Content", body: tab.content.slice(0, 30000) }],
        },
        filename: `${tab.title.replace(/[^a-zA-Z0-9]/g, "_")}.${format}`,
      };
      fetch("/api/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
        .then((r) => r.blob())
        .then((blob) => {
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url; a.download = payload.filename; a.click();
          URL.revokeObjectURL(url);
        })
        .catch(() => toast.error("Download failed"));
    }
    toast.success(`Downloading ${tab.title}`);
  };

  const handleShare = async (tab: PreviewTab) => {
    try {
      const res = await fetch("/api/artifacts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: tab.title, type: tab.type, content: tab.content }) });
      const data = await res.json();
      const shareRes = await fetch(`/api/artifacts/${data.id}/share`, { method: "POST" });
      const shareData = await shareRes.json();
      await navigator.clipboard.writeText(`${window.location.origin}/api/share/${shareData.shareToken}`);
      toast.success("Share link copied!");
    } catch {
      toast.error("Share failed");
    }
  };

  const handleCopyContent = (tab: PreviewTab) => {
    navigator.clipboard.writeText(tab.content);
    toast.success("Content copied");
  };

  if (!isOpen) return null;

  if (isFullscreen) {
    return (
      <div className="fixed inset-0 z-50 bg-background flex flex-col">
        <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-card shrink-0">
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setFullscreen(false)}>
            <Minimize2 className="h-3.5 w-3.5 mr-1" /> Exit Fullscreen
          </Button>
          <div className="flex-1" />
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setOpen(false)}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
        <div className="flex-1 overflow-hidden">{renderContent(activeTab)}</div>
      </div>
    );
  }

  return (
    <div
      ref={panelRef}
      className={cn("flex flex-col border-l border-border bg-card/50 h-full shrink-0 animate-slide-in-right", isDragging && "select-none")}
      style={{ width: `${width}px`, minWidth: `${MIN_WIDTH}px` }}
    >
      {/* Header */}
      <div className="flex items-center gap-1 px-3 py-2 border-b border-border bg-muted/30 shrink-0">
        <PanelRight className="h-3.5 w-3.5 text-primary" />
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Preview</span>
        <div className="flex-1" />
        {/* Tabs */}
        <div className="flex items-center gap-0.5 max-w-[60%] overflow-x-auto scrollbar-none">
          {tabs.map((tab) => {
            const Icon = TYPE_ICONS[tab.type] || FileText;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-medium transition-colors shrink-0 max-w-[120px]",
                  activeTabId === tab.id
                    ? "bg-primary/10 text-primary border border-primary/20"
                    : "hover:bg-muted text-muted-foreground border border-transparent"
                )}
              >
                {tab.isPinned && <Pin className="h-2.5 w-2.5 text-amber-500 shrink-0" />}
                <Icon className="h-3 w-3 shrink-0" />
                <span className="truncate">{tab.title.slice(0, 20)}</span>
                {tab.isStreaming && <span className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse shrink-0" />}
                <button
                  onClick={(e) => { e.stopPropagation(); removeTab(tab.id); }}
                  className="ml-0.5 hover:bg-destructive/10 rounded p-0.5 shrink-0"
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              </button>
            );
          })}
        </div>
        <Button variant="ghost" size="sm" className="h-6 w-6 p-0 shrink-0" onClick={() => {
          const id = Math.random().toString(36).substring(2, 8);
          const tab: PreviewTab = { id, title: "New Preview", type: "markdown", content: "", isPinned: false, isStreaming: false, createdAt: Date.now() };
          useArtifactPreviewStore.getState().addTab(tab);
        }}>
          <Plus className="h-3 w-3" />
        </Button>
        <Button variant="ghost" size="sm" className="h-6 w-6 p-0 shrink-0" onClick={() => setFullscreen(true)}>
          <Maximize2 className="h-3 w-3" />
        </Button>
      </div>

      {/* Content Area */}
      {activeTab ? (
        <TabContent tab={activeTab} onDownload={handleDownload} onShare={handleShare} onCopy={handleCopyContent} />
      ) : (
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="text-center">
            <PanelRight className="h-10 w-10 text-muted-foreground/20 mx-auto mb-2" />
            <p className="text-xs text-muted-foreground">No active preview</p>
            <p className="text-[10px] text-muted-foreground/60 mt-1">Generate content in the chat to see it here</p>
          </div>
        </div>
      )}

      {/* Resize Handle */}
      <div
        className="absolute top-0 left-0 w-1.5 h-full cursor-col-resize hover:bg-primary/30 active:bg-primary/50 transition-colors z-10"
        onMouseDown={onResizeStart}
      />

      {/* Close button */}
      <button
        onClick={() => setOpen(false)}
        className="absolute -left-3 top-1/2 -translate-y-1/2 h-6 w-6 rounded-full bg-border hover:bg-muted-foreground/20 flex items-center justify-center shadow-sm border border-border"
        title="Close preview panel"
      >
        <ChevronRight className="h-3 w-3 text-muted-foreground" />
      </button>
    </div>
  );
}

function TabContent({
  tab,
  onDownload,
  onShare,
  onCopy,
}: {
  tab: PreviewTab;
  onDownload: (t: PreviewTab) => void;
  onShare: (t: PreviewTab) => void;
  onCopy: (t: PreviewTab) => void;
}) {
  const { updateTab } = useArtifactPreviewStore();
  const [isEditing, setIsEditing] = useState(false);

  const handleTogglePin = () => {
    useArtifactPreviewStore.getState().togglePin(tab.id);
  };

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* Tab Action Bar */}
      <div className="flex items-center gap-1 px-2 py-1 border-b border-border/50 bg-muted/10 shrink-0">
        <span className="text-[10px] font-mono text-muted-foreground uppercase">{TYPE_LABELS[tab.type] || "Preview"}</span>
        <div className="flex-1" />
        <Button variant="ghost" size="sm" className="h-5 px-1.5 text-[10px]" onClick={handleTogglePin}>
          {tab.isPinned ? <Pin className="h-3 w-3 text-amber-500" /> : <PinOff className="h-3 w-3" />}
        </Button>
        <Button variant="ghost" size="sm" className="h-5 px-1.5 text-[10px]" onClick={() => onCopy(tab)}>
          <Copy className="h-3 w-3" />
        </Button>
        <Button variant="ghost" size="sm" className="h-5 px-1.5 text-[10px]" onClick={() => onShare(tab)}>
          <Share2 className="h-3 w-3" />
        </Button>
        <Button variant="ghost" size="sm" className="h-5 px-1.5 text-[10px]" onClick={() => onDownload(tab)}>
          <Download className="h-3 w-3" />
        </Button>
        <Button variant="ghost" size="sm" className="h-5 px-1.5 text-[10px]" onClick={() => setIsEditing(!isEditing)}>
          <Pencil className="h-3 w-3" />
        </Button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {renderContent(tab)}
      </div>
    </div>
  );
}

function renderContent(tab: PreviewTab | null) {
  if (!tab) return null;

  const content = tab.content || "";

  switch (tab.type) {
    case "code":
    case "sandbox":
      return <SandboxPreview code={content} type={content.includes("<!DOCTYPE") || content.includes("<html") ? "html" : "code"} />;

    case "html":
      return <SandboxPreview code={content} type="html" />;

    case "diagram":
      return (
        <div className="p-4 h-full overflow-auto">
          <pre className="text-xs font-mono bg-muted/30 p-4 rounded-lg whitespace-pre-wrap">{content}</pre>
        </div>
      );

    case "spreadsheet":
      return <SpreadsheetPreview content={content} />;

    case "markdown":
    case "document":
    case "presentation":
      return <MarkdownPreview content={content} />;

    case "chart":
      return <ChartPreview content={content} />;

    case "canvas":
    case "image":
      return (
        <div className="p-4 h-full overflow-auto flex items-center justify-center">
          <pre className="text-xs font-mono bg-muted/30 p-4 rounded-lg max-w-full whitespace-pre-wrap">{content}</pre>
        </div>
      );

    default:
      return (
        <div className="p-4 h-full overflow-auto">
          <div className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap font-mono text-xs">{content}</div>
        </div>
      );
  }
}

function MarkdownPreview({ content }: { content: string }) {
  return (
    <div className="p-4 h-full overflow-y-auto">
      <div
        className="prose prose-sm dark:prose-invert max-w-none"
        dangerouslySetInnerHTML={{
          __html: content
            .replace(/#{1,3}\s(.+)/g, (_, t) => `<h${_.match(/^#+/)?.[0].length || 1} style="margin:12px 0;font-weight:700;font-size:${_.startsWith("###") ? "16px" : _.startsWith("##") ? "20px" : "24px"}">${t}</h${_.match(/^#+/)?.[0].length || 1}>`)
            .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
            .replace(/\*(.+?)\*/g, "<em>$1</em>")
            .replace(/`(.+?)`/g, "<code style='background:#f3f4f6;padding:2px 6px;border-radius:4px;font-size:13px'>$1</code>")
            .replace(/```[\s\S]*?```/g, (m) => `<pre style='background:#1e1e1e;color:#d4d4d4;padding:12px;border-radius:8px;overflow-x:auto'><code>${m.replace(/```[\w]*\n?/g, "").replace(/```/g, "").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</code></pre>`)
            .replace(/\n/g, "<br/>"),
        }}
      />
    </div>
  );
}

function SpreadsheetPreview({ content }: { content: string }) {
  const lines = content.split("\n").filter((l) => l.trim());
  const rows = lines.map((l) => l.split("|").filter((c) => c.trim()));

  return (
    <div className="p-2 h-full overflow-auto">
      <table className="w-full border-collapse text-xs">
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className={cn(i === 0 && "bg-muted/50 font-semibold", "border-b border-border")}>
              {row.map((cell, j) => (
                <td key={j} className="px-3 py-1.5 border-r border-border/50 last:border-r-0">{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ChartPreview({ content }: { content: string }) {
  return (
    <div className="p-4 h-full overflow-auto">
      <pre className="text-xs font-mono bg-muted/30 p-4 rounded-lg whitespace-pre-wrap">{content}</pre>
    </div>
  );
}

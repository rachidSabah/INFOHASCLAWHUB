"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  Sparkles, FileText, Sheet, Presentation, Code2, Image, Download,
  Share2, Trash2, Copy, ExternalLink, Loader2, Eye, History, Plus,
  LayoutGrid, FileSpreadsheet, FileCode2, GripHorizontal,
  MonitorPlay, PenTool, X,
} from "lucide-react";

interface Artifact {
  id: string;
  title: string;
  type: string;
  content: string;
  metadata: string | null;
  version: number;
  isPublic: boolean;
  shareToken: string | null;
  viewCount: number;
  createdAt: string;
  updatedAt: string;
  versions?: ArtifactVersion[];
}

interface ArtifactVersion {
  id: string;
  version: number;
  content: string;
  changeLog: string | null;
  createdAt: string;
}

const ARTIFACT_TYPES = [
  { type: "document", label: "Document", icon: FileText, prompt: "document" },
  { type: "report", label: "Report", icon: FileText, prompt: "report" },
  { type: "spreadsheet", label: "Spreadsheet", icon: FileSpreadsheet, prompt: "spreadsheet" },
  { type: "presentation", label: "Presentation", icon: Presentation, prompt: "presentation" },
  { type: "markdown", label: "Markdown", icon: FileText, prompt: "markdown document" },
  { type: "code", label: "Code", icon: FileCode2, prompt: "code artifact" },
  { type: "diagram", label: "Diagram", icon: GripHorizontal, prompt: "diagram" },
  { type: "canvas", label: "Canvas", icon: Image, prompt: "visual canvas" },
  { type: "whiteboard", label: "Whiteboard", icon: PenTool, prompt: "whiteboard" },
  { type: "infographic", label: "Infographic", icon: MonitorPlay, prompt: "infographic" },
];

async function fetchAPI(url: string, options?: RequestInit) {
  const res = await fetch(url, options);
  if (!res.ok) throw new Error(await res.text());
  return res;
}

export default function ArtifactPanel({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [selectedType, setSelectedType] = useState("document");
  const [streamingContent, setStreamingContent] = useState("");
  const [activeArtifact, setActiveArtifact] = useState<Artifact | null>(null);
  const [viewingArtifact, setViewingArtifact] = useState<Artifact | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [editingContent, setEditingContent] = useState("");
  const [activeTab, setActiveTab] = useState<"browse" | "create" | "view" | "edit">("browse");
  const streamRef = useRef<AbortController | null>(null);

  const loadArtifacts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchAPI("/api/artifacts");
      const data = await res.json();
      setArtifacts(data);
    } catch {
      toast.error("Failed to load artifacts");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (open) loadArtifacts(); }, [open, loadArtifacts]);

  const generateArtifact = async () => {
    if (!prompt.trim()) return;
    setGenerating(true);
    setStreamingContent("");
    setActiveTab("create");

    try {
      const abort = new AbortController();
      streamRef.current = abort;

      const res = await fetch("/api/artifacts/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, artifactType: selectedType }),
        signal: abort.signal,
      });

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let artifactId = "";

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const text = decoder.decode(value, { stream: true });
          const lines = text.split("\n");
          for (const line of lines) {
            if (line.startsWith("data: ")) {
              try {
                const data = JSON.parse(line.slice(6));
                if (data.type === "init") {
                  artifactId = data.artifactId;
                } else if (data.type === "chunk") {
                  setStreamingContent((prev) => prev + data.content);
                } else if (data.type === "done") {
                  toast.success("Artifact generated");
                  await loadArtifacts();
                  if (artifactId) {
                    const aRes = await fetchAPI(`/api/artifacts/${artifactId}`);
                    const artifact = await aRes.json();
                    setViewingArtifact(artifact);
                    setActiveTab("view");
                  }
                }
              } catch {}
            }
          }
        }
      }
    } catch (e: any) {
      if (e.name !== "AbortError") toast.error("Generation failed");
    } finally {
      setGenerating(false);
    }
  };

  const handleShare = async (artifact: Artifact) => {
    try {
      const res = await fetchAPI(`/api/artifacts/${artifact.id}/share`, { method: "POST" });
      const data = await res.json();
      const shareURL = `${window.location.origin}/api/share/${data.shareToken}`;
      await navigator.clipboard.writeText(shareURL);
      toast.success("Share link copied to clipboard");
      loadArtifacts();
    } catch {
      toast.error("Failed to share");
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await fetchAPI(`/api/artifacts/${id}`, { method: "DELETE" });
      toast.success("Artifact deleted");
      loadArtifacts();
    } catch {
      toast.error("Failed to delete");
    }
  };

  const handleDownload = (artifact: Artifact) => {
    const typeMap: Record<string, string> = {
      document: "docx",
      report: "docx",
      spreadsheet: "xlsx",
      presentation: "pptx",
      markdown: "md",
      code: "md",
      diagram: "html",
      canvas: "html",
      whiteboard: "html",
      infographic: "html",
    };

    const format = typeMap[artifact.type] || "md";

    if (["html", "md", "csv"].includes(format)) {
      let content = artifact.content;
      if (format === "csv") {
        content = `Col1,Col2\n${artifact.content.replace(/\n/g, ",")}\n`;
      }
      const mimeMap: Record<string, string> = { html: "text/html", md: "text/markdown", csv: "text/csv" };
      const blob = new Blob([content], { type: mimeMap[format] });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `${artifact.title}.${format}`; a.click();
      URL.revokeObjectURL(url);
      toast.success(`Downloaded as .${format}`);
    } else {
      const payload = {
        type: format,
        data: artifact.type === "spreadsheet"
          ? { data: [artifact.content.split("\n").map((l: string) => [l])] }
          : artifact.type === "presentation"
          ? { title: artifact.title, content: artifact.content }
          : artifact.type === "markdown"
          ? { content: artifact.content }
          : { title: artifact.title, content: artifact.content, sections: [{ heading: "Content", body: artifact.content }] },
        filename: `${artifact.title}.${format}`,
      };

      fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
        .then((res) => res.blob())
        .then((blob) => {
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url; a.download = `${artifact.title}.${format}`; a.click();
          URL.revokeObjectURL(url);
          toast.success(`Exported as .${format}`);
        })
        .catch(() => toast.error("Export failed"));
    }
  };

  const handleSaveEdit = async () => {
    if (!viewingArtifact) return;
    try {
      await fetchAPI(`/api/artifacts/${viewingArtifact.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: editingTitle, content: editingContent }),
      });
      toast.success("Artifact updated");
      loadArtifacts();
      setActiveTab("view");
    } catch {
      toast.error("Failed to update");
    }
  };

  const typeMeta = ARTIFACT_TYPES.find((t) => t.type === (viewingArtifact?.type || selectedType));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl h-[85vh] flex flex-col p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-6 py-4 border-b border-border shrink-0">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4 text-purple-500" />
            AI Artifacts Studio
          </DialogTitle>
        </DialogHeader>

        {/* Tabs */}
        <div className="flex gap-1 px-6 py-2 border-b border-border bg-muted/30 shrink-0">
          {(["browse", "create", "view", "edit"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => {
                if (tab === "view" && !viewingArtifact) return;
                setActiveTab(tab);
                if (tab === "edit" && viewingArtifact) {
                  setEditingTitle(viewingArtifact.title);
                  setEditingContent(viewingArtifact.content);
                }
              }}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                activeTab === tab
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              disabled={tab === "view" && !viewingArtifact}
            >
              {tab === "browse" && <LayoutGrid className="h-3 w-3 inline mr-1" />}
              {tab === "create" && <Plus className="h-3 w-3 inline mr-1" />}
              {tab === "view" && <Eye className="h-3 w-3 inline mr-1" />}
              {tab === "edit" && <PenTool className="h-3 w-3 inline mr-1" />}
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
          <div className="flex-1" />
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)} className="h-7 w-7 p-0">
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden">
          {/* Browse */}
          {activeTab === "browse" && (
            <div className="h-full overflow-y-auto p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold">Your Artifacts ({artifacts.length})</h3>
                <Button size="sm" onClick={() => setActiveTab("create")} className="h-8 text-xs">
                  <Plus className="h-3 w-3 mr-1" /> New
                </Button>
              </div>
              {loading ? (
                <div className="flex items-center justify-center h-40">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : artifacts.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-60 text-center">
                  <Sparkles className="h-12 w-12 text-muted-foreground/30 mb-3" />
                  <p className="text-sm text-muted-foreground mb-2">No artifacts yet</p>
                  <p className="text-xs text-muted-foreground/60 mb-4">Generate documents, spreadsheets, presentations, and more</p>
                  <Button onClick={() => setActiveTab("create")} size="sm">Create your first artifact</Button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {artifacts.map((a) => {
                    const Icon = ARTIFACT_TYPES.find((t) => t.type === a.type)?.icon || FileText;
                    return (
                      <div
                        key={a.id}
                        className="border border-border rounded-lg p-4 hover:border-primary/50 hover:bg-muted/20 transition-colors cursor-pointer group"
                        onClick={() => {
                          fetchAPI(`/api/artifacts/${a.id}`)
                            .then((r) => r.json())
                            .then((data) => {
                              setViewingArtifact(data);
                              setActiveTab("view");
                            });
                        }}
                      >
                        <div className="flex items-start justify-between mb-2">
                          <Icon className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={(e) => { e.stopPropagation(); handleShare(a); }}
                              className="p-1 rounded hover:bg-muted"
                              title="Share"
                            >
                              <Share2 className="h-3 w-3 text-muted-foreground" />
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); handleDownload(a); }}
                              className="p-1 rounded hover:bg-muted"
                              title="Download"
                            >
                              <Download className="h-3 w-3 text-muted-foreground" />
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); handleDelete(a.id); }}
                              className="p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/20"
                              title="Delete"
                            >
                              <Trash2 className="h-3 w-3 text-red-500" />
                            </button>
                          </div>
                        </div>
                        <h4 className="text-sm font-medium truncate mb-1">{a.title}</h4>
                        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                          <span className="px-1.5 py-0.5 rounded-full bg-muted capitalize">{a.type}</span>
                          <span>v{a.version}</span>
                          {a.isPublic && <span className="text-green-500">Public</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Create */}
          {(activeTab === "create" || activeTab === "view") && activeTab === "create" && (
            <div className="h-full flex flex-col">
              <div className="p-6 space-y-4">
                <div className="grid grid-cols-5 gap-2">
                  {ARTIFACT_TYPES.map((t) => {
                    const Icon = t.icon;
                    return (
                      <button
                        key={t.type}
                        onClick={() => setSelectedType(t.type)}
                        className={`flex flex-col items-center gap-1.5 p-3 rounded-lg border text-xs transition-colors ${
                          selectedType === t.type
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border hover:border-primary/30 hover:bg-muted/30 text-muted-foreground"
                        }`}
                      >
                        <Icon className="h-5 w-5" />
                        {t.label}
                      </button>
                    );
                  })}
                </div>
                <Textarea
                  placeholder="Describe what you want to generate... (e.g. 'Create a business plan for a SaaS startup')"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  rows={3}
                  className="resize-none text-sm"
                />
                <Button onClick={generateArtifact} disabled={generating || !prompt.trim()} className="w-full">
                  {generating ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Generating...</>
                  ) : (
                    <><Sparkles className="h-4 w-4 mr-2" /> Generate {ARTIFACT_TYPES.find((t) => t.type === selectedType)?.label}</>
                  )}
                </Button>
              </div>
              {streamingContent && (
                <div className="flex-1 overflow-hidden border-t border-border">
                  <div className="h-full overflow-y-auto p-6">
                    <div className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap font-mono text-sm">
                      {streamingContent}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* View */}
          {activeTab === "view" && viewingArtifact && (
            <div className="h-full flex flex-col">
              <div className="flex items-center justify-between px-6 py-3 border-b border-border bg-muted/30 shrink-0">
                <div className="flex items-center gap-2">
                  {typeMeta && <typeMeta.icon className="h-4 w-4 text-primary" />}
                  <h3 className="text-sm font-semibold">{viewingArtifact.title}</h3>
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted capitalize">{viewingArtifact.type}</span>
                  <span className="text-[10px] text-muted-foreground">v{viewingArtifact.version}</span>
                </div>
                <div className="flex gap-1">
                  <Button variant="outline" size="sm" className="h-7 text-[10px]" onClick={() => handleShare(viewingArtifact)}>
                    <Share2 className="h-3 w-3 mr-1" />Share
                  </Button>
                  <Button variant="outline" size="sm" className="h-7 text-[10px]" onClick={() => handleDownload(viewingArtifact)}>
                    <Download className="h-3 w-3 mr-1" />Export
                  </Button>
                  <Button variant="outline" size="sm" className="h-7 text-[10px]" onClick={() => {
                    setEditingTitle(viewingArtifact.title);
                    setEditingContent(viewingArtifact.content);
                    setActiveTab("edit");
                  }}>
                    <PenTool className="h-3 w-3 mr-1" />Edit
                  </Button>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-6">
                <div className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap text-sm">
                  {viewingArtifact.content || "(empty artifact)"}
                </div>
                {viewingArtifact.versions && viewingArtifact.versions.length > 1 && (
                  <div className="mt-6 pt-4 border-t border-border">
                    <h4 className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1">
                      <History className="h-3 w-3" /> Version History ({viewingArtifact.versions.length})
                    </h4>
                    <div className="space-y-1">
                      {viewingArtifact.versions.map((v) => (
                        <div key={v.id} className="text-[10px] text-muted-foreground flex justify-between py-1 px-2 rounded hover:bg-muted">
                          <span>v{v.version} — {v.changeLog || "Update"}</span>
                          <span>{new Date(v.createdAt).toLocaleDateString()}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Edit */}
          {activeTab === "edit" && viewingArtifact && (
            <div className="h-full flex flex-col">
              <div className="px-6 py-3 border-b border-border bg-muted/30 shrink-0 flex items-center gap-3">
                <Input
                  value={editingTitle}
                  onChange={(e) => setEditingTitle(e.target.value)}
                  className="flex-1 h-8 text-sm font-medium"
                  placeholder="Title"
                />
                <Button size="sm" onClick={handleSaveEdit} className="h-8 text-xs">
                  Save Changes
                </Button>
              </div>
              <div className="flex-1 p-6">
                <Textarea
                  value={editingContent}
                  onChange={(e) => setEditingContent(e.target.value)}
                  className="h-full min-h-[400px] resize-none font-mono text-sm"
                  placeholder="Artifact content..."
                />
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

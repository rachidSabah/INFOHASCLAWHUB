"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  Code2,
  Sparkles,
  Camera,
  FolderOpen,
  Plus,
  Trash2,
  Loader2,
  Eye,
  EyeOff,
  Download,
  Save,
  Wand2,
  ImagePlus,
  FileCode,
  Layout,
  Copy,
  Check,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

interface UIBuilderProject {
  id: string;
  name: string;
  description?: string | null;
  framework: string;
  components: string;
  generatedCode?: string | null;
  previewUrl?: string | null;
  createdAt: string;
  updatedAt: string;
}

interface UIBuilderPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function UIBuilderPanel({ open, onOpenChange }: UIBuilderPanelProps) {
  const [activeTab, setActiveTab] = useState("projects");
  const [projects, setProjects] = useState<UIBuilderProject[]>([]);
  const [loading, setLoading] = useState(false);

  // Project form
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newFramework, setNewFramework] = useState("react");
  const [creating, setCreating] = useState(false);

  // Generate tab
  const [genDescription, setGenDescription] = useState("");
  const [genFramework, setGenFramework] = useState("react");
  const [genCode, setGenCode] = useState("");
  const [generating, setGenerating] = useState(false);

  // Screenshot tab
  const [ssDescription, setSsDescription] = useState("");
  const [ssFramework, setSsFramework] = useState("react");
  const [ssCode, setSsCode] = useState("");
  const [ssConverting, setSsConverting] = useState(false);
  const [ssDragOver, setSsDragOver] = useState(false);
  const [ssImagePreview, setSsImagePreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Editor tab
  const [editorCode, setEditorCode] = useState("");
  const [editorProjectId, setEditorProjectId] = useState<string | null>(null);
  const [editorProjectName, setEditorProjectName] = useState("");
  const [editorFramework, setEditorFramework] = useState("react");
  const [showPreview, setShowPreview] = useState(true);
  const [saving, setSaving] = useState(false);
  const [optimizing, setOptimizing] = useState(false);
  const [copied, setCopied] = useState(false);

  // ── Fetch Projects ──
  const fetchProjects = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/ui-builder/projects");
      if (res.ok) {
        const data = await res.json();
        setProjects(data);
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  // ── Init ──
  useEffect(() => {
    if (!open) return;
    fetchProjects();
  }, [open, fetchProjects]);

  // ── Create Project ──
  const createProject = async () => {
    if (!newName.trim()) {
      toast.error("Project name is required");
      return;
    }
    setCreating(true);
    try {
      const res = await fetch("/api/ui-builder/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName.trim(),
          description: newDesc.trim() || null,
          framework: newFramework,
        }),
      });
      if (res.ok) {
        toast.success("Project created");
        setNewName("");
        setNewDesc("");
        await fetchProjects();
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to create project");
      }
    } catch {
      toast.error("Failed to create project");
    } finally {
      setCreating(false);
    }
  };

  // ── Delete Project ──
  const deleteProject = async (id: string) => {
    try {
      const res = await fetch(`/api/ui-builder/projects/${id}`, { method: "DELETE" });
      if (res.ok) {
        toast.success("Project deleted");
        if (editorProjectId === id) {
          setEditorProjectId(null);
          setEditorCode("");
          setEditorProjectName("");
        }
        await fetchProjects();
      } else {
        toast.error("Failed to delete project");
      }
    } catch {
      toast.error("Failed to delete project");
    }
  };

  // ── Open Project in Editor ──
  const openInEditor = (project: UIBuilderProject) => {
    setEditorProjectId(project.id);
    setEditorProjectName(project.name);
    setEditorFramework(project.framework);
    setEditorCode(project.generatedCode || "");
    setActiveTab("editor");
  };

  // ── Generate Component ──
  const generateComponent = async () => {
    if (!genDescription.trim()) {
      toast.error("Description is required");
      return;
    }
    setGenerating(true);
    setGenCode("");
    try {
      const res = await fetch("/api/ui-builder/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: genDescription.trim(),
          framework: genFramework,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setGenCode(data.generatedCode || "");
        toast.success("Component generated");
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to generate");
      }
    } catch {
      toast.error("Failed to generate component");
    } finally {
      setGenerating(false);
    }
  };

  // ── Screenshot → Code ──
  const convertScreenshot = async (description: string) => {
    if (!description.trim()) {
      toast.error("Please describe the screenshot or upload an image");
      return;
    }
    setSsConverting(true);
    setSsCode("");
    try {
      const res = await fetch("/api/ui-builder/screenshot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          screenshotDescription: description.trim(),
          framework: ssFramework,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setSsCode(data.generatedCode || "");
        toast.success("Screenshot converted to code");
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to convert screenshot");
      }
    } catch {
      toast.error("Failed to convert screenshot");
    } finally {
      setSsConverting(false);
    }
  };

  // ── Handle Image Upload ──
  const handleImageUpload = (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("Please upload an image file");
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      setSsImagePreview(dataUrl);
      // Describe what we see
      const desc = `A screenshot/image showing a UI layout. File: ${file.name}. Please convert this visual design to code.`;
      setSsDescription(desc);
    };
    reader.readAsDataURL(file);
  };

  // ── Drag & Drop Handlers ──
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setSsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setSsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setSsDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleImageUpload(file);
  };

  // ── Save to Project ──
  const saveToProject = async () => {
    if (!editorProjectId) {
      toast.error("No project selected");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/ui-builder/projects/${editorProjectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ generatedCode: editorCode }),
      });
      if (res.ok) {
        toast.success("Saved to project");
        await fetchProjects();
      } else {
        toast.error("Failed to save");
      }
    } catch {
      toast.error("Failed to save");
    } finally {
      setSaving(false);
    }
  };

  // ── Optimize Code ──
  const optimizeCode = async () => {
    if (!editorCode.trim()) {
      toast.error("No code to optimize");
      return;
    }
    setOptimizing(true);
    try {
      const res = await fetch("/api/ui-builder/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: `Optimize and improve the following ${editorFramework} component code. Fix any issues, improve performance, add best practices, and ensure clean code:\n\n${editorCode}`,
          framework: editorFramework,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.generatedCode) {
          setEditorCode(data.generatedCode);
          toast.success("Code optimized");
        }
      } else {
        toast.error("Failed to optimize");
      }
    } catch {
      toast.error("Failed to optimize code");
    } finally {
      setOptimizing(false);
    }
  };

  // ── Download Code ──
  const downloadCode = () => {
    if (!editorCode.trim()) return;
    const ext = editorFramework === "react" ? "tsx" : editorFramework === "vue" ? "vue" : "html";
    const blob = new Blob([editorCode], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${editorProjectName || "component"}.${ext}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("Downloaded");
  };

  // ── Copy Code ──
  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    toast.success("Copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  };

  // ── Open Generated Code in Editor ──
  const openGeneratedInEditor = (code: string, source: string) => {
    setEditorProjectId(null);
    setEditorProjectName(`Generated (${source})`);
    setEditorFramework(genFramework);
    setEditorCode(code);
    setActiveTab("editor");
  };

  // ── Build iframe srcDoc for preview ──
  const buildPreviewSrcDoc = (code: string, framework: string): string => {
    if (framework === "html") {
      return code;
    }
    // For React/Vue, wrap in an HTML doc with CDN
    if (framework === "react") {
      return `<!DOCTYPE html>
<html><head>
<script src="https://unpkg.com/react@18/umd/react.development.js"><\/script>
<script src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"><\/script>
<script src="https://unpkg.com/@babel/standalone/babel.min.js"><\/script>
<style>body{margin:0;font-family:sans-serif;}*{box-sizing:border-box;}</style>
</head><body>
<div id="root"></div>
<script type="text/babel">
${code}
try { ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(App || Component || (() => React.createElement('div',null,'No App/Component export found')))); } catch(e) { document.getElementById('root').innerHTML = '<pre style="color:red;padding:16px;">' + e.message + '</pre>'; }
<\/script>
</body></html>`;
    }
    if (framework === "vue") {
      return `<!DOCTYPE html>
<html><head>
<script src="https://unpkg.com/vue@3/dist/vue.global.js"><\/script>
<style>body{margin:0;font-family:sans-serif;}*{box-sizing:border-box;}</style>
</head><body>
<div id="app"></div>
<script>
${code}
try { const app = Vue.createApp({}); if (typeof template !== 'undefined') app.template = template; Vue.createApp(typeof App !== 'undefined' ? App : {}).mount('#app'); } catch(e) { document.getElementById('app').innerHTML = '<pre style="color:red;padding:16px;">' + e.message + '</pre>'; }
<\/script>
</body></html>`;
    }
    return code;
  };

  // ── Framework badge color ──
  const frameworkBadge = (fw: string) => {
    switch (fw) {
      case "react":
        return "bg-sky-500/10 text-sky-600 border-sky-500/20";
      case "vue":
        return "bg-emerald-500/10 text-emerald-600 border-emerald-500/20";
      case "html":
        return "bg-orange-500/10 text-orange-600 border-orange-500/20";
      default:
        return "bg-zinc-500/10 text-zinc-600 border-zinc-500/20";
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════════

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-5xl max-h-[90vh] overflow-hidden flex flex-col" showCloseButton>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-gradient-to-br from-sky-500/20 to-violet-500/20 border border-sky-500/30">
              <Layout className="h-4 w-4 text-sky-400" />
            </div>
            Visual UI Builder
          </DialogTitle>
          <DialogDescription>
            Generate, convert, and edit UI components with AI assistance
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
          <TabsList className="grid w-full grid-cols-4 mb-1 shrink-0">
            <TabsTrigger value="projects" className="gap-1.5 text-xs">
              <FolderOpen className="h-3.5 w-3.5" />
              Projects
            </TabsTrigger>
            <TabsTrigger value="generate" className="gap-1.5 text-xs">
              <Sparkles className="h-3.5 w-3.5" />
              Generate
            </TabsTrigger>
            <TabsTrigger value="screenshot" className="gap-1.5 text-xs">
              <Camera className="h-3.5 w-3.5" />
              Screenshot
            </TabsTrigger>
            <TabsTrigger value="editor" className="gap-1.5 text-xs">
              <Code2 className="h-3.5 w-3.5" />
              Editor
            </TabsTrigger>
          </TabsList>

          {/* ═══ PROJECTS TAB ═══ */}
          <TabsContent value="projects" className="flex-1 min-h-0 mt-0">
            <ScrollArea className="h-[calc(90vh-200px)]">
              <div className="space-y-4 p-1 pr-4">
                {/* Create Project */}
                <div className="rounded-xl border bg-card p-5 space-y-4">
                  <h4 className="text-sm font-semibold flex items-center gap-2">
                    <Plus className="h-4 w-4 text-primary" />
                    New Project
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs font-medium">Project Name</Label>
                      <Input
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        placeholder="My Component"
                        className="h-9 text-xs"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs font-medium">Framework</Label>
                      <Select value={newFramework} onValueChange={setNewFramework}>
                        <SelectTrigger className="h-9 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="react">React</SelectItem>
                          <SelectItem value="vue">Vue</SelectItem>
                          <SelectItem value="html">HTML</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs font-medium">Description</Label>
                      <Input
                        value={newDesc}
                        onChange={(e) => setNewDesc(e.target.value)}
                        placeholder="Optional description..."
                        className="h-9 text-xs"
                      />
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <Button
                      size="sm"
                      className="h-8 text-xs gap-1.5 min-w-[120px]"
                      onClick={createProject}
                      disabled={creating || !newName.trim()}
                    >
                      {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                      Create Project
                    </Button>
                  </div>
                </div>

                {/* Project List */}
                <div className="rounded-xl border bg-card p-5 space-y-3">
                  <h4 className="text-sm font-semibold flex items-center gap-2">
                    <FolderOpen className="h-4 w-4 text-muted-foreground" />
                    Your Projects
                    {projects.length > 0 && (
                      <Badge variant="secondary" className="h-5 text-[10px]">
                        {projects.length}
                      </Badge>
                    )}
                  </h4>

                  {loading ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                  ) : projects.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-10 text-muted-foreground border border-dashed rounded-lg">
                      <FileCode className="h-10 w-10 mb-3 opacity-30" />
                      <p className="text-sm font-medium">No projects yet</p>
                      <p className="text-xs mt-1">Create a project above to get started</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {projects.map((project) => (
                        <div
                          key={project.id}
                          className="flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-muted/30 transition-colors cursor-pointer"
                          onClick={() => openInEditor(project)}
                        >
                          <div className="h-9 w-9 rounded-lg bg-primary/5 border border-primary/10 flex items-center justify-center shrink-0">
                            <Code2 className="h-4 w-4 text-primary" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-medium truncate">{project.name}</p>
                              <Badge className={cn("h-4 text-[8px] border", frameworkBadge(project.framework))}>
                                {project.framework.toUpperCase()}
                              </Badge>
                              {project.generatedCode && (
                                <Badge variant="secondary" className="h-4 text-[8px]">
                                  Has code
                                </Badge>
                              )}
                            </div>
                            <p className="text-[10px] text-muted-foreground truncate">
                              {project.description || "No description"}
                              {" • "}
                              {new Date(project.updatedAt).toLocaleDateString()}
                            </p>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-muted-foreground hover:text-primary"
                              onClick={(e) => {
                                e.stopPropagation();
                                openInEditor(project);
                              }}
                            >
                              <Code2 className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-destructive hover:text-destructive"
                              onClick={(e) => {
                                e.stopPropagation();
                                deleteProject(project.id);
                              }}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </ScrollArea>
          </TabsContent>

          {/* ═══ GENERATE TAB ═══ */}
          <TabsContent value="generate" className="flex-1 min-h-0 mt-0">
            <ScrollArea className="h-[calc(90vh-200px)]">
              <div className="space-y-4 p-1 pr-4">
                {/* Description Input */}
                <div className="rounded-xl border bg-card p-5 space-y-4">
                  <h4 className="text-sm font-semibold flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-primary" />
                    AI Component Generator
                  </h4>
                  <p className="text-xs text-muted-foreground">
                    Describe the component you want and AI will generate production-ready code
                  </p>
                  <div className="space-y-2">
                    <div className="space-y-1">
                      <Label className="text-xs font-medium">Component Description</Label>
                      <Textarea
                        value={genDescription}
                        onChange={(e) => setGenDescription(e.target.value)}
                        placeholder="e.g., A login form with email and password fields, a remember me checkbox, and a submit button with gradient background..."
                        className="min-h-[100px] text-xs"
                        rows={4}
                      />
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs font-medium">Framework</Label>
                        <Select value={genFramework} onValueChange={setGenFramework}>
                          <SelectTrigger className="h-9 text-xs w-[140px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="react">React</SelectItem>
                            <SelectItem value="vue">Vue</SelectItem>
                            <SelectItem value="html">HTML</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="pt-4">
                        <Button
                          size="sm"
                          className="h-9 text-xs gap-1.5 min-w-[140px]"
                          onClick={generateComponent}
                          disabled={generating || !genDescription.trim()}
                        >
                          {generating ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Wand2 className="h-3.5 w-3.5" />
                          )}
                          Generate
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Generated Code Preview */}
                {genCode && (
                  <div className="rounded-xl border bg-card p-5 space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-semibold flex items-center gap-2">
                        <FileCode className="h-4 w-4 text-muted-foreground" />
                        Generated Code
                        <Badge className={cn("h-4 text-[8px] border", frameworkBadge(genFramework))}>
                          {genFramework.toUpperCase()}
                        </Badge>
                      </h4>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs gap-1"
                          onClick={() => copyCode(genCode)}
                        >
                          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                          Copy
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs gap-1"
                          onClick={() => openGeneratedInEditor(genCode, "AI")}
                        >
                          <Code2 className="h-3 w-3" />
                          Open in Editor
                        </Button>
                      </div>
                    </div>
                    <div className="relative">
                      <pre className="p-3 bg-zinc-950 text-zinc-100 rounded-lg text-[11px] leading-relaxed overflow-x-auto max-h-[300px] overflow-y-auto">
                        <code>{genCode}</code>
                      </pre>
                    </div>

                    {/* Live Preview */}
                    <div className="space-y-2">
                      <Label className="text-xs font-medium flex items-center gap-1">
                        <Eye className="h-3 w-3" />
                        Preview
                      </Label>
                      <div className="border rounded-lg overflow-hidden bg-white">
                        <iframe
                          srcDoc={buildPreviewSrcDoc(genCode, genFramework)}
                          className="w-full h-[250px] border-0"
                          sandbox="allow-scripts"
                          title="Generated Component Preview"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </ScrollArea>
          </TabsContent>

          {/* ═══ SCREENSHOT TAB ═══ */}
          <TabsContent value="screenshot" className="flex-1 min-h-0 mt-0">
            <ScrollArea className="h-[calc(90vh-200px)]">
              <div className="space-y-4 p-1 pr-4">
                {/* Upload Zone */}
                <div className="rounded-xl border bg-card p-5 space-y-4">
                  <h4 className="text-sm font-semibold flex items-center gap-2">
                    <Camera className="h-4 w-4 text-primary" />
                    Screenshot to Code
                  </h4>
                  <p className="text-xs text-muted-foreground">
                    Upload a screenshot or describe a UI layout and AI will convert it to code
                  </p>

                  {/* Drag & Drop Zone */}
                  <div
                    className={cn(
                      "border-2 border-dashed rounded-xl p-6 text-center transition-colors cursor-pointer",
                      ssDragOver
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-primary/50 hover:bg-muted/30"
                    )}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleImageUpload(file);
                      }}
                    />
                    {ssImagePreview ? (
                      <div className="space-y-3">
                        <img
                          src={ssImagePreview}
                          alt="Uploaded screenshot"
                          className="max-h-[200px] mx-auto rounded-lg border shadow-sm"
                        />
                        <p className="text-xs text-muted-foreground">
                          Click or drag to replace
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <ImagePlus className="h-10 w-10 mx-auto text-muted-foreground/40" />
                        <p className="text-sm font-medium text-muted-foreground">
                          Drop an image here or click to upload
                        </p>
                        <p className="text-[10px] text-muted-foreground/60">
                          Supports PNG, JPG, GIF, WebP
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Or describe manually */}
                  <div className="space-y-2">
                    <Label className="text-xs font-medium">Or describe the UI layout</Label>
                    <Textarea
                      value={ssDescription}
                      onChange={(e) => setSsDescription(e.target.value)}
                      placeholder="Describe the UI you see in the screenshot: layout, components, colors, text content..."
                      className="min-h-[80px] text-xs"
                      rows={3}
                    />
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs font-medium">Framework</Label>
                      <Select value={ssFramework} onValueChange={setSsFramework}>
                        <SelectTrigger className="h-9 text-xs w-[140px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="react">React</SelectItem>
                          <SelectItem value="vue">Vue</SelectItem>
                          <SelectItem value="html">HTML</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="pt-4">
                      <Button
                        size="sm"
                        className="h-9 text-xs gap-1.5 min-w-[160px]"
                        onClick={() => convertScreenshot(ssDescription)}
                        disabled={ssConverting || !ssDescription.trim()}
                      >
                        {ssConverting ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Wand2 className="h-3.5 w-3.5" />
                        )}
                        Convert to Code
                      </Button>
                    </div>
                  </div>
                </div>

                {/* Converted Code */}
                {ssCode && (
                  <div className="rounded-xl border bg-card p-5 space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-semibold flex items-center gap-2">
                        <FileCode className="h-4 w-4 text-muted-foreground" />
                        Converted Code
                        <Badge className={cn("h-4 text-[8px] border", frameworkBadge(ssFramework))}>
                          {ssFramework.toUpperCase()}
                        </Badge>
                      </h4>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs gap-1"
                          onClick={() => copyCode(ssCode)}
                        >
                          <Copy className="h-3 w-3" />
                          Copy
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs gap-1"
                          onClick={() => {
                            setEditorProjectId(null);
                            setEditorProjectName("Screenshot Conversion");
                            setEditorFramework(ssFramework);
                            setEditorCode(ssCode);
                            setActiveTab("editor");
                          }}
                        >
                          <Code2 className="h-3 w-3" />
                          Open in Editor
                        </Button>
                      </div>
                    </div>
                    <pre className="p-3 bg-zinc-950 text-zinc-100 rounded-lg text-[11px] leading-relaxed overflow-x-auto max-h-[300px] overflow-y-auto">
                      <code>{ssCode}</code>
                    </pre>

                    {/* Preview */}
                    <div className="space-y-2">
                      <Label className="text-xs font-medium flex items-center gap-1">
                        <Eye className="h-3 w-3" />
                        Preview
                      </Label>
                      <div className="border rounded-lg overflow-hidden bg-white">
                        <iframe
                          srcDoc={buildPreviewSrcDoc(ssCode, ssFramework)}
                          className="w-full h-[250px] border-0"
                          sandbox="allow-scripts"
                          title="Converted Component Preview"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </ScrollArea>
          </TabsContent>

          {/* ═══ EDITOR TAB ═══ */}
          <TabsContent value="editor" className="flex-1 min-h-0 mt-0">
            <div className="flex flex-col h-[calc(90vh-200px)]">
              {/* Editor Header */}
              <div className="flex items-center justify-between p-3 border-b bg-card rounded-t-xl gap-2 flex-wrap">
                <div className="flex items-center gap-2 min-w-0">
                  <Code2 className="h-4 w-4 text-primary shrink-0" />
                  <span className="text-sm font-medium truncate">
                    {editorProjectName || "Untitled"}
                  </span>
                  {editorProjectId && (
                    <Badge variant="secondary" className="h-4 text-[8px] shrink-0">
                      Saved
                    </Badge>
                  )}
                  <Badge className={cn("h-4 text-[8px] border shrink-0", frameworkBadge(editorFramework))}>
                    {editorFramework.toUpperCase()}
                  </Badge>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs gap-1"
                    onClick={() => copyCode(editorCode)}
                  >
                    <Copy className="h-3 w-3" />
                    Copy
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs gap-1"
                    onClick={() => setShowPreview(!showPreview)}
                  >
                    {showPreview ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                    {showPreview ? "Hide Preview" : "Show Preview"}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs gap-1"
                    onClick={optimizeCode}
                    disabled={optimizing || !editorCode.trim()}
                  >
                    {optimizing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Wand2 className="h-3 w-3" />}
                    Optimize
                  </Button>
                  {editorProjectId && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs gap-1"
                      onClick={saveToProject}
                      disabled={saving}
                    >
                      {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                      Save
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs gap-1"
                    onClick={downloadCode}
                    disabled={!editorCode.trim()}
                  >
                    <Download className="h-3 w-3" />
                    Download
                  </Button>
                </div>
              </div>

              {/* Editor Body */}
              <div className={cn(
                "flex-1 flex min-h-0 overflow-hidden",
                showPreview ? "flex-col md:flex-row" : "flex-col"
              )}>
                {/* Code Editor */}
                <div className={cn(
                  "flex flex-col min-h-0",
                  showPreview ? "md:w-1/2 w-full md:h-full h-1/2" : "flex-1"
                )}>
                  <div className="px-3 py-1.5 bg-muted/30 border-b text-[10px] font-medium text-muted-foreground flex items-center gap-1.5">
                    <Code2 className="h-3 w-3" />
                    Code Editor
                  </div>
                  <textarea
                    value={editorCode}
                    onChange={(e) => setEditorCode(e.target.value)}
                    className="flex-1 w-full p-3 bg-zinc-950 text-zinc-100 text-xs font-mono leading-relaxed resize-none outline-none border-0 min-h-[200px]"
                    placeholder="// Write your component code here...&#10;// Or use the Generate/Screenshot tabs to create code with AI"
                    spellCheck={false}
                  />
                </div>

                {/* Live Preview */}
                {showPreview && (
                  <>
                    <Separator orientation="vertical" className="hidden md:block h-auto" />
                    <Separator className="block md:hidden" />
                    <div className={cn(
                      "flex flex-col min-h-0",
                      "md:w-1/2 w-full md:h-full h-1/2"
                    )}>
                      <div className="px-3 py-1.5 bg-muted/30 border-b text-[10px] font-medium text-muted-foreground flex items-center gap-1.5">
                        <Eye className="h-3 w-3" />
                        Live Preview
                      </div>
                      <div className="flex-1 bg-white overflow-hidden">
                        {editorCode.trim() ? (
                          <iframe
                            srcDoc={buildPreviewSrcDoc(editorCode, editorFramework)}
                            className="w-full h-full border-0"
                            sandbox="allow-scripts"
                            title="Live Component Preview"
                          />
                        ) : (
                          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                            <Eye className="h-8 w-8 mb-2 opacity-20" />
                            <p className="text-xs">Write code to see the preview</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

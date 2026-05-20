"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useSettingsStore } from "@/lib/stores";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  FolderOpen,
  Folder,
  File,
  ChevronRight,
  ChevronDown,
  Plus,
  Trash2,
  Upload,
  X,
  RefreshCw,
  Loader2,
  Home,
  Slash,
  FileCode,
  FileText,
  Image,
} from "lucide-react";

interface FileEntry {
  name: string;
  path: string;
  type: "file" | "directory";
  size: number;
  updatedAt: string;
}

interface DirData {
  type: "directory";
  name: string;
  path: string;
  entries: FileEntry[];
}

interface FileData {
  type: "file";
  name: string;
  path: string;
  size: number;
  content: string;
  updatedAt: string;
}

const TEXT_EXTENSIONS = new Set([
  "txt", "md", "json", "ts", "tsx", "js", "jsx", "css", "html", "xml", "svg",
  "yml", "yaml", "toml", "ini", "cfg", "conf", "log", "csv", "env", "sh", "bat",
  "ps1", "py", "rb", "go", "rs", "java", "c", "cpp", "h", "hpp", "cs", "php",
  "sql", "graphql", "prisma", "vue", "svelte", "astro",
]);

const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "webp", "bmp", "ico", "svg"]);

function getFileIcon(name: string) {
  const ext = name.split(".").pop()?.toLowerCase() || "";
  if (IMAGE_EXTENSIONS.has(ext)) return <Image className="h-3.5 w-3.5 text-blue-400" />;
  if (TEXT_EXTENSIONS.has(ext)) return <FileCode className="h-3.5 w-3.5 text-yellow-400" />;
  return <FileText className="h-3.5 w-3.5 text-muted-foreground" />;
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

export function FileBrowser() {
  const { settings } = useSettingsStore();
  const [currentPath, setCurrentPath] = useState("");
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set());
  const [dirCache, setDirCache] = useState<Map<string, FileEntry[]>>(new Map());
  const [previewFile, setPreviewFile] = useState<FileData | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const [newItemDialog, setNewItemDialog] = useState<{ type: "file" | "folder" } | null>(null);
  const [newItemName, setNewItemName] = useState("");
  const [creating, setCreating] = useState(false);

  const [deleteDialog, setDeleteDialog] = useState<{ name: string; path: string; type: string } | null>(null);
  const [deleting, setDeleting] = useState(false);

  const uploadRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (settings.workspacePath) {
      loadDirectory(settings.workspacePath);
    }
  }, [settings.workspacePath]);

  const loadDirectory = async (dirPath: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/local/files?path=${encodeURIComponent(dirPath)}`);
      const data: DirData = await res.json();
      if (data.type === "directory") {
        setCurrentPath(data.path);
        setEntries(data.entries);
        setDirCache((prev) => {
          const next = new Map(prev);
          next.set(data.path, data.entries);
          return next;
        });
      }
    } catch (err: any) {
      toast.error("Failed to load directory");
    } finally {
      setLoading(false);
    }
  };

  const toggleDirectory = async (dirPath: string) => {
    if (expandedDirs.has(dirPath)) {
      setExpandedDirs((prev) => {
        const next = new Set(prev);
        next.delete(dirPath);
        return next;
      });
      return;
    }

    if (!dirCache.has(dirPath)) {
      try {
        const res = await fetch(`/api/local/files?path=${encodeURIComponent(dirPath)}`);
        const data: DirData = await res.json();
        if (data.type === "directory") {
          setDirCache((prev) => {
            const next = new Map(prev);
            next.set(dirPath, data.entries);
            return next;
          });
        }
      } catch {
        toast.error("Failed to load subdirectory");
        return;
      }
    }

    setExpandedDirs((prev) => {
      const next = new Set(prev);
      next.add(dirPath);
      return next;
    });
  };

  const openPreview = async (filePath: string) => {
    setPreviewLoading(true);
    try {
      const res = await fetch(`/api/local/files?path=${encodeURIComponent(filePath)}`);
      const data: FileData = await res.json();
      if (data.type === "file") {
        setPreviewFile(data);
      }
    } catch {
      toast.error("Failed to read file");
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!newItemName.trim() || !newItemDialog) return;
    setCreating(true);
    try {
      const targetPath = `${currentPath.replace(/\\/g, "/")}/${newItemName.trim()}`;
      const endpoint = newItemDialog.type === "folder"
        ? `/api/local/files`
        : `/api/local/files`;

      const body = newItemDialog.type === "folder"
        ? JSON.stringify({ action: "mkdir", targetPath })
        : JSON.stringify({ action: "write", targetPath, content: "" });

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      });

      if (res.ok) {
        toast.success(`${newItemDialog.type === "folder" ? "Folder" : "File"} created`);
        loadDirectory(currentPath);
        setNewItemDialog(null);
        setNewItemName("");
      } else {
        toast.error("Failed to create");
      }
    } catch {
      toast.error("Failed to create");
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteDialog) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/local/files?path=${encodeURIComponent(deleteDialog.path)}`, {
        method: "DELETE",
      });

      if (res.ok) {
        toast.success(`Deleted ${deleteDialog.name}`);
        dirCache.delete(deleteDialog.path);
        loadDirectory(currentPath);
        if (previewFile?.path === deleteDialog.path) setPreviewFile(null);
      } else {
        toast.error("Failed to delete");
      }
    } catch {
      toast.error("Failed to delete");
    } finally {
      setDeleting(false);
      setDeleteDialog(null);
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const formData = new FormData();
    for (let i = 0; i < files.length; i++) {
      formData.append("files", files[i]);
    }

    try {
      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });
      if (res.ok) {
        toast.success(`Uploaded ${files.length} file${files.length !== 1 ? "s" : ""}`);
        loadDirectory(currentPath);
      } else {
        toast.error("Upload failed");
      }
    } catch {
      toast.error("Upload failed");
    }

    if (uploadRef.current) uploadRef.current.value = "";
  };

  const breadcrumbs = currentPath
    .split("\\")
    .filter(Boolean)
    .reduce<string[]>((acc, part, idx) => {
      const prev = idx === 0 ? "" : acc[idx - 1] || "";
      acc.push(`${prev}\\${part}`);
      return acc;
    }, []);

  const renderEntry = (entry: FileEntry, depth: number = 0) => {
    const isExpanded = expandedDirs.has(entry.path);
    const children = dirCache.get(entry.path);

    return (
      <div key={entry.path}>
        <div
          className={cn(
            "flex items-center gap-1.5 px-2 py-1 rounded cursor-pointer text-xs transition-colors group",
            previewFile?.path === entry.path
              ? "bg-primary/10 text-primary"
              : "hover:bg-accent/50 text-muted-foreground hover:text-foreground"
          )}
          style={{ paddingLeft: `${8 + depth * 14}px` }}
          onClick={() => {
            if (entry.type === "directory") {
              toggleDirectory(entry.path);
            } else {
              openPreview(entry.path);
            }
          }}
        >
          {entry.type === "directory" ? (
            <>
              <span className="shrink-0">
                {isExpanded ? (
                  <ChevronDown className="h-3 w-3" />
                ) : (
                  <ChevronRight className="h-3 w-3" />
                )}
              </span>
              {isExpanded ? (
                <FolderOpen className="h-3.5 w-3.5 text-amber-400" />
              ) : (
                <Folder className="h-3.5 w-3.5 text-amber-400" />
              )}
            </>
          ) : (
            <>
              <span className="w-3 shrink-0" />
              {getFileIcon(entry.name)}
            </>
          )}
          <span className="flex-1 truncate">{entry.name}</span>
          {entry.type === "file" && (
            <span className="text-[9px] text-muted-foreground/50 hidden group-hover:inline">
              {formatFileSize(entry.size)}
            </span>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={(e) => {
              e.stopPropagation();
              setDeleteDialog({ name: entry.name, path: entry.path, type: entry.type });
            }}
            title="Delete"
          >
            <Trash2 className="h-3 w-3 text-destructive" />
          </Button>
        </div>

        {entry.type === "directory" && isExpanded && children && (
          <div>
            {children.map((child) => renderEntry(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  const isTextFile = previewFile
    ? TEXT_EXTENSIONS.has(previewFile.name.split(".").pop()?.toLowerCase() || "")
    : false;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border/60 bg-background/50">
        <span className="text-[11px] font-bold text-muted-foreground flex items-center gap-1.5">
          <FolderOpen className="h-3.5 w-3.5 text-primary" />
          Files
        </span>
        <div className="flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => loadDirectory(currentPath || settings.workspacePath || "")}
            title="Refresh"
            disabled={loading}
          >
            <RefreshCw className={cn("h-3 w-3", loading && "animate-spin")} />
          </Button>
        </div>
      </div>

      <div className="px-2 py-1.5 border-b border-border/40 bg-background/30">
        <div className="flex items-center gap-0.5 text-[10px] font-mono text-muted-foreground overflow-x-auto whitespace-nowrap py-0.5">
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5 shrink-0"
            onClick={() => {
              if (settings.workspacePath) loadDirectory(settings.workspacePath);
            }}
            title="Root"
          >
            <Home className="h-3 w-3" />
          </Button>
          {breadcrumbs.map((crumb, idx) => {
            const parts = crumb.split("\\");
            const name = parts[parts.length - 1];
            return (
              <span key={crumb} className="flex items-center gap-0.5 shrink-0">
                <Slash className="h-2.5 w-2.5 text-border" />
                <button
                  className="hover:text-foreground hover:underline cursor-pointer truncate max-w-[80px]"
                  onClick={() => loadDirectory(crumb)}
                  title={crumb}
                >
                  {name}
                </button>
              </span>
            );
          })}
        </div>
      </div>

      <div className="flex-1 min-h-0">
        <ScrollArea className="h-full">
          <div className="py-1">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : entries.length === 0 ? (
              <div className="text-center py-8 text-xs text-muted-foreground select-none">
                <FolderOpen className="h-8 w-8 mx-auto mb-2 opacity-30" />
                <p>Empty directory</p>
              </div>
            ) : (
              entries.map((entry) => renderEntry(entry))
            )}
          </div>
        </ScrollArea>
      </div>

      {previewFile && (
        <div className="border-t border-border/60 bg-background/30">
          <div className="flex items-center justify-between px-3 py-1.5 bg-accent/20 border-b border-border/40">
            <span className="text-[10px] font-mono font-medium flex items-center gap-1.5 truncate">
              {getFileIcon(previewFile.name)}
              {previewFile.name}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5"
              onClick={() => setPreviewFile(null)}
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
          <div className="max-h-[200px] overflow-auto">
            {previewLoading ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            ) : isTextFile ? (
              <pre className="text-[10px] font-mono p-3 whitespace-pre-wrap break-all select-text leading-relaxed text-foreground/80">
                {previewFile.content}
              </pre>
            ) : (
              <div className="p-3 text-[10px] text-muted-foreground text-center">
                {formatFileSize(previewFile.size)}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="flex items-center gap-1 p-1.5 border-t border-border/60 bg-background/50">
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-[10px] px-2 gap-1 flex-1"
          onClick={() => setNewItemDialog({ type: "file" })}
        >
          <Plus className="h-3 w-3" />
          New File
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-[10px] px-2 gap-1 flex-1"
          onClick={() => setNewItemDialog({ type: "folder" })}
        >
          <Plus className="h-3 w-3" />
          New Folder
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-[10px] px-2 gap-1"
          onClick={() => uploadRef.current?.click()}
        >
          <Upload className="h-3 w-3" />
        </Button>
        <input
          ref={uploadRef}
          type="file"
          multiple
          className="hidden"
          onChange={handleUpload}
        />
      </div>

      <Dialog open={newItemDialog !== null} onOpenChange={(o) => !o && setNewItemDialog(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>
              New {newItemDialog?.type === "folder" ? "Folder" : "File"}
            </DialogTitle>
            <DialogDescription>
              Create in: {currentPath}
            </DialogDescription>
          </DialogHeader>
          <Input
            placeholder={newItemDialog?.type === "folder" ? "Folder name..." : "File name..."}
            value={newItemName}
            onChange={(e) => setNewItemName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            autoFocus
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewItemDialog(null)}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={creating || !newItemName.trim()}>
              {creating ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteDialog !== null} onOpenChange={(o) => !o && setDeleteDialog(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete {deleteDialog?.type === "directory" ? "Folder" : "File"}</DialogTitle>
            <DialogDescription>This action cannot be undone.</DialogDescription>
          </DialogHeader>
          <p className="text-sm">
            Delete <span className="font-mono font-semibold">{deleteDialog?.name}</span>?
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialog(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

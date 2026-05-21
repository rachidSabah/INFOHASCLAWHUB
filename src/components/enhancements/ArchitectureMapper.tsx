"use client";

import { PowerToolHint } from "./PowerToolHint";
import { useState, useCallback, useRef } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Network,
  Search,
  Loader2,
  FolderOpen,
  FileCode,
  GitFork,
  ExternalLink,
  ChevronRight,
  ChevronDown,
  Folder,
  File,
  ArrowRightLeft,
  Box,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface FileNode {
  path: string;
  name: string;
  type: "file" | "directory";
  children?: FileNode[];
  category?: "component" | "page" | "api" | "lib" | "other";
}

interface FileDetail {
  path: string;
  imports: string[];
  exports: string[];
  category: "component" | "page" | "api" | "lib" | "other";
}

interface DependencyEdge {
  from: string;
  to: string;
}

interface ScanResult {
  tree: FileNode[];
  files: FileDetail[];
  edges: DependencyEdge[];
  totalFiles: number;
}

interface ArchitectureMapperProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const CATEGORY_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  component: { label: "Component", color: "text-blue-400", bg: "bg-blue-500/10 border-blue-500/20" },
  page: { label: "Page", color: "text-green-400", bg: "bg-green-500/10 border-green-500/20" },
  api: { label: "API Route", color: "text-orange-400", bg: "bg-orange-500/10 border-orange-500/20" },
  lib: { label: "Library", color: "text-purple-400", bg: "bg-purple-500/10 border-purple-500/20" },
  other: { label: "Other", color: "text-gray-400", bg: "bg-gray-500/10 border-gray-500/20" },
};

const CATEGORY_DOT: Record<string, string> = {
  component: "bg-blue-500",
  page: "bg-green-500",
  api: "bg-orange-500",
  lib: "bg-purple-500",
  other: "bg-gray-500",
};

function classifyFile(path: string): "component" | "page" | "api" | "lib" | "other" {
  if (path.includes("/components/")) return "component";
  if (path.includes("/app/") && path.includes("/route.")) return "api";
  if (path.includes("/app/") && path.includes("/page.")) return "page";
  if (path.match(/\/app\/api\//)) return "api";
  if (path.match(/\/app\//) && !path.includes("/api/")) return "page";
  if (path.includes("/lib/")) return "lib";
  return "other";
}

function buildTree(paths: string[]): FileNode[] {
  const root: FileNode[] = [];

  for (const fullPath of paths) {
    const parts = fullPath.replace(/\\/g, "/").replace(/^src\//, "").split("/").filter(Boolean);
    let current = root;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isFile = i === parts.length - 1;
      const pathSoFar = parts.slice(0, i + 1).join("/");
      const fullSoFar = `src/${pathSoFar}`;

      let existing = current.find((n) => n.name === part);

      if (!existing) {
        existing = {
          path: fullSoFar,
          name: part,
          type: isFile ? "file" : "directory",
          children: isFile ? undefined : [],
          category: classifyFile(fullSoFar),
        };
        current.push(existing);
      }

      if (!isFile && existing.children) {
        current = existing.children;
      }
    }
  }

  return sortNodes(root);
}

function sortNodes(nodes: FileNode[]): FileNode[] {
  return [...nodes].sort((a, b) => {
    if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
    return a.name.localeCompare(b.name);
  }).map((n) => n.children ? { ...n, children: sortNodes(n.children) } : n);
}

function extractImports(content: string, filePath: string): string[] {
  const imports: string[] = [];
  const lines = content.split("\n");
  for (const line of lines) {
    if (line.trim().startsWith("//") || line.trim().startsWith("/*")) continue;
    const importMatch = line.match(/from\s+["'](.+?)["']/);
    if (importMatch && !importMatch[1].startsWith(".")) {
      const lib = importMatch[1].split("/")[0];
      if (!lib.startsWith("@")) {
        imports.push(lib);
      } else {
        imports.push(importMatch[1].split("/").slice(0, 2).join("/"));
      }
    }
  }
  return [...new Set(imports)];
}

function extractExports(content: string): string[] {
  const exports: string[] = [];
  const lines = content.split("\n");
  for (const line of lines) {
    if (line.trim().startsWith("//")) continue;
    const namedMatch = line.match(/export\s+(?:const|function|class|type|interface|enum)\s+(\w+)/);
    if (namedMatch) exports.push(namedMatch[1]);
    if (line.match(/export\s+default\s+(?:function|class)\s+(\w+)/)) {
      const m = line.match(/export\s+default\s+(?:function|class)\s+(\w+)/);
      if (m) exports.push(`default ${m[1]}`);
    } else if (line.match(/export\s+default\s+/)) {
      exports.push("default export");
    }
  }
  return [...new Set(exports)];
}

export function ArchitectureMapper({ open, onOpenChange }: ArchitectureMapperProps) {
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState("");
  const [result, setResult] = useState<ScanResult | null>(null);
  const [selectedFile, setSelectedFile] = useState<FileDetail | null>(null);
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set(["src"]));
  const [search, setSearch] = useState("");

  const toggleDir = useCallback((path: string) => {
    setExpandedDirs((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  const scanWorkspace = useCallback(async () => {
    setScanning(true);
    setProgress(0);
    setProgressLabel("Scanning workspace...");
    setResult(null);
    setSelectedFile(null);

    try {
      const res = await fetch("/api/local/files?path=.&recursive=true&pattern=src/**/*.{ts,tsx}");
      if (!res.ok) throw new Error("Failed to list files");
      const data = await res.json();
      const files: string[] = data.files || [];

      if (files.length === 0) throw new Error("No files found in workspace");

      setProgressLabel(`Found ${files.length} files. Analyzing imports...`);
      setProgress(30);

      const fileDetails: FileDetail[] = [];
      const edges: DependencyEdge[] = [];

      const batchSize = 10;
      for (let i = 0; i < files.length; i += batchSize) {
        const batch = files.slice(i, i + batchSize);
        const batchResults = await Promise.all(
          batch.map(async (filePath) => {
            try {
              const fileRes = await fetch(`/api/local/files?path=${encodeURIComponent(filePath)}`);
              if (!fileRes.ok) return null;
              const fileData = await fileRes.json();
              const content = fileData.content || "";
              const category = classifyFile(filePath);
              const imports = extractImports(content, filePath);
              const exports = extractExports(content);
              return { path: filePath, imports, exports, category };
            } catch {
              return { path: filePath, imports: [], exports: [], category: classifyFile(filePath) as any };
            }
          })
        );

        for (const detail of batchResults) {
          if (!detail) continue;
          fileDetails.push(detail);
          for (const imp of detail.imports) {
            const targetFile = files.find(
              (f) => f.includes(imp) || f.endsWith(`/${imp}`) || f.includes(`/${imp}.`) || f.includes(`/${imp}/`)
            );
            if (targetFile && targetFile !== detail.path) {
              edges.push({ from: detail.path, to: targetFile });
            }
          }
        }

        setProgress(30 + Math.floor((i / files.length) * 60));
      }

      setProgressLabel("Building tree...");
      setProgress(95);

      const tree = buildTree(files);

      setResult({ tree, files: fileDetails, edges, totalFiles: files.length });
      setProgress(100);
      setProgressLabel("Scan complete");
      toast.success(`Architecture mapped: ${files.length} files`);
    } catch (e: any) {
      toast.error(e.message || "Scan failed");
    } finally {
      setScanning(false);
    }
  }, []);

  const filteredTree = search.trim()
    ? result?.files
        .filter((f) => f.path.toLowerCase().includes(search.toLowerCase()))
        .map((f) => ({
          path: f.path,
          name: f.path.split("/").pop() || f.path,
          type: "file" as const,
          category: f.category,
        }))
    : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[800px] max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Network className="h-5 w-5 text-cyan-500" />
            Live Architecture Mapper
          </DialogTitle>
          <DialogDescription>
            Visualize your codebase structure, dependencies, and file relationships
          </DialogDescription>
        </DialogHeader>

        <PowerToolHint name="Codebase Intelligence" />

        <div className="flex-1 flex flex-col gap-3 min-h-0">
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={scanWorkspace}
              disabled={scanning}
            >
              {scanning ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
              ) : (
                <Search className="h-4 w-4 mr-1.5" />
              )}
              Scan Workspace
            </Button>
            <div className="relative flex-1">
              <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                className="h-8 w-full rounded-md border border-input bg-background pl-8 pr-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                placeholder="Search files..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>

          {scanning && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{progressLabel}</span>
                <span>{progress}%</span>
              </div>
              <Progress value={progress} className="h-1.5" />
            </div>
          )}

          {result && !scanning && (
            <div className="text-xs text-muted-foreground flex items-center gap-3">
              <span className="flex items-center gap-1">
                <FolderOpen className="h-3 w-3" /> {result.totalFiles} files
              </span>
              <span className="flex items-center gap-1">
                <GitFork className="h-3 w-3" /> {result.edges.length} dependencies
              </span>
              <div className="flex gap-2 ml-auto">
                {Object.entries(CATEGORY_CONFIG).map(([key, cfg]) => (
                  <span key={key} className="flex items-center gap-1">
                    <span className={cn("h-2 w-2 rounded-full", CATEGORY_DOT[key])} />
                    <span className="text-[10px]">{cfg.label}</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {result && !scanning && (
            <div className="flex-1 flex gap-3 min-h-0">
              <div className="w-[380px] shrink-0 flex flex-col min-h-0">
                <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5 px-1">
                  File Tree
                </div>
                <ScrollArea className="flex-1 rounded-lg border border-border bg-muted/20">
                  <div className="p-2">
                    {(filteredTree ?? result.tree).map((node) => (
                      <TreeNode
                        key={node.path}
                        node={node}
                        depth={0}
                        expandedDirs={expandedDirs}
                        onToggle={toggleDir}
                        onSelect={(path) => {
                          const fd = result.files.find((f) => f.path === path);
                          setSelectedFile(fd || null);
                        }}
                        selectedPath={selectedFile?.path}
                      />
                    ))}
                  </div>
                </ScrollArea>
              </div>

              <div className="flex-1 flex flex-col min-h-0">
                <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5 px-1">
                  {selectedFile ? "File Details" : "Select a file"}
                </div>
                <ScrollArea className="flex-1 rounded-lg border border-border bg-muted/20">
                  <div className="p-3">
                    {selectedFile ? (
                      <div className="space-y-3">
                        <div className="flex items-center gap-2">
                          <span
                            className={cn("h-2.5 w-2.5 rounded-full", CATEGORY_DOT[selectedFile.category])}
                          />
                          <span className="text-sm font-mono font-semibold truncate">
                            {selectedFile.path}
                          </span>
                          <Badge
                            variant="outline"
                            className={cn("text-[10px] shrink-0", CATEGORY_CONFIG[selectedFile.category].bg)}
                          >
                            {CATEGORY_CONFIG[selectedFile.category].label}
                          </Badge>
                        </div>

                        <Separator />

                        <div>
                          <div className="flex items-center gap-1.5 mb-1.5">
                            <ArrowRightLeft className="h-3.5 w-3.5 text-blue-400" />
                            <span className="text-xs font-semibold">Imports ({selectedFile.imports.length})</span>
                          </div>
                          <div className="pl-5 space-y-0.5">
                            {selectedFile.imports.length > 0 ? (
                              selectedFile.imports.map((imp, i) => (
                                <span
                                  key={i}
                                  className="block text-xs text-muted-foreground font-mono"
                                >
                                  {imp}
                                </span>
                              ))
                            ) : (
                              <span className="text-xs text-muted-foreground italic">
                                No external imports
                              </span>
                            )}
                          </div>
                        </div>

                        <Separator />

                        <div>
                          <div className="flex items-center gap-1.5 mb-1.5">
                            <Box className="h-3.5 w-3.5 text-green-400" />
                            <span className="text-xs font-semibold">Exports ({selectedFile.exports.length})</span>
                          </div>
                          <div className="pl-5 space-y-0.5">
                            {selectedFile.exports.length > 0 ? (
                              selectedFile.exports.map((exp, i) => (
                                <span
                                  key={i}
                                  className="block text-xs text-muted-foreground font-mono"
                                >
                                  {exp}
                                </span>
                              ))
                            ) : (
                              <span className="text-xs text-muted-foreground italic">
                                No named exports
                              </span>
                            )}
                          </div>
                        </div>

                        <Separator />

                        <div>
                          <div className="flex items-center gap-1.5 mb-1.5">
                            <GitFork className="h-3.5 w-3.5 text-amber-400" />
                            <span className="text-xs font-semibold">Dependencies</span>
                          </div>
                          <div className="pl-5 space-y-0.5">
                            {result.edges
                              .filter((e) => e.from === selectedFile.path)
                              .slice(0, 20).length > 0 ? (
                              result.edges
                                .filter((e) => e.from === selectedFile.path)
                                .slice(0, 20)
                                .map((edge, i) => (
                                  <button
                                    key={i}
                                    onClick={() => {
                                      const fd = result.files.find((f) => f.path === edge.to);
                                      if (fd) setSelectedFile(fd);
                                    }}
                                    className="block text-xs text-blue-400 hover:text-blue-300 font-mono cursor-pointer text-left"
                                  >
                                    {edge.to}
                                  </button>
                                ))
                            ) : (
                              <span className="text-xs text-muted-foreground italic">
                                No dependency links
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="text-xs text-muted-foreground py-8 text-center space-y-2">
                        <Network className="h-8 w-8 mx-auto opacity-30" />
                        <p>Click a file in the tree to see its details</p>
                        <p className="text-[10px]">Imports, exports, and dependency links will appear here</p>
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </div>
            </div>
          )}

          {!result && !scanning && (
            <div className="flex-1 flex items-center justify-center text-xs text-muted-foreground space-y-2 flex-col">
              <GitFork className="h-10 w-10 opacity-20" />
              <p>Click "Scan Workspace" to visualize your codebase</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function TreeNode({
  node,
  depth,
  expandedDirs,
  onToggle,
  onSelect,
  selectedPath,
}: {
  node: FileNode;
  depth: number;
  expandedDirs: Set<string>;
  onToggle: (path: string) => void;
  onSelect: (path: string) => void;
  selectedPath?: string;
}) {
  const isExpanded = expandedDirs.has(node.path);
  const isSelected = selectedPath === node.path;

  if (node.type === "directory") {
    return (
      <div>
        <button
          onClick={() => onToggle(node.path)}
          className="w-full flex items-center gap-1 py-0.5 text-xs hover:bg-muted/50 rounded px-1 transition-colors"
          style={{ paddingLeft: `${depth * 12 + 4}px` }}
        >
          {isExpanded ? (
            <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
          ) : (
            <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
          )}
          <Folder className="h-3 w-3 text-amber-400 shrink-0" />
          <span className="text-foreground truncate">{node.name}</span>
        </button>
        {isExpanded &&
          node.children?.map((child) => (
            <TreeNode
              key={child.path}
              node={child}
              depth={depth + 1}
              expandedDirs={expandedDirs}
              onToggle={onToggle}
              onSelect={onSelect}
              selectedPath={selectedPath}
            />
          ))}
      </div>
    );
  }

  return (
    <button
      onClick={() => onSelect(node.path)}
      className={cn(
        "w-full flex items-center gap-1 py-0.5 text-xs hover:bg-muted/50 rounded px-1 transition-colors",
        isSelected && "bg-primary/10 text-primary font-medium"
      )}
      style={{ paddingLeft: `${depth * 12 + 4}px` }}
    >
      <span className="w-3 shrink-0" />
      {node.category ? (
        <span className={cn("h-2 w-2 rounded-full shrink-0", CATEGORY_DOT[node.category])} />
      ) : (
        <span className="h-2 w-2 shrink-0" />
      )}
      <span className="truncate">{node.name}</span>
    </button>
  );
}

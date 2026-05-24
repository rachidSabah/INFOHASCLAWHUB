/**
 * ClawHub Enhanced Artifact System v2
 * 
 * Professional-grade artifact management with:
 * - Multi-tab artifact viewer (multiple artifacts open simultaneously)
 * - Version history with diff comparison
 * - Export system (HTML, code, data)
 * - Smart artifact detection v2 (Mermaid, SVG, LaTeX, React)
 * - Artifact actions (run, fork, embed, annotate)
 */

import { db } from "@/lib/db";

// ── Types ──────────────────────────────────────────────────────────────────

export type ArtifactType = 
  | "html" | "react" | "code" | "markdown" | "svg" | "mermaid" 
  | "latex" | "chart" | "json" | "csv" | "sql" | "python" 
  | "typescript" | "javascript" | "css" | "shell" | "yaml" | "xml";

export type ArtifactAction = "run" | "fork" | "embed" | "annotate" | "export" | "diff";

export interface ArtifactVersion {
  id: string;
  artifactId: string;
  version: number;
  content: string;
  createdAt: string;
  message: string;  // Commit-like message
  tokenCount: number;
  diffFromPrevious?: string;
}

export interface ArtifactTab {
  id: string;
  artifactId: string;
  title: string;
  type: ArtifactType;
  icon: string;
  isPinned: boolean;
  isDirty: boolean;
  position: number;
}

export interface ArtifactExport {
  format: "html" | "py" | "ts" | "js" | "json" | "csv" | "md" | "svg" | "sql" | "txt";
  filename: string;
  content: string;
  mimeType: string;
}

export interface ArtifactAnnotation {
  id: string;
  artifactId: string;
  versionId: string;
  lineNumber: number;
  text: string;
  createdAt: string;
  author: string;
}

// ── Artifact Type Detection v2 ─────────────────────────────────────────────

const ARTIFACT_PATTERNS: Array<{
  type: ArtifactType;
  icon: string;
  detect: (content: string) => boolean;
  exportFormat: string;
  mimeType: string;
}> = [
  {
    type: "mermaid",
    icon: "📊",
    detect: (c) => /^(graph |flowchart |sequenceDiagram |classDiagram |stateDiagram |erDiagram |gantt |pie |gitgraph )/m.test(c.trim()),
    exportFormat: "md",
    mimeType: "text/markdown",
  },
  {
    type: "svg",
    icon: "🎨",
    detect: (c) => c.trim().startsWith("<svg") || c.trim().startsWith("<?xml") && c.includes("<svg"),
    exportFormat: "svg",
    mimeType: "image/svg+xml",
  },
  {
    type: "react",
    icon: "⚛️",
    detect: (c) => /(import\s+.*from\s+['"]react['"]|export\s+default\s+function|function\s+\w+\s*\(|const\s+\w+\s*=\s*\(\s*\)\s*=>)/.test(c) && /(<\w+[^>]*>|jsx|tsx|return\s*\()/i.test(c),
    exportFormat: "tsx",
    mimeType: "text/typescript",
  },
  {
    type: "html",
    icon: "🌐",
    detect: (c) => /<!DOCTYPE\s+html|<html[\s>]/i.test(c.trim()) || /<body|<head|<div/i.test(c.trim()),
    exportFormat: "html",
    mimeType: "text/html",
  },
  {
    type: "latex",
    icon: "📐",
    detect: (c) => /\\begin\{(document|equation|align|matrix|tabular|itemize|enumerate)\}/.test(c) || /\\frac|\\sum|\\int|\\sqrt/.test(c),
    exportFormat: "txt",
    mimeType: "text/plain",
  },
  {
    type: "sql",
    icon: "🗃️",
    detect: (c) => /^(SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|WITH)\s/im.test(c.trim()),
    exportFormat: "sql",
    mimeType: "text/x-sql",
  },
  {
    type: "python",
    icon: "🐍",
    detect: (c) => /^(import |from |def |class |if __name__)/m.test(c.trim()) && !/^\/\//.test(c.trim()),
    exportFormat: "py",
    mimeType: "text/x-python",
  },
  {
    type: "typescript",
    icon: "📘",
    detect: (c) => /^(import |export |interface |type |const |async function)/m.test(c.trim()) && /:\s*(string|number|boolean|void|any|Record|Array|Promise)/.test(c),
    exportFormat: "ts",
    mimeType: "text/typescript",
  },
  {
    type: "javascript",
    icon: "📄",
    detect: (c) => /^(import |export |const |let |var |function |async function|class )/m.test(c.trim()) && !/:\s*(string|number|boolean)/.test(c),
    exportFormat: "js",
    mimeType: "text/javascript",
  },
  {
    type: "css",
    icon: "🎨",
    detect: (c) => /^[\s]*[.#@:a-zA-Z][\w-]*\s*\{|@media|@keyframes|@import/.test(c.trim()),
    exportFormat: "css",
    mimeType: "text/css",
  },
  {
    type: "json",
    icon: "📋",
    detect: (c) => {
      try { const p = JSON.parse(c); return typeof p === "object" && p !== null; } catch { return false; }
    },
    exportFormat: "json",
    mimeType: "application/json",
  },
  {
    type: "csv",
    icon: "📈",
    detect: (c) => {
      const lines = c.trim().split("\n");
      if (lines.length < 2) return false;
      const commaCount = (lines[0].match(/,/g) || []).length;
      return commaCount >= 1 && lines.slice(1).every(l => (l.match(/,/g) || []).length === commaCount);
    },
    exportFormat: "csv",
    mimeType: "text/csv",
  },
  {
    type: "yaml",
    icon: "📝",
    detect: (c) => /^(---|\w+:\s)/m.test(c.trim()) && !/[{[]/.test(c.trim().slice(0, 10)),
    exportFormat: "yaml",
    mimeType: "text/yaml",
  },
  {
    type: "shell",
    icon: "💻",
    detect: (c) => /^(#!\/bin\/|npm |yarn |pip |git |docker |kubectl |cd |mkdir |rm |cp |mv |chmod |export |echo )/m.test(c.trim()),
    exportFormat: "sh",
    mimeType: "text/x-shellscript",
  },
  {
    type: "markdown",
    icon: "📝",
    detect: (c) => /^#{1,6}\s|^\*|^\-|^\d+\.\s|```/m.test(c.trim()),
    exportFormat: "md",
    mimeType: "text/markdown",
  },
  {
    type: "code",
    icon: "💻",
    detect: () => true,  // Fallback
    exportFormat: "txt",
    mimeType: "text/plain",
  },
];

/**
 * Detect the artifact type from content.
 */
export function detectArtifactType(content: string): { type: ArtifactType; icon: string; exportFormat: string; mimeType: string } {
  // Strip tool call XML before detection
  const cleanContent = content
    .replace(/<longcat_tool_call>[\s\S]*?<\/longcat_tool_call>/g, "")
    .replace(/```tool_call[\s\S]*?```/g, "")
    .replace(/\{"name":\s*"[^"]*",\s*"arguments":\s*\{[\s\S]*?\}\s*\}/g, "")
    .trim();

  for (const pattern of ARTIFACT_PATTERNS) {
    if (pattern.detect(cleanContent)) {
      return { type: pattern.type, icon: pattern.icon, exportFormat: pattern.exportFormat, mimeType: pattern.mimeType };
    }
  }

  return { type: "code", icon: "💻", exportFormat: "txt", mimeType: "text/plain" };
}

/**
 * Extract all code blocks from a response and create artifact metadata for each.
 */
export function extractArtifactsFromResponse(response: string): Array<{
  content: string;
  type: ArtifactType;
  icon: string;
  language: string;
  title: string;
}> {
  const artifacts: Array<{
    content: string;
    type: ArtifactType;
    icon: string;
    language: string;
    title: string;
  }> = [];

  // Extract fenced code blocks
  const codeBlockRegex = /```(\w*)\n([\s\S]*?)```/g;
  let match;
  let blockIndex = 0;

  while ((match = codeBlockRegex.exec(response)) !== null) {
    const language = match[1] || "text";
    const content = match[2].trim();

    if (content.length < 20) continue; // Skip tiny blocks

    const detected = detectArtifactType(content);

    // Skip tool_call blocks
    if (language === "tool_call") continue;

    artifacts.push({
      content,
      type: detected.type,
      icon: detected.icon,
      language: language || detected.type,
      title: `${detected.type.charAt(0).toUpperCase() + detected.type.slice(1)} ${blockIndex + 1}`,
    });

    blockIndex++;
  }

  return artifacts;
}

// ── Version History ────────────────────────────────────────────────────────

/**
 * Save a new version of an artifact.
 */
export async function saveArtifactVersion(
  artifactId: string,
  content: string,
  message: string = "Auto-save"
): Promise<ArtifactVersion | null> {
  try {
    // Get current version count
    const versions = await db.artifactVersion.findMany({
      where: { artifactId },
      orderBy: { version: "desc" },
      take: 1,
    });

    const nextVersion = versions.length > 0 ? versions[0].version + 1 : 1;

    const version = await db.artifactVersion.create({
      data: {
        artifactId,
        version: nextVersion,
        content,
        changeLog: message,
      },
    });

    return {
      id: version.id,
      artifactId: version.artifactId,
      version: version.version,
      content: version.content,
      createdAt: version.createdAt.toISOString(),
      message: version.changeLog || message,
      tokenCount: Math.ceil(content.length / 4),
    };
  } catch (error) {
    console.error("[ArtifactSystem] Failed to save version:", error);
    return null;
  }
}

/**
 * Get version history for an artifact.
 */
export async function getArtifactVersions(artifactId: string): Promise<ArtifactVersion[]> {
  try {
    const versions = await db.artifactVersion.findMany({
      where: { artifactId },
      orderBy: { version: "desc" },
      take: 50,
    });

    return versions.map(v => ({
      id: v.id,
      artifactId: v.artifactId,
      version: v.version,
      content: v.content,
      createdAt: v.createdAt.toISOString(),
      message: v.changeLog || "No message",
      tokenCount: Math.ceil(v.content.length / 4),
    }));
  } catch {
    return [];
  }
}

/**
 * Rollback an artifact to a specific version.
 */
export async function rollbackArtifactVersion(artifactId: string, versionId: string): Promise<boolean> {
  try {
    const version = await db.artifactVersion.findUnique({
      where: { id: versionId },
    });

    if (!version) return false;

    // Save current state as a new version before rolling back
    await saveArtifactVersion(artifactId, version.content, `Rollback to version ${version.version}`);

    return true;
  } catch {
    return false;
  }
}

// ── Export System ──────────────────────────────────────────────────────────

/**
 * Generate an export for an artifact.
 */
export function exportArtifact(
  content: string,
  type: ArtifactType,
  filename?: string
): ArtifactExport {
  const detected = detectArtifactType(content);
  const format = detected.exportFormat as ArtifactExport["format"];
  
  const formatMimeTypes: Record<string, string> = {
    html: "text/html",
    py: "text/x-python",
    ts: "text/typescript",
    js: "text/javascript",
    json: "application/json",
    csv: "text/csv",
    md: "text/markdown",
    svg: "image/svg+xml",
    sql: "text/x-sql",
    txt: "text/plain",
    yaml: "text/yaml",
    sh: "text/x-shellscript",
    css: "text/css",
  };

  const defaultFilename = filename || `artifact_${Date.now()}.${format}`;

  return {
    format,
    filename: defaultFilename,
    content,
    mimeType: formatMimeTypes[format] || "text/plain",
  };
}

/**
 * Get available export formats for an artifact type.
 */
export function getExportFormats(type: ArtifactType): Array<{ format: string; label: string; icon: string }> {
  const formatMap: Record<ArtifactType, Array<{ format: string; label: string; icon: string }>> = {
    html: [
      { format: "html", label: "HTML File", icon: "🌐" },
      { format: "txt", label: "Plain Text", icon: "📄" },
    ],
    react: [
      { format: "tsx", label: "TypeScript React", icon: "⚛️" },
      { format: "js", label: "JavaScript", icon: "📄" },
      { format: "txt", label: "Plain Text", icon: "📄" },
    ],
    code: [
      { format: "txt", label: "Plain Text", icon: "📄" },
    ],
    markdown: [
      { format: "md", label: "Markdown", icon: "📝" },
      { format: "html", label: "HTML", icon: "🌐" },
      { format: "txt", label: "Plain Text", icon: "📄" },
    ],
    svg: [
      { format: "svg", label: "SVG Image", icon: "🎨" },
      { format: "html", label: "HTML with SVG", icon: "🌐" },
    ],
    mermaid: [
      { format: "md", label: "Markdown", icon: "📝" },
      { format: "svg", label: "SVG (rendered)", icon: "🎨" },
    ],
    latex: [
      { format: "txt", label: "LaTeX Source", icon: "📐" },
      { format: "pdf", label: "PDF", icon: "📄" },
    ],
    chart: [
      { format: "svg", label: "SVG Image", icon: "🎨" },
      { format: "png", label: "PNG Image", icon: "🖼️" },
      { format: "json", label: "Chart Data", icon: "📋" },
    ],
    json: [
      { format: "json", label: "JSON", icon: "📋" },
      { format: "csv", label: "CSV (if tabular)", icon: "📈" },
    ],
    csv: [
      { format: "csv", label: "CSV", icon: "📈" },
      { format: "json", label: "JSON", icon: "📋" },
    ],
    sql: [
      { format: "sql", label: "SQL", icon: "🗃️" },
      { format: "txt", label: "Plain Text", icon: "📄" },
    ],
    python: [
      { format: "py", label: "Python", icon: "🐍" },
      { format: "txt", label: "Plain Text", icon: "📄" },
    ],
    typescript: [
      { format: "ts", label: "TypeScript", icon: "📘" },
      { format: "js", label: "JavaScript", icon: "📄" },
    ],
    javascript: [
      { format: "js", label: "JavaScript", icon: "📄" },
      { format: "txt", label: "Plain Text", icon: "📄" },
    ],
    css: [
      { format: "css", label: "CSS", icon: "🎨" },
      { format: "txt", label: "Plain Text", icon: "📄" },
    ],
    shell: [
      { format: "sh", label: "Shell Script", icon: "💻" },
      { format: "txt", label: "Plain Text", icon: "📄" },
    ],
    yaml: [
      { format: "yaml", label: "YAML", icon: "📝" },
      { format: "json", label: "JSON", icon: "📋" },
    ],
    xml: [
      { format: "xml", label: "XML", icon: "📄" },
      { format: "txt", label: "Plain Text", icon: "📄" },
    ],
  };

  return formatMap[type] || [{ format: "txt", label: "Plain Text", icon: "📄" }];
}

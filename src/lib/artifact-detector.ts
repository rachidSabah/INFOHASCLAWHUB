interface DetectedArtifact {
  type: "document" | "code" | "sandbox" | "spreadsheet" | "presentation" | "diagram" | "markdown" | "html" | "canvas" | "image" | "chart" | "website";
  title: string;
  confidence: number;
}

const DETECTION_PATTERNS: Array<{ regex: RegExp; type: DetectedArtifact["type"]; weight: number }> = [
  { regex: /```(html|jsx|tsx|js|ts|javascript|typescript|react|css)\n/, type: "code", weight: 6 },
  { regex: /<!DOCTYPE html|<html\b/i, type: "html", weight: 6 },
  { regex: /```mermaid\n/, type: "diagram", weight: 5 },
  { regex: /flowchart|graph\s+(TD|LR|TB|RL)/i, type: "diagram", weight: 5 },
  { regex: /useState|useEffect|useCallback|useMemo|useRef/, type: "code", weight: 4 },
  { regex: /export\s+(default\s+)?(function|class|const|interface)/, type: "code", weight: 3 },
  { regex: /import\s+.*\s+from\s+['"]/, type: "code", weight: 3 },
  { regex: /function\s+\w+\s*\(|const\s+\w+\s*=\s*(\(|function)|class\s+\w+/, type: "code", weight: 2 },
  { regex: /\|.*\|.*\|\n\|[-: ]+\|/i, type: "spreadsheet", weight: 4 },
  { regex: /<div|<section|<table|<svg|<canvas/i, type: "html", weight: 2 },
  { regex: /slide \d|Slide \d|Presentation/i, type: "presentation", weight: 3 },
  { regex: /^#{1,3}\s/m, type: "document", weight: 1 },
  { regex: /```mermaid/, type: "diagram", weight: 2 },
  { regex: /```css/, type: "code", weight: 1 },
];

// Patterns that indicate tool call JSON — should NOT be detected as artifacts
const TOOL_CALL_PATTERNS = [
  /^\s*\{"name"\s*:\s*"\w+"\s*,\s*"(arguments|args|params)"\s*:/m,
  /```tool_call\s*\n/m,
  /<longcat_tool_call>/,
  /"toolCallId"\s*:\s*"/,
  /^Tool:\s+\w+$/m,
  /^Status:\s+(success|error)$/m,
  /^Result:$/m,
  /^\s*\{"action"\s*:\s*"\w+"/m,
  /^\s*\{"tool"\s*:\s*"\w+"/m,
  /"functionCall"\s*:\s*\{/m,
  /⚙️/,
  /\[Executed System Action\]/m,
  /^\s*\{"url":\s*"/m,  // web_fetch result
  /^\s*\{"path":\s*"/m,  // file operation result
  /^\s*\{"query":\s*"/m,  // search result
  /^\s*\{"expression":\s*"/m,  // calculator result
  /^\s*\{"stdout"/m,  // command result
];

function isToolCallContent(content: string): boolean {
  for (const pattern of TOOL_CALL_PATTERNS) {
    if (pattern.test(content)) return true;
  }
  const trimmed = content.trim();
  
  // Check for JSON tool call patterns
  if (trimmed.startsWith('{"name":') && (trimmed.includes('"arguments"') || trimmed.includes('"args"') || trimmed.includes('"params"'))) return true;
  if (trimmed.startsWith('{"action":') || trimmed.startsWith('{"tool":')) return true;
  
  // Check for tool result JSON patterns
  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed);
      // Tool results from our tools
      if (parsed.url && (parsed.textContent !== undefined || parsed.fetched !== undefined)) return true;
      if (parsed.path && parsed.content !== undefined && !trimmed.includes('import ')) return true;
      if (parsed.query && parsed.results !== undefined) return true;
      if (parsed.expression && parsed.result !== undefined) return true;
      if (parsed.stdout !== undefined || parsed.exitCode !== undefined) return true;
      if (parsed.error && parsed.hint) return true;
      if (parsed.error && parsed.url) return true;
      if (parsed.path && parsed.files !== undefined) return true;
      if (parsed.path && parsed.written !== undefined) return true;
      if (parsed.path && parsed.replacements !== undefined) return true;
      if (parsed.appended !== undefined) return true;
      if (parsed.name && parsed.exists !== undefined) return true;
      if (parsed.memories !== undefined) return true;
      if (parsed.iso && parsed.timezone) return true;
      if (parsed.platform && parsed.cpus) return true;
      // Web fetch results
      if (parsed.url && parsed.title && parsed.textContent) return true;
    } catch {}
  }
  
  // Check for tool execution output patterns
  const toolResultLines = trimmed.split('\n').filter(l => 
    l.startsWith('Tool:') || l.startsWith('Status:') || l.startsWith('Result:')
  );
  if (toolResultLines.length > 2) return true;
  
  // Check for "Executed System Action" blocks
  if (trimmed.includes('[Executed System Action]')) return true;
  if (trimmed.includes('⚙️')) return true;
  
  return false;
}

export function detectArtifact(content: string, _chunk: string): DetectedArtifact | null {
  // Skip content that is primarily tool call data
  if (isToolCallContent(content)) return null;

  // Additional check: if content starts with { and is valid JSON that looks like a tool result, return null
  const trimmedContent = content.trim();
  if (trimmedContent.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmedContent);
      // Check if it has keys that indicate it's a tool result, not an artifact
      const toolResultKeys = ["url", "textContent", "path", "content", "query", "results", "stdout", "exitCode", "error", "hint", "files", "written", "replacements", "appended", "exists", "memories", "iso", "timezone", "platform", "cpus", "fetched"];
      const parsedKeys = Object.keys(parsed);
      if (parsedKeys.some(k => toolResultKeys.includes(k))) {
        return null;
      }
    } catch {
      // Not valid JSON, continue with artifact detection
    }
  }

  const scores: Record<string, number> = {};
  scores["markdown"] = 1;

  for (const { regex, type, weight } of DETECTION_PATTERNS) {
    if (regex.test(content)) {
      scores[type] = (scores[type] || 0) + weight;
    }
  }

  if (content.length > 800) {
    scores["markdown"] = (scores["markdown"] || 0) + 2;
  }

  let bestType = "markdown";
  let bestScore = 1;

  for (const [type, score] of Object.entries(scores)) {
    if (score > bestScore) {
      bestScore = score;
      bestType = type;
    }
  }

  const title = generateTitle(content, bestType as DetectedArtifact["type"]);

  return {
    type: bestType as DetectedArtifact["type"],
    title,
    confidence: Math.min(bestScore / 10, 1),
  };
}

function generateTitle(content: string, type: string): string {
  const lines = content.split("\n").filter((l) => l.trim());
  const firstLine = lines[0]?.replace(/^[#*\s`>-]+/, "").trim();
  if (firstLine && firstLine.length > 3 && firstLine.length < 80) {
    return firstLine.slice(0, 60);
  }
  const typeNames: Record<string, string> = {
    document: "Document", code: "Code", sandbox: "Sandbox", spreadsheet: "Spreadsheet",
    presentation: "Presentation", diagram: "Diagram", markdown: "Response", html: "HTML",
    canvas: "Canvas", image: "Image", chart: "Chart",
  };
  return `${typeNames[type] || "Artifact"} - ${new Date().toLocaleTimeString()}`;
}

export function shouldAutoOpen(artifact: DetectedArtifact | null, contentLength: number): boolean {
  if (contentLength < 20) return false;
  return true;
}

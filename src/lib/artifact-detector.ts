interface DetectedArtifact {
  type: "document" | "code" | "sandbox" | "spreadsheet" | "presentation" | "diagram" | "markdown" | "html" | "canvas" | "image" | "chart";
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

export function detectArtifact(content: string, _chunk: string): DetectedArtifact | null {
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

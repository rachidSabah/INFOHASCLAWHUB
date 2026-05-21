interface DetectedArtifact {
  type: "document" | "code" | "sandbox" | "spreadsheet" | "presentation" | "diagram" | "markdown" | "html" | "canvas" | "image" | "chart";
  title: string;
  confidence: number;
}

const DETECTION_PATTERNS: Array<{ regex: RegExp; type: DetectedArtifact["type"]; weight: number }> = [
  { regex: /```(html|jsx|tsx|js|ts|javascript|typescript|react)\n/, type: "code", weight: 5 },
  { regex: /```mermaid\n/, type: "diagram", weight: 3 },
  { regex: /<html|<!DOCTYPE html|<div|<section|<table|<svg|<canvas/i, type: "html", weight: 3 },
  { regex: /```mermaid/, type: "diagram", weight: 2 },
  { regex: /\|.*\|.*\|\n\|[-: ]+\|/i, type: "spreadsheet", weight: 3 },
  { regex: /^#{1,3}\s/, type: "document", weight: 2 },
  { regex: /slide \d|Slide \d|Presentation/i, type: "presentation", weight: 3 },
  { regex: /flowchart|graph\s+(TD|LR|TB|RL)/i, type: "diagram", weight: 4 },
  { regex: /function\s+\w+\s*\(|const\s+\w+\s*=\s*(\(|function)|class\s+\w+/, type: "code", weight: 3 },
  { regex: /import\s+.*\s+from\s+['"]/, type: "code", weight: 3 },
  { regex: /export\s+(default\s+)?(function|class|const|interface)/, type: "code", weight: 3 },
  { regex: /useState|useEffect|useCallback|useMemo|useRef/, type: "code", weight: 4 },
  { regex: /```css/, type: "code", weight: 1 },
];

const CONTENT_LENGTH_THRESHOLD = 200;

export function detectArtifact(content: string, chunk: string): DetectedArtifact | null {
  if (content.length < CONTENT_LENGTH_THRESHOLD) return null;

  const fullContent = content + chunk;
  const scores: Record<string, number> = {};

  for (const { regex, type, weight } of DETECTION_PATTERNS) {
    if (regex.test(fullContent)) {
      scores[type] = (scores[type] || 0) + weight;
    }
  }

  if (fullContent.length > 500) {
    scores["markdown"] = (scores["markdown"] || 0) + 1;
  }

  if (Object.keys(scores).length === 0) return null;

  let bestType = "";
  let bestScore = 0;
  for (const [type, score] of Object.entries(scores)) {
    if (score > bestScore) {
      bestScore = score;
      bestType = type;
    }
  }

  if (bestScore < 2) return null;

  const title = generateTitle(fullContent, bestType as DetectedArtifact["type"]);

  return {
    type: bestType as DetectedArtifact["type"],
    title,
    confidence: Math.min(bestScore / 8, 1),
  };
}

function generateTitle(content: string, type: string): string {
  const lines = content.split("\n").filter((l) => l.trim());
  const firstLine = lines[0]?.replace(/^[#*\s`>-]+/, "").trim();

  if (firstLine && firstLine.length > 3 && firstLine.length < 80) {
    return firstLine.slice(0, 60);
  }

  const typeNames: Record<string, string> = {
    document: "Document",
    code: "Code Artifact",
    sandbox: "App Preview",
    spreadsheet: "Spreadsheet",
    presentation: "Presentation",
    diagram: "Diagram",
    markdown: "Markdown",
    html: "HTML Preview",
    canvas: "Canvas",
    image: "Image",
    chart: "Chart",
  };

  return `${typeNames[type] || "Artifact"} - ${new Date().toLocaleTimeString()}`;
}

export function shouldAutoOpen(artifact: DetectedArtifact | null, contentLength: number): boolean {
  if (!artifact) return false;
  if (contentLength < 300) return false;
  if (artifact.confidence < 0.3) return false;
  return true;
}

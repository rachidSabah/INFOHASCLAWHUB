"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { RefreshCw, Maximize2, AlertTriangle, Terminal } from "lucide-react";

interface SandboxPreviewProps {
  code: string;
  type: "html" | "react" | "code";
  className?: string;
}

const REACT_DEPS_CDN = `
<script crossorigin src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
<script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
<script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
`;

export default function SandboxPreview({ code, type, className }: SandboxPreviewProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [showLogs, setShowLogs] = useState(false);

  const buildHTML = useCallback((source: string): string => {
    if (type === "html") {
      return source;
    }

    const cleaned = source
      .replace(/```[\w]*\n?/g, "")
      .replace(/```/g, "")
      .trim();

    if (cleaned.includes("import React") || cleaned.includes("from 'react'") || cleaned.includes("useState") || cleaned.includes("useEffect")) {
      const appCode = cleaned
        .replace(/import\s+.*\s+from\s+['"][^'"]+['"];?/g, "")
        .replace(/export\s+default\s+/, "")
        .replace(/export\s+\{.*\};?/g, "")
        .trim();

      return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><script src="https://cdn.tailwindcss.com"></script>${REACT_DEPS_CDN}<style>body{margin:0;font-family:system-ui,sans-serif}#root{padding:16px}.error{color:#ef4444;padding:8px;background:#fef2f2;border-radius:6px;margin:8px;font-size:13px}console-panel{position:fixed;bottom:0;left:0;right:0;max-height:150px;overflow-y:auto;background:#1e1e1e;color:#d4d4d4;font-family:monospace;font-size:11px;padding:8px;display:none;border-top:1px solid #333}</style></head><body><div id="root"></div><div id="console-panel" style="display:none;position:fixed;bottom:0;left:0;right:0;max-height:120px;overflow-y:auto;background:#1e1e1e;color:#d4d4d4;font-family:monospace;font-size:11px;padding:8px;border-top:1px solid #333"></div><script>window.onerror=function(m,s,l,c,e){document.getElementById('console-panel').style.display='block';document.getElementById('console-panel').innerHTML+='<div style=\"color:#f87171\">'+m+'</div>';};</script><script type="text/babel">\n${appCode}\nconst root=ReactDOM.createRoot(document.getElementById('root'));const app=typeof App!=='undefined'?React.createElement(App):typeof MyApp!=='undefined'?React.createElement(MyApp):React.createElement('div',null,'No React component found.Export a component named App or MyApp.');root.render(app);</script></body></html>`;
    }

    return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><script src="https://cdn.tailwindcss.com"></script><style>body{margin:0;font-family:system-ui,sans-serif;padding:16px}pre{background:#f5f5f5;padding:12px;border-radius:8px;overflow-x:auto}code{font-family:monospace;font-size:13px}</style></head><body>${cleaned}</body></html>`;
  }, [type]);

  const [html, setHtml] = useState("");

  useEffect(() => {
    try {
      setHtml(buildHTML(code));
      setError(null);
    } catch (e: any) {
      setError(e.message);
    }
  }, [code, buildHTML]);

  const refresh = useCallback(() => {
    try {
      setHtml(buildHTML(code));
      setError(null);
    } catch (e: any) {
      setError(e.message);
    }
  }, [code, buildHTML]);

  return (
    <div className={cn("flex flex-col h-full bg-background", className)}>
      <div className="flex items-center gap-1 px-2 py-1 border-b border-border bg-muted/20 shrink-0">
        <span className="text-[10px] text-muted-foreground font-mono uppercase">Preview</span>
        <div className="flex-1" />
        <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={() => setShowLogs(!showLogs)} title="Console">
          <Terminal className="h-3 w-3" />
        </Button>
        <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={refresh} title="Refresh">
          <RefreshCw className="h-3 w-3" />
        </Button>
      </div>
      {error && (
        <div className="mx-2 mt-1 p-2 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900 rounded text-xs text-red-600 dark:text-red-400 flex items-start gap-1.5">
          <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
          {error}
        </div>
      )}
      <div className="flex-1 relative">
        <iframe
          ref={iframeRef}
          srcDoc={html}
          className="w-full h-full border-0"
          sandbox="allow-scripts allow-same-origin"
          title="sandbox-preview"
        />
      </div>
      {showLogs && (
        <div className="h-24 border-t border-border bg-gray-950 text-gray-300 text-[10px] font-mono p-2 overflow-y-auto">
          {logs.length === 0 && <span className="text-gray-600">No console output (sandboxed)</span>}
          {logs.map((l, i) => <div key={i}>{l}</div>)}
        </div>
      )}
    </div>
  );
}

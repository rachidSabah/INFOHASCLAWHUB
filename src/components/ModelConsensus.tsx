"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { GitCompare, Loader2, Copy, Check, Sparkles, Clock } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface ModelResult {
  model: string;
  content: string;
  tokens?: { prompt: number; completion: number };
  cost?: number;
  duration: number;
  error?: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const POPULAR_MODELS = [
  "gemini-2.5-pro", "gemini-2.5-flash",
  "deepseek/deepseek-chat", "deepseek/deepseek-reasoner",
  "openai/gpt-4o", "openai/gpt-4o-mini",
  "anthropic/claude-sonnet-4-20250514",
  "groq/llama-4-maverick-17b-128e-instruct",
];

export function ModelConsensus({ open, onOpenChange }: Props) {
  const [prompt, setPrompt] = useState("");
  const [selectedModels, setSelectedModels] = useState<string[]>(["gemini-2.5-pro", "deepseek/deepseek-chat"]);
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<ModelResult[]>([]);
  const [copied, setCopied] = useState<string | null>(null);

  const handleRun = async () => {
    if (!prompt.trim()) { toast.error("Enter a prompt"); return; }
    if (selectedModels.length === 0) { toast.error("Select at least one model"); return; }

    setRunning(true);
    setResults([]);

    try {
      const res = await fetch("/api/consensus", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: prompt.trim(), models: selectedModels }),
      });
      const data = await res.json();
      setResults(data.results || []);
    } catch (e: any) {
      toast.error(e.message || "Consensus failed");
    } finally {
      setRunning(false);
    }
  };

  const toggleModel = (model: string) => {
    setSelectedModels((prev) =>
      prev.includes(model) ? prev.filter((m) => m !== model) : [...prev, model]
    );
  };

  const copyAll = async () => {
    const text = results.map((r) => `## ${r.model}\n${r.content}\n`).join("\n---\n\n");
    await navigator.clipboard.writeText(text);
    toast.success("All responses copied");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] flex flex-col p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-3 border-b shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <GitCompare className="h-5 w-5 text-primary" />
            Multi-Model Consensus
          </DialogTitle>
          <DialogDescription>Run the same prompt across multiple AI models and compare results.</DialogDescription>
        </DialogHeader>

        <div className="flex-1 flex flex-col min-h-0">
          {/* Input area */}
          <div className="shrink-0 p-6 pb-3 space-y-3">
            <Textarea
              placeholder="Enter your prompt to test across models..."
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              className="min-h-[80px] text-sm"
            />
            <div>
              <Label className="text-xs text-muted-foreground mb-2 block">Select Models</Label>
              <div className="flex flex-wrap gap-2">
                {POPULAR_MODELS.map((model) => (
                  <label
                    key={model}
                    className={cn(
                      "flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] cursor-pointer transition-colors",
                      selectedModels.includes(model)
                        ? "border-primary/50 bg-primary/10 text-primary"
                        : "border-border hover:bg-accent"
                    )}
                  >
                    <Checkbox
                      checked={selectedModels.includes(model)}
                      onCheckedChange={() => toggleModel(model)}
                      className="h-3 w-3"
                    />
                    {model}
                  </label>
                ))}
              </div>
            </div>
            <Button onClick={handleRun} disabled={running} className="w-full" size="sm">
              {running ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Running Consensus...</>
              ) : (
                <><GitCompare className="h-4 w-4 mr-2" /> Run Consensus</>
              )}
            </Button>
          </div>

          {/* Results */}
          {results.length > 0 && (
            <>
              <div className="shrink-0 px-6 py-2 flex items-center justify-between">
                <span className="text-xs text-muted-foreground">{results.length} model responses</span>
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={copyAll}>
                  <Copy className="h-3 w-3 mr-1" /> Copy All
                </Button>
              </div>
              <ScrollArea className="flex-1 min-h-0 px-6 pb-4">
                <div className="grid grid-cols-2 gap-3">
                  {results.map((r) => (
                    <div
                      key={r.model}
                      className={cn(
                        "rounded-xl border p-3 space-y-2",
                        r.error ? "border-red-500/20 bg-red-500/5" : "border-border bg-card/30"
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold">{r.model}</span>
                        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                          {r.duration > 0 && (
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />{(r.duration / 1000).toFixed(1)}s
                            </span>
                          )}
                          {r.cost !== undefined && (
                            <span>${r.cost.toFixed(4)}</span>
                          )}
                        </div>
                      </div>
                      <div className="bg-muted/30 rounded-lg p-2.5 max-h-48 overflow-y-auto">
                        <pre className="text-[11px] whitespace-pre-wrap font-sans leading-relaxed text-foreground/80">
                          {r.error || r.content}
                        </pre>
                      </div>
                      {!r.error && (
                        <button
                          onClick={async () => {
                            await navigator.clipboard.writeText(r.content);
                            setCopied(r.model);
                            setTimeout(() => setCopied(null), 2000);
                          }}
                          className="text-[10px] text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
                        >
                          {copied === r.model ? (
                            <><Check className="h-3 w-3 text-green-500" /> Copied</>
                          ) : (
                            <><Copy className="h-3 w-3" /> Copy</>
                          )}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </>
          )}

          {running && (
            <div className="flex-1 flex items-center justify-center py-8">
              <div className="flex flex-col items-center gap-2">
                <Loader2 className="h-6 w-6 text-primary animate-spin" />
                <p className="text-sm text-muted-foreground">Running {selectedModels.length} models in parallel...</p>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

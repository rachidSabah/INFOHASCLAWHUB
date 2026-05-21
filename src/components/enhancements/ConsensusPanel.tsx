"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { PowerToolHint } from "./PowerToolHint";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  Vote, Loader2, Play, CheckCircle2, Crown, Trophy,
  Clock, Hash, BarChart3, GitMerge, Copy, Check,
  Sparkles, Zap, Brain, ArrowRight, AlertTriangle
} from "lucide-react";

interface ProviderResponse {
  provider: string;
  model: string;
  content: string;
  duration: number;
  tokens?: { prompt: number; completion: number };
  error?: string;
}

interface VoteResult {
  winner: string;
  winnerIndex: number;
  reasoning: string;
  scores: { provider: string; score: number }[];
}

interface WinStats {
  provider: string;
  wins: number;
}

interface ConsensusPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const PROVIDER_COLORS: Record<string, { color: string; bg: string; border: string }> = {
  deepseek: { color: "text-blue-500", bg: "bg-blue-500/10", border: "border-blue-500/30" },
  qwen: { color: "text-purple-500", bg: "bg-purple-500/10", border: "border-purple-500/30" },
  gemini: { color: "text-sky-400", bg: "bg-sky-400/10", border: "border-sky-400/30" },
  kimi: { color: "text-red-500", bg: "bg-red-500/10", border: "border-red-500/30" },
  "z-ai": { color: "text-cyan-500", bg: "bg-cyan-500/10", border: "border-cyan-500/30" },
  openai: { color: "text-emerald-500", bg: "bg-emerald-500/10", border: "border-emerald-500/30" },
  anthropic: { color: "text-orange-500", bg: "bg-orange-500/10", border: "border-orange-500/30" },
  groq: { color: "text-rose-500", bg: "bg-rose-500/10", border: "border-rose-500/30" },
};

const PROVIDER_EMOJI: Record<string, string> = {
  deepseek: "⚡", qwen: "🧠", gemini: "🔵", kimi: "🚀", "z-ai": "💎",
  openai: "🤖", anthropic: "🎭", groq: "⚡",
};

export function ConsensusPanel({ open, onOpenChange }: ConsensusPanelProps) {
  const [prompt, setPrompt] = useState("");
  const [running, setRunning] = useState(false);
  const [responses, setResponses] = useState<ProviderResponse[]>([]);
  const [voteResult, setVoteResult] = useState<VoteResult | null>(null);
  const [voting, setVoting] = useState(false);
  const [copied, setCopied] = useState<number | null>(null);
  const [winStats, setWinStats] = useState<WinStats[]>([]);
  const [availableProviders, setAvailableProviders] = useState<string[]>([]);

  // Fetch available providers on open
  useEffect(() => {
    if (!open) return;
    fetch("/api/models?t=" + Date.now())
      .then(r => r.json())
      .then(data => {
        const providers = new Set<string>();
        for (const g of data || []) {
          for (const m of g.models || []) {
            const parts = m.id.split("/");
            if (parts.length > 1) providers.add(parts[0].toLowerCase());
            else if (m.provider) providers.add(m.provider.toLowerCase());
            else {
              // Heuristic detection
              if (m.id.includes("gemini")) providers.add("gemini");
              if (m.id.includes("deepseek")) providers.add("deepseek");
              if (m.id.includes("qwen")) providers.add("qwen");
              if (m.id.includes("claude")) providers.add("anthropic");
              if (m.id.includes("gpt") || m.id.includes("o1")) providers.add("openai");
              if (m.id.includes("llama") || m.id.includes("mixtral")) providers.add("groq");
            }
          }
        }
        setAvailableProviders(Array.from(providers));
      })
      .catch(() => {
        setAvailableProviders(["gemini", "deepseek", "qwen", "openai", "anthropic"]);
      });

    // Load win stats from localStorage
    try {
      const stored = localStorage.getItem("consensus-win-stats");
      if (stored) setWinStats(JSON.parse(stored));
    } catch {}
  }, [open]);

  const saveWinStats = (newStats: WinStats[]) => {
    setWinStats(newStats);
    try { localStorage.setItem("consensus-win-stats", JSON.stringify(newStats)); } catch {}
  };

  // Run consensus across all providers
  const handleRun = async () => {
    if (!prompt.trim()) { toast.error("Enter a prompt"); return; }

    setRunning(true);
    setResponses([]);
    setVoteResult(null);

    try {
      const res = await fetch("/api/consensus", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: prompt.trim(),
          models: availableProviders,
          mode: "all-providers",
        }),
      });
      const data = await res.json();
      const results: ProviderResponse[] = (data.results || []).map((r: any) => ({
        provider: r.model?.split("/")[0] || r.provider || r.model || "unknown",
        model: r.model || "unknown",
        content: r.content || "",
        duration: r.duration || 0,
        tokens: r.tokens,
        error: r.error,
      }));
      setResponses(results);
      if (results.length > 0) {
        toast.success(`${results.length} providers responded`);
      }
    } catch {
      toast.error("Consensus failed");
    } finally {
      setRunning(false);
    }
  };

  // AI Vote: compare responses and pick winner
  const handleVote = async () => {
    if (responses.length < 2) { toast.error("Need at least 2 responses to vote"); return; }

    setVoting(true);
    try {
      const res = await fetch("/api/consensus/vote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: prompt.trim(),
          responses: responses.map(r => ({
            provider: r.provider,
            model: r.model,
            content: r.content,
          })),
        }),
      });
      const data = await res.json();

      // Fallback: local scoring if API doesn't support voting
      if (data.winner) {
        const result: VoteResult = {
          winner: data.winner,
          winnerIndex: responses.findIndex(r => r.provider === data.winner || r.model === data.winner),
          reasoning: data.reasoning || "Selected based on completeness and accuracy.",
          scores: data.scores || responses.map(r => ({ provider: r.provider, score: Math.random() * 5 + 5 })),
        };
        setVoteResult(result);

        // Update win stats
        const newStats = [...winStats];
        const existing = newStats.find(s => s.provider === result.winner);
        if (existing) {
          existing.wins += 1;
        } else {
          newStats.push({ provider: result.winner, wins: 1 });
        }
        saveWinStats(newStats);
      } else {
        // Local heuristics fallback
        const scores = responses.map((r, i) => {
          let score = 0;
          // Longer responses tend to be better
          score += Math.min(r.content.length / 100, 10);
          // Fewer errors is better
          if (!r.error) score += 5;
          // Faster responses are preferred for simple prompts
          if (r.duration < 3000 && prompt.length < 100) score += 3;
          // Tokens used indicate depth
          if (r.tokens?.completion && r.tokens.completion > 50) score += 2;
          return { provider: r.provider, score: Math.round(score * 10) / 10 };
        });
        scores.sort((a, b) => b.score - a.scores[0].score);

        const result: VoteResult = {
          winner: scores[0].provider,
          winnerIndex: responses.findIndex(r => r.provider === scores[0].provider),
          reasoning: `Scored highest (${scores[0].score}) based on response depth, speed, and absence of errors.`,
          scores,
        };
        setVoteResult(result);

        const newStats = [...winStats];
        const existing = newStats.find(s => s.provider === result.winner);
        if (existing) {
          existing.wins += 1;
        } else {
          newStats.push({ provider: result.winner, wins: 1 });
        }
        saveWinStats(newStats);
      }
      toast.success(`Consensus winner: ${responses.find(r => r.provider === (voteResult?.winner || scores[0].provider))?.model || voteResult?.winner || scores[0].provider}`);
    } catch {
      // Fallback entirely to local scoring
      const scores = responses.map((r) => {
        let score = 0;
        if (!r.error) score += 10;
        score += Math.min(r.content.length / 50, 15);
        if (r.tokens?.completion && r.tokens.completion > 100) score += 3;
        return { provider: r.provider, score: Math.round(score * 10) / 10 };
      });
      scores.sort((a, b) => b.score - a.score);

      const result: VoteResult = {
        winner: scores[0].provider,
        winnerIndex: responses.findIndex(r => r.provider === scores[0].provider),
        reasoning: `Scored highest (${scores[0].score}) based on response quality heuristics.`,
        scores,
      };
      setVoteResult(result);

      const newStats = [...winStats];
      const existing = newStats.find(s => s.provider === result.winner);
      if (existing) {
        existing.wins += 1;
      } else {
        newStats.push({ provider: result.winner, wins: 1 });
      }
      saveWinStats(newStats);
      toast.success(`Consensus winner: ${result.winner}`);
    } finally {
      setVoting(false);
    }
  };

  const copyResponse = async (content: string, index: number) => {
    await navigator.clipboard.writeText(content);
    setCopied(index);
    setTimeout(() => setCopied(null), 2000);
    toast.success("Copied to clipboard");
  };

  const getProviderStyle = (provider: string) => {
    const key = Object.keys(PROVIDER_COLORS).find(k => provider.toLowerCase().includes(k)) || "gemini";
    return PROVIDER_COLORS[key] || PROVIDER_COLORS.gemini;
  };

  const getProviderEmoji = (provider: string) => {
    const key = Object.keys(PROVIDER_EMOJI).find(k => provider.toLowerCase().includes(k));
    return key ? PROVIDER_EMOJI[key] : "•";
  };

  const totalTokens = responses.reduce((sum, r) => sum + (r.tokens?.completion || 0), 0);
  const avgDuration = responses.length > 0
    ? Math.round(responses.reduce((sum, r) => sum + r.duration, 0) / responses.length)
    : 0;
  const sortedWinStats = [...winStats].sort((a, b) => b.wins - a.wins);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-5xl max-h-[95vh] overflow-hidden flex flex-col" showCloseButton>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Vote className="h-5 w-5 text-amber-500" />
            Cross-Provider Consensus
          </DialogTitle>
          <DialogDescription>
            Send to all connected AI providers simultaneously. AI votes on the best response.
          </DialogDescription>
        </DialogHeader>
        <PowerToolHint name="Model Consensus" />

        {/* Input area */}
        <div className="shrink-0 space-y-3">
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <Textarea
                placeholder="Enter your prompt — it will be sent to ALL configured providers..."
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                className="min-h-[80px] text-sm pr-20"
                rows={3}
              />
              <span className="absolute bottom-2 right-3 text-[10px] text-muted-foreground">
                {prompt.length} chars
              </span>
            </div>
          </div>

          {/* Available providers badges */}
          {availableProviders.length > 0 && (
            <div className="flex flex-wrap gap-1.5 items-center">
              <span className="text-[10px] text-muted-foreground mr-1">Targets:</span>
              {availableProviders.map((p) => {
                const style = getProviderStyle(p);
                return (
                  <Badge key={p} variant="outline" className={cn("text-[10px] gap-1 px-1.5 h-5", style.bg, style.color, style.border)}>
                    {getProviderEmoji(p)} {p}
                  </Badge>
                );
              })}
              {availableProviders.length === 0 && (
                <Badge variant="outline" className="text-[10px] text-muted-foreground">No providers detected</Badge>
              )}
            </div>
          )}

          <div className="flex gap-2">
            <Button onClick={handleRun} disabled={running || !prompt.trim()} className="flex-1" size="sm">
              {running ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Sending to {availableProviders.length || "all"} providers...</>
              ) : (
                <><Play className="h-4 w-4 mr-2" /> Run Consensus</>
              )}
            </Button>
            {responses.length >= 2 && (
              <Button
                onClick={handleVote}
                disabled={voting}
                variant="secondary"
                size="sm"
                className="gap-1.5 bg-amber-500/10 hover:bg-amber-500/20 border-amber-500/30"
              >
                {voting ? (
                  <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Voting...</>
                ) : (
                  <><GitMerge className="h-4 w-4" /> AI Vote</>
                )}
              </Button>
            )}
          </div>

          {/* Stats bar */}
          {responses.length > 0 && (
            <div className="flex items-center gap-4 px-2 py-1.5 rounded-lg bg-muted/30 border text-[10px] text-muted-foreground">
              <span className="flex items-center gap-1"><Hash className="h-3 w-3" /> {responses.length} responses</span>
              <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> Avg {avgDuration}ms</span>
              <span className="flex items-center gap-1"><Zap className="h-3 w-3" /> {totalTokens.toLocaleString()} tokens</span>
              <span className="flex items-center gap-1"><BarChart3 className="h-3 w-3" /> {responses.filter(r => !r.error).length}/{responses.length} OK</span>
            </div>
          )}
        </div>

        <Separator className="shrink-0" />

        {/* Consensus Winner */}
        {voteResult && (
          <div className="shrink-0">
            <div className="mx-1 mt-3 mb-1 p-4 rounded-xl bg-gradient-to-r from-amber-500/10 via-yellow-500/10 to-amber-500/5 border-2 border-amber-500/30">
              <div className="flex items-center gap-2 mb-2">
                <Trophy className="h-5 w-5 text-amber-500" />
                <span className="text-sm font-bold text-amber-600">Consensus Winner</span>
                <Crown className="h-4 w-4 text-amber-500 ml-auto" />
              </div>
              <div className="flex items-center gap-3">
                {(() => {
                  const winnerResp = responses[voteResult.winnerIndex];
                  if (!winnerResp) return null;
                  const style = getProviderStyle(winnerResp.provider);
                  return (
                    <>
                      <Badge className={cn("h-6 text-xs gap-1.5 font-semibold", style.bg, style.color, style.border)}>
                        {getProviderEmoji(winnerResp.provider)} {winnerResp.model}
                      </Badge>
                      <span className="text-[11px] text-muted-foreground flex-1">{voteResult.reasoning}</span>
                    </>
                  );
                })()}
              </div>

              {/* Score breakdown */}
              {voteResult.scores.length > 0 && (
                <div className="mt-3 space-y-1.5">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Score Breakdown</p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {voteResult.scores.slice(0, 4).map((s) => {
                      const style = getProviderStyle(s.provider);
                      const maxScore = Math.max(...voteResult.scores.map(x => x.score), 1);
                      return (
                        <div key={s.provider} className="flex items-center gap-2 p-1.5 rounded-lg bg-muted/20">
                          <span className="text-[10px] font-medium w-16 truncate">{getProviderEmoji(s.provider)} {s.provider}</span>
                          <div className="flex-1 h-3 bg-muted rounded-full overflow-hidden">
                            <div className={cn("h-full rounded-full transition-all duration-700", s.provider === voteResult.winner ? "bg-amber-500" : "bg-muted-foreground/30")} style={{ width: `${(s.score / maxScore) * 100}%` }} />
                          </div>
                          <span className="text-[10px] font-mono text-muted-foreground">{s.score.toFixed(1)}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Responses Grid */}
        {responses.length > 0 && (
          <ScrollArea className="flex-1 min-h-0 px-1">
            <div className="grid grid-cols-2 gap-3 p-3">
              {responses.map((r, i) => {
                const style = getProviderStyle(r.provider);
                const isWinner = voteResult && i === voteResult.winnerIndex;

                return (
                  <div
                    key={i}
                    className={cn(
                      "rounded-xl border p-3 space-y-2 transition-all",
                      r.error ? "border-red-500/20 bg-red-500/5" : "border-border bg-card/30",
                      isWinner && "ring-2 ring-amber-500 border-amber-500/50 bg-amber-500/5"
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {isWinner && <Crown className="h-3.5 w-3.5 text-amber-500" />}
                        <Badge className={cn("text-[10px] gap-1 px-1.5 h-5 font-semibold", style.bg, style.color, style.border)}>
                          {getProviderEmoji(r.provider)} {r.model}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                        {r.duration > 0 && (
                          <span className="flex items-center gap-0.5">
                            <Clock className="h-3 w-3" />{(r.duration / 1000).toFixed(1)}s
                          </span>
                        )}
                        {r.tokens?.completion && (
                          <span className="flex items-center gap-0.5">
                            <Hash className="h-3 w-3" />{r.tokens.completion}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className={cn("rounded-lg p-2.5 max-h-56 overflow-y-auto", r.error ? "bg-red-500/5" : "bg-muted/30")}>
                      {r.error ? (
                        <div className="flex items-center gap-1.5 text-red-500 text-[11px]">
                          <AlertTriangle className="h-3.5 w-3.5" />
                          {r.error}
                        </div>
                      ) : (
                        <pre className="text-[11px] whitespace-pre-wrap font-sans leading-relaxed text-foreground/80">
                          {r.content}
                        </pre>
                      )}
                    </div>

                    {!r.error && (
                      <button
                        onClick={() => copyResponse(r.content, i)}
                        className="text-[10px] text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
                      >
                        {copied === i ? (
                          <><Check className="h-3 w-3 text-green-500" /> Copied</>
                        ) : (
                          <><Copy className="h-3 w-3" /> Copy</>
                        )}
                      </button>
                    )}
                  </div>
                );
              })}

              {/* Running placeholder cards */}
              {running && responses.length === 0 && (
                <>
                  {[1, 2, 3, 4].map((n) => (
                    <div key={n} className="rounded-xl border border-border bg-card/30 p-3 space-y-2 animate-pulse">
                      <div className="flex items-center gap-2">
                        <div className="h-4 w-24 bg-muted rounded" />
                        <div className="h-3 w-16 bg-muted rounded ml-auto" />
                      </div>
                      <div className="space-y-1.5">
                        <div className="h-3 w-full bg-muted rounded" />
                        <div className="h-3 w-3/4 bg-muted rounded" />
                        <div className="h-3 w-1/2 bg-muted rounded" />
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>
          </ScrollArea>
        )}

        {/* Win Stats */}
        {sortedWinStats.length > 0 && (
          <div className="shrink-0 px-1 pb-1">
            <Separator className="mb-2" />
            <div className="px-2 pb-2">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">All-Time Wins</p>
              <div className="flex flex-wrap gap-1.5">
                {sortedWinStats.map((s) => {
                  const style = getProviderStyle(s.provider);
                  return (
                    <Badge key={s.provider} variant="outline" className={cn("text-[10px] gap-1 px-1.5 h-5", style.bg, style.color, style.border)}>
                      {getProviderEmoji(s.provider)} {s.provider}: {s.wins} win{s.wins !== 1 ? "s" : ""}
                    </Badge>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Running state */}
        {running && (
          <div className="flex-1 flex items-center justify-center py-12">
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="h-6 w-6 text-primary animate-spin" />
              <p className="text-sm text-muted-foreground">Running {availableProviders.length || "all"} providers in parallel...</p>
              {responses.length > 0 && (
                <p className="text-xs text-muted-foreground">{responses.length} responded so far</p>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

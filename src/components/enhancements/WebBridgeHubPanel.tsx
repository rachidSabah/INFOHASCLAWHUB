"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PowerToolHint } from "./PowerToolHint";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Globe, Key, Copy, Check, RefreshCw, ExternalLink, Loader2, AlertTriangle, CheckCircle2, XCircle, Eye, EyeOff, Play, Square, Server, Zap } from "lucide-react";

interface TokenResult {
  browser: string; domain: string; name: string; value: string;
  decrypted?: boolean; source?: "cookie" | "localStorage"; error?: string;
}

interface ProviderInfo {
  name: string; baseUrl: string; tokenLabel: string; domain: string;
  loginUrl: string; localStorageKey: string; models: { id: string; name: string; description: string }[];
  setupGuide: string[];
}

const PROVIDERS: ProviderInfo[] = [
  {
    name: "DeepSeek (ds2api)",
    baseUrl: "http://localhost:8000/v1",
    tokenLabel: "Bearer Token (JWT)",
    domain: "chat.deepseek.com",
    loginUrl: "https://chat.deepseek.com",
    localStorageKey: "userToken",
    models: [
      { id: "deepseek-chat", name: "DeepSeek Chat (V3)", description: "Free V3 through web-to-API bridge" },
      { id: "deepseek-reasoner", name: "DeepSeek Reasoner (R1)", description: "Free R1 reasoning through web-to-API bridge" },
    ],
    setupGuide: [
      "Download ds2api from github.com/CJackHwang/ds2api",
      "Start ds2api — it runs on http://localhost:8000/v1",
      "Extract your Bearer token using the scanner below",
      "Paste token as API Key in the provider config",
      "Use Model Router to route models to ds2api",
    ],
  },
  {
    name: "Qwen (qw2api)",
    baseUrl: "http://localhost:8100/v1",
    tokenLabel: "Bearer Token (JWT)",
    domain: "qwenlm.ai",
    loginUrl: "https://chat.qwen.ai",
    localStorageKey: "token",
    models: [
      { id: "qwen-plus", name: "Qwen Plus", description: "Alibaba's flagship model" },
      { id: "qwen-max", name: "Qwen Max", description: "Most capable Qwen model" },
      { id: "qwen-turbo", name: "Qwen Turbo", description: "Fast and efficient" },
      { id: "qwen-coder", name: "Qwen Coder", description: "Code generation specialist" },
    ],
    setupGuide: [
      "Log into chat.qwen.ai in your browser",
      "Open DevTools (F12) → Network → Fetch/XHR tab",
      "Send a message — watch for requests to chat.qwen.ai/api",
      "Find Authorization: Bearer eyJ... in Request Headers",
      "Copy the full JWT token and paste it here",
      "Find/create a qw2api bridge at localhost:8100",
    ],
  },
  {
    name: "Gemini (Free Web)",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    tokenLabel: "API Key (from Google AI Studio)",
    domain: "aistudio.google.com",
    loginUrl: "https://aistudio.google.com/apikey",
    localStorageKey: "",
    models: [
      { id: "gemini-2.0-flash", name: "Gemini 2.0 Flash", description: "Google's fast free tier model" },
      { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro", description: "Google's most capable model" },
      { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash", description: "Fast thinking with high quality" },
    ],
    setupGuide: [
      "Visit aistudio.google.com/apikey to get a free API key",
      "The key starts with 'AIza...'",
      "Paste it as the API Key in the provider config",
      "No bridge needed — direct HTTPS API",
      "50 requests/day free tier",
    ],
  },
];

interface Props { open: boolean; onOpenChange: (open: boolean) => void; }

export function WebBridgeHubPanel({ open, onOpenChange }: Props) {
  const [activeProvider, setActiveProvider] = useState(0);
  const [tokens, setTokens] = useState<TokenResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [showValues, setShowValues] = useState<Record<string, boolean>>({});
  const [apiKey, setApiKey] = useState("");
  const [configured, setConfigured] = useState<string[]>([]);
  const [bridgeStatus, setBridgeStatus] = useState<Record<string, "unknown" | "running" | "stopped">>({});

  const provider = PROVIDERS[activeProvider];

  const checkBridgeStatus = async (p: ProviderInfo) => {
    try {
      const res = await fetch(p.baseUrl.replace("/v1", "") + "/v1/models", { signal: AbortSignal.timeout(3000) });
      setBridgeStatus(prev => ({ ...prev, [p.name]: res.ok ? "running" : "stopped" }));
    } catch {
      setBridgeStatus(prev => ({ ...prev, [p.name]: "stopped" }));
    }
  };

  useEffect(() => {
    if (open) PROVIDERS.forEach(p => checkBridgeStatus(p));
  }, [open]);

  const scanTokens = async () => {
    setLoading(true); setTokens([]);
    try {
      const res = await fetch("/api/browser/tokens");
      const data = await res.json();
      setTokens(data.tokens || []);
      toast.success(`${data.summary?.valid || 0} tokens found`);
    } catch { toast.error("Scan failed"); }
    finally { setLoading(false); }
  };

  useEffect(() => { if (open) scanTokens(); }, [open]);

  const copyToken = async (text: string, id: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(id); setTimeout(() => setCopied(null), 2000);
    toast.success("Copied");
  };

  const configureProvider = async () => {
    const token = apiKey || tokens.find(t => t.decrypted && t.value && t.source === "localStorage")?.value;
    if (!token) { toast.error("No token available. Scan or paste one."); return; }
    try {
      await fetch("/api/providers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: provider.name, baseUrl: provider.baseUrl, apiKey: token, isActive: true }),
      });
      setConfigured(prev => [...prev, provider.name]);
      toast.success(`Provider "${provider.name}" configured! Refresh the page or click Detect to load models.`);
      // Auto-refresh models
      setTimeout(async () => {
        try { await fetch("/api/models?t=" + Date.now()); } catch {}
      }, 1000);
    } catch { toast.error("Failed to configure provider"); }
  };

  const addModelRoute = async (modelId: string) => {
    const slug = provider.name.toLowerCase().replace(/\s+/g, "-").replace(/[()]/g, "");
    try {
      await fetch("/api/model-routes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: `${modelId} via ${provider.name}`, taskType: "chat", model: `${slug}/${modelId}`, priority: 1, fallbackChain: "[]" }),
      });
      toast.success(`Route added for ${modelId}`);
    } catch { toast.error("Failed to add route"); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[92vh] overflow-hidden flex flex-col" showCloseButton>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Server className="h-5 w-5 text-violet-500" />
            Web-to-API Bridge Hub
          </DialogTitle>
          <DialogDescription>
            Free AI via browser session tokens — no API keys, no credit card
          </DialogDescription>
        </DialogHeader>
        <PowerToolHint name="Browser Token Extractor" />

        <Tabs value={String(activeProvider)} onValueChange={(v) => setActiveProvider(parseInt(v))} className="flex-1 flex flex-col min-h-0">
          <TabsList className="grid w-full shrink-0" style={{ gridTemplateColumns: `repeat(${PROVIDERS.length}, 1fr)` }}>
            {PROVIDERS.map((p, i) => (
              <TabsTrigger key={i} value={String(i)} className="text-[11px] gap-1.5 py-1.5">
                {i === 0 ? "⚡" : i === 1 ? "🧠" : "🔵"} {p.name.split("(")[0].trim()}
              </TabsTrigger>
            ))}
          </TabsList>

          {PROVIDERS.map((p, i) => (
            <TabsContent key={i} value={String(i)} className="flex-1 flex flex-col min-h-0 mt-2 data-[state=inactive]:hidden">
              <div className="flex-1 flex flex-col min-h-0">
                {/* Bridge Status */}
                <div className="flex items-center gap-2 mb-2 shrink-0">
                  <span className="text-[11px] text-muted-foreground">Bridge:</span>
                  <Badge className={cn("text-[10px] gap-1", bridgeStatus[p.name] === "running" ? "bg-green-500/10 text-green-600" : bridgeStatus[p.name] === "stopped" ? "bg-red-500/10 text-red-600" : "bg-muted text-muted-foreground")}>
                    {bridgeStatus[p.name] === "running" ? <CheckCircle2 className="h-3 w-3" /> : bridgeStatus[p.name] === "stopped" ? <XCircle className="h-3 w-3" /> : <Loader2 className="h-3 w-3 animate-spin" />}
                    {bridgeStatus[p.name] === "running" ? "Online" : bridgeStatus[p.name] === "stopped" ? "Offline" : "Checking..."}
                  </Badge>
                  {bridgeStatus[p.name] !== "running" && (
                    <Button size="sm" variant="ghost" className="h-6 text-[10px]" onClick={() => checkBridgeStatus(p)}>
                      <RefreshCw className="h-3 w-3 mr-1" /> Retry
                    </Button>
                  )}
                  <a href={p.loginUrl} target="_blank" className="text-[10px] text-muted-foreground hover:text-foreground ml-auto flex items-center gap-1">
                    <ExternalLink className="h-3 w-3" /> Login
                  </a>
                </div>

                {/* Setup Guide */}
                <details className="mb-2 shrink-0">
                  <summary className="text-[11px] font-medium text-muted-foreground cursor-pointer">Setup Guide</summary>
                  <ol className="mt-1 text-[10px] text-muted-foreground space-y-0.5 list-decimal list-inside">
                    {p.setupGuide.map((s, j) => <li key={j}>{s}</li>)}
                  </ol>
                </details>

                {/* Token Scanner */}
                <div className="flex gap-1.5 mb-2 shrink-0">
                  <Button size="sm" variant="outline" className="h-7 text-[10px] gap-1" onClick={scanTokens} disabled={loading}>
                    {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                    Scan Tokens
                  </Button>
                  <Input value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="Or paste Bearer token..." className="h-7 text-[10px] flex-1" />
                  <Button size="sm" className={cn("h-7 text-[10px] gap-1", configured.includes(p.name) ? "bg-green-600" : "")} onClick={configureProvider}>
                    {configured.includes(p.name) ? <CheckCircle2 className="h-3 w-3" /> : <Play className="h-3 w-3" />}
                    {configured.includes(p.name) ? "Done" : "Configure"}
                  </Button>
                </div>

                {/* Models */}
                <div className="mb-2 shrink-0">
                  <p className="text-[11px] font-semibold mb-1.5">Available Models</p>
                  <div className="flex flex-wrap gap-1.5">
                    {p.models.map(m => (
                      <button key={m.id} onClick={() => addModelRoute(m.id)}
                        className="text-[10px] px-2.5 py-1 rounded-full border border-border hover:bg-primary/10 hover:border-primary/30 transition-colors flex items-center gap-1">
                        <Zap className="h-3 w-3 text-amber-500" />
                        {m.name}
                      </button>
                    ))}
                  </div>
                </div>

                <Separator className="mb-2 shrink-0" />

                {/* Token List */}
                <div className="flex-1 min-h-0">
                  <ScrollArea className="h-full">
                    {tokens.filter(t => !t.provider || t.provider === (i === 0 ? "deepseek" : i === 1 ? "qwen" : "gemini")).length === 0 && !loading && (
                      <p className="text-[11px] text-muted-foreground text-center py-4">Click Scan Tokens to find auth tokens in your browser</p>
                    )}
                    <div className="space-y-1.5">
                      {tokens.filter(t => t.decrypted && t.value && t.value !== "[locked]" && (!t.provider || t.provider === (i === 0 ? "deepseek" : i === 1 ? "qwen" : "gemini"))).map((t, j) => (
                        <div key={j} className={cn("rounded-lg border p-2", t.source === "localStorage" ? "border-blue-500/20 bg-blue-500/5" : "border-green-500/20 bg-green-500/5")}>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <Badge className={cn("text-[9px] h-4 shrink-0", t.source === "localStorage" ? "bg-blue-500/10 text-blue-600" : "bg-green-500/10 text-green-600")}>
                                {t.source === "localStorage" ? "Bearer" : "Cookie"}
                              </Badge>
                              <code className="text-[10px] font-mono truncate max-w-[200px]">{showValues[`${j}`] ? t.value : t.value.slice(0, 40) + "..."}</code>
                            </div>
                            <div className="flex items-center gap-0.5 shrink-0">
                              <Button size="icon" variant="ghost" className="h-5 w-5" onClick={() => setShowValues(p => ({ ...p, [`${j}`]: !p[`${j}`] }))}>
                                {showValues[`${j}`] ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                              </Button>
                              <Button size="icon" variant="ghost" className="h-5 w-5" onClick={() => copyToken(t.value, `t-${j}`)}>
                                {copied === `t-${j}` ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
                              </Button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </div>
              </div>
            </TabsContent>
          ))}
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

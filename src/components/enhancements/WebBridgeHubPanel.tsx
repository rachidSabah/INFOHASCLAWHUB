"use client";

import { useState, useEffect, useCallback } from "react";
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
import {
  Globe, Key, Copy, Check, RefreshCw, ExternalLink, Loader2,
  AlertTriangle, CheckCircle2, XCircle, Eye, EyeOff, Play,
  Server, Zap, Search, Shield, Wifi, WifiOff, Sparkles
} from "lucide-react";

interface TokenResult {
  browser: string; domain: string; name: string; value: string;
  decrypted?: boolean; source?: "cookie" | "localStorage"; provider?: string; error?: string;
}

interface BridgeStatus {
  running: boolean; url: string; models: string[];
}

interface ValidationResult {
  valid: boolean; method?: string; models?: string[]; modelCount?: number;
  message?: string; error?: string; warning?: string; suggestion?: string;
  detail?: string; response?: string; model?: string;
}

interface ProviderInfo {
  name: string; baseUrl: string; tokenLabel: string; domain: string;
  loginUrl: string; localStorageKey: string;
  models: { id: string; name: string; description: string }[];
  setupGuide: string[];
  bridgeName: string; // for matching bridge status
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
      "Install ds2api: pip install ds2api or docker run from github.com/CJackHwang/ds2api",
      "Start ds2api — it runs on http://localhost:8000/v1",
      "Log into chat.deepseek.com in your browser",
      "Click 'Scan Tokens' to auto-detect your session token, or paste it manually",
      "Click 'Validate' to verify the token works with ds2api",
      "Click 'Configure' to add the provider to your dashboard",
    ],
    bridgeName: "DeepSeek (ds2api)",
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
      "Copy the full JWT token and paste it below",
      "Find/create a qw2api bridge at localhost:8100",
    ],
    bridgeName: "Qwen (qw2api)",
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
      "Paste it in the token field below",
      "No bridge needed — direct HTTPS API",
      "50 requests/day free tier",
    ],
    bridgeName: "", // Gemini doesn't use a bridge
  },
  {
    name: "Kimi (Moonshot)",
    baseUrl: "http://localhost:8200/v1",
    tokenLabel: "Bearer Token (JWT)",
    domain: "kimi.moonshot.cn",
    loginUrl: "https://kimi.moonshot.cn",
    localStorageKey: "token",
    models: [
      { id: "kimi-latest", name: "Kimi Latest", description: "Moonshot's flagship conversational model" },
      { id: "moonshot-v1-8k", name: "Moonshot v1 8K", description: "Standard context window" },
      { id: "moonshot-v1-32k", name: "Moonshot v1 32K", description: "Extended context for documents" },
      { id: "moonshot-v1-128k", name: "Moonshot v1 128K", description: "Ultra-long context" },
    ],
    setupGuide: [
      "Log into kimi.moonshot.cn in your browser",
      "Open DevTools (F12) → Network → Fetch/XHR",
      "Send a message — find Authorization: Bearer in headers",
      "Or scan cookies for token from kimi.moonshot.cn",
      "Create/use a Kimi bridge at localhost:8200/v1",
    ],
    bridgeName: "Kimi Bridge",
  },
  {
    name: "Z.AI / GLM",
    baseUrl: "http://localhost:8300/v1",
    tokenLabel: "Bearer Token (JWT)",
    domain: "chat.z.ai",
    loginUrl: "https://chat.z.ai",
    localStorageKey: "authToken",
    models: [
      { id: "glm-4", name: "GLM-4", description: "Zhipu's flagship model" },
      { id: "glm-4-flash", name: "GLM-4 Flash", description: "Fast and lightweight" },
      { id: "glm-4-air", name: "GLM-4 Air", description: "Balanced performance" },
      { id: "glm-4-long", name: "GLM-4 Long", description: "Extended context" },
    ],
    setupGuide: [
      "Log into chat.z.ai in your browser",
      "Open DevTools (F12) → Network → Fetch/XHR",
      "Send a message — find Authorization: Bearer in headers",
      "Or scan cookies for authToken from chat.z.ai",
      "Create/use a GLM bridge at localhost:8300/v1",
    ],
    bridgeName: "GLM/Z.AI Bridge",
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
  const [bridgeStatus, setBridgeStatus] = useState<Record<string, BridgeStatus>>({});
  const [validationResults, setValidationResults] = useState<Record<string, ValidationResult>>({});
  const [validating, setValidating] = useState<string | null>(null);
  const [platform, setPlatform] = useState<string>("");
  const [scannedBrowsers, setScannedBrowsers] = useState<string[]>([]);

  const provider = PROVIDERS[activeProvider];

  // Fetch bridge status from the scan results
  const checkBridgeStatus = useCallback(async (p: ProviderInfo) => {
    if (!p.bridgeName) return; // Gemini doesn't use a bridge
    try {
      const res = await fetch(p.baseUrl.replace("/v1", "") + "/v1/models", {
        signal: AbortSignal.timeout(3000),
      });
      if (res.ok) {
        const data = await res.json();
        const models = (data.data || []).map((m: { id: string }) => m.id);
        setBridgeStatus(prev => ({ ...prev, [p.name]: { running: true, url: p.baseUrl, models } }));
      } else {
        setBridgeStatus(prev => ({ ...prev, [p.name]: { running: false, url: p.baseUrl, models: [] } }));
      }
    } catch {
      setBridgeStatus(prev => ({ ...prev, [p.name]: { running: false, url: p.baseUrl, models: [] } }));
    }
  }, []);

  // Scan all tokens
  const scanTokens = useCallback(async () => {
    setLoading(true);
    setTokens([]);
    try {
      const res = await fetch("/api/browser/tokens");
      const data = await res.json();
      setTokens(data.tokens || []);
      setPlatform(data.platform || "unknown");
      setScannedBrowsers(data.summary?.browsersFound || []);

      // Also get bridge status from the API
      if (data.bridgeStatus) {
        setBridgeStatus(data.bridgeStatus);
      }

      const validCount = data.summary?.valid || 0;
      if (validCount > 0) {
        toast.success(`${validCount} valid tokens found across ${data.summary?.browsersFound?.length || 0} browser(s)`);
      } else if (data.summary?.total > 0) {
        toast.info(`${data.summary.total} tokens found but all are encrypted — paste token manually`);
      } else {
        toast.info("No browser tokens found. Log into a provider in your browser first, or paste a token manually.");
      }
    } catch {
      toast.error("Token scan failed — try pasting token manually");
    } finally {
      setLoading(false);
    }
  }, []);

  // Validate a token against the provider's API
  const validateToken = useCallback(async (token: string, p: ProviderInfo) => {
    if (!token.trim()) { toast.error("Enter a token first"); return; }
    setValidating(p.name);
    try {
      const res = await fetch("/api/browser/tokens/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: token.trim(),
          baseUrl: p.baseUrl,
          model: p.models[0]?.id,
        }),
      });
      const data: ValidationResult = await res.json();
      setValidationResults(prev => ({ ...prev, [p.name]: data }));

      if (data.valid) {
        toast.success(data.message || "Token is valid!");
      } else {
        toast.error(data.error || "Token validation failed");
      }
    } catch {
      const failResult: ValidationResult = { valid: false, error: "Validation request failed" };
      setValidationResults(prev => ({ ...prev, [p.name]: failResult }));
      toast.error("Validation request failed");
    } finally {
      setValidating(null);
    }
  }, []);

  // Configure provider in dashboard
  const configureProvider = useCallback(async () => {
    let token = apiKey.trim();
    if (!token) { toast.error("Paste a token first"); return; }
    token = token.replace(/^Bearer\s+/i, "").replace(/^Authorization:\s*Bearer\s+/i, "");
    if (token.length < 20) {
      toast.error("Token too short. Copy the full Authorization header value from DevTools.");
      return;
    }
    setApiKey(token);
    try {
      await fetch("/api/providers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: provider.name, baseUrl: provider.baseUrl, apiKey: token, isActive: true }),
      });
      setConfigured(prev => [...prev, provider.name]);
      toast.success(`"${provider.name}" configured! Models will appear in the dropdown.`);
      setApiKey("");
      // Refresh models list
      setTimeout(async () => { try { await fetch("/api/models?t=" + Date.now()); } catch {} }, 1000);
    } catch { toast.error("Failed to configure provider"); }
  }, [apiKey, provider]);

  // Add model route
  const addModelRoute = useCallback(async (modelId: string, p: ProviderInfo) => {
    const slug = p.name.toLowerCase().replace(/\s+/g, "-").replace(/[()]/g, "");
    try {
      await fetch("/api/model-routes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: `${modelId} via ${p.name}`,
          taskType: "chat",
          model: `${slug}/${modelId}`,
          priority: 1,
          fallbackChain: "[]",
        }),
      });
      toast.success(`Route added for ${modelId}`);
    } catch { toast.error("Failed to add route"); }
  }, []);

  // Auto-fill token from scan results
  const autoFillToken = useCallback((tokenValue: string) => {
    setApiKey(tokenValue);
    toast.success("Token auto-filled — click Validate to check, then Configure");
  }, []);

  // Copy to clipboard
  const copyToken = useCallback(async (text: string, id: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
    toast.success("Copied");
  }, []);

  // Load data on open
  useEffect(() => {
    if (open) {
      scanTokens();
      PROVIDERS.forEach(p => checkBridgeStatus(p));
    }
  }, [open, scanTokens, checkBridgeStatus]);

  // Filter tokens for current provider
  const providerTokens = tokens.filter(t =>
    t.provider === ["deepseek", "qwen", "gemini", "kimi", "z-ai"][activeProvider] || !t.provider
  );

  const bridgeInfo = bridgeStatus[provider.name];
  const validation = validationResults[provider.name];
  const isGemini = provider.name.includes("Gemini");

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

        {/* Platform info bar */}
        <div className="flex items-center gap-2 px-1 shrink-0">
          <Badge variant="outline" className="text-[9px] gap-1">
            <Globe className="h-3 w-3" /> {platform || "detecting..."}
          </Badge>
          {scannedBrowsers.length > 0 && (
            <Badge variant="outline" className="text-[9px] gap-1 text-green-600">
              <CheckCircle2 className="h-3 w-3" /> {scannedBrowsers.join(", ")}
            </Badge>
          )}
          <div className="flex-1" />
          <Button size="sm" variant="ghost" className="h-6 text-[10px] gap-1" onClick={scanTokens} disabled={loading}>
            {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
            Re-scan
          </Button>
        </div>

        <Tabs value={String(activeProvider)} onValueChange={(v) => setActiveProvider(parseInt(v))} className="flex-1 flex flex-col min-h-0">
          <TabsList className="grid w-full shrink-0" style={{ gridTemplateColumns: `repeat(${PROVIDERS.length}, 1fr)` }}>
            {PROVIDERS.map((p, i) => (
              <TabsTrigger key={i} value={String(i)} className="text-[10px] gap-1.5 py-1.5 relative">
                {["⚡","🧠","🔵","🚀","💎"][i] || "•"} {p.name.split("(")[0].trim()}
                {bridgeStatus[p.name]?.running && (
                  <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-green-500" />
                )}
              </TabsTrigger>
            ))}
          </TabsList>

          {PROVIDERS.map((p, i) => (
            <TabsContent key={i} value={String(i)} className="flex-1 flex flex-col min-h-0 mt-2 data-[state=inactive]:hidden overflow-y-auto">
              <div className="flex-1 flex flex-col min-h-0 gap-2">
                {/* Bridge Status */}
                {!isGemini && (
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[11px] text-muted-foreground">Bridge:</span>
                    {bridgeInfo?.running ? (
                      <Badge className="text-[10px] gap-1 bg-green-500/10 text-green-600">
                        <Wifi className="h-3 w-3" /> Online
                      </Badge>
                    ) : (
                      <Badge className="text-[10px] gap-1 bg-red-500/10 text-red-600">
                        <WifiOff className="h-3 w-3" /> Offline
                      </Badge>
                    )}
                    {bridgeInfo?.running && bridgeInfo.models.length > 0 && (
                      <span className="text-[10px] text-muted-foreground">
                        ({bridgeInfo.models.length} models: {bridgeInfo.models.slice(0, 3).join(", ")})
                      </span>
                    )}
                    {!bridgeInfo?.running && (
                      <>
                        <Button size="sm" variant="ghost" className="h-6 text-[10px]" onClick={() => checkBridgeStatus(p)}>
                          <RefreshCw className="h-3 w-3 mr-1" /> Recheck
                        </Button>
                        <span className="text-[10px] text-amber-600">
                          Start the bridge service first (e.g., ds2api)
                        </span>
                      </>
                    )}
                    <a href={p.loginUrl} target="_blank" className="text-[10px] text-muted-foreground hover:text-foreground ml-auto flex items-center gap-1">
                      <ExternalLink className="h-3 w-3" /> Login
                    </a>
                  </div>
                )}

                {/* Setup Guide */}
                <details className="shrink-0">
                  <summary className="text-[11px] font-medium text-muted-foreground cursor-pointer hover:text-foreground">
                    Setup Guide
                  </summary>
                  <ol className="mt-1 text-[10px] text-muted-foreground space-y-0.5 list-decimal list-inside">
                    {p.setupGuide.map((s, j) => <li key={j}>{s}</li>)}
                  </ol>
                </details>

                {/* Token Input + Validate + Configure */}
                <div className="p-3 rounded-xl bg-violet-500/5 border border-violet-500/20 space-y-2 shrink-0">
                  <p className="text-[11px] font-semibold flex items-center gap-1.5">
                    <Zap className="h-3.5 w-3.5 text-violet-500" /> Token Input
                  </p>
                  <div className="flex gap-2">
                    <Input value={apiKey} onChange={(e) => setApiKey(e.target.value)}
                      placeholder={isGemini ? "Paste API key (AIza...) here" : "Paste Bearer token (eyJ...) here"}
                      className="h-8 text-[10px] flex-1 font-mono"
                      type={showValues["input"] ? "text" : "password"} />
                    <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0"
                      onClick={() => setShowValues(prev => ({ ...prev, input: !prev.input }))}>
                      {showValues["input"] ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                    </Button>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" className="h-8 text-[10px] gap-1 flex-1"
                      onClick={() => validateToken(apiKey, p)} disabled={!apiKey.trim() || validating === p.name}>
                      {validating === p.name ? <Loader2 className="h-3 w-3 animate-spin" /> : <Shield className="h-3 w-3" />}
                      Validate
                    </Button>
                    <Button size="sm" className={cn("h-8 text-[10px] gap-1 flex-1", configured.includes(p.name) ? "bg-green-600" : "")}
                      onClick={configureProvider} disabled={!apiKey.trim()}>
                      {configured.includes(p.name) ? <><CheckCircle2 className="h-3 w-3" /> Done</> : <><Play className="h-3 w-3" /> Configure</>}
                    </Button>
                  </div>

                  {/* Validation Result */}
                  {validation && (
                    <div className={cn("p-2 rounded-lg border text-[10px]", validation.valid
                      ? "bg-green-500/5 border-green-500/20 text-green-700"
                      : "bg-red-500/5 border-red-500/20 text-red-700")}>
                      <div className="flex items-center gap-1.5 font-semibold mb-1">
                        {validation.valid ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                        {validation.valid ? "Valid" : "Invalid"}
                        {validation.method && <span className="font-normal text-muted-foreground">({validation.method})</span>}
                      </div>
                      {validation.message && <p>{validation.message}</p>}
                      {validation.warning && <p className="text-amber-600">{validation.warning}</p>}
                      {validation.error && <p>{validation.error}</p>}
                      {validation.suggestion && <p className="text-muted-foreground">{validation.suggestion}</p>}
                      {validation.models && validation.models.length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {validation.models.map(m => (
                            <Badge key={m} variant="outline" className="text-[8px] h-4">{m}</Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  <p className="text-[9px] text-muted-foreground">
                    {isGemini
                      ? "Paste your Google AI Studio API key directly — no bridge needed"
                      : "Auto-detect: strips 'Bearer' prefix, handles JWT format. Validate before configuring."}
                  </p>
                </div>

                {/* Available Models */}
                <div className="shrink-0">
                  <p className="text-[11px] font-semibold mb-1.5">Available Models</p>
                  <div className="flex flex-wrap gap-1.5">
                    {p.models.map(m => (
                      <button key={m.id} onClick={() => addModelRoute(m.id, p)}
                        className="text-[10px] px-2.5 py-1 rounded-full border border-border hover:bg-primary/10 hover:border-primary/30 transition-colors flex items-center gap-1">
                        <Sparkles className="h-3 w-3 text-amber-500" />
                        {m.name}
                      </button>
                    ))}
                  </div>
                </div>

                <Separator className="shrink-0" />

                {/* Scanned Tokens */}
                <div className="flex-1 min-h-0">
                  <p className="text-[11px] font-semibold mb-1.5 flex items-center gap-1.5">
                    <Search className="h-3 w-3" /> Scanned Tokens
                    {providerTokens.length > 0 && <Badge variant="outline" className="text-[9px] h-4">{providerTokens.length}</Badge>}
                  </p>
                  <ScrollArea className="h-full max-h-48">
                    {providerTokens.length === 0 && (
                      <div className="p-3 rounded-xl bg-muted/30 border border-border text-center">
                        <p className="text-xs text-muted-foreground">
                          {configured.includes(p.name)
                            ? "Provider configured. Models available in dropdown."
                            : loading ? "Scanning..." : "No tokens auto-detected. Paste a token manually above."}
                        </p>
                        {!loading && !configured.includes(p.name) && (
                          <p className="text-[10px] text-muted-foreground mt-1">
                            Tip: Open <a href={p.loginUrl} target="_blank" className="text-blue-500 hover:underline">{p.loginUrl}</a>,
                            log in, then F12 → Network → copy Bearer token
                          </p>
                        )}
                      </div>
                    )}
                    <div className="space-y-1.5">
                      {providerTokens.map((t, j) => (
                        <div key={j} className={cn("rounded-lg border p-2",
                          t.decrypted ? (t.source === "localStorage" ? "border-blue-500/20 bg-blue-500/5" : "border-green-500/20 bg-green-500/5") : "border-amber-500/20 bg-amber-500/5"
                        )}>
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <Badge className={cn("text-[9px] h-4 shrink-0",
                                !t.decrypted ? "bg-amber-500/10 text-amber-600" :
                                t.source === "localStorage" ? "bg-blue-500/10 text-blue-600" : "bg-green-500/10 text-green-600"
                              )}>
                                {!t.decrypted ? "Locked" : t.source === "localStorage" ? "Bearer" : "Cookie"}
                              </Badge>
                              <span className="text-[10px] truncate max-w-[120px]">{t.name || t.domain}</span>
                              <span className="text-[9px] text-muted-foreground">{t.browser}</span>
                            </div>
                            <div className="flex items-center gap-0.5 shrink-0">
                              {t.decrypted && t.value && t.value !== "[locked]" ? (
                                <>
                                  <Button size="icon" variant="ghost" className="h-5 w-5"
                                    onClick={() => copyToken(t.value, `t-${i}-${j}`)}>
                                    {copied === `t-${i}-${j}` ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
                                  </Button>
                                  <Button size="icon" variant="ghost" className="h-5 w-5"
                                    onClick={() => autoFillToken(t.value)}
                                    title="Auto-fill token for validation & configuration">
                                    <Play className="h-3 w-3 text-green-500" />
                                  </Button>
                                  <Button size="icon" variant="ghost" className="h-5 w-5"
                                    onClick={() => setShowValues(prev => ({ ...prev, [`t-${i}-${j}`]: !prev[`t-${i}-${j}`] }))}>
                                    {showValues[`t-${i}-${j}`] ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                                  </Button>
                                </>
                              ) : (
                                <span className="text-[9px] text-amber-600">{t.error || "Encrypted"}</span>
                              )}
                            </div>
                          </div>
                          {t.decrypted && t.value && showValues[`t-${i}-${j}`] && (
                            <code className="text-[9px] bg-muted/50 px-1.5 py-0.5 rounded break-all block max-w-full mt-1 font-mono">
                              {t.value}
                            </code>
                          )}
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

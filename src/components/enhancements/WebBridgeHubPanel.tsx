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
  Server, Zap, Search, Shield, Wifi, WifiOff, Sparkles, Terminal,
  Bookmark, Bot, Radio, BookOpen, Circle
} from "lucide-react";

interface TokenResult {
  browser: string; domain: string; name: string; value: string;
  decrypted?: boolean; source?: "cookie" | "localStorage" | "manual" | "bookmarklet" | "playwright" | "cdp" | "submitted"; provider?: string; error?: string;
}

interface BridgeStatus {
  running: boolean; url: string; models: string[];
}

interface ValidationResult {
  valid: boolean; method?: string; models?: string[]; modelCount?: number;
  message?: string; error?: string; warning?: string; suggestion?: string;
  detail?: string; response?: string; model?: string;
}

interface BookmarkletInfo {
  label: string; bookmarklet: string; instructions: string;
}

interface ExtractionMethod {
  available: boolean; label: string; description: string;
}

interface ProviderInfo {
  name: string; baseUrl: string; tokenLabel: string; domain: string;
  loginUrl: string; localStorageKey: string;
  models: { id: string; name: string; description: string }[];
  setupGuide: string[];
  bridgeName?: string;
}

const PROVIDERS: ProviderInfo[] = [
  {
    name: "DeepSeek (Free Web)",
    baseUrl: "http://localhost:8000/v1",
    tokenLabel: "Bearer Token (JWT from Web)",
    domain: "chat.deepseek.com",
    loginUrl: "https://chat.deepseek.com",
    localStorageKey: "userToken",
    models: [
      { id: "deepseek-chat", name: "DeepSeek Chat (V3)", description: "Free V3 via web session token" },
      { id: "deepseek-reasoner", name: "DeepSeek Reasoner (R1)", description: "Free R1 via web session token" },
    ],
    setupGuide: [
      "Log into chat.deepseek.com in your browser",
      "Start ds2api bridge: npx ds2api --port 8000",
      "Or use direct API: https://api.deepseek.com/v1 (needs API key)",
      "F12 → Application → Local Storage → chat.deepseek.com",
      "Find userToken or copy Authorization header from Network tab",
      "Paste the JWT token below and click Configure",
    ],
  },
  {
    name: "Qwen (Free Web)",
    baseUrl: "http://localhost:8100/v1",
    tokenLabel: "Bearer Token (JWT from Web)",
    domain: "chat.qwen.ai",
    loginUrl: "https://chat.qwen.ai",
    localStorageKey: "token",
    models: [
      { id: "qwen-plus", name: "Qwen Plus", description: "Alibaba's flagship via web token" },
      { id: "qwen-max", name: "Qwen Max", description: "Most capable via web token" },
      { id: "qwen-turbo", name: "Qwen Turbo", description: "Fast via web token" },
    ],
    setupGuide: [
      "Log into chat.qwen.ai in your browser",
      "Start qw2api bridge on localhost:8100",
      "F12 → Network → find API chat request",
      "Copy Authorization: Bearer eyJ... header value",
      "Paste below and click Configure",
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
      "Visit aistudio.google.com/apikey to get a free API key (AIza...)",
      "No bridge needed — direct HTTPS API connection",
      "50 requests/day free tier — no credit card required",
    ],
  },
  {
    name: "Kimi (Free Web)",
    baseUrl: "http://localhost:8200/v1",
    tokenLabel: "Bearer Token (JWT from Web)",
    domain: "kimi.moonshot.cn",
    loginUrl: "https://kimi.moonshot.cn",
    localStorageKey: "token",
    models: [
      { id: "moonshot-v1-8k", name: "Moonshot v1 8K", description: "Free via web token" },
      { id: "moonshot-v1-32k", name: "Moonshot v1 32K", description: "Extended via web token" },
      { id: "moonshot-v1-128k", name: "Moonshot v1 128K", description: "Ultra-long via web token" },
    ],
    setupGuide: [
      "Log into kimi.com or kimi.moonshot.cn",
      "F12 → Network → find Authorization: Bearer eyJ...",
      "Or F12 → Application → Cookies → kimi.com → find kimi-auth",
      "Paste the Bearer token below and click Configure",
    ],
  },
  {
    name: "Z.AI / GLM (Free Web)",
    baseUrl: "http://localhost:8300/v1",
    tokenLabel: "Bearer Token (JWT from Web)",
    domain: "chat.z.ai",
    loginUrl: "https://chat.z.ai",
    localStorageKey: "authToken",
    models: [
      { id: "glm-4-flash", name: "GLM-4 Flash", description: "Fast GLM via web token" },
      { id: "glm-4-air", name: "GLM-4 Air", description: "Balanced GLM via web token" },
      { id: "glm-4-plus", name: "GLM-4 Plus", description: "Powerful GLM via web token" },
    ],
    setupGuide: [
      "Log into chat.z.ai in your browser",
      "Start GLM bridge on localhost:8300",
      "F12 → Network → find API request headers",
      "Copy the Bearer token and paste below",
    ],
  },
];

type ExtractTab = "bookmarklet" | "playwright" | "manual";

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
  const [browserInstallStatus, setBrowserInstallStatus] = useState<Record<string, string>>({});
  const [keyStatuses, setKeyStatuses] = useState<Record<string, string>>({});
  const [bookmarklets, setBookmarklets] = useState<Record<string, BookmarkletInfo>>({});
  const [extractionMethods, setExtractionMethods] = useState<Record<string, ExtractionMethod>>({});
  const [playwrightAvailable, setPlaywrightAvailable] = useState(false);
  const [extractTab, setExtractTab] = useState<ExtractTab>("bookmarklet");
  const [autograbLoading, setAutograbLoading] = useState(false);
  const [showConsoleScript, setShowConsoleScript] = useState(false);

  const provider = PROVIDERS[activeProvider];
  const providerKey = ["deepseek", "qwen", "gemini", "kimi", "z-ai"][activeProvider];
  const isGemini = provider.name.includes("Gemini");

  // Check bridge status
  const checkBridgeStatus = useCallback(async (p: ProviderInfo) => {
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
      setBrowserInstallStatus(data.summary?.browsersInstalled || {});
      setKeyStatuses(data.summary?.keyStatuses || {});
      setBookmarklets(data.bookmarklets || {});
      setExtractionMethods(data.extractionMethods || {});
      setPlaywrightAvailable(data.summary?.playwrightAvailable || false);

      if (data.bridgeStatus) {
        setBridgeStatus(data.bridgeStatus);
      }

      const validCount = data.summary?.valid || 0;
      const submittedCount = data.summary?.submitted || 0;
      if (validCount > 0) {
        toast.success(`${validCount} valid tokens found (${submittedCount} from auto-extraction)`);
      } else if (submittedCount > 0) {
        toast.success(`${submittedCount} auto-extracted tokens available`);
      } else {
        toast.info("Use the Bookmarklet method for automatic token extraction — no F12 needed!");
      }
    } catch {
      toast.error("Token scan failed — try Bookmarklet or manual paste");
    } finally {
      setLoading(false);
    }
  }, []);

  // Playwright auto-extract
  const autoGrab = useCallback(async () => {
    setAutograbLoading(true);
    try {
      const res = await fetch("/api/browser/tokens/autograb", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: providerKey, headless: true }),
      });
      const data = await res.json();
      if (data.ok && data.tokens?.length > 0) {
        toast.success(`${data.count} token(s) auto-extracted via Playwright!`);
        // Auto-fill the first token
        setApiKey(data.tokens[0].value);
        // Re-scan to pick up the new submitted tokens
        await scanTokens();
      } else {
        toast.info(data.message || data.hint || "No tokens found. Try the Bookmarklet method instead.");
        if (data.hint) {
          setExtractTab("bookmarklet");
        }
      }
    } catch {
      toast.error("Playwright auto-extract failed. Use the Bookmarklet method instead.");
      setExtractTab("bookmarklet");
    } finally {
      setAutograbLoading(false);
    }
  }, [providerKey, scanTokens]);

  // Validate a token
  const validateToken = useCallback(async (token: string, p: ProviderInfo) => {
    if (!token.trim()) { toast.error("Enter a token first"); return; }
    setValidating(p.name);
    try {
      const res = await fetch("/api/bridge/proxy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: [{ role: "user", content: "Say OK in one word" }], model: p.models[0]?.id || "chat" }),
      });
      const data = await res.json();
      if (data.content) {
        setValidationResults(prev => ({ ...prev, [p.name]: { valid: true, message: `Works: "${data.content.slice(0, 60)}"` } }));
        toast.success("Token works! Click Configure to save.");
      } else if (data.error?.includes("502") || data.error?.includes("Bridge connection failed")) {
        setValidationResults(prev => ({ ...prev, [p.name]: { valid: false, error: "Local bridge not running. Click Configure anyway — the token will be tried when chatting." } }));
        toast.error("Bridge offline — but you can still Configure");
      } else {
        setValidationResults(prev => ({ ...prev, [p.name]: { valid: false, error: data.error || "Token invalid" } }));
        toast.error(data.error || "Token validation failed");
      }
    } catch {
      setValidationResults(prev => ({ ...prev, [p.name]: { valid: false, error: "Bridge not reachable — click Configure to save" } }));
      toast.error("Bridge error — click Configure to save token");
    } finally { setValidating(null); }
  }, []);

  // Configure provider
  const configureProvider = useCallback(async () => {
    let token = apiKey.trim();
    if (!token) { toast.error("Paste a token first"); return; }
    token = token.replace(/^Bearer\s+/i, "").replace(/^Authorization:\s*Bearer\s+/i, "");
    if (token.length < 20) {
      toast.error("Token too short. Copy the full value.");
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
      toast.success(`"${provider.name}" configured! Models in dropdown.`);
      setApiKey("");
      // Refresh models immediately + after delay
      try { const r = await fetch("/api/models?t=" + Date.now()); if (r.ok) { const data = await r.json(); console.log("Models refreshed:", data.length, "groups"); } } catch {}
      setTimeout(async () => { try { await fetch("/api/models?t=" + Date.now()); } catch {} }, 2000);
    } catch { toast.error("Failed to configure provider"); }
  }, [apiKey, provider]);

  // Add model route
  const addModelRoute = useCallback(async (modelId: string, p: ProviderInfo) => {
    const slug = p.name.toLowerCase().replace(/\s+/g, "-").replace(/[()]/g, "");
    try {
      await fetch("/api/model-routes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: `${modelId} via ${p.name}`, taskType: "chat", model: `${slug}/${modelId}`, priority: 1, fallbackChain: "[]" }),
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

  // Load data on open + periodic bridge polling every 5s
  useEffect(() => {
    if (open) {
      scanTokens();
      PROVIDERS.forEach(p => checkBridgeStatus(p));
    }
  }, [open, scanTokens, checkBridgeStatus]);

  // Periodic bridge polling every 5 seconds while panel is open
  useEffect(() => {
    if (!open) return;
    const interval = setInterval(() => {
      PROVIDERS.forEach(p => checkBridgeStatus(p));
    }, 5000);
    return () => clearInterval(interval);
  }, [open, checkBridgeStatus]);

  // Provider key mapping for display names
  const PROVIDER_DISPLAY: Record<string, { emoji: string; name: string; color: string; bgColor: string; borderColor: string }> = {
    deepseek: { emoji: "⚡", name: "DeepSeek", color: "text-blue-500", bgColor: "bg-blue-500/10", borderColor: "border-blue-500/30" },
    qwen: { emoji: "🧠", name: "Qwen", color: "text-purple-500", bgColor: "bg-purple-500/10", borderColor: "border-purple-500/30" },
    gemini: { emoji: "🔵", name: "Gemini", color: "text-blue-400", bgColor: "bg-blue-400/10", borderColor: "border-blue-400/30" },
    kimi: { emoji: "🚀", name: "Kimi", color: "text-red-500", bgColor: "bg-red-500/10", borderColor: "border-red-500/30" },
    "z-ai": { emoji: "💎", name: "Z.AI/GLM", color: "text-cyan-500", bgColor: "bg-cyan-500/10", borderColor: "border-cyan-500/30" },
  };

  // Filter tokens for current provider tab ONLY
  const providerTokens = tokens.filter(t => t.provider === providerKey);

  // Count tokens per provider for the tab indicators
  const tokensByProvider: Record<string, number> = {};
  for (const t of tokens) {
    if (t.provider && t.decrypted) {
      tokensByProvider[t.provider] = (tokensByProvider[t.provider] || 0) + 1;
    }
  }

  const bridgeInfo = bridgeStatus[provider.name];
  const validation = validationResults[provider.name];
  const bookmarklet = bookmarklets[providerKey];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[92vh] overflow-hidden flex flex-col" showCloseButton>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Server className="h-5 w-5 text-violet-500" />
            Web-to-API Bridge Hub
          </DialogTitle>
          <DialogDescription>
            Free AI via browser session tokens — no API keys, no credit card, no F12 needed!
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
          {playwrightAvailable && (
            <Badge variant="outline" className="text-[9px] gap-1 text-blue-600">
              <Bot className="h-3 w-3" /> Playwright ready
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
            {PROVIDERS.map((p, i) => {
              const pk = ["deepseek", "qwen", "gemini", "kimi", "z-ai"][i];
              const hasTokens = (tokensByProvider[pk] || 0) > 0;
              return (
              <TabsTrigger key={i} value={String(i)} className="text-[10px] gap-1.5 py-1.5">
                {["⚡","🧠","🔵","🚀","💎"][i] || "•"} {p.name.replace("(Free Web)","").trim()}
                {hasTokens && <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse ml-0.5" />}
              </TabsTrigger>
            );})}
          </TabsList>

          {PROVIDERS.map((p, i) => (
            <TabsContent key={i} value={String(i)} className="flex-1 flex flex-col min-h-0 mt-2 data-[state=inactive]:hidden overflow-y-auto">
              <div className="flex-1 flex flex-col min-h-0 gap-2">

                {/* Bridge Status — always visible */}
                {!isGemini && (
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="flex items-center gap-1.5">
                      <Circle className={cn("h-2.5 w-2.5 fill-current", bridgeInfo?.running ? "text-green-500 animate-pulse" : "text-red-500")} />
                      <span className="text-[11px] text-muted-foreground">Bridge:</span>
                    </div>
                    <Badge className={cn("text-[10px] gap-1 font-semibold", bridgeInfo?.running ? "bg-green-500/10 text-green-600 border-green-500/30" : "bg-red-500/10 text-red-600 border-red-500/30")}>
                      <Server className="h-3 w-3" /> {bridgeInfo?.running ? "Online" : "Offline"}
                    </Badge>
                    <span className="text-[10px] text-muted-foreground">{p.baseUrl}</span>
                    <Button size="sm" variant="ghost" className="h-6 text-[10px]" onClick={() => checkBridgeStatus(p)}>
                      <RefreshCw className="h-3 w-3 mr-1" /> Refresh
                    </Button>
                    <a href={p.loginUrl} target="_blank" className="text-[10px] text-muted-foreground hover:text-foreground ml-auto flex items-center gap-1">
                      <ExternalLink className="h-3 w-3" /> Login
                    </a>
                  </div>
                )}

                {/* ═══════ AUTO-EXTRACTION SECTION ═══════ */}
                <div className="p-3 rounded-xl bg-gradient-to-r from-violet-500/5 to-blue-500/5 border border-violet-500/20 space-y-2 shrink-0">
                  <p className="text-[11px] font-semibold flex items-center gap-1.5">
                    <Zap className="h-3.5 w-3.5 text-violet-500" />
                    Token Extraction (No F12 needed!)
                  </p>

                  {/* Extraction method tabs */}
                  <div className="flex gap-1 bg-muted/30 p-1 rounded-lg">
                    <button
                      className={cn("flex-1 text-[10px] py-1.5 px-2 rounded-md flex items-center justify-center gap-1 transition-colors",
                        extractTab === "bookmarklet" ? "bg-violet-500 text-white shadow-sm" : "hover:bg-muted/50 text-muted-foreground"
                      )}
                      onClick={() => setExtractTab("bookmarklet")}
                    >
                      <Bookmark className="h-3 w-3" /> Bookmarklet
                    </button>
                    <button
                      className={cn("flex-1 text-[10px] py-1.5 px-2 rounded-md flex items-center justify-center gap-1 transition-colors",
                        extractTab === "playwright" ? "bg-blue-500 text-white shadow-sm" : "hover:bg-muted/50 text-muted-foreground",
                        !playwrightAvailable && "opacity-50"
                      )}
                      onClick={() => playwrightAvailable && setExtractTab("playwright")}
                      disabled={!playwrightAvailable}
                    >
                      <Bot className="h-3 w-3" /> Playwright
                    </button>
                    <button
                      className={cn("flex-1 text-[10px] py-1.5 px-2 rounded-md flex items-center justify-center gap-1 transition-colors",
                        extractTab === "manual" ? "bg-emerald-500 text-white shadow-sm" : "hover:bg-muted/50 text-muted-foreground"
                      )}
                      onClick={() => setExtractTab("manual")}
                    >
                      <Key className="h-3 w-3" /> Manual
                    </button>
                  </div>

                  {/* ─── BOOKMARKLET TAB ─── */}
                  {extractTab === "bookmarklet" && bookmarklet && (
                    <div className="space-y-2">
                      <div className="p-2.5 rounded-lg bg-blue-500/5 border border-blue-500/20">
                        <p className="text-[10px] text-blue-600 font-medium mb-1.5">
                          One-click extract — drag this link to your bookmarks bar:
                        </p>
                        <a
                          href={bookmarklet.bookmarklet}
                          draggable
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-500 hover:bg-blue-600 text-white text-[11px] font-medium shadow-sm transition-colors cursor-grab active:cursor-grabbing"
                          onClick={(e) => {
                            e.preventDefault();
                            // If clicked directly (not dragged), show instructions
                            toast.info("Drag this button to your bookmarks bar, then use it on the provider's site!");
                          }}
                        >
                          <Bookmark className="h-3.5 w-3.5" />
                          {bookmarklet.label}
                        </a>
                      </div>
                      <ol className="text-[10px] text-muted-foreground space-y-0.5 list-decimal list-inside">
                        {bookmarklet.instructions.split(". ").map((s, j) => (
                          <li key={j}>{s}</li>
                        ))}
                      </ol>
                    </div>
                  )}

                  {/* ─── PLAYWRIGHT TAB ─── */}
                  {extractTab === "playwright" && (
                    <div className="space-y-2">
                      <div className="p-2.5 rounded-lg bg-blue-500/5 border border-blue-500/20">
                        <p className="text-[10px] text-muted-foreground mb-1.5">
                          Launches a Playwright browser — log into the provider, and the token is captured automatically.
                        </p>
                        <Button
                          size="sm"
                          className="h-8 text-[10px] gap-1.5 bg-blue-500 hover:bg-blue-600"
                          onClick={autoGrab}
                          disabled={autograbLoading}
                        >
                          {autograbLoading ? (
                            <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Extracting...</>
                          ) : (
                            <><Bot className="h-3.5 w-3.5" /> Auto-Extract with Playwright</>
                          )}
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* ─── MANUAL TAB ─── */}
                  {extractTab === "manual" && (
                    <div className="space-y-2">
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

                      {/* Console Script */}
                      <div className="p-2 rounded-lg bg-emerald-500/5 border border-emerald-500/20">
                        <p className="text-[10px] font-semibold text-emerald-600 mb-1">Console Script (F12)</p>
                        <Button size="sm" variant="outline" className="h-7 text-[10px] gap-1 w-full"
                          onClick={() => {
                            const storageKey = p.localStorageKey || "token";
                            const script = `(()=>{const t=localStorage.getItem('${storageKey}')||Object.values(localStorage).find(v=>typeof v==='string'&&v.length>50&&(v.startsWith('eyJ')||v.startsWith('sk-')||v.startsWith('AIza')));if(t){console.log('%c✅ TOKEN FOUND:','color:green;font-size:14px');console.log(t)}else{console.log('%c❌ No token found. Login first.','color:red')}})()`;
                            navigator.clipboard.writeText(script).then(() => toast.success("Script copied!"));
                          }}>
                          <Copy className="h-3 w-3 mr-1" /> Copy Script
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Validation Result */}
                  {validation && (
                    <div className={cn("p-2.5 rounded-lg border text-[10px] animate-in fade-in slide-in-from-top-2", validation.valid
                      ? "bg-green-500/5 border-green-500/20 text-green-700"
                      : "bg-red-500/5 border-red-500/20 text-red-700")}>
                      <div className="flex items-center gap-1.5 font-semibold mb-1">
                        {validation.valid ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
                        {validation.valid ? "Validation Successful" : "Validation Failed"}
                      </div>
                      <p>{validation.message || validation.error}</p>
                      {validation.suggestion && <p className="mt-1 font-medium text-amber-600">{validation.suggestion}</p>}
                    </div>
                  )}
                </div>

                {/* Scanned Tokens Section */}
                <div className="flex-1 min-h-0 flex flex-col">
                  <div className="flex items-center justify-between mb-1.5 px-1 shrink-0">
                    <p className="text-[11px] font-semibold flex items-center gap-1.5">
                      <Search className="h-3.5 w-3.5 text-blue-500" />
                      Detected Tokens
                    </p>
                    {providerTokens.length > 0 && (
                      <Badge variant="secondary" className="text-[9px] bg-blue-500/10 text-blue-600">
                        {providerTokens.length} Found
                      </Badge>
                    )}
                  </div>

                  <ScrollArea className="flex-1 rounded-xl border bg-muted/20">
                    {providerTokens.length > 0 ? (
                      <div className="p-2 space-y-2">
                        {providerTokens.map((t, idx) => (
                          <div key={idx} className="p-2.5 rounded-lg border bg-background hover:border-primary/30 transition-all group">
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-2">
                                <Badge variant="outline" className="text-[9px] font-mono px-1 h-4 bg-muted/50">
                                  {t.browser}
                                </Badge>
                                {t.provider && PROVIDER_DISPLAY[t.provider] && (
                                  <Badge variant="outline" className={cn("text-[9px] px-1.5 h-4", PROVIDER_DISPLAY[t.provider].bgColor, PROVIDER_DISPLAY[t.provider].color, PROVIDER_DISPLAY[t.provider].borderColor)}>
                                    {PROVIDER_DISPLAY[t.provider].emoji} {PROVIDER_DISPLAY[t.provider].name}
                                  </Badge>
                                )}
                                <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                                  {t.source === "cookie" ? <Radio className="h-3 w-3" /> : <Bot className="h-3 w-3" />}
                                  {t.source}
                                </span>
                              </div>
                              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setShowValues(prev => ({ ...prev, [idx]: !prev[idx] }))}>
                                  {showValues[idx] ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                                </Button>
                                <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => copyToken(t.value, String(idx))}>
                                  {copied === String(idx) ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
                                </Button>
                              </div>
                            </div>
                            
                            <div className="relative">
                              <code className="block p-2 rounded bg-muted/50 text-[10px] break-all font-mono leading-relaxed border border-border/50">
                                {showValues[idx] ? t.value : t.value.slice(0, 30) + "••••••••••••••••" + t.value.slice(-10)}
                              </code>
                            </div>

                            <Button size="sm" variant="secondary" className="h-7 text-[10px] gap-1.5 w-full mt-2.5 bg-blue-500/5 hover:bg-blue-500/10 border-blue-500/20 text-blue-600" onClick={() => autoFillToken(t.value)}>
                              <Play className="h-3 w-3" /> Use this
                            </Button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
                        <WifiOff className="h-6 w-6 text-muted-foreground/40 mb-2" />
                        <p className="text-[11px] font-medium text-muted-foreground">No tokens detected</p>
                        <p className="text-[10px] text-muted-foreground/60 mt-1 max-w-[200px]">
                          Log into {new URL(p.loginUrl).hostname} and try the Bookmarklet method.
                        </p>
                      </div>
                    )}
                  </ScrollArea>
                </div>

                {/* Setup Guide details */}
                <details className="mt-2 group">
                  <summary className="text-[11px] font-medium text-muted-foreground cursor-pointer hover:text-foreground flex items-center gap-1">
                    <BookOpen className="h-3 w-3" />
                    How to setup
                  </summary>
                  <ol className="mt-2 text-[10px] text-muted-foreground space-y-1 list-decimal list-inside p-2 bg-muted/30 rounded-lg">
                    {p.setupGuide.map((s, j) => <li key={j}>{s}</li>)}
                  </ol>
                </details>
              </div>
            </TabsContent>
          ))}
        </Tabs>

        <Separator />
        
        <div className="flex items-center justify-between p-1 shrink-0">
          <div className="flex gap-4">
            <div className="flex items-center gap-1.5">
              <Circle className={cn("h-2 w-2 fill-current", bridgeStatus[provider.name]?.running ? "text-green-500 animate-pulse" : "text-red-500")} />
              <span className="text-[10px] text-muted-foreground">Service Status: {bridgeStatus[provider.name]?.running ? "Online" : "Offline"}</span>
            </div>
          </div>
          <Button size="sm" variant="outline" className="h-7 text-[10px]" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

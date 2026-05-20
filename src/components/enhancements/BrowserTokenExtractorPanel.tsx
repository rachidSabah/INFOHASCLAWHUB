"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { PowerToolHint } from "./PowerToolHint";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  Globe, Key, Copy, Check, RefreshCw, Shield, ExternalLink, Loader2,
  AlertTriangle, CheckCircle2, XCircle, Eye, EyeOff,
} from "lucide-react";

interface TokenResult {
  browser: string;
  domain: string;
  name: string;
  value: string;
  decrypted?: boolean;
  error?: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function BrowserTokenExtractorPanel({ open, onOpenChange }: Props) {
  const [tokens, setTokens] = useState<TokenResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<{ total: number; valid: number; encrypted: number } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [showValues, setShowValues] = useState<Record<string, boolean>>({});
  const [providerUrl, setProviderUrl] = useState("http://localhost:8000/v1");
  const [configured, setConfigured] = useState(false);

  const scanTokens = async () => {
    setLoading(true);
    setTokens([]);
    try {
      const res = await fetch("/api/browser/tokens");
      const data = await res.json();
      setTokens(data.tokens || []);
      setSummary(data.summary || null);
    } catch {
      toast.error("Failed to scan browser tokens");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) scanTokens();
  }, [open]);

  const copyToClipboard = async (text: string, id: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
    toast.success("Token copied");
  };

  const configureProvider = async () => {
    const validToken = tokens.find((t) => t.decrypted && t.value);
    if (!validToken) { toast.error("No valid token found"); return; }
    try {
      await fetch("/api/providers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "DeepSeek (ds2api)",
          baseUrl: providerUrl,
          apiKey: validToken.value,
          isActive: true,
        }),
      });
      setConfigured(true);
      toast.success("Provider configured! Use Model Router to route deepseek-chat to this provider.");
    } catch {
      toast.error("Failed to configure provider");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[92vh] overflow-hidden flex flex-col" showCloseButton>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5 text-blue-500" />
            Browser Token Extractor
          </DialogTitle>
          <DialogDescription>
            Extract DeepSeek session tokens from your browser cookies for use with ds2api
          </DialogDescription>
        </DialogHeader>
        <PowerToolHint name="Browser Token Extractor" />

        <div className="flex-1 flex flex-col min-h-0">
          <div className="flex items-center gap-2 mb-3 shrink-0">
            <Button onClick={scanTokens} disabled={loading} size="sm" className="gap-1.5">
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              {loading ? "Scanning browsers..." : "Scan for Tokens"}
            </Button>
            <span className="text-[11px] text-muted-foreground">
              Reads Chrome, Edge, and Brave cookie databases
            </span>
          </div>

          {summary && (
            <div className="flex gap-2 mb-3 shrink-0">
              <Badge variant="outline" className="gap-1 text-[10px]">
                <Key className="h-3 w-3" /> {summary.total} found
              </Badge>
              {summary.valid > 0 && (
                <Badge className="gap-1 text-[10px] bg-green-500/10 text-green-600 border-green-500/20">
                  <CheckCircle2 className="h-3 w-3" /> {summary.valid} usable
                </Badge>
              )}
              {summary.encrypted > 0 && (
                <Badge variant="outline" className="gap-1 text-[10px] text-amber-500 border-amber-500/20">
                  <AlertTriangle className="h-3 w-3" /> {summary.encrypted} locked
                </Badge>
              )}
            </div>
          )}

          <ScrollArea className="flex-1 min-h-0">
            {tokens.length === 0 && !loading && (
              <div className="text-center py-8 text-muted-foreground">
                <Globe className="h-8 w-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">Click "Scan for Tokens" to extract DeepSeek cookies</p>
                <p className="text-[11px] mt-1">Log into chat.deepseek.com in your browser first</p>
              </div>
            )}

            {tokens.filter((t) => t.decrypted && t.value).length > 0 && !configured && (
              <div className="mb-3 p-3 rounded-xl bg-blue-500/5 border border-blue-500/20 space-y-2">
                <p className="text-xs font-semibold text-blue-500 flex items-center gap-1.5">
                  <Shield className="h-3.5 w-3.5" /> Auto-Configure ds2api Provider
                </p>
                <div className="flex gap-2">
                  <Input
                    value={providerUrl}
                    onChange={(e) => setProviderUrl(e.target.value)}
                    className="h-7 text-xs flex-1"
                    placeholder="http://localhost:8000/v1"
                  />
                  <Button size="sm" className="h-7 text-xs gap-1" onClick={configureProvider}>
                    <ExternalLink className="h-3 w-3" /> Configure
                  </Button>
                </div>
                <p className="text-[10px] text-muted-foreground">
                  This creates a provider in Settings &gt; Providers. Then use Model Router to route deepseek-chat to it.
                </p>
              </div>
            )}

            {configured && (
              <div className="mb-3 p-3 rounded-xl bg-green-500/5 border border-green-500/20">
                <p className="text-xs text-green-600 flex items-center gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Provider configured!
                </p>
                <p className="text-[10px] text-muted-foreground mt-1">
                  Go to Power Tools → Model Router to create a route for deepseek-chat
                </p>
              </div>
            )}

            <div className="space-y-2">
              {tokens.map((token, i) => (
                <div
                  key={i}
                  className={cn(
                    "rounded-xl border p-3 transition-colors",
                    token.decrypted && token.value ? "border-green-500/20 bg-green-500/5" :
                    token.error ? "border-amber-500/20 bg-amber-500/5" :
                    "border-border bg-card/30"
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-semibold">{token.browser}</span>
                        {token.decrypted && token.value && (
                          <Badge variant="outline" className="text-[9px] h-4 text-green-500 border-green-500/20">Decrypted</Badge>
                        )}
                        {token.error && (
                          <Badge variant="outline" className="text-[9px] h-4 text-amber-500 border-amber-500/20">Locked</Badge>
                        )}
                      </div>
                      {token.domain && (
                        <p className="text-[11px] text-muted-foreground truncate">{token.domain}</p>
                      )}
                      {token.name && (
                        <p className="text-[10px] font-mono text-muted-foreground truncate">{token.name}</p>
                      )}
                      {token.error && (
                        <p className="text-[10px] text-amber-600 mt-1">{token.error}</p>
                      )}
                      {token.decrypted && token.value && (
                        <div className="mt-1.5">
                          <code className="text-[10px] bg-muted/50 px-1.5 py-0.5 rounded break-all block max-w-full">
                            {showValues[`${i}`] ? token.value : token.value.slice(0, 30) + "..."}
                          </code>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {token.decrypted && token.value && (
                        <>
                          <Button
                            size="icon" variant="ghost"
                            className="h-6 w-6"
                            onClick={() => setShowValues((p) => ({ ...p, [`${i}`]: !p[`${i}`] }))}
                          >
                            {showValues[`${i}`] ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                          </Button>
                          <Button
                            size="icon" variant="ghost"
                            className="h-6 w-6"
                            onClick={() => copyToClipboard(token.value, `token-${i}`)}
                          >
                            {copied === `token-${i}` ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  );
}

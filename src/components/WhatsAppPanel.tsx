"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  MessageCircle,
  Send,
  Loader2,
  RefreshCw,
  PhoneOff,
  CheckCircle2,
  XCircle,
  Circle,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";

function generateQRSVG(text: string): string {
  // Use api.qrserver.com which is more reliable
  const encoded = encodeURIComponent(text);
  return `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encoded}&format=png&margin=10`;
}

interface WhatsAppMessage {
  from: string;
  text: string;
  timestamp: number;
}

interface WhatsAppStatus {
  connected: boolean;
  qr?: string;
}

export function WhatsAppPanel({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [status, setStatus] = useState<WhatsAppStatus>({ connected: false });
  const [connecting, setConnecting] = useState(false);
  const [messages, setMessages] = useState<WhatsAppMessage[]>([]);
  const [inputText, setInputText] = useState("");
  const [inputJid, setInputJid] = useState("");
  const [sending, setSending] = useState(false);
  const [botEnabled, setBotEnabled] = useState(false);
  const [botModel, setBotModel] = useState("gemini-2.5-flash");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/whatsapp/status");
      if (res.ok) {
        const data = await res.json();
        setStatus((prev) => {
          if (JSON.stringify(prev) !== JSON.stringify(data)) return data;
          return prev;
        });
        if (data.connected) {
          setConnecting(false);
        }
      }
    } catch {}
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  useEffect(() => {
    if (!open) return;
    // Simple polling for status
    pollRef.current = setInterval(fetchStatus, 3000);
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [open, fetchStatus]);

  // Scroll messages to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Auto-refresh status when connecting
  useEffect(() => {
    if (!connecting) return;
    pollRef.current = setInterval(fetchStatus, 5000);
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [connecting, fetchStatus]);

  const handleConnect = async () => {
    setConnecting(true);
    try {
      const res = await fetch("/api/whatsapp/connect", { method: "POST" });
      const data = await res.json();
      if (data.qr) {
        setStatus((prev) => ({ ...prev, qr: data.qr }));
      } else if (data.error) {
        toast.error(data.error);
        setConnecting(false);
      }
      const pollForQR = setInterval(async () => {
        try {
          const sRes = await fetch("/api/whatsapp/status");
          const sData = await sRes.json();
          if (sData.qr) { setStatus(sData); clearInterval(pollForQR); }
          if (sData.connected) { setStatus(sData); setConnecting(false); clearInterval(pollForQR); }
        } catch {}
      }, 2000);
      setTimeout(() => clearInterval(pollForQR), 45000);
    } catch {
      toast.error("Failed to start WhatsApp connection.");
      setConnecting(false);
    }
  };

  // Load bot config
  useEffect(() => {
    if (!open || !status.connected) return;
    fetch("/api/whatsapp/bot").then(r => r.json()).then(d => {
      setBotEnabled(d.enabled || false);
      if (d.model) setBotModel(d.model);
    }).catch(() => {});
  }, [open, status.connected]);

  const handleBotToggle = async (enabled: boolean) => {
    setBotEnabled(enabled);
    try {
      await fetch("/api/whatsapp/bot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled, model: botModel }),
      });
      toast.success(enabled ? "Bot enabled - AI will auto-reply" : "Bot disabled");
    } catch {
      setBotEnabled(!enabled);
      toast.error("Failed to toggle bot");
    }
  };

  const handleDisconnect = async () => {
    try {
      await fetch("/api/whatsapp/disconnect", { method: "POST" });
      setConnecting(false);
      await fetchStatus();
      toast.success("Disconnected from WhatsApp");
    } catch {
      toast.error("Failed to disconnect");
    }
  };

  const handleSend = async () => {
    if (!inputJid.trim() || !inputText.trim()) return;
    setSending(true);
    try {
      const res = await fetch("/api/whatsapp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jid: inputJid.trim(), text: inputText.trim() }),
      });
      if (res.ok) {
        setInputText("");
        toast.success("Message sent");
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to send");
      }
    } catch {
      toast.error("Failed to send message");
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px] max-h-[85vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 pt-6 pb-3 border-b border-border shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center">
                <MessageCircle className="h-5 w-5 text-emerald-500" />
              </div>
              <div>
                <DialogTitle className="text-base">WhatsApp</DialogTitle>
                <DialogDescription className="text-xs">
                  {status.connected
                    ? "Connected"
                    : connecting
                    ? "Connecting..."
                    : "Disconnected"}
                </DialogDescription>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {status.connected ? (
                <Badge variant="default" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 gap-1">
                  <CheckCircle2 className="h-3 w-3" />
                  Online
                </Badge>
              ) : connecting ? (
                <Badge variant="secondary" className="gap-1">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Connecting
                </Badge>
              ) : (
                <Badge variant="secondary" className="gap-1 text-muted-foreground">
                  <XCircle className="h-3 w-3" />
                  Offline
                </Badge>
              )}
            </div>
          </div>
        </DialogHeader>

        <ScrollArea className="flex-1 px-6 py-4 min-h-0">
          {/* QR Code Area */}
          {!status.connected && status.qr && (
            <div className="flex flex-col items-center gap-3 mb-4 p-4 bg-muted/30 rounded-xl border border-border">
              <p className="text-sm text-muted-foreground text-center">
                Scan this QR code with WhatsApp on your phone
              </p>
              <div className="bg-white p-3 rounded-xl shadow-sm">
                <img
                  src={typeof status.qr === "string" && status.qr.length > 100 ? generateQRSVG(status.qr) : status.qr}
                  alt="WhatsApp QR Code"
                  className="w-52 h-52"
                  onError={(e) => {
                    const img = e.target as HTMLImageElement;
                    img.style.display = "none";
                    const parent = img.parentElement;
                    if (parent) {
                      parent.innerHTML = `<div class="flex items-center justify-center w-52 h-52 bg-muted rounded-xl"><p class="text-xs text-muted-foreground text-center p-4">QR Code could not load.<br/>Try reconnecting.</p></div>`;
                    }
                  }}
                />
              </div>
              <p className="text-[11px] text-muted-foreground text-center">
                Open WhatsApp &gt; Settings &gt; Linked Devices &gt; Link a Device
              </p>
            </div>
          )}

          {/* Connection Controls */}
          <div className="flex gap-2 mb-4">
            {!status.connected && !connecting && (
              <Button
                variant="default"
                size="sm"
                className="flex-1 bg-emerald-600 hover:bg-emerald-700"
                onClick={handleConnect}
              >
                <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                Connect
              </Button>
            )}
            {connecting && (
              <Button variant="default" size="sm" className="flex-1" disabled>
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                Waiting for scan...
              </Button>
            )}
            {(status.connected || connecting) && (
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={handleDisconnect}
              >
                <PhoneOff className="h-3.5 w-3.5 mr-1.5" />
                Disconnect
              </Button>
            )}
          </div>

          {/* Bot Controls */}
          {status.connected && (
            <div className="mb-4 p-3 rounded-xl bg-primary/5 border border-primary/10 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" />
                  <span className="text-xs font-semibold">AI Auto-Reply Bot</span>
                </div>
                <Switch
                  checked={botEnabled}
                  onCheckedChange={handleBotToggle}
                />
              </div>
              {botEnabled && (
                <p className="text-[10px] text-muted-foreground">
                  Agent will automatically reply to WhatsApp messages using {botModel || "AI"}
                </p>
              )}
            </div>
          )}

          {/* Messages List */}
          {status.connected && (
            <>
              <div className="mb-3">
                <h4 className="text-sm font-semibold mb-1.5">Recent Messages</h4>
                {messages.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-4 text-center">
                    No messages yet. Incoming WhatsApp messages will appear here.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {messages.map((msg, i) => (
                      <div
                        key={i}
                        className="p-2.5 rounded-lg bg-muted/30 border border-border/50"
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[11px] font-mono text-muted-foreground truncate max-w-[200px]">
                            {msg.from}
                          </span>
                          <span className="text-[10px] text-muted-foreground/60 shrink-0 ml-2">
                            {formatTime(new Date(msg.timestamp))}
                          </span>
                        </div>
                        <p className="text-sm leading-relaxed">{msg.text}</p>
                      </div>
                    ))}
                    <div ref={messagesEndRef} />
                  </div>
                )}
              </div>

              {/* Send Message */}
              <div className="border-t border-border pt-3">
                <h4 className="text-sm font-semibold mb-2">Send Message</h4>
                <div className="space-y-2">
                  <Input
                    placeholder="Recipient JID (e.g. 1234567890@s.whatsapp.net)"
                    value={inputJid}
                    onChange={(e) => setInputJid(e.target.value)}
                    className="h-9 text-xs"
                  />
                  <div className="flex gap-2">
                    <Textarea
                      placeholder="Type a message..."
                      value={inputText}
                      onChange={(e) => setInputText(e.target.value)}
                      className="min-h-[36px] max-h-[80px] resize-none text-sm flex-1"
                      rows={1}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          handleSend();
                        }
                      }}
                    />
                    <Button
                      size="icon"
                      className="h-9 w-9 shrink-0 rounded-lg"
                      onClick={handleSend}
                      disabled={sending || !inputJid.trim() || !inputText.trim()}
                    >
                      {sending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Send className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            </>
          )}

          {!status.connected && !status.qr && !connecting && (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <div className="w-14 h-14 rounded-full bg-muted/40 flex items-center justify-center mb-3">
                <Circle className="h-6 w-6 text-muted-foreground/40" />
              </div>
              <p className="text-sm text-muted-foreground">
                Click Connect to start the WhatsApp integration
              </p>
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

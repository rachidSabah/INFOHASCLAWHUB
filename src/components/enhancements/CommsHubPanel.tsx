"use client";

import { PowerToolHint } from "./PowerToolHint";
import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  MessageCircle,
  Send,
  Radio,
  Loader2,
  CheckCircle2,
  XCircle,
  QrCode,
  Sparkles,
  Megaphone,
  PhoneOff,
  Cable,
  Trash2,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

interface BotConnection {
  id: string;
  platform: string;
  name: string;
  token?: string | null;
  isConnected: boolean;
  config?: string | null;
  botEnabled: boolean;
  connectedNumber?: string | null;
  personality?: string | null;
  lastActivity?: string | null;
  createdAt: string;
  updatedAt: string;
}

interface WhatsAppStatus {
  connected: boolean;
  qr?: string;
  botEnabled?: boolean;
  connectedNumber?: string | null;
}

interface CommsHubPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function generateQRUrl(text: string): string {
  const encoded = encodeURIComponent(text);
  return `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encoded}&format=png&margin=10`;
}

function parsePersonality(raw: string | null | undefined): { tone?: string; style?: string; rules?: string } {
  try {
    if (!raw) return {};
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function platformIcon(platform: string) {
  switch (platform) {
    case "whatsapp":
      return <MessageCircle className="h-4 w-4" />;
    case "telegram":
      return <Send className="h-4 w-4" />;
    case "discord":
      return <Radio className="h-4 w-4" />;
    case "slack":
      return <Radio className="h-4 w-4" />;
    default:
      return <Cable className="h-4 w-4" />;
  }
}

function platformColor(platform: string) {
  switch (platform) {
    case "whatsapp":
      return { bg: "bg-emerald-500/10", text: "text-emerald-500", border: "border-emerald-500/20", hover: "hover:bg-emerald-600", solid: "bg-emerald-600" };
    case "telegram":
      return { bg: "bg-sky-500/10", text: "text-sky-500", border: "border-sky-500/20", hover: "hover:bg-sky-600", solid: "bg-sky-600" };
    case "discord":
      return { bg: "bg-violet-500/10", text: "text-violet-500", border: "border-violet-500/20", hover: "hover:bg-violet-600", solid: "bg-violet-600" };
    case "slack":
      return { bg: "bg-orange-500/10", text: "text-orange-500", border: "border-orange-500/20", hover: "hover:bg-orange-600", solid: "bg-orange-600" };
    default:
      return { bg: "bg-zinc-500/10", text: "text-zinc-500", border: "border-zinc-500/20", hover: "hover:bg-zinc-600", solid: "bg-zinc-600" };
  }
}

// ─── Component ───────────────────────────────────────────────────────────────

export function CommsHubPanel({ open, onOpenChange }: CommsHubPanelProps) {
  const [connections, setConnections] = useState<BotConnection[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("whatsapp");

  // WhatsApp-specific
  const [waStatus, setWaStatus] = useState<WhatsAppStatus>({ connected: false });
  const [waConnecting, setWaConnecting] = useState(false);
  const [waDisconnected, setWaDisconnected] = useState(false);

  // Bot creation form
  const [newName, setNewName] = useState("");
  const [newToken, setNewToken] = useState("");
  const [creating, setCreating] = useState(false);

  // Send message form per platform
  const [sendRecipient, setSendRecipient] = useState("");
  const [sendText, setSendText] = useState("");
  const [sending, setSending] = useState(false);

  // Broadcast
  const [broadcastMsg, setBroadcastMsg] = useState("");
  const [broadcasting, setBroadcasting] = useState(false);
  const [broadcastAdapt, setBroadcastAdapt] = useState(false);
  const [broadcastResults, setBroadcastResults] = useState<any[] | null>(null);

  // ── Fetch Connections ──
  const fetchConnections = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/bots/connections");
      if (res.ok) {
        const data = await res.json();
        setConnections(data);
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  // ── Fetch WhatsApp Status ──
  const fetchWaStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/whatsapp/status");
      if (res.ok) {
        const data = await res.json();
        setWaStatus((prev) => {
          if (JSON.stringify(prev) !== JSON.stringify(data)) return data;
          return prev;
        });
        if (data.connected) {
          setWaConnecting(false);
          setWaDisconnected(false);
        }
      }
    } catch {
      // silently fail
    }
  }, []);

  // ── Init ──
  useEffect(() => {
    if (!open) return;
    fetchConnections();
    fetchWaStatus();
  }, [open, fetchConnections, fetchWaStatus]);

  // ── Poll WhatsApp ──
  useEffect(() => {
    if (!open) return;
    const interval = setInterval(fetchWaStatus, 3000);
    return () => clearInterval(interval);
  }, [open, fetchWaStatus]);

  // ── Get connection for a platform ──
  const getConnection = (platform: string): BotConnection | undefined => {
    return connections.find((c) => c.platform === platform);
  };

  // ── Create Bot Connection ──
  const createConnection = async (platform: string) => {
    if (!newName.trim()) {
      toast.error("Name is required");
      return;
    }
    if (platform !== "whatsapp" && !newToken.trim()) {
      toast.error("Bot token is required");
      return;
    }

    setCreating(true);
    try {
      const personality = JSON.stringify({ tone: "professional", style: "casual" });
      const res = await fetch("/api/bots/connections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platform,
          name: newName.trim(),
          token: newToken.trim() || null,
          isConnected: false,
          botEnabled: true,
          personality,
        }),
      });
      if (res.ok) {
        toast.success(`${platform.charAt(0).toUpperCase() + platform.slice(1)} connection created`);
        setNewName("");
        setNewToken("");
        await fetchConnections();
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to create connection");
      }
    } catch {
      toast.error("Failed to create connection");
    } finally {
      setCreating(false);
    }
  };

  // ── Connect Bot ──
  const connectBot = async (id: string) => {
    try {
      const res = await fetch(`/api/bots/connections/${id}/connect`, { method: "POST" });
      if (res.ok) {
        toast.success("Bot connected");
        await fetchConnections();
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to connect");
      }
    } catch {
      toast.error("Failed to connect bot");
    }
  };

  // ── Disconnect Bot ──
  const disconnectBot = async (id: string) => {
    try {
      const res = await fetch(`/api/bots/connections/${id}/disconnect`, { method: "POST" });
      if (res.ok) {
        toast.success("Bot disconnected");
        await fetchConnections();
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to disconnect");
      }
    } catch {
      toast.error("Failed to disconnect bot");
    }
  };

  // ── Toggle Bot ──
  const toggleBot = async (id: string) => {
    try {
      const res = await fetch(`/api/bots/connections/${id}/toggle`, { method: "POST" });
      if (res.ok) {
        await fetchConnections();
        toast.success("Bot toggled");
      } else {
        toast.error("Failed to toggle bot");
      }
    } catch {
      toast.error("Failed to toggle bot");
    }
  };

  // ── Update Personality ──
  const updatePersonality = async (id: string, tone: string) => {
    try {
      const personality = JSON.stringify({ tone, style: "casual" });
      const res = await fetch(`/api/bots/connections/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ personality }),
      });
      if (res.ok) {
        await fetchConnections();
        toast.success("Personality updated");
      }
    } catch {
      toast.error("Failed to update personality");
    }
  };

  // ── Delete Connection ──
  const deleteConnection = async (id: string) => {
    try {
      const res = await fetch(`/api/bots/connections/${id}`, { method: "DELETE" });
      if (res.ok) {
        toast.success("Connection deleted");
        await fetchConnections();
      } else {
        toast.error("Failed to delete");
      }
    } catch {
      toast.error("Failed to delete connection");
    }
  };

  // ── Send Message ──
  const sendMessage = async (connectionId: string) => {
    if (!sendRecipient.trim() || !sendText.trim()) {
      toast.error("Recipient and message are required");
      return;
    }
    setSending(true);
    try {
      const res = await fetch(`/api/bots/connections/${connectionId}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: sendText.trim(), recipient: sendRecipient.trim() }),
      });
      if (res.ok) {
        toast.success("Message sent");
        setSendText("");
        setSendRecipient("");
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

  // ── WhatsApp Connect ──
  const handleWaConnect = async () => {
    setWaConnecting(true);
    setWaDisconnected(false);
    try {
      const res = await fetch("/api/whatsapp/connect", { method: "POST" });
      const data = await res.json();
      if (data.qr) {
        setWaStatus((prev) => ({ ...prev, qr: data.qr, connected: false }));
      } else if (data.error) {
        toast.error(data.error);
        setWaConnecting(false);
      }
      // Poll for connection
      const pollForQR = setInterval(async () => {
        try {
          const sRes = await fetch("/api/whatsapp/status");
          const sData = await sRes.json();
          if (sData.qr) setWaStatus(sData);
          if (sData.connected) {
            setWaStatus(sData);
            setWaConnecting(false);
            clearInterval(pollForQR);
          }
        } catch {}
      }, 2000);
      setTimeout(() => { clearInterval(pollForQR); setWaConnecting(false); }, 60000);
    } catch {
      toast.error("Failed to start WhatsApp connection");
      setWaConnecting(false);
    }
  };

  // ── WhatsApp Disconnect ──
  const handleWaDisconnect = async () => {
    try {
      await fetch("/api/whatsapp/disconnect", { method: "POST" });
      setWaConnecting(false);
      setWaStatus({ connected: false });
      setWaDisconnected(true);
      toast.success("Disconnected from WhatsApp");
    } catch {
      toast.error("Failed to disconnect");
    }
  };

  // ── WhatsApp Bot Toggle ──
  const handleWaBotToggle = async (enabled: boolean) => {
    try {
      await fetch("/api/whatsapp/bot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
      setWaStatus((prev) => ({ ...prev, botEnabled: enabled }));
      toast.success(enabled ? "WhatsApp bot enabled" : "WhatsApp bot disabled");
    } catch {
      toast.error("Failed to toggle WhatsApp bot");
    }
  };

  // ── WhatsApp Send ──
  const handleWaSend = async () => {
    if (!sendRecipient.trim() || !sendText.trim()) return;
    setSending(true);
    try {
      let normalizedJid = sendRecipient.trim();
      if (/^\d{5,15}$/.test(normalizedJid)) {
        normalizedJid = `${normalizedJid}@s.whatsapp.net`;
      }
      const res = await fetch("/api/whatsapp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jid: normalizedJid, text: sendText.trim() }),
      });
      if (res.ok) {
        toast.success("Message sent");
        setSendText("");
        setSendRecipient("");
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

  // ── Broadcast ──
  const handleBroadcast = async () => {
    if (!broadcastMsg.trim()) {
      toast.error("Message is required");
      return;
    }
    setBroadcasting(true);
    setBroadcastResults(null);
    try {
      const res = await fetch("/api/bots/broadcast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: broadcastMsg.trim(), adaptPerPlatform: broadcastAdapt }),
      });
      if (res.ok) {
        const data = await res.json();
        setBroadcastResults(data.results || []);
        toast.success(`Broadcast sent to ${data.recipients} platform(s)`);
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to broadcast");
      }
    } catch {
      toast.error("Failed to broadcast");
    } finally {
      setBroadcasting(false);
    }
  };

  // ── Platform Tab Content (reusable for Telegram/Discord/Slack) ──
  const renderPlatformTab = (platform: string) => {
    const conn = getConnection(platform);
    const colors = platformColor(platform);

    return (
      <ScrollArea className="h-[calc(85vh-220px)]">
        <div className="space-y-4 p-1 pr-3">
          {/* Connection Status */}
          <div className="rounded-xl border bg-card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={cn("w-10 h-10 rounded-full flex items-center justify-center", colors.bg)}>
                  <div className={colors.text}>{platformIcon(platform)}</div>
                </div>
                <div>
                  <h4 className="text-sm font-semibold">{conn?.name || platform.charAt(0).toUpperCase() + platform.slice(1)}</h4>
                  <p className="text-[11px] text-muted-foreground">
                    {conn?.isConnected ? "Connected" : "Not connected"}
                  </p>
                </div>
              </div>
              <Badge
                className={cn(
                  "h-6 text-[10px] font-medium border gap-1",
                  conn?.isConnected
                    ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                    : "bg-zinc-500/10 text-zinc-500 border-zinc-500/20"
                )}
              >
                {conn?.isConnected ? (
                  <>
                    <CheckCircle2 className="h-3 w-3" />
                    Online
                  </>
                ) : (
                  <>
                    <XCircle className="h-3 w-3" />
                    Offline
                  </>
                )}
              </Badge>
            </div>

            {conn?.connectedNumber && (
              <div className={cn("p-2.5 rounded-lg border", colors.bg, colors.border)}>
                <div className="flex items-center gap-2">
                  <div className={cn("h-5 w-5 rounded-full flex items-center justify-center", colors.bg)}>
                    <div className={cn("h-2.5 w-2.5", colors.text)}>{platformIcon(platform)}</div>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground">Connected as</p>
                    <p className="text-xs font-mono font-semibold">{conn.connectedNumber}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Connection Controls */}
            <div className="flex gap-2">
              {!conn && (
                <Button
                  variant="default"
                  size="sm"
                  className={cn("flex-1 text-xs gap-1.5", colors.solid, colors.hover)}
                  onClick={() => createConnection(platform)}
                  disabled={creating}
                >
                  {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Cable className="h-3.5 w-3.5" />}
                  Create & Connect
                </Button>
              )}
              {conn && !conn.isConnected && (
                <Button
                  variant="default"
                  size="sm"
                  className={cn("flex-1 text-xs gap-1.5", colors.solid, colors.hover)}
                  onClick={() => connectBot(conn.id)}
                >
                  <Cable className="h-3.5 w-3.5" />
                  Connect
                </Button>
              )}
              {conn?.isConnected && (
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 text-xs gap-1.5"
                  onClick={() => disconnectBot(conn.id)}
                >
                  <PhoneOff className="h-3.5 w-3.5" />
                  Disconnect
                </Button>
              )}
              {conn && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs text-destructive hover:text-destructive gap-1"
                  onClick={() => deleteConnection(conn.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete
                </Button>
              )}
            </div>
          </div>

          {/* Setup Form (when no connection exists) */}
          {!conn && (
            <div className="rounded-xl border bg-card p-4 space-y-3">
              <h4 className="text-sm font-semibold flex items-center gap-2">
                <Cable className="h-4 w-4 text-muted-foreground" />
                Setup {platform.charAt(0).toUpperCase() + platform.slice(1)} Connection
              </h4>
              <div className="space-y-2">
                <div className="space-y-1">
                  <Label className="text-xs font-medium">Connection Name</Label>
                  <Input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder={`My ${platform.charAt(0).toUpperCase() + platform.slice(1)} Bot`}
                    className="h-9 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-medium">Bot Token</Label>
                  <Input
                    value={newToken}
                    onChange={(e) => setNewToken(e.target.value)}
                    placeholder="Enter bot token..."
                    type="password"
                    className="h-9 text-xs"
                  />
                  <p className="text-[10px] text-muted-foreground">
                    Get your bot token from the {platform.charAt(0).toUpperCase() + platform.slice(1)} developer portal
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Bot Settings (when connected) */}
          {conn && (
            <>
              <div className="rounded-xl border bg-card p-4 space-y-3">
                <h4 className="text-sm font-semibold flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" />
                  AI Auto-Reply
                </h4>
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <p className="text-xs font-medium">Auto-Reply Bot</p>
                    <p className="text-[10px] text-muted-foreground">
                      {conn.botEnabled ? "AI will auto-reply to incoming messages" : "Bot is OFF — no auto-replies"}
                    </p>
                  </div>
                  <Switch
                    checked={conn.botEnabled}
                    onCheckedChange={() => toggleBot(conn.id)}
                  />
                </div>
              </div>

              {/* Channel Personality */}
              <div className="rounded-xl border bg-card p-4 space-y-3">
                <h4 className="text-sm font-semibold">Channel Personality</h4>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Tone</Label>
                  <Select
                    value={parsePersonality(conn.personality).tone || "professional"}
                    onValueChange={(v) => updatePersonality(conn.id, v)}
                  >
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="professional">Professional</SelectItem>
                      <SelectItem value="casual">Casual</SelectItem>
                      <SelectItem value="friendly">Friendly</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Send Message */}
              <div className="rounded-xl border bg-card p-4 space-y-3">
                <h4 className="text-sm font-semibold">Send Message</h4>
                <div className="space-y-2">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Recipient</Label>
                    <Input
                      value={sendRecipient}
                      onChange={(e) => setSendRecipient(e.target.value)}
                      placeholder={
                        platform === "telegram" ? "Chat ID or @username" :
                        platform === "discord" ? "Channel ID" :
                        platform === "slack" ? "Channel or @user" :
                        "Recipient"
                      }
                      className="h-9 text-xs"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Textarea
                      value={sendText}
                      onChange={(e) => setSendText(e.target.value)}
                      placeholder="Type your message..."
                      className="min-h-[60px] max-h-[100px] resize-none text-xs flex-1"
                      rows={2}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          sendMessage(conn.id);
                        }
                      }}
                    />
                    <Button
                      size="icon"
                      className={cn("h-9 w-9 shrink-0 rounded-lg", colors.solid)}
                      onClick={() => sendMessage(conn.id)}
                      disabled={sending || !sendRecipient.trim() || !sendText.trim()}
                    >
                      {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </ScrollArea>
    );
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════════

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[92vh] overflow-hidden flex flex-col" showCloseButton>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-gradient-to-br from-emerald-500/20 to-sky-500/20 border border-emerald-500/30">
              <MessageCircle className="h-4 w-4 text-emerald-400" />
            </div>
            Multi-Platform Comms Hub
          </DialogTitle>
          <DialogDescription>
            Connect and manage bots across messaging platforms with AI auto-reply
          </DialogDescription>
        </DialogHeader>
          <PowerToolHint name="Comms Hub" />

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
          <TabsList className="grid w-full grid-cols-5 mb-1 shrink-0">
            <TabsTrigger value="whatsapp" className="gap-1 text-[10px] px-1">
              <MessageCircle className="h-3 w-3" />
              <span className="hidden sm:inline">WhatsApp</span>
            </TabsTrigger>
            <TabsTrigger value="telegram" className="gap-1 text-[10px] px-1">
              <Send className="h-3 w-3" />
              <span className="hidden sm:inline">Telegram</span>
            </TabsTrigger>
            <TabsTrigger value="discord" className="gap-1 text-[10px] px-1">
              <Radio className="h-3 w-3" />
              <span className="hidden sm:inline">Discord</span>
            </TabsTrigger>
            <TabsTrigger value="slack" className="gap-1 text-[10px] px-1">
              <Radio className="h-3 w-3" />
              <span className="hidden sm:inline">Slack</span>
            </TabsTrigger>
            <TabsTrigger value="broadcast" className="gap-1 text-[10px] px-1">
              <Megaphone className="h-3 w-3" />
              <span className="hidden sm:inline">Broadcast</span>
            </TabsTrigger>
          </TabsList>

          {/* ═══ WHATSAPP TAB ═══ */}
          <TabsContent value="whatsapp" className="flex-1 min-h-0 mt-0">
            <ScrollArea className="h-[calc(85vh-220px)]">
              <div className="space-y-4 p-1 pr-3">
                {/* Connection Status */}
                <div className="rounded-xl border bg-card p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center">
                        <MessageCircle className="h-5 w-5 text-emerald-500" />
                      </div>
                      <div>
                        <h4 className="text-sm font-semibold">WhatsApp</h4>
                        <p className="text-[11px] text-muted-foreground">
                          {waStatus.connected ? "Connected" : waConnecting ? "Connecting..." : waDisconnected ? "Disconnected" : "Not connected"}
                        </p>
                      </div>
                    </div>
                    <Badge
                      className={cn(
                        "h-6 text-[10px] font-medium border gap-1",
                        waStatus.connected
                          ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                          : waConnecting
                          ? "bg-sky-500/10 text-sky-600 border-sky-500/20"
                          : "bg-zinc-500/10 text-zinc-500 border-zinc-500/20"
                      )}
                    >
                      {waStatus.connected ? (
                        <><CheckCircle2 className="h-3 w-3" /> Online</>
                      ) : waConnecting ? (
                        <><Loader2 className="h-3 w-3 animate-spin" /> Connecting</>
                      ) : (
                        <><XCircle className="h-3 w-3" /> Offline</>
                      )}
                    </Badge>
                  </div>

                  {/* Connected Number */}
                  {waStatus.connected && waStatus.connectedNumber && (
                    <div className="p-2.5 rounded-lg bg-emerald-500/5 border border-emerald-500/10">
                      <div className="flex items-center gap-2">
                        <div className="h-5 w-5 rounded-full bg-emerald-500/10 flex items-center justify-center shrink-0">
                          <MessageCircle className="h-2.5 w-2.5 text-emerald-500" />
                        </div>
                        <div>
                          <p className="text-[10px] text-muted-foreground">Connected as</p>
                          <p className="text-xs font-mono font-semibold">+{waStatus.connectedNumber}</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* QR Code */}
                  {!waStatus.connected && waStatus.qr && (
                    <div className="flex flex-col items-center gap-2 p-3 bg-muted/30 rounded-xl border border-border">
                      <p className="text-xs text-muted-foreground text-center">
                        Scan this QR code with WhatsApp on your phone
                      </p>
                      <div className="bg-white p-2 rounded-lg shadow-sm">
                        <img
                          src={
                            typeof waStatus.qr === "string" && waStatus.qr.length > 100
                              ? generateQRUrl(waStatus.qr)
                              : waStatus.qr
                          }
                          alt="WhatsApp QR Code"
                          className="w-40 h-40"
                          onError={(e) => {
                            const img = e.target as HTMLImageElement;
                            img.style.display = "none";
                            const parent = img.parentElement;
                            if (parent) {
                              parent.innerHTML = `<div class="flex items-center justify-center w-40 h-40 bg-muted rounded-lg"><p class="text-[10px] text-muted-foreground text-center p-2">QR Code could not load.<br/>Try reconnecting.</p></div>`;
                            }
                          }}
                        />
                      </div>
                      <p className="text-[10px] text-muted-foreground text-center">
                        WhatsApp &gt; Settings &gt; Linked Devices &gt; Link a Device
                      </p>
                    </div>
                  )}

                  {/* Connection Buttons */}
                  <div className="flex gap-2">
                    {!waStatus.connected && !waConnecting && (
                      <Button
                        variant="default"
                        size="sm"
                        className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-xs gap-1.5"
                        onClick={handleWaConnect}
                      >
                        <QrCode className="h-3.5 w-3.5" />
                        {waDisconnected ? "Reconnect" : "Connect"}
                      </Button>
                    )}
                    {waConnecting && !waStatus.connected && (
                      <Button variant="default" size="sm" className="flex-1 text-xs" disabled>
                        <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                        Waiting for QR scan...
                      </Button>
                    )}
                    {(waStatus.connected || waConnecting) && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 text-xs gap-1.5"
                        onClick={handleWaDisconnect}
                      >
                        <PhoneOff className="h-3.5 w-3.5" />
                        Disconnect
                      </Button>
                    )}
                  </div>

                  {/* Disconnected empty state */}
                  {!waStatus.connected && !waStatus.qr && !waConnecting && (
                    <div className="flex flex-col items-center justify-center py-6 text-center">
                      <div className="w-12 h-12 rounded-full bg-muted/40 flex items-center justify-center mb-2">
                        {waDisconnected ? (
                          <QrCode className="h-5 w-5 text-muted-foreground/60" />
                        ) : (
                          <MessageCircle className="h-5 w-5 text-muted-foreground/40" />
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {waDisconnected
                          ? "Session cleared. Click Reconnect for a new QR code."
                          : "Click Connect to start the WhatsApp integration"}
                      </p>
                    </div>
                  )}
                </div>

                {/* AI Auto-Reply */}
                {waStatus.connected && (
                  <>
                    <div className="rounded-xl border bg-card p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Sparkles className="h-4 w-4 text-primary" />
                          <span className="text-sm font-semibold">AI Auto-Reply</span>
                        </div>
                        <Switch
                          checked={waStatus.botEnabled ?? true}
                          onCheckedChange={handleWaBotToggle}
                        />
                      </div>
                      <p className="text-[10px] text-muted-foreground">
                        {waStatus.botEnabled !== false
                          ? "Bot is ACTIVE — auto-replying to all incoming WhatsApp messages"
                          : "Bot is OFF — incoming messages will not receive auto-replies"}
                      </p>
                    </div>

                    {/* Personality */}
                    {(() => {
                      const waConn = getConnection("whatsapp");
                      return waConn ? (
                        <div className="rounded-xl border bg-card p-4 space-y-3">
                          <h4 className="text-sm font-semibold">Channel Personality</h4>
                          <div className="space-y-1.5">
                            <Label className="text-xs text-muted-foreground">Tone</Label>
                            <Select
                              value={parsePersonality(waConn.personality).tone || "professional"}
                              onValueChange={(v) => updatePersonality(waConn.id, v)}
                            >
                              <SelectTrigger className="h-9 text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="professional">Professional</SelectItem>
                                <SelectItem value="casual">Casual</SelectItem>
                                <SelectItem value="friendly">Friendly</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      ) : null;
                    })()}

                    {/* Send Message */}
                    <div className="rounded-xl border bg-card p-4 space-y-3">
                      <h4 className="text-sm font-semibold">Send Message</h4>
                      <div className="space-y-2">
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Recipient</Label>
                          <Input
                            value={sendRecipient}
                            onChange={(e) => setSendRecipient(e.target.value)}
                            placeholder="Phone number (e.g. 1234567890)"
                            className="h-9 text-xs"
                          />
                        </div>
                        <div className="flex gap-2">
                          <Textarea
                            value={sendText}
                            onChange={(e) => setSendText(e.target.value)}
                            placeholder="Type your message..."
                            className="min-h-[60px] max-h-[100px] resize-none text-xs flex-1"
                            rows={2}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && !e.shiftKey) {
                                e.preventDefault();
                                handleWaSend();
                              }
                            }}
                          />
                          <Button
                            size="icon"
                            className="h-9 w-9 shrink-0 rounded-lg bg-emerald-600 hover:bg-emerald-700"
                            onClick={handleWaSend}
                            disabled={sending || !sendRecipient.trim() || !sendText.trim()}
                          >
                            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                          </Button>
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </ScrollArea>
          </TabsContent>

          {/* ═══ TELEGRAM TAB ═══ */}
          <TabsContent value="telegram" className="flex-1 min-h-0 mt-0">
            {renderPlatformTab("telegram")}
          </TabsContent>

          {/* ═══ DISCORD TAB ═══ */}
          <TabsContent value="discord" className="flex-1 min-h-0 mt-0">
            {renderPlatformTab("discord")}
          </TabsContent>

          {/* ═══ SLACK TAB ═══ */}
          <TabsContent value="slack" className="flex-1 min-h-0 mt-0">
            {renderPlatformTab("slack")}
          </TabsContent>

          {/* ═══ BROADCAST TAB ═══ */}
          <TabsContent value="broadcast" className="flex-1 min-h-0 mt-0">
            <ScrollArea className="h-[calc(85vh-220px)]">
              <div className="space-y-4 p-1 pr-3">
                {/* Connected Platforms */}
                <div className="rounded-xl border bg-card p-4 space-y-3">
                  <h4 className="text-sm font-semibold flex items-center gap-2">
                    <Cable className="h-4 w-4 text-muted-foreground" />
                    Connected Platforms
                  </h4>
                  {connections.filter((c) => c.isConnected).length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-6 text-muted-foreground">
                      <Megaphone className="h-8 w-8 mb-2 opacity-30" />
                      <p className="text-xs">No connected platforms yet</p>
                      <p className="text-[10px] mt-1">Connect a platform above to enable broadcasting</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {connections
                        .filter((c) => c.isConnected)
                        .map((conn) => {
                          const colors = platformColor(conn.platform);
                          return (
                            <div
                              key={conn.id}
                              className={cn(
                                "flex items-center gap-3 p-2.5 rounded-lg border",
                                colors.bg,
                                colors.border
                              )}
                            >
                              <div className={cn("h-8 w-8 rounded-full flex items-center justify-center", colors.bg)}>
                                <div className={colors.text}>{platformIcon(conn.platform)}</div>
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-medium truncate">{conn.name}</p>
                                <p className="text-[10px] text-muted-foreground">
                                  {conn.platform.charAt(0).toUpperCase() + conn.platform.slice(1)}
                                  {conn.botEnabled ? " • Bot active" : " • Bot off"}
                                </p>
                              </div>
                              <Badge
                                className={cn(
                                  "h-5 text-[10px] border shrink-0",
                                  "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                                )}
                              >
                                <CheckCircle2 className="h-2.5 w-2.5 mr-0.5" />
                                Online
                              </Badge>
                            </div>
                          );
                        })}
                    </div>
                  )}
                </div>

                {/* Broadcast Message */}
                <div className="rounded-xl border bg-card p-4 space-y-3">
                  <h4 className="text-sm font-semibold flex items-center gap-2">
                    <Megaphone className="h-4 w-4 text-primary" />
                    Broadcast Message
                  </h4>
                  <p className="text-[10px] text-muted-foreground">
                    Send a message to all connected platforms simultaneously
                  </p>
                  <div className="space-y-2">
                    <Textarea
                      value={broadcastMsg}
                      onChange={(e) => setBroadcastMsg(e.target.value)}
                      placeholder="Type your broadcast message..."
                      className="min-h-[80px] max-h-[140px] resize-none text-xs"
                      rows={3}
                    />
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={broadcastAdapt}
                          onCheckedChange={setBroadcastAdapt}
                        />
                        <Label className="text-xs text-muted-foreground">
                          Adapt per platform tone
                        </Label>
                      </div>
                      <Button
                        size="sm"
                        className="text-xs gap-1.5 min-w-[120px]"
                        onClick={handleBroadcast}
                        disabled={broadcasting || !broadcastMsg.trim()}
                      >
                        {broadcasting ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Megaphone className="h-3.5 w-3.5" />
                        )}
                        Broadcast
                      </Button>
                    </div>
                  </div>
                </div>

                {/* Broadcast Results */}
                {broadcastResults && broadcastResults.length > 0 && (
                  <div className="rounded-xl border bg-card p-4 space-y-3">
                    <h4 className="text-sm font-semibold">Broadcast Results</h4>
                    <div className="space-y-2">
                      {broadcastResults.map((result, i) => {
                        const colors = platformColor(result.platform);
                        return (
                          <div
                            key={i}
                            className={cn(
                              "p-2.5 rounded-lg border",
                              colors.bg,
                              colors.border
                            )}
                          >
                            <div className="flex items-center gap-2 mb-1">
                              <div className={colors.text}>{platformIcon(result.platform)}</div>
                              <span className="text-xs font-medium">{result.name}</span>
                              <Badge className="h-4 text-[8px] bg-emerald-500/10 text-emerald-600 border-emerald-500/20 border">
                                Sent
                              </Badge>
                            </div>
                            <p className="text-[10px] text-muted-foreground line-clamp-2">
                              {result.message}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* WhatsApp also in broadcast */}
                {waStatus.connected && (
                  <div className="rounded-lg border border-dashed p-3 flex items-center gap-2">
                    <div className="h-6 w-6 rounded-full bg-emerald-500/10 flex items-center justify-center">
                      <MessageCircle className="h-3 w-3 text-emerald-500" />
                    </div>
                    <div>
                      <p className="text-[10px] font-medium">WhatsApp is also connected</p>
                      <p className="text-[10px] text-muted-foreground">Broadcast will include WhatsApp if bot is enabled</p>
                    </div>
                  </div>
                )}
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

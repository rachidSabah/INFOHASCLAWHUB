"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
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
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Globe,
  Users,
  MessageSquare,
  Shield,
  Loader2,
  Plus,
  ArrowUpRight,
  ArrowDownLeft,
  Lock,
  Unlock,
  CheckCircle2,
  XCircle,
  Scan,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ───────────────────────────────────────────────────────────────────

interface Peer {
  id: string;
  name: string;
  endpoint: string;
  status: "online" | "offline" | "handshaking";
  trustScore: number;
  lastSeen: string;
}

interface FederationMessage {
  id: string;
  direction: "inbound" | "outbound";
  peerId: string;
  peerName: string;
  type: string;
  content: string;
  timestamp: string;
}

interface PIIResult {
  id: string;
  peerId: string;
  scanType: string;
  findings: number;
  status: "clean" | "flagged";
  scannedAt: string;
}

interface FederationPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function trustScoreColor(score: number) {
  if (score >= 0.8) return "bg-emerald-500/15 text-emerald-400 border-emerald-500/30";
  if (score >= 0.5) return "bg-amber-500/15 text-amber-400 border-amber-500/30";
  return "bg-red-500/15 text-red-400 border-red-500/30";
}

function peerStatusColor(status: string) {
  switch (status) {
    case "online":
      return "bg-emerald-500/15 text-emerald-400 border-emerald-500/30";
    case "offline":
      return "bg-zinc-500/15 text-zinc-400 border-zinc-500/30";
    case "handshaking":
      return "bg-amber-500/15 text-amber-400 border-amber-500/30";
    default:
      return "bg-zinc-500/15 text-zinc-400 border-zinc-500/30";
  }
}

// ─── Component ───────────────────────────────────────────────────────────────

export function FederationPanel({ open, onOpenChange }: FederationPanelProps) {
  const [activeTab, setActiveTab] = useState("peers");

  // ══ Peers Tab State ══
  const [peers, setPeers] = useState<Peer[]>([]);
  const [loadingPeers, setLoadingPeers] = useState(false);
  const [newPeerName, setNewPeerName] = useState("");
  const [newPeerEndpoint, setNewPeerEndpoint] = useState("");
  const [registeringPeer, setRegisteringPeer] = useState(false);
  const [handshakingPeerId, setHandshakingPeerId] = useState<string | null>(null);

  // ══ Messages Tab State ══
  const [messages, setMessages] = useState<FederationMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [msgContent, setMsgContent] = useState("");
  const [msgTargetPeer, setMsgTargetPeer] = useState("");
  const [sendingMsg, setSendingMsg] = useState(false);

  // ══ Trust Tab State ══
  const [piiResults, setPiiResults] = useState<PIIResult[]>([]);
  const [loadingTrust, setLoadingTrust] = useState(false);
  const [scanningPeerId, setScanningPeerId] = useState<string | null>(null);

  // ── Fetch data on open ──
  const fetchPeers = useCallback(async () => {
    setLoadingPeers(true);
    try {
      const res = await fetch("/api/federation/peers");
      if (res.ok) {
        const data = await res.json();
        setPeers(data.peers || []);
      }
    } catch {
      toast.error("Failed to load peers");
    } finally {
      setLoadingPeers(false);
    }
  }, []);

  const fetchMessages = useCallback(async () => {
    setLoadingMessages(true);
    try {
      const res = await fetch("/api/federation/messages");
      if (res.ok) {
        const data = await res.json();
        setMessages(data.messages || []);
      }
    } catch {
      toast.error("Failed to load messages");
    } finally {
      setLoadingMessages(false);
    }
  }, []);

  const fetchTrust = useCallback(async () => {
    setLoadingTrust(true);
    try {
      const res = await fetch("/api/federation/trust");
      if (res.ok) {
        const data = await res.json();
        setPiiResults(data.scans || []);
      }
    } catch {
      toast.error("Failed to load trust data");
    } finally {
      setLoadingTrust(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      fetchPeers();
      fetchMessages();
      fetchTrust();
    }
  }, [open, fetchPeers, fetchMessages, fetchTrust]);

  // ── Register Peer ──
  const registerPeer = async () => {
    if (!newPeerName.trim() || !newPeerEndpoint.trim()) {
      toast.error("Peer name and endpoint are required");
      return;
    }
    setRegisteringPeer(true);
    try {
      const res = await fetch("/api/federation/peers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newPeerName.trim(), endpoint: newPeerEndpoint.trim() }),
      });
      if (res.ok) {
        toast.success("Peer registered");
        setNewPeerName("");
        setNewPeerEndpoint("");
        fetchPeers();
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to register peer");
      }
    } catch {
      toast.error("Failed to register peer");
    } finally {
      setRegisteringPeer(false);
    }
  };

  // ── Handshake ──
  const handshake = async (peerId: string) => {
    setHandshakingPeerId(peerId);
    try {
      const res = await fetch("/api/federation/handshake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ peerId }),
      });
      if (res.ok) {
        toast.success("Handshake initiated");
        fetchPeers();
      } else {
        const data = await res.json();
        toast.error(data.error || "Handshake failed");
      }
    } catch {
      toast.error("Handshake failed");
    } finally {
      setHandshakingPeerId(null);
    }
  };

  // ── Send Message ──
  const sendMessage = async () => {
    if (!msgContent.trim() || !msgTargetPeer) {
      toast.error("Message content and target peer are required");
      return;
    }
    setSendingMsg(true);
    try {
      const res = await fetch("/api/federation/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: msgContent.trim(), targetPeerId: msgTargetPeer }),
      });
      if (res.ok) {
        toast.success("Message sent");
        setMsgContent("");
        fetchMessages();
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to send message");
      }
    } catch {
      toast.error("Failed to send message");
    } finally {
      setSendingMsg(false);
    }
  };

  // ── PII Scan ──
  const piiScan = async (peerId: string) => {
    setScanningPeerId(peerId);
    try {
      const res = await fetch("/api/federation/pii-scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ peerId }),
      });
      if (res.ok) {
        toast.success("PII scan complete");
        fetchTrust();
      } else {
        const data = await res.json();
        toast.error(data.error || "PII scan failed");
      }
    } catch {
      toast.error("PII scan failed");
    } finally {
      setScanningPeerId(null);
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════════

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-5xl max-h-[92vh] overflow-hidden flex flex-col" showCloseButton>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-gradient-to-br from-emerald-500/20 to-green-500/20 border border-emerald-500/30">
              <Globe className="h-4 w-4 text-emerald-400" />
            </div>
            Federation
          </DialogTitle>
          <DialogDescription>
            Register peers, manage handshakes, exchange messages, and monitor trust scores
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
          <TabsList className="grid w-full grid-cols-3 mb-1 shrink-0">
            <TabsTrigger value="peers" className="gap-1.5 text-xs">
              <Users className="h-3.5 w-3.5" />
              Peers
            </TabsTrigger>
            <TabsTrigger value="messages" className="gap-1.5 text-xs">
              <MessageSquare className="h-3.5 w-3.5" />
              Messages
            </TabsTrigger>
            <TabsTrigger value="trust" className="gap-1.5 text-xs">
              <Shield className="h-3.5 w-3.5" />
              Trust
            </TabsTrigger>
          </TabsList>

          {/* ═══ PEERS TAB ═══ */}
          <TabsContent value="peers" className="flex-1 min-h-0 mt-0 overflow-y-auto">
            <ScrollArea className="h-[calc(90vh-200px)]">
              <div className="space-y-5 p-1 pr-4">
                {/* Register Peer */}
                <div className="rounded-xl border bg-card p-5 space-y-4">
                  <h4 className="text-sm font-semibold flex items-center gap-2">
                    <Plus className="h-4 w-4 text-emerald-400" />
                    Register Peer
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium">Peer Name</Label>
                      <Input value={newPeerName} onChange={(e) => setNewPeerName(e.target.value)} placeholder="e.g., partner-node-01" className="h-9" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium">Endpoint</Label>
                      <Input value={newPeerEndpoint} onChange={(e) => setNewPeerEndpoint(e.target.value)} placeholder="e.g., wss://partner.example.com" className="h-9" />
                    </div>
                  </div>
                  <div className="flex items-center justify-end">
                    <Button size="sm" onClick={registerPeer} disabled={registeringPeer || !newPeerName.trim() || !newPeerEndpoint.trim()} className="h-9 text-xs gap-1.5 min-w-[150px]">
                      {registeringPeer ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                      Register Peer
                    </Button>
                  </div>
                </div>

                {/* Peers List */}
                <div className="rounded-xl border bg-card p-5 space-y-3">
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Connected Peers</h4>
                  {loadingPeers ? (
                    <div className="flex items-center justify-center py-8 text-muted-foreground">
                      <Loader2 className="h-5 w-5 animate-spin mr-2" />
                      Loading peers...
                    </div>
                  ) : peers.length === 0 ? (
                    <div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
                      <Globe className="h-8 w-8 mx-auto mb-2 opacity-30" />
                      <p className="text-sm">No peers registered</p>
                      <p className="text-xs mt-1">Register a peer above</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {peers.map((peer) => (
                        <div key={peer.id} className="flex items-center gap-3 rounded-lg bg-muted/30 p-3">
                          <Badge className={cn("h-5 text-[10px] border", peerStatusColor(peer.status))}>
                            {peer.status}
                          </Badge>
                          <div className="min-w-0 flex-1">
                            <div className="text-xs font-medium">{peer.name}</div>
                            <div className="text-[10px] text-muted-foreground truncate">{peer.endpoint}</div>
                          </div>
                          <Badge className={cn("h-5 text-[10px] border", trustScoreColor(peer.trustScore))}>
                            {(peer.trustScore * 100).toFixed(0)}% trust
                          </Badge>
                          <Button variant="outline" size="sm" className="h-7 text-[10px] gap-1" onClick={() => handshake(peer.id)} disabled={handshakingPeerId === peer.id}>
                            {handshakingPeerId === peer.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Lock className="h-3 w-3" />}
                            Handshake
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </ScrollArea>
          </TabsContent>

          {/* ═══ MESSAGES TAB ═══ */}
          <TabsContent value="messages" className="flex-1 min-h-0 mt-0 overflow-y-auto">
            <ScrollArea className="h-[calc(90vh-200px)]">
              <div className="space-y-5 p-1 pr-4">
                {/* Send Message */}
                <div className="rounded-xl border bg-card p-5 space-y-4">
                  <h4 className="text-sm font-semibold flex items-center gap-2">
                    <ArrowUpRight className="h-4 w-4 text-green-400" />
                    Send Message
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium">Target Peer</Label>
                      <Select value={msgTargetPeer} onValueChange={setMsgTargetPeer}>
                        <SelectTrigger className="h-9">
                          <SelectValue placeholder="Choose peer..." />
                        </SelectTrigger>
                        <SelectContent>
                          {peers.map((p) => (
                            <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="md:col-span-2 space-y-1.5">
                      <Label className="text-xs font-medium">Message</Label>
                      <Input value={msgContent} onChange={(e) => setMsgContent(e.target.value)} placeholder="Type your message..." className="h-9" />
                    </div>
                  </div>
                  <div className="flex items-center justify-end">
                    <Button size="sm" onClick={sendMessage} disabled={sendingMsg || !msgContent.trim() || !msgTargetPeer} className="h-9 text-xs gap-1.5 min-w-[150px]">
                      {sendingMsg ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowUpRight className="h-3.5 w-3.5" />}
                      Send
                    </Button>
                  </div>
                </div>

                {/* Messages List */}
                <div className="rounded-xl border bg-card p-5 space-y-3">
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Message Log</h4>
                  {loadingMessages ? (
                    <div className="flex items-center justify-center py-8 text-muted-foreground">
                      <Loader2 className="h-5 w-5 animate-spin mr-2" />
                      Loading messages...
                    </div>
                  ) : messages.length === 0 ? (
                    <div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
                      <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-30" />
                      <p className="text-sm">No messages yet</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {messages.map((msg) => (
                        <div key={msg.id} className={cn("rounded-lg p-3 flex items-start gap-3", msg.direction === "inbound" ? "bg-green-500/5 border border-green-500/20" : "bg-emerald-500/5 border border-emerald-500/20")}>
                          {msg.direction === "inbound" ? <ArrowDownLeft className="h-4 w-4 text-green-400 shrink-0 mt-0.5" /> : <ArrowUpRight className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />}
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-medium">{msg.peerName}</span>
                              <Badge variant="outline" className="h-4 text-[9px]">{msg.type}</Badge>
                            </div>
                            <p className="text-xs mt-1">{msg.content}</p>
                          </div>
                          <span className="text-[10px] text-muted-foreground shrink-0">{msg.timestamp}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </ScrollArea>
          </TabsContent>

          {/* ═══ TRUST TAB ═══ */}
          <TabsContent value="trust" className="flex-1 min-h-0 mt-0 overflow-y-auto">
            <ScrollArea className="h-[calc(90vh-200px)]">
              <div className="space-y-5 p-1 pr-4">
                {/* Trust Score Visualization */}
                <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-5 space-y-3">
                  <h4 className="text-sm font-semibold flex items-center gap-2 text-emerald-400">
                    <Shield className="h-4 w-4" />
                    Trust Scores
                  </h4>
                  {peers.length === 0 ? (
                    <div className="text-center text-xs text-muted-foreground py-4">No peers to display</div>
                  ) : (
                    <div className="space-y-3">
                      {peers.map((peer) => (
                        <div key={peer.id} className="flex items-center gap-3">
                          <span className="text-xs font-medium w-32 truncate">{peer.name}</span>
                          <div className="flex-1 h-3 bg-muted rounded-full overflow-hidden">
                            <div
                              className={cn("h-full rounded-full transition-all", peer.trustScore >= 0.8 ? "bg-emerald-500" : peer.trustScore >= 0.5 ? "bg-amber-500" : "bg-red-500")}
                              style={{ width: `${peer.trustScore * 100}%` }}
                            />
                          </div>
                          <span className="text-xs font-bold w-12 text-right">{(peer.trustScore * 100).toFixed(0)}%</span>
                          <Button variant="outline" size="sm" className="h-6 text-[9px] gap-1" onClick={() => piiScan(peer.id)} disabled={scanningPeerId === peer.id}>
                            {scanningPeerId === peer.id ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <Scan className="h-2.5 w-2.5" />}
                            PII Scan
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* PII Scan Results */}
                <div className="rounded-xl border bg-card p-5 space-y-3">
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">PII Scan Results</h4>
                  {loadingTrust ? (
                    <div className="flex items-center justify-center py-8 text-muted-foreground">
                      <Loader2 className="h-5 w-5 animate-spin mr-2" />
                      Loading...
                    </div>
                  ) : piiResults.length === 0 ? (
                    <div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
                      <Scan className="h-8 w-8 mx-auto mb-2 opacity-30" />
                      <p className="text-sm">No PII scans yet</p>
                      <p className="text-xs mt-1">Run a PII scan on a peer above</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {piiResults.map((result) => (
                        <div key={result.id} className="flex items-center gap-3 rounded-lg bg-muted/30 p-3">
                          {result.status === "clean" ? <CheckCircle2 className="h-4 w-4 text-emerald-400" /> : <XCircle className="h-4 w-4 text-red-400" />}
                          <div className="min-w-0 flex-1">
                            <span className="text-xs font-medium">Peer: {result.peerId}</span>
                            <span className="text-[10px] text-muted-foreground ml-2">{result.scanType}</span>
                          </div>
                          <Badge className={cn("h-5 text-[10px] border", result.status === "clean" ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" : "bg-red-500/15 text-red-400 border-red-500/30")}>
                            {result.findings} findings
                          </Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

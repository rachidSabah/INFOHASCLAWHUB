"use client";

import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Users, Plus, LogIn, LogOut, Loader2, UserCircle } from "lucide-react";

interface Props { open: boolean; onOpenChange: (open: boolean) => void; }

interface CollabSession {
  id: string; name: string; hostId: string; peers: string; status: string; sharedAgent?: string; createdAt: string;
}

export function CollaborationPanel({ open, onOpenChange }: Props) {
  const [sessions, setSessions] = useState<CollabSession[]>([]);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ name: "", hostId: "user-1" });

  const fetchSessions = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/collab");
      if (res.ok) { const d = await res.json(); setSessions(d.sessions || []); }
    } catch { toast.error("Failed to fetch sessions"); }
    setLoading(false);
  };

  useEffect(() => { if (open) fetchSessions(); }, [open]);

  const handleCreate = async () => {
    if (!form.name) { toast.error("Session name required"); return; }
    try {
      const res = await fetch("/api/collab", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      if (res.ok) { toast.success("Session created"); setForm({ name: "", hostId: "user-1" }); fetchSessions(); }
      else { const e = await res.json(); toast.error(e.error || "Failed"); }
    } catch { toast.error("Failed to create session"); }
  };

  const handleEnd = async (id: string) => {
    try {
      await fetch(`/api/collab`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "end", sessionId: id }) });
      toast.success("Session ended"); fetchSessions();
    } catch { toast.error("Failed"); }
  };

  const parsePeers = (peersStr: string) => {
    try { return JSON.parse(peersStr); } catch { return []; }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Users className="h-5 w-5 text-indigo-500" />Real-Time Collaboration</DialogTitle>
          <DialogDescription>Create and manage collaborative sessions</DialogDescription>
        </DialogHeader>
        <Tabs defaultValue="sessions">
          <TabsList className="grid w-full grid-cols-2"><TabsTrigger value="sessions">Sessions</TabsTrigger><TabsTrigger value="create">Create</TabsTrigger></TabsList>
          <TabsContent value="sessions">
            <ScrollArea className="h-[55vh]">
              {loading ? <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div> :
                sessions.length === 0 ? <div className="text-center py-8 text-muted-foreground"><Users className="h-8 w-8 mx-auto mb-2 opacity-50" />No active sessions</div> :
                sessions.map(s => {
                  const peers = parsePeers(s.peers);
                  return (
                    <div key={s.id} className="border rounded-lg p-3 mb-2">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <UserCircle className="h-4 w-4 text-indigo-500" />
                          <span className="font-medium text-sm">{s.name}</span>
                          <Badge variant={s.status === "active" ? "default" : "secondary"} className="text-[10px]">{s.status}</Badge>
                        </div>
                        <div className="flex gap-1.5">
                          <Button size="sm" variant="outline" className="h-7 text-xs"><LogIn className="h-3 w-3 mr-1" />Join</Button>
                          <Button size="sm" variant="ghost" className="h-7 text-xs text-red-500" onClick={() => handleEnd(s.id)}><LogOut className="h-3 w-3 mr-1" />End</Button>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>Host: {s.hostId}</span>
                        <span>•</span>
                        <span>{peers.length} peer{peers.length !== 1 ? "s" : ""}</span>
                        <span>•</span>
                        <span>{new Date(s.createdAt).toLocaleString()}</span>
                      </div>
                      {peers.length > 0 && (
                        <div className="flex gap-1.5 mt-2 flex-wrap">
                          {peers.map((p: any, i: number) => (
                            <Badge key={i} variant="outline" className="text-[10px]" style={{ borderColor: p.color || "#6b7280" }}>
                              <UserCircle className="h-2.5 w-2.5 mr-1" style={{ color: p.color || "#6b7280" }} />{p.name || p.id}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })
              }
            </ScrollArea>
          </TabsContent>
          <TabsContent value="create">
            <div className="space-y-3 max-w-md">
              <div><Label>Session Name</Label><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="My collaborative session" /></div>
              <div><Label>Host ID</Label><Input value={form.hostId} onChange={e => setForm(f => ({ ...f, hostId: e.target.value }))} /></div>
              <Button onClick={handleCreate}><Plus className="h-4 w-4 mr-2" />Create Session</Button>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

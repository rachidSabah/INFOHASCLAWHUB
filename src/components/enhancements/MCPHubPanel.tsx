"use client";

import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Puzzle, Server, Wrench, Plus, Trash2, Power, Loader2, CheckCircle2, XCircle, Globe, Terminal as TerminalIcon } from "lucide-react";

interface Props { open: boolean; onOpenChange: (open: boolean) => void; }

interface MCPEntry {
  id: string; name: string; description: string; version: string; author: string;
  transport: string; endpoint?: string; capabilities: string; authType?: string;
  isEnabled: boolean; isVerified: boolean; rating: number; installs: number;
}

interface MCPServer { name: string; status: string; toolCount: number; }
interface MCPTool { name: string; description: string; serverName: string; }

export function MCPHubPanel({ open, onOpenChange }: Props) {
  const [entries, setEntries] = useState<MCPEntry[]>([]);
  const [servers, setServers] = useState<MCPServer[]>([]);
  const [tools, setTools] = useState<MCPTool[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", version: "1.0.0", author: "", transport: "stdio", endpoint: "", capabilities: "", authType: "none" });

  const fetchEntries = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/mcp-registry");
      if (res.ok) { const data = await res.json(); setEntries(data.entries || []); }
    } catch { toast.error("Failed to fetch MCP registry"); }
    setLoading(false);
  };

  const fetchServers = async () => {
    try {
      const res = await fetch("/api/mcp/servers");
      if (res.ok) { const data = await res.json(); setServers(data.servers || data || []); }
    } catch { /* ignore */ }
  };

  const fetchTools = async () => {
    try {
      const res = await fetch("/api/mcp/tools");
      if (res.ok) { const data = await res.json(); setTools(data.tools || data || []); }
    } catch { /* ignore */ }
  };

  useEffect(() => { if (open) { fetchEntries(); fetchServers(); fetchTools(); } }, [open]);

  const handleAdd = async () => {
    if (!form.name || !form.description) { toast.error("Name and description required"); return; }
    try {
      const res = await fetch("/api/mcp-registry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, capabilities: form.capabilities.split(",").map(s => s.trim()).filter(Boolean) }),
      });
      if (res.ok) { toast.success("MCP server registered"); setShowAddForm(false); setForm({ name: "", description: "", version: "1.0.0", author: "", transport: "stdio", endpoint: "", capabilities: "", authType: "none" }); fetchEntries(); }
      else { const e = await res.json(); toast.error(e.error || "Failed"); }
    } catch { toast.error("Failed to register"); }
  };

  const handleToggle = async (name: string, isEnabled: boolean) => {
    try {
      await fetch(`/api/mcp-registry/${encodeURIComponent(name)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ isEnabled: !isEnabled }) });
      fetchEntries();
    } catch { toast.error("Failed to toggle"); }
  };

  const handleDelete = async (name: string) => {
    try {
      await fetch(`/api/mcp-registry/${encodeURIComponent(name)}`, { method: "DELETE" });
      toast.success("Deleted"); fetchEntries();
    } catch { toast.error("Failed to delete"); }
  };

  const transportIcon = (t: string) => t === "stdio" ? TerminalIcon : Globe;
  const transportColor = (t: string) => t === "stdio" ? "text-amber-500" : t === "http" ? "text-blue-500" : "text-purple-500";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Puzzle className="h-5 w-5 text-purple-500" />MCP Hub</DialogTitle>
          <DialogDescription>Model Context Protocol registry, servers & tools</DialogDescription>
        </DialogHeader>
        <Tabs defaultValue="registry">
          <TabsList className="grid w-full grid-cols-3"><TabsTrigger value="registry">Registry</TabsTrigger><TabsTrigger value="servers">Servers</TabsTrigger><TabsTrigger value="tools">Tools</TabsTrigger></TabsList>
          <TabsContent value="registry">
            <div className="flex justify-between items-center mb-3">
              <span className="text-sm text-muted-foreground">{entries.length} registered servers</span>
              <Button size="sm" onClick={() => setShowAddForm(!showAddForm)}><Plus className="h-3.5 w-3.5 mr-1" />Add Server</Button>
            </div>
            {showAddForm && (
              <div className="border rounded-lg p-3 mb-3 space-y-2 bg-muted/20">
                <div className="grid grid-cols-2 gap-2">
                  <div><Label className="text-xs">Name</Label><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="my-mcp-server" /></div>
                  <div><Label className="text-xs">Version</Label><Input value={form.version} onChange={e => setForm(f => ({ ...f, version: e.target.value }))} /></div>
                  <div><Label className="text-xs">Author</Label><Input value={form.author} onChange={e => setForm(f => ({ ...f, author: e.target.value }))} /></div>
                  <div><Label className="text-xs">Transport</Label>
                    <Select value={form.transport} onValueChange={v => setForm(f => ({ ...f, transport: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="stdio">stdio</SelectItem><SelectItem value="http">http</SelectItem><SelectItem value="websocket">websocket</SelectItem></SelectContent>
                    </Select>
                  </div>
                </div>
                <div><Label className="text-xs">Description</Label><Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} /></div>
                <div><Label className="text-xs">Endpoint (for http/ws)</Label><Input value={form.endpoint} onChange={e => setForm(f => ({ ...f, endpoint: e.target.value }))} placeholder="https://..." /></div>
                <div><Label className="text-xs">Capabilities (comma-separated)</Label><Input value={form.capabilities} onChange={e => setForm(f => ({ ...f, capabilities: e.target.value }))} placeholder="search, code, file" /></div>
                <Button size="sm" onClick={handleAdd}>Register</Button>
              </div>
            )}
            <ScrollArea className="h-[50vh]">
              {loading ? <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div> :
                entries.length === 0 ? <div className="text-center py-8 text-muted-foreground"><Puzzle className="h-8 w-8 mx-auto mb-2 opacity-50" />No MCP servers registered</div> :
                entries.map(e => {
                  const TIcon = transportIcon(e.transport);
                  return (
                    <div key={e.id} className="border rounded-lg p-3 mb-2 flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <TIcon className={`h-4 w-4 ${transportColor(e.transport)}`} />
                          <span className="font-medium text-sm">{e.name}</span>
                          <Badge variant="outline" className="text-[10px]">{e.transport}</Badge>
                          <Badge variant="outline" className="text-[10px]">v{e.version}</Badge>
                          {e.isVerified && <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />}
                        </div>
                        <p className="text-xs text-muted-foreground truncate">{e.description}</p>
                        <div className="flex items-center gap-2 mt-1 text-[10px] text-muted-foreground">
                          <span>by {e.author}</span>
                          <span>★ {e.rating.toFixed(1)}</span>
                          <span>{e.installs} installs</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <Switch checked={e.isEnabled} onCheckedChange={() => handleToggle(e.name, e.isEnabled)} />
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDelete(e.name)}><Trash2 className="h-3.5 w-3.5 text-red-500" /></Button>
                      </div>
                    </div>
                  );
                })
              }
            </ScrollArea>
          </TabsContent>
          <TabsContent value="servers">
            <ScrollArea className="h-[55vh]">
              {servers.length === 0 ? <div className="text-center py-8 text-muted-foreground"><Server className="h-8 w-8 mx-auto mb-2 opacity-50" />No connected MCP servers</div> :
                servers.map((s, i) => (
                  <div key={i} className="border rounded-lg p-3 mb-2 flex items-center justify-between">
                    <div><span className="font-medium text-sm">{s.name}</span><div className="text-xs text-muted-foreground">{s.toolCount || 0} tools available</div></div>
                    <Badge variant={s.status === "connected" ? "default" : "secondary"} className="text-xs">{s.status}</Badge>
                  </div>
                ))
              }
            </ScrollArea>
          </TabsContent>
          <TabsContent value="tools">
            <ScrollArea className="h-[55vh]">
              {tools.length === 0 ? <div className="text-center py-8 text-muted-foreground"><Wrench className="h-8 w-8 mx-auto mb-2 opacity-50" />No MCP tools available</div> :
                tools.map((t, i) => (
                  <div key={i} className="border rounded-lg p-3 mb-2">
                    <div className="flex items-center gap-2 mb-1"><Wrench className="h-3.5 w-3.5 text-amber-500" /><span className="font-medium text-sm">{t.name}</span><Badge variant="outline" className="text-[10px]">{t.serverName}</Badge></div>
                    <p className="text-xs text-muted-foreground">{t.description}</p>
                  </div>
                ))
              }
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

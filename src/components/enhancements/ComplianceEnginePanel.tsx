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
import { Shield, FileText, Scan, AlertTriangle, CheckCircle2, Plus, Trash2, Loader2, XCircle } from "lucide-react";

interface Props { open: boolean; onOpenChange: (open: boolean) => void; }

interface AuditEntry { id: string; actor: string; action: string; resource: string; result: string; risk: string; details?: string; createdAt: string; }
interface Policy { id: string; name: string; description: string; ruleType: string; config: string; severity: string; isEnabled: boolean; }

export function ComplianceEnginePanel({ open, onOpenChange }: Props) {
  const [logs, setLogs] = useState<AuditEntry[]>([]);
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [loading, setLoading] = useState(false);
  const [scanResults, setScanResults] = useState<any>(null);
  const [complianceResults, setComplianceResults] = useState<any>(null);
  const [showLogForm, setShowLogForm] = useState(false);
  const [showPolicyForm, setShowPolicyForm] = useState(false);
  const [logForm, setLogForm] = useState({ actor: "", action: "", resource: "", result: "success", risk: "low", details: "" });
  const [policyForm, setPolicyForm] = useState({ name: "", description: "", ruleType: "rbac", config: "{}", severity: "medium" });
  const [filters, setFilters] = useState({ actor: "", action: "", risk: "" });

  const fetchLogs = async () => {
    try {
      const params = new URLSearchParams();
      if (filters.actor) params.set("actor", filters.actor);
      if (filters.action) params.set("action", filters.action);
      if (filters.risk) params.set("risk", filters.risk);
      const res = await fetch(`/api/compliance?${params}`);
      if (res.ok) { const d = await res.json(); setLogs(d.logs || []); }
    } catch { /* ignore */ }
  };

  const fetchPolicies = async () => {
    try {
      const res = await fetch("/api/compliance/policies");
      if (res.ok) { const d = await res.json(); setPolicies(d.policies || []); }
    } catch { /* ignore */ }
  };

  useEffect(() => { if (open) { fetchLogs(); fetchPolicies(); } }, [open]);

  const handleCreateLog = async () => {
    try {
      const res = await fetch("/api/compliance", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(logForm) });
      if (res.ok) { toast.success("Audit entry created"); setShowLogForm(false); fetchLogs(); }
    } catch { toast.error("Failed"); }
  };

  const handleCreatePolicy = async () => {
    try {
      const res = await fetch("/api/compliance/policies", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(policyForm) });
      if (res.ok) { toast.success("Policy created"); setShowPolicyForm(false); fetchPolicies(); }
    } catch { toast.error("Failed"); }
  };

  const handleScan = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/codebase/security", { method: "GET" });
      if (res.ok) setScanResults(await res.json());
      else toast.error("Scan failed");
    } catch { toast.error("Scan error"); }
    setLoading(false);
  };

  const handleCompliance = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/security/compliance", { method: "GET" });
      if (res.ok) setComplianceResults(await res.json());
      else toast.error("Compliance check failed");
    } catch { toast.error("Check error"); }
    setLoading(false);
  };

  const riskColor = (r: string) => r === "critical" ? "bg-red-500" : r === "high" ? "bg-orange-500" : r === "medium" ? "bg-amber-500" : "bg-green-500";
  const resultIcon = (r: string) => r === "success" ? <CheckCircle2 className="h-3.5 w-3.5 text-green-500" /> : r === "denied" ? <XCircle className="h-3.5 w-3.5 text-red-500" /> : <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Shield className="h-5 w-5 text-red-500" />Compliance Engine</DialogTitle>
          <DialogDescription>Audit logs, policies & security scanning</DialogDescription>
        </DialogHeader>
        <Tabs defaultValue="audit">
          <TabsList className="grid w-full grid-cols-3"><TabsTrigger value="audit">Audit Log</TabsTrigger><TabsTrigger value="policies">Policies</TabsTrigger><TabsTrigger value="scan">Scan</TabsTrigger></TabsList>

          <TabsContent value="audit">
            <div className="flex gap-2 mb-3 flex-wrap items-center">
              <Input placeholder="Filter actor" className="w-32 h-8 text-xs" value={filters.actor} onChange={e => setFilters(f => ({ ...f, actor: e.target.value }))} />
              <Input placeholder="Filter action" className="w-32 h-8 text-xs" value={filters.action} onChange={e => setFilters(f => ({ ...f, action: e.target.value }))} />
              <Select value={filters.risk || "all"} onValueChange={v => setFilters(f => ({ ...f, risk: v === "all" ? "" : v }))}>
                <SelectTrigger className="w-28 h-8 text-xs"><SelectValue placeholder="Risk" /></SelectTrigger>
                <SelectContent><SelectItem value="all">All Risks</SelectItem><SelectItem value="low">Low</SelectItem><SelectItem value="medium">Medium</SelectItem><SelectItem value="high">High</SelectItem><SelectItem value="critical">Critical</SelectItem></SelectContent>
              </Select>
              <Button size="sm" variant="outline" className="h-8" onClick={fetchLogs}>Filter</Button>
              <div className="flex-1" />
              <Button size="sm" onClick={() => setShowLogForm(!showLogForm)}><Plus className="h-3.5 w-3.5 mr-1" />Log Entry</Button>
            </div>
            {showLogForm && (
              <div className="border rounded-lg p-3 mb-3 space-y-2 bg-muted/20">
                <div className="grid grid-cols-2 gap-2">
                  <div><Label className="text-xs">Actor</Label><Input value={logForm.actor} onChange={e => setLogForm(f => ({ ...f, actor: e.target.value }))} /></div>
                  <div><Label className="text-xs">Action</Label><Input value={logForm.action} onChange={e => setLogForm(f => ({ ...f, action: e.target.value }))} /></div>
                  <div><Label className="text-xs">Resource</Label><Input value={logForm.resource} onChange={e => setLogForm(f => ({ ...f, resource: e.target.value }))} /></div>
                  <div><Label className="text-xs">Result</Label>
                    <Select value={logForm.result} onValueChange={v => setLogForm(f => ({ ...f, result: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="success">Success</SelectItem><SelectItem value="denied">Denied</SelectItem><SelectItem value="error">Error</SelectItem></SelectContent>
                    </Select>
                  </div>
                </div>
                <div><Label className="text-xs">Details (JSON)</Label><Textarea value={logForm.details} onChange={e => setLogForm(f => ({ ...f, details: e.target.value }))} rows={2} /></div>
                <Button size="sm" onClick={handleCreateLog}>Create Entry</Button>
              </div>
            )}
            <ScrollArea className="h-[45vh]">
              {logs.length === 0 ? <div className="text-center py-8 text-muted-foreground"><FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />No audit entries</div> :
                logs.map(l => (
                  <div key={l.id} className="border rounded-lg p-2.5 mb-1.5 flex items-center gap-3">
                    {resultIcon(l.result)}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2"><span className="font-medium text-xs">{l.actor}</span><span className="text-xs text-muted-foreground">{l.action}</span><span className="text-xs text-muted-foreground truncate">{l.resource}</span></div>
                      <span className="text-[10px] text-muted-foreground">{new Date(l.createdAt).toLocaleString()}</span>
                    </div>
                    <Badge className={`text-[10px] text-white ${riskColor(l.risk)}`}>{l.risk}</Badge>
                  </div>
                ))
              }
            </ScrollArea>
          </TabsContent>

          <TabsContent value="policies">
            <div className="flex justify-between items-center mb-3">
              <span className="text-sm text-muted-foreground">{policies.length} policies</span>
              <Button size="sm" onClick={() => setShowPolicyForm(!showPolicyForm)}><Plus className="h-3.5 w-3.5 mr-1" />Add Policy</Button>
            </div>
            {showPolicyForm && (
              <div className="border rounded-lg p-3 mb-3 space-y-2 bg-muted/20">
                <div className="grid grid-cols-2 gap-2">
                  <div><Label className="text-xs">Name</Label><Input value={policyForm.name} onChange={e => setPolicyForm(f => ({ ...f, name: e.target.value }))} /></div>
                  <div><Label className="text-xs">Rule Type</Label>
                    <Select value={policyForm.ruleType} onValueChange={v => setPolicyForm(f => ({ ...f, ruleType: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="rbac">RBAC</SelectItem><SelectItem value="data_access">Data Access</SelectItem><SelectItem value="secret_scan">Secret Scan</SelectItem><SelectItem value="gdpr">GDPR</SelectItem><SelectItem value="soc2">SOC2</SelectItem><SelectItem value="custom">Custom</SelectItem></SelectContent>
                    </Select>
                  </div>
                </div>
                <div><Label className="text-xs">Description</Label><Input value={policyForm.description} onChange={e => setPolicyForm(f => ({ ...f, description: e.target.value }))} /></div>
                <div><Label className="text-xs">Config (JSON)</Label><Textarea value={policyForm.config} onChange={e => setPolicyForm(f => ({ ...f, config: e.target.value }))} rows={2} className="font-mono text-xs" /></div>
                <Button size="sm" onClick={handleCreatePolicy}>Create Policy</Button>
              </div>
            )}
            <ScrollArea className="h-[45vh]">
              {policies.length === 0 ? <div className="text-center py-8 text-muted-foreground"><Shield className="h-8 w-8 mx-auto mb-2 opacity-50" />No compliance policies</div> :
                policies.map(p => (
                  <div key={p.id} className="border rounded-lg p-3 mb-2 flex items-center justify-between">
                    <div><div className="flex items-center gap-2 mb-1"><span className="font-medium text-sm">{p.name}</span><Badge variant="outline" className="text-[10px]">{p.ruleType}</Badge><Badge className={`text-[10px] text-white ${riskColor(p.severity)}`}>{p.severity}</Badge></div><p className="text-xs text-muted-foreground">{p.description}</p></div>
                    <Switch checked={p.isEnabled} disabled />
                  </div>
                ))
              }
            </ScrollArea>
          </TabsContent>

          <TabsContent value="scan">
            <div className="space-y-4">
              <div className="flex gap-3">
                <Button onClick={handleScan} disabled={loading}>{loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Scan className="h-4 w-4 mr-2" />}Security Scan</Button>
                <Button onClick={handleCompliance} disabled={loading} variant="outline">{loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Shield className="h-4 w-4 mr-2" />}Compliance Check</Button>
              </div>
              {scanResults && (
                <div className="border rounded-lg p-3">
                  <h4 className="font-medium text-sm mb-2 flex items-center gap-2"><Scan className="h-4 w-4 text-amber-500" />Security Scan Results</h4>
                  <pre className="text-xs bg-muted/50 p-2 rounded overflow-auto max-h-40">{JSON.stringify(scanResults, null, 2)}</pre>
                </div>
              )}
              {complianceResults && (
                <div className="border rounded-lg p-3">
                  <h4 className="font-medium text-sm mb-2 flex items-center gap-2"><Shield className="h-4 w-4 text-red-500" />Compliance Check Results</h4>
                  <pre className="text-xs bg-muted/50 p-2 rounded overflow-auto max-h-40">{JSON.stringify(complianceResults, null, 2)}</pre>
                </div>
              )}
              {!scanResults && !complianceResults && <div className="text-center py-8 text-muted-foreground"><Shield className="h-8 w-8 mx-auto mb-2 opacity-50" />Run a scan to see results</div>}
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

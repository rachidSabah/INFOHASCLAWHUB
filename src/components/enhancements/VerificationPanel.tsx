"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
  ShieldCheck,
  FileCheck,
  Plus,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  Key,
  Download,
  Upload,
  Scan,
  FileText,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ───────────────────────────────────────────────────────────────────

type WitnessStatus = "verified" | "pending" | "failed";
type VerifyResult = "verified" | "tampered" | "unknown";

interface Witness {
  id: string;
  fileName: string;
  filePath: string;
  hash: string;
  status: WitnessStatus;
  witnessCount: number;
  lastVerified: string;
  createdAt: string;
}

interface VerificationReport {
  id: string;
  fileName: string;
  result: VerifyResult;
  witnessIds: string[];
  timestamp: string;
  details: string;
}

interface VerificationKey {
  id: string;
  algorithm: string;
  publicKey: string;
  createdAt: string;
  active: boolean;
}

interface VerificationPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function witnessStatusColor(status: WitnessStatus) {
  switch (status) {
    case "verified":
      return "bg-emerald-500/15 text-emerald-400 border-emerald-500/30";
    case "pending":
      return "bg-amber-500/15 text-amber-400 border-amber-500/30";
    case "failed":
      return "bg-red-500/15 text-red-400 border-red-500/30";
    default:
      return "bg-zinc-500/15 text-zinc-400 border-zinc-500/30";
  }
}

function verifyResultColor(result: VerifyResult) {
  switch (result) {
    case "verified":
      return "bg-emerald-500/15 text-emerald-400 border-emerald-500/30";
    case "tampered":
      return "bg-red-500/15 text-red-400 border-red-500/30";
    case "unknown":
      return "bg-amber-500/15 text-amber-400 border-amber-500/30";
    default:
      return "bg-zinc-500/15 text-zinc-400 border-zinc-500/30";
  }
}

function verifyResultIcon(result: VerifyResult) {
  switch (result) {
    case "verified":
      return <CheckCircle2 className="h-4 w-4 text-emerald-400" />;
    case "tampered":
      return <XCircle className="h-4 w-4 text-red-400" />;
    case "unknown":
      return <Clock className="h-4 w-4 text-amber-400" />;
    default:
      return <Clock className="h-4 w-4 text-zinc-400" />;
  }
}

// ─── Component ───────────────────────────────────────────────────────────────

export function VerificationPanel({ open, onOpenChange }: VerificationPanelProps) {
  const [activeTab, setActiveTab] = useState("witnesses");

  // ══ Witnesses Tab State ══
  const [witnesses, setWitnesses] = useState<Witness[]>([]);
  const [loadingWitnesses, setLoadingWitnesses] = useState(false);
  const [newWitnessPath, setNewWitnessPath] = useState("");
  const [creatingWitness, setCreatingWitness] = useState(false);

  // ══ Verify Tab State ══
  const [verifyWitnessIds, setVerifyWitnessIds] = useState<string[]>([]);
  const [verifying, setVerifying] = useState(false);
  const [verifyResults, setVerifyResults] = useState<Array<{ witnessId: string; fileName: string; result: VerifyResult }>>([]);

  // ══ Reports Tab State ══
  const [reports, setReports] = useState<VerificationReport[]>([]);
  const [loadingReports, setLoadingReports] = useState(false);
  const [generatingReport, setGeneratingReport] = useState(false);
  const [keys, setKeys] = useState<VerificationKey[]>([]);
  const [loadingKeys, setLoadingKeys] = useState(false);
  const [generatingKey, setGeneratingKey] = useState(false);

  // ── Fetch data on open ──
  const fetchWitnesses = useCallback(async () => {
    setLoadingWitnesses(true);
    try {
      const res = await fetch("/api/verification/witnesses");
      if (res.ok) {
        const data = await res.json();
        setWitnesses(data.witnesses || []);
      }
    } catch {
      toast.error("Failed to load witnesses");
    } finally {
      setLoadingWitnesses(false);
    }
  }, []);

  const fetchReports = useCallback(async () => {
    setLoadingReports(true);
    try {
      const res = await fetch("/api/verification/reports");
      if (res.ok) {
        const data = await res.json();
        setReports(data.reports || []);
      }
    } catch {
      toast.error("Failed to load reports");
    } finally {
      setLoadingReports(false);
    }
  }, []);

  const fetchKeys = useCallback(async () => {
    setLoadingKeys(true);
    try {
      const res = await fetch("/api/verification/keys");
      if (res.ok) {
        const data = await res.json();
        setKeys(data.keys || []);
      }
    } catch {
      toast.error("Failed to load keys");
    } finally {
      setLoadingKeys(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      fetchWitnesses();
      fetchReports();
      fetchKeys();
    }
  }, [open, fetchWitnesses, fetchReports, fetchKeys]);

  // ── Create Witness ──
  const createWitness = async () => {
    if (!newWitnessPath.trim()) {
      toast.error("File path is required");
      return;
    }
    setCreatingWitness(true);
    try {
      const res = await fetch("/api/verification/witnesses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filePath: newWitnessPath.trim() }),
      });
      if (res.ok) {
        toast.success("Witness created");
        setNewWitnessPath("");
        fetchWitnesses();
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to create witness");
      }
    } catch {
      toast.error("Failed to create witness");
    } finally {
      setCreatingWitness(false);
    }
  };

  // ── Batch Verify ──
  const batchVerify = async () => {
    if (verifyWitnessIds.length === 0) {
      toast.error("Select at least one witness to verify");
      return;
    }
    setVerifying(true);
    setVerifyResults([]);
    try {
      const res = await fetch("/api/verification/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ witnessIds: verifyWitnessIds }),
      });
      if (res.ok) {
        const data = await res.json();
        setVerifyResults(data.results || []);
        toast.success("Verification complete");
      } else {
        const data = await res.json();
        toast.error(data.error || "Verification failed");
      }
    } catch {
      toast.error("Verification failed");
    } finally {
      setVerifying(false);
    }
  };

  // ── Generate Report ──
  const generateReport = async () => {
    setGeneratingReport(true);
    try {
      const res = await fetch("/api/verification/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ witnessIds: verifyWitnessIds }),
      });
      if (res.ok) {
        toast.success("Report generated");
        fetchReports();
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to generate report");
      }
    } catch {
      toast.error("Failed to generate report");
    } finally {
      setGeneratingReport(false);
    }
  };

  // ── Generate Key ──
  const generateKey = async () => {
    setGeneratingKey(true);
    try {
      const res = await fetch("/api/verification/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (res.ok) {
        toast.success("Key generated");
        fetchKeys();
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to generate key");
      }
    } catch {
      toast.error("Failed to generate key");
    } finally {
      setGeneratingKey(false);
    }
  };

  // ── Toggle Witness Selection ──
  const toggleWitnessSelection = (witnessId: string) => {
    setVerifyWitnessIds((prev) =>
      prev.includes(witnessId) ? prev.filter((id) => id !== witnessId) : [...prev, witnessId]
    );
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════════

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-5xl max-h-[92vh] overflow-hidden flex flex-col" showCloseButton>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-gradient-to-br from-green-500/20 to-emerald-500/20 border border-green-500/30">
              <ShieldCheck className="h-4 w-4 text-green-400" />
            </div>
            Verification
          </DialogTitle>
          <DialogDescription>
            Create witnesses, verify files, generate reports, and manage verification keys
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
          <TabsList className="grid w-full grid-cols-3 mb-1 shrink-0">
            <TabsTrigger value="witnesses" className="gap-1.5 text-xs">
              <FileCheck className="h-3.5 w-3.5" />
              Witnesses
            </TabsTrigger>
            <TabsTrigger value="verify" className="gap-1.5 text-xs">
              <Scan className="h-3.5 w-3.5" />
              Verify
            </TabsTrigger>
            <TabsTrigger value="reports" className="gap-1.5 text-xs">
              <FileText className="h-3.5 w-3.5" />
              Reports
            </TabsTrigger>
          </TabsList>

          {/* ═══ WITNESSES TAB ═══ */}
          <TabsContent value="witnesses" className="flex-1 min-h-0 mt-0 overflow-y-auto">
            <ScrollArea className="h-[calc(90vh-200px)]">
              <div className="space-y-5 p-1 pr-4">
                {/* Create Witness */}
                <div className="rounded-xl border bg-card p-5 space-y-4">
                  <h4 className="text-sm font-semibold flex items-center gap-2">
                    <Plus className="h-4 w-4 text-green-400" />
                    Create Witness
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="md:col-span-2 space-y-1.5">
                      <Label className="text-xs font-medium">File Path</Label>
                      <Input value={newWitnessPath} onChange={(e) => setNewWitnessPath(e.target.value)} placeholder="e.g., /app/config/production.yaml" className="h-9 font-mono text-xs" />
                    </div>
                    <div className="flex items-end">
                      <Button size="sm" onClick={createWitness} disabled={creatingWitness || !newWitnessPath.trim()} className="h-9 text-xs gap-1.5 w-full">
                        {creatingWitness ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                        Create Witness
                      </Button>
                    </div>
                  </div>
                </div>

                {/* Shield Status */}
                <div className="rounded-xl border border-green-500/30 bg-green-500/5 p-5 space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center h-12 w-12 rounded-xl bg-gradient-to-br from-green-500/20 to-emerald-500/20 border border-green-500/30">
                      <ShieldCheck className="h-6 w-6 text-green-400" />
                    </div>
                    <div>
                      <h4 className="text-sm font-semibold text-green-400">Verification Status</h4>
                      <p className="text-xs text-muted-foreground">
                        {witnesses.length} witnesses · {witnesses.filter((w) => w.status === "verified").length} verified · {witnesses.filter((w) => w.status === "failed").length} failed
                      </p>
                    </div>
                  </div>
                </div>

                {/* Witnesses List */}
                <div className="rounded-xl border bg-card p-5 space-y-3">
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Witness Files</h4>
                  {loadingWitnesses ? (
                    <div className="flex items-center justify-center py-8 text-muted-foreground">
                      <Loader2 className="h-5 w-5 animate-spin mr-2" />
                      Loading witnesses...
                    </div>
                  ) : witnesses.length === 0 ? (
                    <div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
                      <FileCheck className="h-8 w-8 mx-auto mb-2 opacity-30" />
                      <p className="text-sm">No witnesses found</p>
                      <p className="text-xs mt-1">Create a witness above</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {witnesses.map((witness) => (
                        <div key={witness.id} className="flex items-center gap-3 rounded-lg bg-muted/30 p-3">
                          <div className={cn("flex items-center justify-center h-8 w-8 rounded-lg shrink-0", witness.status === "verified" ? "bg-emerald-500/15 text-emerald-400" : witness.status === "failed" ? "bg-red-500/15 text-red-400" : "bg-amber-500/15 text-amber-400")}>
                            {witness.status === "verified" ? <CheckCircle2 className="h-4 w-4" /> : witness.status === "failed" ? <XCircle className="h-4 w-4" /> : <Clock className="h-4 w-4" />}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-xs font-medium">{witness.fileName}</div>
                            <div className="text-[10px] text-muted-foreground font-mono truncate">{witness.filePath}</div>
                          </div>
                          <Badge className={cn("h-5 text-[10px] border", witnessStatusColor(witness.status))}>
                            {witness.status}
                          </Badge>
                          <span className="text-[10px] text-muted-foreground">{witness.witnessCount} witnesses</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </ScrollArea>
          </TabsContent>

          {/* ═══ VERIFY TAB ═══ */}
          <TabsContent value="verify" className="flex-1 min-h-0 mt-0 overflow-y-auto">
            <ScrollArea className="h-[calc(90vh-200px)]">
              <div className="space-y-5 p-1 pr-4">
                {/* Select Witnesses for Verification */}
                <div className="rounded-xl border bg-card p-5 space-y-4">
                  <h4 className="text-sm font-semibold flex items-center gap-2">
                    <Scan className="h-4 w-4 text-emerald-400" />
                    Batch Verify
                  </h4>
                  <p className="text-xs text-muted-foreground">Select witnesses to verify their file integrity</p>

                  {witnesses.length === 0 ? (
                    <div className="text-xs text-muted-foreground py-2">No witnesses available. Create witnesses first.</div>
                  ) : (
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {witnesses.map((witness) => (
                        <div
                          key={witness.id}
                          className={cn("flex items-center gap-3 rounded-lg p-3 cursor-pointer transition-colors", verifyWitnessIds.includes(witness.id) ? "bg-emerald-500/10 border border-emerald-500/30" : "bg-muted/30 hover:bg-muted/50")}
                          onClick={() => toggleWitnessSelection(witness.id)}
                        >
                          <div className={cn("h-4 w-4 rounded border flex items-center justify-center", verifyWitnessIds.includes(witness.id) ? "bg-emerald-500 border-emerald-500" : "border-muted-foreground/30")}>
                            {verifyWitnessIds.includes(witness.id) && <CheckCircle2 className="h-3 w-3 text-white" />}
                          </div>
                          <span className="text-xs font-medium">{witness.fileName}</span>
                          <Badge className={cn("h-4 text-[9px] border ml-auto", witnessStatusColor(witness.status))}>
                            {witness.status}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="flex items-center gap-2 justify-end">
                    <Button size="sm" onClick={batchVerify} disabled={verifying || verifyWitnessIds.length === 0} className="h-9 text-xs gap-1.5 min-w-[130px]">
                      {verifying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Scan className="h-3.5 w-3.5" />}
                      Verify ({verifyWitnessIds.length})
                    </Button>
                  </div>
                </div>

                {/* Verification Results */}
                {verifyResults.length > 0 && (
                  <div className="rounded-xl border border-green-500/30 bg-green-500/5 p-5 space-y-3">
                    <h4 className="text-sm font-semibold flex items-center gap-2 text-green-400">
                      <ShieldCheck className="h-4 w-4" />
                      Verification Results
                    </h4>
                    <div className="space-y-2">
                      {verifyResults.map((result, i) => (
                        <div key={i} className="flex items-center gap-3 rounded-lg bg-muted/30 p-3">
                          {verifyResultIcon(result.result)}
                          <span className="text-xs font-medium">{result.fileName}</span>
                          <Badge className={cn("h-5 text-[10px] border ml-auto", verifyResultColor(result.result))}>
                            {result.result}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </ScrollArea>
          </TabsContent>

          {/* ═══ REPORTS TAB ═══ */}
          <TabsContent value="reports" className="flex-1 min-h-0 mt-0 overflow-y-auto">
            <ScrollArea className="h-[calc(90vh-200px)]">
              <div className="space-y-5 p-1 pr-4">
                {/* Generate Report */}
                <div className="rounded-xl border bg-card p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-semibold flex items-center gap-2">
                      <FileText className="h-4 w-4 text-emerald-400" />
                      Verification Reports
                    </h4>
                    <Button size="sm" onClick={generateReport} disabled={generatingReport || verifyWitnessIds.length === 0} className="h-8 text-[10px] gap-1">
                      {generatingReport ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
                      Generate Report
                    </Button>
                  </div>
                </div>

                {/* Reports List */}
                <div className="rounded-xl border bg-card p-5 space-y-3">
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Reports</h4>
                  {loadingReports ? (
                    <div className="flex items-center justify-center py-8 text-muted-foreground">
                      <Loader2 className="h-5 w-5 animate-spin mr-2" />
                      Loading reports...
                    </div>
                  ) : reports.length === 0 ? (
                    <div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
                      <FileText className="h-8 w-8 mx-auto mb-2 opacity-30" />
                      <p className="text-sm">No verification reports</p>
                      <p className="text-xs mt-1">Select witnesses and generate a report</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {reports.map((report) => (
                        <div key={report.id} className="rounded-lg bg-muted/30 p-3 space-y-2">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              {verifyResultIcon(report.result)}
                              <span className="text-xs font-medium">{report.fileName}</span>
                            </div>
                            <Badge className={cn("h-5 text-[10px] border", verifyResultColor(report.result))}>
                              {report.result}
                            </Badge>
                          </div>
                          <div className="text-[10px] text-muted-foreground">{report.details}</div>
                          <div className="text-[10px] text-muted-foreground">{report.timestamp}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <Separator />

                {/* Key Management */}
                <div className="rounded-xl border bg-card p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-semibold flex items-center gap-2">
                      <Key className="h-4 w-4 text-green-400" />
                      Verification Keys
                    </h4>
                    <Button size="sm" onClick={generateKey} disabled={generatingKey} className="h-8 text-[10px] gap-1">
                      {generatingKey ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
                      Generate Key
                    </Button>
                  </div>
                  {loadingKeys ? (
                    <div className="flex items-center justify-center py-4 text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    </div>
                  ) : keys.length === 0 ? (
                    <div className="text-xs text-muted-foreground text-center py-4">No keys generated yet</div>
                  ) : (
                    <div className="space-y-2">
                      {keys.map((key) => (
                        <div key={key.id} className="flex items-center gap-3 rounded-lg bg-muted/30 p-3">
                          <div className={cn("flex items-center justify-center h-6 w-6 rounded-lg shrink-0", key.active ? "bg-emerald-500/15 text-emerald-400" : "bg-zinc-500/15 text-zinc-400")}>
                            <Key className="h-3 w-3" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-xs font-mono">{key.id.slice(0, 16)}...</div>
                            <div className="text-[10px] text-muted-foreground">{key.algorithm}</div>
                          </div>
                          <Badge className={cn("h-4 text-[9px] border", key.active ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" : "bg-zinc-500/15 text-zinc-400 border-zinc-500/30")}>
                            {key.active ? "Active" : "Inactive"}
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

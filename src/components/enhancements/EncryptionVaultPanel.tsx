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
  Lock,
  Unlock,
  Key,
  Plus,
  Loader2,
  Shield,
  RotateCcw,
  FileText,
  Eye,
  EyeOff,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ───────────────────────────────────────────────────────────────────

interface Vault {
  id: string;
  name: string;
  encrypted: boolean;
  recordCount: number;
  keyId: string;
  createdAt: string;
}

interface VaultRecord {
  id: string;
  vaultId: string;
  name: string;
  encrypted: boolean;
  size: number;
  updatedAt: string;
}

interface VaultKey {
  id: string;
  algorithm: string;
  createdAt: string;
  rotatedAt: string | null;
  active: boolean;
}

interface EncryptionVaultPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function EncryptionVaultPanel({ open, onOpenChange }: EncryptionVaultPanelProps) {
  const [activeTab, setActiveTab] = useState("vaults");

  // ══ Vaults Tab State ══
  const [vaults, setVaults] = useState<Vault[]>([]);
  const [loadingVaults, setLoadingVaults] = useState(false);
  const [newVaultName, setNewVaultName] = useState("");
  const [creatingVault, setCreatingVault] = useState(false);
  const [togglingVaultId, setTogglingVaultId] = useState<string | null>(null);

  // ══ Records Tab State ══
  const [records, setRecords] = useState<VaultRecord[]>([]);
  const [loadingRecords, setLoadingRecords] = useState(false);
  const [selectedVaultId, setSelectedVaultId] = useState("");
  const [newRecordName, setNewRecordName] = useState("");
  const [newRecordContent, setNewRecordContent] = useState("");
  const [addingRecord, setAddingRecord] = useState(false);
  const [processingRecordId, setProcessingRecordId] = useState<string | null>(null);
  const [decryptedContent, setDecryptedContent] = useState<Record<string, string>>({});

  // ══ Keys Tab State ══
  const [keys, setKeys] = useState<VaultKey[]>([]);
  const [loadingKeys, setLoadingKeys] = useState(false);
  const [rotatingKeyId, setRotatingKeyId] = useState<string | null>(null);

  // ── Fetch data on open ──
  const fetchVaults = useCallback(async () => {
    setLoadingVaults(true);
    try {
      const res = await fetch("/api/encryption/vaults");
      if (res.ok) {
        const data = await res.json();
        setVaults(data.vaults || []);
      }
    } catch {
      toast.error("Failed to load vaults");
    } finally {
      setLoadingVaults(false);
    }
  }, []);

  const fetchRecords = useCallback(async () => {
    if (!selectedVaultId) return;
    setLoadingRecords(true);
    try {
      const res = await fetch(`/api/encryption/records?vaultId=${selectedVaultId}`);
      if (res.ok) {
        const data = await res.json();
        setRecords(data.records || []);
      }
    } catch {
      toast.error("Failed to load records");
    } finally {
      setLoadingRecords(false);
    }
  }, [selectedVaultId]);

  const fetchKeys = useCallback(async () => {
    setLoadingKeys(true);
    try {
      const res = await fetch("/api/encryption/keys");
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
      fetchVaults();
      fetchKeys();
    }
  }, [open, fetchVaults, fetchKeys]);

  useEffect(() => {
    if (open && selectedVaultId) {
      fetchRecords();
    }
  }, [open, selectedVaultId, fetchRecords]);

  // ── Create Vault ──
  const createVault = async () => {
    if (!newVaultName.trim()) {
      toast.error("Vault name is required");
      return;
    }
    setCreatingVault(true);
    try {
      const res = await fetch("/api/encryption/vaults", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newVaultName.trim() }),
      });
      if (res.ok) {
        toast.success("Vault created");
        setNewVaultName("");
        fetchVaults();
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to create vault");
      }
    } catch {
      toast.error("Failed to create vault");
    } finally {
      setCreatingVault(false);
    }
  };

  // ── Toggle Encryption ──
  const toggleEncryption = async (vaultId: string, enable: boolean) => {
    setTogglingVaultId(vaultId);
    try {
      const res = await fetch("/api/encryption/toggle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vaultId, enable }),
      });
      if (res.ok) {
        toast.success(enable ? "Encryption enabled" : "Encryption disabled");
        fetchVaults();
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to toggle encryption");
      }
    } catch {
      toast.error("Failed to toggle encryption");
    } finally {
      setTogglingVaultId(null);
    }
  };

  // ── Add Record ──
  const addRecord = async () => {
    if (!newRecordName.trim() || !selectedVaultId) {
      toast.error("Record name and vault are required");
      return;
    }
    setAddingRecord(true);
    try {
      const res = await fetch("/api/encryption/records", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newRecordName.trim(),
          content: newRecordContent.trim(),
          vaultId: selectedVaultId,
        }),
      });
      if (res.ok) {
        toast.success("Record added");
        setNewRecordName("");
        setNewRecordContent("");
        fetchRecords();
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to add record");
      }
    } catch {
      toast.error("Failed to add record");
    } finally {
      setAddingRecord(false);
    }
  };

  // ── Encrypt/Decrypt Record ──
  const toggleRecordEncryption = async (recordId: string, encrypt: boolean) => {
    setProcessingRecordId(recordId);
    try {
      const res = await fetch("/api/encryption/records/toggle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recordId, encrypt }),
      });
      if (res.ok) {
        toast.success(encrypt ? "Record encrypted" : "Record decrypted");
        if (!encrypt) {
          const data = await res.json();
          setDecryptedContent((prev) => ({ ...prev, [recordId]: data.content || "" }));
        } else {
          setDecryptedContent((prev) => {
            const next = { ...prev };
            delete next[recordId];
            return next;
          });
        }
        fetchRecords();
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to toggle record encryption");
      }
    } catch {
      toast.error("Failed to toggle record encryption");
    } finally {
      setProcessingRecordId(null);
    }
  };

  // ── Rotate Key ──
  const rotateKey = async (keyId: string) => {
    setRotatingKeyId(keyId);
    try {
      const res = await fetch("/api/encryption/keys/rotate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keyId }),
      });
      if (res.ok) {
        toast.success("Key rotated");
        fetchKeys();
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to rotate key");
      }
    } catch {
      toast.error("Failed to rotate key");
    } finally {
      setRotatingKeyId(null);
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
            <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-gradient-to-br from-rose-500/20 to-pink-500/20 border border-rose-500/30">
              <Lock className="h-4 w-4 text-rose-400" />
            </div>
            Encryption Vault
          </DialogTitle>
          <DialogDescription>
            Create encrypted vaults, manage records, and rotate encryption keys
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
          <TabsList className="grid w-full grid-cols-3 mb-1 shrink-0">
            <TabsTrigger value="vaults" className="gap-1.5 text-xs">
              <Shield className="h-3.5 w-3.5" />
              Vaults
            </TabsTrigger>
            <TabsTrigger value="records" className="gap-1.5 text-xs">
              <FileText className="h-3.5 w-3.5" />
              Records
            </TabsTrigger>
            <TabsTrigger value="keys" className="gap-1.5 text-xs">
              <Key className="h-3.5 w-3.5" />
              Keys
            </TabsTrigger>
          </TabsList>

          {/* ═══ VAULTS TAB ═══ */}
          <TabsContent value="vaults" className="flex-1 min-h-0 mt-0 overflow-y-auto">
            <ScrollArea className="h-[calc(90vh-200px)]">
              <div className="space-y-5 p-1 pr-4">
                {/* Create Vault */}
                <div className="rounded-xl border bg-card p-5 space-y-4">
                  <h4 className="text-sm font-semibold flex items-center gap-2">
                    <Plus className="h-4 w-4 text-rose-400" />
                    Create Vault
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="md:col-span-2 space-y-1.5">
                      <Label className="text-xs font-medium">Vault Name</Label>
                      <Input value={newVaultName} onChange={(e) => setNewVaultName(e.target.value)} placeholder="e.g., credentials-vault" className="h-9" />
                    </div>
                    <div className="flex items-end">
                      <Button size="sm" onClick={createVault} disabled={creatingVault || !newVaultName.trim()} className="h-9 text-xs gap-1.5 w-full">
                        {creatingVault ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                        Create Vault
                      </Button>
                    </div>
                  </div>
                </div>

                {/* Vaults List */}
                <div className="rounded-xl border bg-card p-5 space-y-3">
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Your Vaults</h4>
                  {loadingVaults ? (
                    <div className="flex items-center justify-center py-8 text-muted-foreground">
                      <Loader2 className="h-5 w-5 animate-spin mr-2" />
                      Loading vaults...
                    </div>
                  ) : vaults.length === 0 ? (
                    <div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
                      <Lock className="h-8 w-8 mx-auto mb-2 opacity-30" />
                      <p className="text-sm">No vaults found</p>
                      <p className="text-xs mt-1">Create a vault above</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {vaults.map((vault) => (
                        <div key={vault.id} className="flex items-center gap-3 rounded-lg bg-muted/30 p-3">
                          <div className={cn("flex items-center justify-center h-8 w-8 rounded-lg", vault.encrypted ? "bg-rose-500/15 text-rose-400" : "bg-zinc-500/15 text-zinc-400")}>
                            {vault.encrypted ? <Lock className="h-4 w-4" /> : <Unlock className="h-4 w-4" />}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-medium">{vault.name}</div>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-[10px] text-muted-foreground">{vault.recordCount} records</span>
                              <Badge className={cn("h-4 text-[9px] border", vault.encrypted ? "bg-rose-500/15 text-rose-400 border-rose-500/30" : "bg-zinc-500/15 text-zinc-400 border-zinc-500/30")}>
                                {vault.encrypted ? "Encrypted" : "Unencrypted"}
                              </Badge>
                            </div>
                          </div>
                          <Button variant="outline" size="sm" className="h-7 text-[10px] gap-1" onClick={() => toggleEncryption(vault.id, !vault.encrypted)} disabled={togglingVaultId === vault.id}>
                            {togglingVaultId === vault.id ? <Loader2 className="h-3 w-3 animate-spin" /> : vault.encrypted ? <Unlock className="h-3 w-3" /> : <Lock className="h-3 w-3" />}
                            {vault.encrypted ? "Decrypt" : "Encrypt"}
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </ScrollArea>
          </TabsContent>

          {/* ═══ RECORDS TAB ═══ */}
          <TabsContent value="records" className="flex-1 min-h-0 mt-0 overflow-y-auto">
            <ScrollArea className="h-[calc(90vh-200px)]">
              <div className="space-y-5 p-1 pr-4">
                {/* Select Vault */}
                <div className="rounded-xl border bg-card p-5 space-y-4">
                  <h4 className="text-sm font-semibold flex items-center gap-2">
                    <FileText className="h-4 w-4 text-pink-400" />
                    Vault Records
                  </h4>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">Select Vault</Label>
                    <Select value={selectedVaultId} onValueChange={setSelectedVaultId}>
                      <SelectTrigger className="h-9">
                        <SelectValue placeholder="Choose a vault..." />
                      </SelectTrigger>
                      <SelectContent>
                        {vaults.map((v) => (
                          <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {selectedVaultId && (
                    <>
                      <Separator />
                      <div className="space-y-3">
                        <div className="space-y-1.5">
                          <Label className="text-xs font-medium">New Record Name</Label>
                          <Input value={newRecordName} onChange={(e) => setNewRecordName(e.target.value)} placeholder="e.g., api-key-stripe" className="h-9" />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs font-medium">Content</Label>
                          <Textarea value={newRecordContent} onChange={(e) => setNewRecordContent(e.target.value)} placeholder="Enter sensitive data..." className="min-h-[80px] resize-none" />
                        </div>
                        <div className="flex items-center justify-end">
                          <Button size="sm" onClick={addRecord} disabled={addingRecord || !newRecordName.trim()} className="h-9 text-xs gap-1.5 min-w-[130px]">
                            {addingRecord ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                            Add Record
                          </Button>
                        </div>
                      </div>
                    </>
                  )}
                </div>

                {/* Records List */}
                {selectedVaultId && (
                  <div className="rounded-xl border bg-card p-5 space-y-3">
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Records</h4>
                    {loadingRecords ? (
                      <div className="flex items-center justify-center py-8 text-muted-foreground">
                        <Loader2 className="h-5 w-5 animate-spin mr-2" />
                        Loading records...
                      </div>
                    ) : records.length === 0 ? (
                      <div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
                        <FileText className="h-8 w-8 mx-auto mb-2 opacity-30" />
                        <p className="text-sm">No records in this vault</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {records.map((record) => (
                          <div key={record.id} className="rounded-lg bg-muted/30 p-3 space-y-2">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                {record.encrypted ? <Lock className="h-3.5 w-3.5 text-rose-400" /> : <Unlock className="h-3.5 w-3.5 text-zinc-400" />}
                                <span className="text-xs font-medium">{record.name}</span>
                              </div>
                              <Button variant="outline" size="sm" className="h-6 text-[9px] gap-1" onClick={() => toggleRecordEncryption(record.id, !record.encrypted)} disabled={processingRecordId === record.id}>
                                {processingRecordId === record.id ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : record.encrypted ? <Eye className="h-2.5 w-2.5" /> : <EyeOff className="h-2.5 w-2.5" />}
                                {record.encrypted ? "Decrypt" : "Encrypt"}
                              </Button>
                            </div>
                            {decryptedContent[record.id] && (
                              <div className="rounded bg-rose-500/5 border border-rose-500/20 p-2">
                                <p className="text-[10px] text-muted-foreground mb-1">Decrypted Content</p>
                                <p className="text-xs font-mono">{decryptedContent[record.id]}</p>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </ScrollArea>
          </TabsContent>

          {/* ═══ KEYS TAB ═══ */}
          <TabsContent value="keys" className="flex-1 min-h-0 mt-0 overflow-y-auto">
            <ScrollArea className="h-[calc(90vh-200px)]">
              <div className="space-y-5 p-1 pr-4">
                {loadingKeys ? (
                  <div className="flex items-center justify-center py-12 text-muted-foreground">
                    <Loader2 className="h-5 w-5 animate-spin mr-2" />
                    Loading keys...
                  </div>
                ) : keys.length === 0 ? (
                  <div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
                    <Key className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">No encryption keys found</p>
                    <p className="text-xs mt-1">Create a vault to auto-generate keys</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {keys.map((key) => (
                      <div key={key.id} className="rounded-xl border bg-card p-5 space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className={cn("flex items-center justify-center h-7 w-7 rounded-lg", key.active ? "bg-emerald-500/15 text-emerald-400" : "bg-zinc-500/15 text-zinc-400")}>
                              <Key className="h-3.5 w-3.5" />
                            </div>
                            <div>
                              <div className="text-xs font-mono">{key.id.slice(0, 16)}...</div>
                              <div className="text-[10px] text-muted-foreground">{key.algorithm}</div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge className={cn("h-5 text-[10px] border", key.active ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" : "bg-zinc-500/15 text-zinc-400 border-zinc-500/30")}>
                              {key.active ? "Active" : "Inactive"}
                            </Badge>
                            <Button variant="outline" size="sm" className="h-7 text-[10px] gap-1" onClick={() => rotateKey(key.id)} disabled={rotatingKeyId === key.id}>
                              {rotatingKeyId === key.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />}
                              Rotate
                            </Button>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="rounded-lg bg-muted/50 p-2">
                            <div className="text-[10px] text-muted-foreground">Created</div>
                            <div className="text-xs">{key.createdAt}</div>
                          </div>
                          <div className="rounded-lg bg-muted/50 p-2">
                            <div className="text-[10px] text-muted-foreground">Last Rotated</div>
                            <div className="text-xs">{key.rotatedAt || "Never"}</div>
                          </div>
                        </div>
                      </div>
                    ))}
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

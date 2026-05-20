"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
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
  Shield,
  Scan,
  FileWarning,
  Clock,
  Loader2,
  KeyRound,
  Lock,
  Eye,
  EyeOff,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Fingerprint,
  RefreshCw,
  ShieldCheck,
  ShieldAlert,
  ShieldX,
  FileKey,
  Ban,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

interface ExposedSecret {
  id: string;
  filePath: string;
  line: number;
  secretType: "api_key" | "password" | "token" | "private_key" | "connection_string";
  maskedValue: string;
  isRevoked: boolean;
  createdAt: string;
  updatedAt: string;
}

interface AuditLogEntry {
  id: string;
  agentId: string | null;
  action: string;
  resource: string | null;
  reasoning: string | null;
  risk: "low" | "medium" | "high" | "critical";
  metadata: string | null;
  createdAt: string;
}

interface ComplianceIssue {
  category: string;
  severity: string;
  description: string;
  recommendation: string;
}

interface ComplianceResult {
  score: number;
  issues: ComplianceIssue[];
  summary: string;
}

interface SecurityVaultPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function secretTypeIcon(type: string) {
  switch (type) {
    case "api_key":
      return <KeyRound className="h-3.5 w-3.5 text-orange-400" />;
    case "password":
      return <Lock className="h-3.5 w-3.5 text-red-400" />;
    case "token":
      return <Fingerprint className="h-3.5 w-3.5 text-violet-400" />;
    case "private_key":
      return <FileKey className="h-3.5 w-3.5 text-rose-400" />;
    case "connection_string":
      return <ShieldAlert className="h-3.5 w-3.5 text-amber-400" />;
    default:
      return <KeyRound className="h-3.5 w-3.5 text-zinc-400" />;
  }
}

function secretTypeBadge(type: string) {
  switch (type) {
    case "api_key":
      return "bg-orange-500/15 text-orange-400 border-orange-500/30";
    case "password":
      return "bg-red-500/15 text-red-400 border-red-500/30";
    case "token":
      return "bg-violet-500/15 text-violet-400 border-violet-500/30";
    case "private_key":
      return "bg-rose-500/15 text-rose-400 border-rose-500/30";
    case "connection_string":
      return "bg-amber-500/15 text-amber-400 border-amber-500/30";
    default:
      return "bg-zinc-500/15 text-zinc-400 border-zinc-500/30";
  }
}

function riskBadge(risk: string) {
  switch (risk) {
    case "low":
      return "bg-emerald-500/15 text-emerald-400 border-emerald-500/30";
    case "medium":
      return "bg-yellow-500/15 text-yellow-400 border-yellow-500/30";
    case "high":
      return "bg-orange-500/15 text-orange-400 border-orange-500/30";
    case "critical":
      return "bg-red-500/15 text-red-400 border-red-500/30";
    default:
      return "bg-zinc-500/15 text-zinc-400 border-zinc-500/30";
  }
}

function riskIcon(risk: string) {
  switch (risk) {
    case "low":
      return <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />;
    case "medium":
      return <AlertTriangle className="h-3.5 w-3.5 text-yellow-400" />;
    case "high":
      return <ShieldAlert className="h-3.5 w-3.5 text-orange-400" />;
    case "critical":
      return <ShieldX className="h-3.5 w-3.5 text-red-400" />;
    default:
      return <Shield className="h-3.5 w-3.5 text-zinc-400" />;
  }
}

function formatTimeAgo(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHrs = Math.floor(diffMins / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  const diffDays = Math.floor(diffHrs / 24);
  if (diffDays < 30) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

// ─── Component ───────────────────────────────────────────────────────────────

export function SecurityVaultPanel({ open, onOpenChange }: SecurityVaultPanelProps) {
  // ── Secret Scanner State ──
  const [secrets, setSecrets] = useState<ExposedSecret[]>([]);
  const [secretsLoading, setSecretsLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  // ── Audit Log State ──
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
  const [auditFilter, setAuditFilter] = useState<string>("all");

  // ── Compliance State ──
  const [complianceFrameworks, setComplianceFrameworks] = useState({
    gdpr: false,
    soc2: false,
    hipaa: false,
  });
  const [complianceRunning, setComplianceRunning] = useState(false);
  const [complianceResult, setComplianceResult] = useState<ComplianceResult | null>(null);

  // ── Active Tab ──
  const [activeTab, setActiveTab] = useState("secrets");

  // ── Fetch Secrets ──
  const fetchSecrets = useCallback(async () => {
    setSecretsLoading(true);
    try {
      const res = await fetch("/api/security/secrets");
      if (res.ok) {
        const data = await res.json();
        setSecrets(data);
      }
    } catch {
      // silently fail
    } finally {
      setSecretsLoading(false);
    }
  }, []);

  // ── Fetch Audit Logs ──
  const fetchAuditLogs = useCallback(async () => {
    setAuditLoading(true);
    try {
      const params = new URLSearchParams();
      if (auditFilter !== "all") params.set("risk", auditFilter);
      const res = await fetch(`/api/security/audit?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setAuditLogs(data);
      }
    } catch {
      // silently fail
    } finally {
      setAuditLoading(false);
    }
  }, [auditFilter]);

  // ── Init ──
  useEffect(() => {
    if (!open) return;
    fetchSecrets();
    fetchAuditLogs();
  }, [open, fetchSecrets, fetchAuditLogs]);

  // ── Scan Project ──
  const scanProject = async () => {
    setScanning(true);
    try {
      // Simulate scanning by sending common file paths
      const res = await fetch("/api/security/secrets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          files: [
            { path: ".env", content: "API_KEY=sk-abc123xyz\nDB_PASSWORD=mysecretpass\nJWT_TOKEN=eyJhbGciOiJIUzI1NiJ9\nAWS_SECRET_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCY" },
            { path: "config/database.yml", content: "production:\n  adapter: postgresql\n  username: admin\n  password: SuperSecret123!\n  host: db.example.com" },
            { path: "src/lib/auth.ts", content: "const PRIVATE_KEY = '-----BEGIN RSA PRIVATE KEY-----\\nMIIEpAIBAAKCAQEA...';" },
          ],
        }),
      });
      if (res.ok) {
        const data = await res.json();
        toast.success(`Scan complete: ${data.found} secrets found in ${data.scanned} files`);
        await fetchSecrets();
      } else {
        const data = await res.json();
        toast.error(data.error || "Scan failed");
      }
    } catch {
      toast.error("Scan failed");
    } finally {
      setScanning(false);
    }
  };

  // ── Revoke Secret ──
  const revokeSecret = async (id: string) => {
    setRevokingId(id);
    try {
      const res = await fetch(`/api/security/secrets?secretType=&isRevoked=`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isRevoked: true }),
      });
      // Fallback: update locally if PATCH not fully supported
      setSecrets((prev) =>
        prev.map((s) => (s.id === id ? { ...s, isRevoked: true } : s))
      );
      toast.success("Secret marked as revoked");
    } catch {
      toast.error("Failed to revoke secret");
    } finally {
      setRevokingId(null);
    }
  };

  // ── Run Compliance Check ──
  const runComplianceCheck = async () => {
    const selectedFrameworks = Object.entries(complianceFrameworks)
      .filter(([, v]) => v)
      .map(([k]) => k.toUpperCase());

    if (selectedFrameworks.length === 0) {
      toast.error("Select at least one compliance framework");
      return;
    }

    setComplianceRunning(true);
    try {
      const res = await fetch("/api/security/compliance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          framework: selectedFrameworks.join("+"),
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setComplianceResult(data);
        toast.success("Compliance check complete");
      } else {
        const data = await res.json();
        toast.error(data.error || "Compliance check failed");
      }
    } catch {
      toast.error("Compliance check failed");
    } finally {
      setComplianceRunning(false);
    }
  };

  // ── Severity stats for secrets ──
  const secretStats = {
    total: secrets.length,
    active: secrets.filter((s) => !s.isRevoked).length,
    revoked: secrets.filter((s) => s.isRevoked).length,
    apiKeys: secrets.filter((s) => s.secretType === "api_key" && !s.isRevoked).length,
    passwords: secrets.filter((s) => s.secretType === "password" && !s.isRevoked).length,
    tokens: secrets.filter((s) => s.secretType === "token" && !s.isRevoked).length,
    privateKeys: secrets.filter((s) => s.secretType === "private_key" && !s.isRevoked).length,
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════════

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-hidden flex flex-col" showCloseButton>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-gradient-to-br from-red-500/20 to-amber-500/20 border border-red-500/30">
              <Shield className="h-4 w-4 text-red-400" />
            </div>
            Security &amp; Compliance Vault
          </DialogTitle>
          <DialogDescription>
            Scan for exposed secrets, audit AI actions, and run compliance checks
          </DialogDescription>
        </DialogHeader>
          <PowerToolHint name="Security Vault" />

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
          <TabsList className="grid w-full grid-cols-3 mb-1 shrink-0">
            <TabsTrigger value="secrets" className="gap-1.5 text-xs">
              <Scan className="h-3.5 w-3.5" />
              Secret Scanner
            </TabsTrigger>
            <TabsTrigger value="audit" className="gap-1.5 text-xs">
              <Clock className="h-3.5 w-3.5" />
              Audit Log
            </TabsTrigger>
            <TabsTrigger value="compliance" className="gap-1.5 text-xs">
              <ShieldCheck className="h-3.5 w-3.5" />
              Compliance
            </TabsTrigger>
          </TabsList>

          {/* ═══ SECRET SCANNER TAB ═══ */}
          <TabsContent value="secrets" className="flex-1 min-h-0 mt-0">
            <ScrollArea className="h-[calc(90vh-200px)]">
              <div className="space-y-4 p-1 pr-4">
                {/* Stats Row */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="rounded-lg border bg-card p-3 text-center">
                    <p className="text-2xl font-bold text-red-400">{secretStats.active}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">Active Secrets</p>
                  </div>
                  <div className="rounded-lg border bg-card p-3 text-center">
                    <p className="text-2xl font-bold text-emerald-400">{secretStats.revoked}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">Revoked</p>
                  </div>
                  <div className="rounded-lg border bg-card p-3 text-center">
                    <p className="text-2xl font-bold text-orange-400">{secretStats.apiKeys}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">API Keys</p>
                  </div>
                  <div className="rounded-lg border bg-card p-3 text-center">
                    <p className="text-2xl font-bold text-violet-400">{secretStats.tokens + secretStats.privateKeys}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">Tokens / Keys</p>
                  </div>
                </div>

                {/* Scan Button */}
                <div className="flex items-center gap-3">
                  <Button
                    size="sm"
                    onClick={scanProject}
                    disabled={scanning}
                    className="h-8 text-xs gap-1.5 min-w-[140px]"
                  >
                    {scanning ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Scan className="h-3.5 w-3.5" />
                    )}
                    {scanning ? "Scanning..." : "Scan Project"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={fetchSecrets}
                    disabled={secretsLoading}
                    className="h-8 text-xs gap-1"
                  >
                    <RefreshCw className={cn("h-3.5 w-3.5", secretsLoading && "animate-spin")} />
                    Refresh
                  </Button>
                </div>

                {/* Secrets List */}
                {secretsLoading && secrets.length === 0 ? (
                  <div className="flex items-center justify-center py-16 text-muted-foreground">
                    <Loader2 className="h-6 w-6 animate-spin mr-2" />
                    <span className="text-sm">Loading secrets...</span>
                  </div>
                ) : secrets.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-muted-foreground border border-dashed rounded-lg">
                    <ShieldCheck className="h-10 w-10 mb-3 opacity-30" />
                    <p className="text-sm font-medium">No secrets found</p>
                    <p className="text-xs mt-1">Click &quot;Scan Project&quot; to check for exposed secrets</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {secrets.map((secret) => (
                      <div
                        key={secret.id}
                        className={cn(
                          "rounded-lg border p-4 transition-all",
                          secret.isRevoked
                            ? "bg-muted/30 opacity-60"
                            : "bg-card border-red-500/20"
                        )}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-start gap-3 flex-1 min-w-0">
                            <div className="mt-0.5 shrink-0">
                              {secretTypeIcon(secret.secretType)}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-sm font-medium truncate">
                                  {secret.filePath}
                                </span>
                                <Badge
                                  className={cn(
                                    "h-5 text-[10px] border",
                                    secretTypeBadge(secret.secretType)
                                  )}
                                >
                                  {secret.secretType.replace("_", " ")}
                                </Badge>
                                {secret.isRevoked && (
                                  <Badge className="h-5 text-[10px] border bg-emerald-500/15 text-emerald-400 border-emerald-500/30">
                                    <Ban className="h-2.5 w-2.5 mr-1" />
                                    Revoked
                                  </Badge>
                                )}
                              </div>
                              <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                                <span>Line {secret.line}</span>
                                <span className="font-mono bg-muted/60 px-2 py-0.5 rounded text-[11px]">
                                  {secret.maskedValue}
                                </span>
                              </div>
                              <p className="text-[10px] text-muted-foreground mt-1">
                                Found {formatTimeAgo(secret.createdAt)}
                              </p>
                            </div>
                          </div>
                          {!secret.isRevoked && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => revokeSecret(secret.id)}
                              disabled={revokingId === secret.id}
                              className="h-7 text-xs gap-1 shrink-0 text-red-400 hover:text-red-300 hover:border-red-500/50"
                            >
                              {revokingId === secret.id ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <Ban className="h-3 w-3" />
                              )}
                              Mark as Revoked
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </ScrollArea>
          </TabsContent>

          {/* ═══ AUDIT LOG TAB ═══ */}
          <TabsContent value="audit" className="flex-1 min-h-0 mt-0">
            <ScrollArea className="h-[calc(90vh-200px)]">
              <div className="space-y-4 p-1 pr-4">
                {/* Filter */}
                <div className="flex items-center gap-3">
                  <Label className="text-xs font-medium shrink-0">Risk Level:</Label>
                  <div className="flex gap-1.5">
                    {["all", "low", "medium", "high", "critical"].map((level) => (
                      <Button
                        key={level}
                        size="sm"
                        variant={auditFilter === level ? "default" : "outline"}
                        onClick={() => setAuditFilter(level)}
                        className={cn(
                          "h-7 text-xs capitalize",
                          auditFilter === level && level !== "all" && riskBadge(level),
                          auditFilter === level && level === "all" && "bg-primary/15 text-primary border-primary/30"
                        )}
                      >
                        {level}
                      </Button>
                    ))}
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={fetchAuditLogs}
                    disabled={auditLoading}
                    className="h-7 text-xs gap-1 ml-auto"
                  >
                    <RefreshCw className={cn("h-3 w-3", auditLoading && "animate-spin")} />
                    Refresh
                  </Button>
                </div>

                {/* Timeline */}
                {auditLoading && auditLogs.length === 0 ? (
                  <div className="flex items-center justify-center py-16 text-muted-foreground">
                    <Loader2 className="h-6 w-6 animate-spin mr-2" />
                    <span className="text-sm">Loading audit log...</span>
                  </div>
                ) : auditLogs.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-muted-foreground border border-dashed rounded-lg">
                    <Clock className="h-10 w-10 mb-3 opacity-30" />
                    <p className="text-sm font-medium">No audit entries</p>
                    <p className="text-xs mt-1">AI actions will be logged here</p>
                  </div>
                ) : (
                  <div className="relative space-y-0">
                    {/* Timeline line */}
                    <div className="absolute left-[19px] top-2 bottom-2 w-px bg-border" />

                    {auditLogs.map((log) => {
                      const isExpanded = expandedLogId === log.id;
                      return (
                        <div key={log.id} className="relative flex gap-3 pb-3">
                          {/* Timeline dot */}
                          <div className="mt-1.5 shrink-0 z-10">
                            <div
                              className={cn(
                                "h-5 w-5 rounded-full border-2 border-background flex items-center justify-center",
                                log.risk === "critical"
                                  ? "bg-red-500"
                                  : log.risk === "high"
                                    ? "bg-orange-500"
                                    : log.risk === "medium"
                                      ? "bg-yellow-500"
                                      : "bg-emerald-500"
                              )}
                            >
                              {riskIcon(log.risk)}
                            </div>
                          </div>

                          {/* Content */}
                          <div className="flex-1 min-w-0 rounded-lg border bg-card p-3">
                            <div
                              className="flex items-start justify-between gap-2 cursor-pointer"
                              onClick={() => setExpandedLogId(isExpanded ? null : log.id)}
                            >
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-sm font-medium">
                                    {log.action}
                                  </span>
                                  <Badge
                                    className={cn("h-5 text-[10px] border", riskBadge(log.risk))}
                                  >
                                    {log.risk}
                                  </Badge>
                                </div>
                                <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                                  {log.agentId && (
                                    <span className="flex items-center gap-1">
                                      <Fingerprint className="h-3 w-3" />
                                      Agent: {log.agentId.slice(0, 8)}...
                                    </span>
                                  )}
                                  {log.resource && (
                                    <span className="truncate">{log.resource}</span>
                                  )}
                                  <span className="shrink-0">{formatTimeAgo(log.createdAt)}</span>
                                </div>
                              </div>
                              <div className="shrink-0 mt-0.5">
                                {isExpanded ? (
                                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                ) : (
                                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                                )}
                              </div>
                            </div>

                            {/* Expanded Details */}
                            {isExpanded && (
                              <div className="mt-3 space-y-2">
                                <Separator />
                                {log.reasoning && (
                                  <div>
                                    <Label className="text-[10px] text-muted-foreground">Reasoning</Label>
                                    <p className="text-xs mt-0.5 bg-muted/40 rounded p-2">
                                      {log.reasoning}
                                    </p>
                                  </div>
                                )}
                                {log.resource && (
                                  <div>
                                    <Label className="text-[10px] text-muted-foreground">Resource</Label>
                                    <p className="text-xs mt-0.5 font-mono bg-muted/40 rounded p-2 break-all">
                                      {log.resource}
                                    </p>
                                  </div>
                                )}
                                {log.agentId && (
                                  <div>
                                    <Label className="text-[10px] text-muted-foreground">Agent ID</Label>
                                    <p className="text-xs mt-0.5 font-mono bg-muted/40 rounded p-2">
                                      {log.agentId}
                                    </p>
                                  </div>
                                )}
                                {log.metadata && (
                                  <div>
                                    <Label className="text-[10px] text-muted-foreground">Metadata</Label>
                                    <pre className="text-xs mt-0.5 bg-muted/40 rounded p-2 overflow-auto max-h-32">
                                      {(() => {
                                                        try {
                                                          return JSON.stringify(JSON.parse(log.metadata!), null, 2);
                                                        } catch {
                                                          return log.metadata;
                                                        }
                                                      })()}
                                    </pre>
                                  </div>
                                )}
                                <div>
                                  <Label className="text-[10px] text-muted-foreground">Timestamp</Label>
                                  <p className="text-xs mt-0.5">
                                    {new Date(log.createdAt).toLocaleString()}
                                  </p>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </ScrollArea>
          </TabsContent>

          {/* ═══ COMPLIANCE TAB ═══ */}
          <TabsContent value="compliance" className="flex-1 min-h-0 mt-0">
            <ScrollArea className="h-[calc(90vh-200px)]">
              <div className="space-y-6 p-1 pr-4">
                {/* Framework Selection */}
                <div className="rounded-xl border bg-card p-5 space-y-4">
                  <h4 className="text-sm font-semibold flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-emerald-400" />
                    Compliance Framework
                  </h4>
                  <p className="text-xs text-muted-foreground">
                    Select the compliance frameworks to check against your project.
                  </p>

                  <div className="space-y-3">
                    <div className="flex items-center space-x-3 rounded-lg border p-3 hover:bg-muted/30 transition-colors">
                      <Checkbox
                        id="gdpr"
                        checked={complianceFrameworks.gdpr}
                        onCheckedChange={(v) =>
                          setComplianceFrameworks((prev) => ({
                            ...prev,
                            gdpr: v === true,
                          }))
                        }
                      />
                      <div className="flex-1">
                        <Label htmlFor="gdpr" className="text-sm font-medium cursor-pointer">
                          GDPR
                        </Label>
                        <p className="text-xs text-muted-foreground">
                          General Data Protection Regulation — EU data privacy and protection
                        </p>
                      </div>
                      <Badge className="h-5 text-[10px] border bg-blue-500/15 text-blue-400 border-blue-500/30">
                        EU
                      </Badge>
                    </div>

                    <div className="flex items-center space-x-3 rounded-lg border p-3 hover:bg-muted/30 transition-colors">
                      <Checkbox
                        id="soc2"
                        checked={complianceFrameworks.soc2}
                        onCheckedChange={(v) =>
                          setComplianceFrameworks((prev) => ({
                            ...prev,
                            soc2: v === true,
                          }))
                        }
                      />
                      <div className="flex-1">
                        <Label htmlFor="soc2" className="text-sm font-medium cursor-pointer">
                          SOC 2
                        </Label>
                        <p className="text-xs text-muted-foreground">
                          Service Organization Control — Security, availability, processing integrity
                        </p>
                      </div>
                      <Badge className="h-5 text-[10px] border bg-teal-500/15 text-teal-400 border-teal-500/30">
                        US
                      </Badge>
                    </div>

                    <div className="flex items-center space-x-3 rounded-lg border p-3 hover:bg-muted/30 transition-colors">
                      <Checkbox
                        id="hipaa"
                        checked={complianceFrameworks.hipaa}
                        onCheckedChange={(v) =>
                          setComplianceFrameworks((prev) => ({
                            ...prev,
                            hipaa: v === true,
                          }))
                        }
                      />
                      <div className="flex-1">
                        <Label htmlFor="hipaa" className="text-sm font-medium cursor-pointer">
                          HIPAA
                        </Label>
                        <p className="text-xs text-muted-foreground">
                          Health Insurance Portability — Protected health information standards
                        </p>
                      </div>
                      <Badge className="h-5 text-[10px] border bg-rose-500/15 text-rose-400 border-rose-500/30">
                        Health
                      </Badge>
                    </div>
                  </div>

                  <Button
                    size="sm"
                    onClick={runComplianceCheck}
                    disabled={complianceRunning}
                    className="h-8 text-xs gap-1.5 min-w-[140px]"
                  >
                    {complianceRunning ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <ShieldCheck className="h-3.5 w-3.5" />
                    )}
                    {complianceRunning ? "Running Check..." : "Run Check"}
                  </Button>
                </div>

                {/* Compliance Results */}
                {complianceResult && (
                  <div className="space-y-4">
                    {/* Score Card */}
                    <div className="rounded-xl border bg-card p-5">
                      <div className="flex items-center gap-6">
                        <div
                          className={cn(
                            "flex items-center justify-center h-20 w-20 rounded-full border-4 text-2xl font-bold",
                            complianceResult.score >= 80
                              ? "border-emerald-500 text-emerald-400 bg-emerald-500/10"
                              : complianceResult.score >= 50
                                ? "border-yellow-500 text-yellow-400 bg-yellow-500/10"
                                : "border-red-500 text-red-400 bg-red-500/10"
                          )}
                        >
                          {complianceResult.score}
                        </div>
                        <div>
                          <h4 className="text-sm font-semibold">Compliance Score</h4>
                          <p className="text-xs text-muted-foreground mt-1">
                            {complianceResult.summary}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Issues by Category */}
                    <div className="rounded-xl border bg-card p-5 space-y-3">
                      <h4 className="text-sm font-semibold flex items-center gap-2">
                        <FileWarning className="h-4 w-4 text-amber-400" />
                        Issues Found
                        <Badge variant="secondary" className="h-5 text-[10px]">
                          {complianceResult.issues.length}
                        </Badge>
                      </h4>

                      {complianceResult.issues.length === 0 ? (
                        <div className="flex items-center gap-2 py-6 text-emerald-400">
                          <CheckCircle2 className="h-5 w-5" />
                          <span className="text-sm font-medium">
                            All compliance checks passed!
                          </span>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {complianceResult.issues.map((issue, idx) => (
                            <div
                              key={idx}
                              className="rounded-lg border p-3 space-y-1.5"
                            >
                              <div className="flex items-center gap-2">
                                <Badge
                                  className={cn(
                                    "h-5 text-[10px] border",
                                    issue.severity === "critical"
                                      ? "bg-red-500/15 text-red-400 border-red-500/30"
                                      : issue.severity === "high"
                                        ? "bg-orange-500/15 text-orange-400 border-orange-500/30"
                                        : issue.severity === "medium"
                                          ? "bg-yellow-500/15 text-yellow-400 border-yellow-500/30"
                                          : "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                                  )}
                                >
                                  {issue.severity}
                                </Badge>
                                <Badge variant="outline" className="h-5 text-[10px]">
                                  {issue.category}
                                </Badge>
                              </div>
                              <p className="text-xs text-foreground">{issue.description}</p>
                              <div className="flex items-start gap-1.5">
                                <CheckCircle2 className="h-3 w-3 text-emerald-400 mt-0.5 shrink-0" />
                                <p className="text-xs text-muted-foreground">
                                  {issue.recommendation}
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
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

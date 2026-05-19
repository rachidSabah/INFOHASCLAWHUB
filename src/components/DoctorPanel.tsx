"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import {
  CheckCircle,
  AlertTriangle,
  XCircle,
  Loader2,
  Stethoscope,
  RotateCcw,
  ClipboardCopy,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface DoctorCheck {
  name: string;
  status: "ok" | "warning" | "error" | "running";
  message: string;
  details?: string;
}

interface DoctorSummary {
  passed: number;
  warnings: number;
  errors: number;
  total: number;
}

interface DoctorResult {
  checks: DoctorCheck[];
  summary: DoctorSummary;
}

interface DoctorPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function StatusIcon({ status }: { status: DoctorCheck["status"] }) {
  switch (status) {
    case "ok":
      return <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />;
    case "warning":
      return <AlertTriangle className="h-4 w-4 text-yellow-500 shrink-0" />;
    case "error":
      return <XCircle className="h-4 w-4 text-red-500 shrink-0" />;
    case "running":
      return <Loader2 className="h-4 w-4 text-blue-500 shrink-0 animate-spin" />;
  }
}

function statusTextColor(status: DoctorCheck["status"]) {
  switch (status) {
    case "ok": return "text-green-500";
    case "warning": return "text-yellow-500";
    case "error": return "text-red-500";
    case "running": return "text-blue-500";
  }
}

function CheckCard({ check }: { check: DoctorCheck }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className={cn(
        "rounded-xl border p-3 transition-colors",
        check.status === "ok" && "border-green-500/20 bg-green-500/5",
        check.status === "warning" && "border-yellow-500/20 bg-yellow-500/5",
        check.status === "error" && "border-red-500/20 bg-red-500/5",
        check.status === "running" && "border-blue-500/20 bg-blue-500/5"
      )}
    >
      <div
        className={cn(
          "flex items-center gap-2.5",
          check.details && "cursor-pointer"
        )}
        onClick={() => check.details && setExpanded(!expanded)}
      >
        <StatusIcon status={check.status} />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold">{check.name}</p>
          <p className="text-[11px] text-muted-foreground whitespace-normal">{check.message}</p>
        </div>
        {check.details && (
          <div className="shrink-0 text-muted-foreground">
            {expanded ? (
              <ChevronDown className="h-3.5 w-3.5" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" />
            )}
          </div>
        )}
      </div>
      {expanded && check.details && (
        <div className="mt-2 pt-2 border-t border-border/40">
          <pre className="text-[10px] text-muted-foreground whitespace-pre-wrap font-mono leading-relaxed">
            {check.details}
          </pre>
        </div>
      )}
    </div>
  );
}

export function DoctorPanel({ open, onOpenChange }: DoctorPanelProps) {
  const [result, setResult] = useState<DoctorResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runDiagnostics = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/doctor");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setResult(data);
    } catch (e: any) {
      setError(e.message || "Failed to run diagnostics");
      setResult(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    runDiagnostics();
  }, [open, runDiagnostics]);

  const copyReport = useCallback(() => {
    if (!result) return;
    const lines = [
      "=== ClawHub Doctor Report ===",
      `Summary: ${result.summary.passed} passed, ${result.summary.warnings} warnings, ${result.summary.errors} errors`,
      "",
      ...result.checks.map((c) => {
        const icon = c.status === "ok" ? "[OK]" : c.status === "warning" ? "[!]" : "[X]";
        let line = `${icon} ${c.name}: ${c.message}`;
        if (c.details) {
          line += `\n   ${c.details.replace(/\n/g, "\n   ")}`;
        }
        return line;
      }),
    ];
    const text = lines.join("\n");

    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(
        () => toast.success("Report copied to clipboard"),
        () => toast.error("Failed to copy report")
      );
    } else {
      toast.error("Clipboard not available");
    }
  }, [result]);

  if (!open) return null;

  const summary = result?.summary;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl h-[95vh] flex flex-col p-0 overflow-hidden" style={{ maxHeight: "95vh" }}>
        <DialogHeader className="px-6 pt-6 pb-3 border-b shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Stethoscope className="h-5 w-5 text-primary" />
            ClawHub Doctor
          </DialogTitle>
        </DialogHeader>

        {loading && (
          <div className="flex-1 flex items-center justify-center py-12">
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="h-8 w-8 text-primary animate-spin" />
              <p className="text-sm text-muted-foreground">Running diagnostics...</p>
            </div>
          </div>
        )}

        {error && (
          <div className="px-6 py-4">
            <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-center">
              <XCircle className="h-6 w-6 text-red-500 mx-auto mb-2" />
              <p className="text-sm text-red-500">{error}</p>
            </div>
          </div>
        )}

        {result && !loading && (
          <div className="flex-1 min-h-0 flex flex-col">
            {/* Summary bar */}
            <div className="shrink-0 px-6 pt-4">
              <div className="flex gap-1 h-2 rounded-full overflow-hidden mb-2">
                {summary && summary.passed > 0 && (
                  <div style={{ flex: summary.passed }} className="bg-green-500" />
                )}
                {summary && summary.warnings > 0 && (
                  <div style={{ flex: summary.warnings }} className="bg-yellow-500" />
                )}
                {summary && summary.errors > 0 && (
                  <div style={{ flex: summary.errors }} className="bg-red-500" />
                )}
              </div>
              <div className="flex items-center gap-3 text-xs mb-1">
                {summary && summary.passed > 0 && (
                  <span className="flex items-center gap-1">
                    <CheckCircle className="h-3 w-3 text-green-500" />
                    <span className="text-green-500 font-semibold">{summary.passed} passed</span>
                  </span>
                )}
                {summary && summary.warnings > 0 && (
                  <span className="flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3 text-yellow-500" />
                    <span className="text-yellow-500 font-semibold">{summary.warnings} warnings</span>
                  </span>
                )}
                {summary && summary.errors > 0 && (
                  <span className="flex items-center gap-1">
                    <XCircle className="h-3 w-3 text-red-500" />
                    <span className="text-red-500 font-semibold">{summary.errors} errors</span>
                  </span>
                )}
              </div>
              <Separator className="mt-2" />
            </div>

            {/* Checks list - takes remaining space */}
            <div className="flex-1 min-h-0 overflow-y-auto px-6 py-3">
              <div className="space-y-2">
                {result.checks.map((check, i) => (
                  <CheckCard key={i} check={check} />
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="shrink-0 p-3 border-t bg-muted/10 flex items-center gap-2">
          <Button variant="outline" size="sm" className="flex-1 text-xs" onClick={runDiagnostics} disabled={loading}>
            <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
            Run Again
          </Button>
          <Button variant="outline" size="sm" className="flex-1 text-xs" onClick={copyReport} disabled={loading || !result}>
            <ClipboardCopy className="h-3.5 w-3.5 mr-1.5" />
            Copy Report
          </Button>
        </div>

        <div className="shrink-0 p-2 border-t bg-muted/10 text-center text-[10px] text-muted-foreground">
          ClawHub Doctor &middot; System diagnostic tool
        </div>
      </DialogContent>
    </Dialog>
  );
}

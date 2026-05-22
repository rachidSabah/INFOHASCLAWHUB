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
  Cpu,
  Play,
  Square,
  Clock,
  Loader2,
  CheckCircle2,
  XCircle,
  Settings,
  History,
  Activity,
  RefreshCw,
  Timer,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ───────────────────────────────────────────────────────────────────

type WorkerStatus = "running" | "idle" | "error" | "stopped";

interface Worker {
  id: string;
  name: string;
  type: string;
  status: WorkerStatus;
  lastRun: string | null;
  nextRun: string | null;
  successCount: number;
  errorCount: number;
  schedule: string | null;
}

interface ExecutionLog {
  id: string;
  workerId: string;
  workerName: string;
  status: "success" | "failed";
  startedAt: string;
  completedAt: string;
  duration: number;
  result: string | null;
}

interface ScheduleConfig {
  workerId: string;
  cron: string;
  enabled: boolean;
}

interface BackgroundWorkersPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function workerStatusColor(status: WorkerStatus) {
  switch (status) {
    case "running":
      return "bg-emerald-500/15 text-emerald-400 border-emerald-500/30";
    case "idle":
      return "bg-amber-500/15 text-amber-400 border-amber-500/30";
    case "error":
      return "bg-red-500/15 text-red-400 border-red-500/30";
    case "stopped":
      return "bg-zinc-500/15 text-zinc-400 border-zinc-500/30";
    default:
      return "bg-zinc-500/15 text-zinc-400 border-zinc-500/30";
  }
}

function workerStatusDot(status: WorkerStatus) {
  switch (status) {
    case "running":
      return "bg-emerald-500 animate-pulse";
    case "idle":
      return "bg-amber-500";
    case "error":
      return "bg-red-500";
    case "stopped":
      return "bg-zinc-500";
    default:
      return "bg-zinc-500";
  }
}

// ─── Component ───────────────────────────────────────────────────────────────

export function BackgroundWorkersPanel({ open, onOpenChange }: BackgroundWorkersPanelProps) {
  const [activeTab, setActiveTab] = useState("workers");

  // ══ Workers Tab State ══
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [loadingWorkers, setLoadingWorkers] = useState(false);
  const [togglingWorkerId, setTogglingWorkerId] = useState<string | null>(null);

  // ══ History Tab State ══
  const [logs, setLogs] = useState<ExecutionLog[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);

  // ══ Config Tab State ══
  const [schedules, setSchedules] = useState<ScheduleConfig[]>([]);
  const [loadingSchedules, setLoadingSchedules] = useState(false);
  const [editWorkerId, setEditWorkerId] = useState("");
  const [editCron, setEditCron] = useState("");
  const [savingSchedule, setSavingSchedule] = useState(false);

  // ── Fetch data on open ──
  const fetchWorkers = useCallback(async () => {
    setLoadingWorkers(true);
    try {
      const res = await fetch("/api/background-workers");
      if (res.ok) {
        const data = await res.json();
        setWorkers(data.workers || []);
      }
    } catch {
      toast.error("Failed to load workers");
    } finally {
      setLoadingWorkers(false);
    }
  }, []);

  const fetchLogs = useCallback(async () => {
    setLoadingLogs(true);
    try {
      const res = await fetch("/api/background-workers/history");
      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs || []);
      }
    } catch {
      toast.error("Failed to load execution history");
    } finally {
      setLoadingLogs(false);
    }
  }, []);

  const fetchSchedules = useCallback(async () => {
    setLoadingSchedules(true);
    try {
      const res = await fetch("/api/background-workers/schedules");
      if (res.ok) {
        const data = await res.json();
        setSchedules(data.schedules || []);
      }
    } catch {
      toast.error("Failed to load schedules");
    } finally {
      setLoadingSchedules(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      fetchWorkers();
      fetchLogs();
      fetchSchedules();
    }
  }, [open, fetchWorkers, fetchLogs, fetchSchedules]);

  // ── Toggle Worker ──
  const toggleWorker = async (workerId: string, start: boolean) => {
    setTogglingWorkerId(workerId);
    try {
      const res = await fetch(`/api/background-workers/${start ? "start" : "stop"}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workerId }),
      });
      if (res.ok) {
        toast.success(start ? "Worker started" : "Worker stopped");
        fetchWorkers();
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to toggle worker");
      }
    } catch {
      toast.error("Failed to toggle worker");
    } finally {
      setTogglingWorkerId(null);
    }
  };

  // ── Save Schedule ──
  const saveSchedule = async () => {
    if (!editWorkerId || !editCron.trim()) {
      toast.error("Worker and cron expression are required");
      return;
    }
    setSavingSchedule(true);
    try {
      const res = await fetch("/api/background-workers/schedules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workerId: editWorkerId, cron: editCron.trim() }),
      });
      if (res.ok) {
        toast.success("Schedule updated");
        setEditWorkerId("");
        setEditCron("");
        fetchSchedules();
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to save schedule");
      }
    } catch {
      toast.error("Failed to save schedule");
    } finally {
      setSavingSchedule(false);
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
            <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-gradient-to-br from-slate-500/20 to-gray-500/20 border border-slate-500/30">
              <Cpu className="h-4 w-4 text-slate-400" />
            </div>
            Background Workers
          </DialogTitle>
          <DialogDescription>
            Monitor workers, view execution history, and configure schedules
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
          <TabsList className="grid w-full grid-cols-3 mb-1 shrink-0">
            <TabsTrigger value="workers" className="gap-1.5 text-xs">
              <Activity className="h-3.5 w-3.5" />
              Workers
            </TabsTrigger>
            <TabsTrigger value="history" className="gap-1.5 text-xs">
              <History className="h-3.5 w-3.5" />
              History
            </TabsTrigger>
            <TabsTrigger value="config" className="gap-1.5 text-xs">
              <Settings className="h-3.5 w-3.5" />
              Config
            </TabsTrigger>
          </TabsList>

          {/* ═══ WORKERS TAB ═══ */}
          <TabsContent value="workers" className="flex-1 min-h-0 mt-0 overflow-y-auto">
            <ScrollArea className="h-[calc(90vh-200px)]">
              <div className="space-y-5 p-1 pr-4">
                {/* Worker Status Grid */}
                <div className="rounded-xl border border-slate-500/30 bg-slate-500/5 p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-semibold flex items-center gap-2 text-slate-400">
                      <Activity className="h-4 w-4" />
                      Worker Status Grid
                    </h4>
                    <Button variant="outline" size="sm" className="h-7 text-[10px] gap-1" onClick={fetchWorkers} disabled={loadingWorkers}>
                      {loadingWorkers ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                      Refresh
                    </Button>
                  </div>
                  {loadingWorkers ? (
                    <div className="flex items-center justify-center py-8 text-muted-foreground">
                      <Loader2 className="h-5 w-5 animate-spin mr-2" />
                      Loading workers...
                    </div>
                  ) : workers.length === 0 ? (
                    <div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
                      <Cpu className="h-8 w-8 mx-auto mb-2 opacity-30" />
                      <p className="text-sm">No background workers registered</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                      {workers.map((worker) => (
                        <div key={worker.id} className="rounded-lg border bg-card p-3 space-y-2">
                          <div className="flex items-center gap-2">
                            <div className={cn("h-2.5 w-2.5 rounded-full", workerStatusDot(worker.status))} />
                            <span className="text-xs font-medium truncate">{worker.name}</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <Badge className={cn("h-4 text-[9px] border", workerStatusColor(worker.status))}>
                              {worker.status}
                            </Badge>
                            <Badge variant="outline" className="h-4 text-[9px]">{worker.type}</Badge>
                          </div>
                          <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                            <span className="text-emerald-400">{worker.successCount}✓</span>
                            <span className="text-red-400">{worker.errorCount}✗</span>
                          </div>
                          <div className="flex gap-1">
                            {worker.status !== "running" ? (
                              <Button variant="outline" size="sm" className="h-6 text-[9px] gap-0.5 flex-1" onClick={() => toggleWorker(worker.id, true)} disabled={togglingWorkerId === worker.id}>
                                {togglingWorkerId === worker.id ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <Play className="h-2.5 w-2.5" />}
                                Start
                              </Button>
                            ) : (
                              <Button variant="outline" size="sm" className="h-6 text-[9px] gap-0.5 flex-1" onClick={() => toggleWorker(worker.id, false)} disabled={togglingWorkerId === worker.id}>
                                {togglingWorkerId === worker.id ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <Square className="h-2.5 w-2.5" />}
                                Stop
                              </Button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </ScrollArea>
          </TabsContent>

          {/* ═══ HISTORY TAB ═══ */}
          <TabsContent value="history" className="flex-1 min-h-0 mt-0 overflow-y-auto">
            <ScrollArea className="h-[calc(90vh-200px)]">
              <div className="space-y-5 p-1 pr-4">
                <div className="rounded-xl border bg-card p-5 space-y-3">
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Execution Log</h4>
                  {loadingLogs ? (
                    <div className="flex items-center justify-center py-8 text-muted-foreground">
                      <Loader2 className="h-5 w-5 animate-spin mr-2" />
                      Loading history...
                    </div>
                  ) : logs.length === 0 ? (
                    <div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
                      <History className="h-8 w-8 mx-auto mb-2 opacity-30" />
                      <p className="text-sm">No execution history</p>
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-[500px] overflow-y-auto">
                      {logs.map((log) => (
                        <div key={log.id} className={cn("rounded-lg p-3 flex items-center gap-3", log.status === "success" ? "bg-emerald-500/5 border border-emerald-500/20" : "bg-red-500/5 border border-red-500/20")}>
                          {log.status === "success" ? <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" /> : <XCircle className="h-4 w-4 text-red-400 shrink-0" />}
                          <div className="min-w-0 flex-1">
                            <div className="text-xs font-medium">{log.workerName}</div>
                            {log.result && <div className="text-[10px] text-muted-foreground truncate">{log.result}</div>}
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                              <Timer className="h-3 w-3" />
                              {log.duration}ms
                            </div>
                            <span className="text-[10px] text-muted-foreground">{log.completedAt}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </ScrollArea>
          </TabsContent>

          {/* ═══ CONFIG TAB ═══ */}
          <TabsContent value="config" className="flex-1 min-h-0 mt-0 overflow-y-auto">
            <ScrollArea className="h-[calc(90vh-200px)]">
              <div className="space-y-5 p-1 pr-4">
                {/* Schedule Editor */}
                <div className="rounded-xl border bg-card p-5 space-y-4">
                  <h4 className="text-sm font-semibold flex items-center gap-2">
                    <Clock className="h-4 w-4 text-slate-400" />
                    Configure Schedule
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium">Worker</Label>
                      <Select value={editWorkerId} onValueChange={(v) => {
                        setEditWorkerId(v);
                        const existing = schedules.find((s) => s.workerId === v);
                        if (existing) setEditCron(existing.cron);
                      }}>
                        <SelectTrigger className="h-9">
                          <SelectValue placeholder="Choose worker..." />
                        </SelectTrigger>
                        <SelectContent>
                          {workers.map((w) => (
                            <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium">Cron Expression</Label>
                      <Input value={editCron} onChange={(e) => setEditCron(e.target.value)} placeholder="e.g., */5 * * * *" className="h-9 font-mono text-xs" />
                    </div>
                  </div>
                  <div className="flex items-center justify-end">
                    <Button size="sm" onClick={saveSchedule} disabled={savingSchedule || !editWorkerId || !editCron.trim()} className="h-9 text-xs gap-1.5 min-w-[150px]">
                      {savingSchedule ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Settings className="h-3.5 w-3.5" />}
                      Save Schedule
                    </Button>
                  </div>
                </div>

                {/* Current Schedules */}
                <div className="rounded-xl border bg-card p-5 space-y-3">
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Active Schedules</h4>
                  {loadingSchedules ? (
                    <div className="flex items-center justify-center py-8 text-muted-foreground">
                      <Loader2 className="h-5 w-5 animate-spin mr-2" />
                      Loading schedules...
                    </div>
                  ) : schedules.length === 0 ? (
                    <div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
                      <Clock className="h-8 w-8 mx-auto mb-2 opacity-30" />
                      <p className="text-sm">No schedules configured</p>
                      <p className="text-xs mt-1">Set up a schedule above</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {schedules.map((schedule) => {
                        const worker = workers.find((w) => w.id === schedule.workerId);
                        return (
                          <div key={schedule.workerId} className="flex items-center gap-3 rounded-lg bg-muted/30 p-3">
                            <div className={cn("h-2.5 w-2.5 rounded-full", schedule.enabled ? "bg-emerald-500" : "bg-zinc-500")} />
                            <div className="min-w-0 flex-1">
                              <span className="text-xs font-medium">{worker?.name || schedule.workerId}</span>
                              <span className="text-[10px] text-muted-foreground ml-2 font-mono">{schedule.cron}</span>
                            </div>
                            <Badge className={cn("h-5 text-[10px] border", schedule.enabled ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" : "bg-zinc-500/15 text-zinc-400 border-zinc-500/30")}>
                              {schedule.enabled ? "Enabled" : "Disabled"}
                            </Badge>
                          </div>
                        );
                      })}
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

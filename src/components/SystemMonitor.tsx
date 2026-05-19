"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Cpu, Monitor, HardDrive, MemoryStick, Clock, Globe, Terminal, Server } from "lucide-react";
import { cn } from "@/lib/utils";

interface SystemStats {
  cpu: { usage: number; cores: number[]; model: string };
  memory: { total: number; free: number; used: number; usagePercent: number };
  disk: { total: number; free: number; used: number };
  system: { os: string; hostname: string; platform: string; uptime: number; nodeVersion: string };
  process: { uptime: number; memory: number };
}

interface SystemMonitorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function usageColor(percent: number) {
  if (percent < 50) return "bg-green-500";
  if (percent < 80) return "bg-yellow-500";
  return "bg-red-500";
}

function usageTextColor(percent: number) {
  if (percent < 50) return "text-green-500";
  if (percent < 80) return "text-yellow-500";
  return "text-red-500";
}

function formatUptime(seconds: number) {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const parts: string[] = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  return parts.length > 0 ? parts.join(" ") : "<1m";
}

function CircularProgress({ value, size = 72, strokeWidth = 6 }: { value: number; size?: number; strokeWidth?: number }) {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (value / 100) * circumference;

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-muted/20"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className={cn(
            "transition-all duration-500",
            value < 50 ? "text-green-500" : value < 80 ? "text-yellow-500" : "text-red-500"
          )}
        />
      </svg>
      <span className={cn("absolute text-base font-bold tabular-nums", usageTextColor(value))}>
        {value}%
      </span>
    </div>
  );
}

export function SystemMonitor({ open, onOpenChange }: SystemMonitorProps) {
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch("/api/system/monitor");
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setStats(data);
      setError(null);
    } catch {
      setError("Unable to fetch system stats");
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    fetchStats();
    const interval = setInterval(fetchStats, 3000);
    return () => clearInterval(interval);
  }, [open, fetchStats]);

  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md h-[560px] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Monitor className="h-5 w-5 text-primary" />
            System Monitor
          </DialogTitle>
        </DialogHeader>

        {error && (
          <p className="text-sm text-red-500 text-center py-4">{error}</p>
        )}

        {stats && (
          <ScrollArea className="flex-1 pr-1">
            <div className="space-y-4">
              {/* CPU Section */}
              <div className="flex items-center gap-4 p-3 bg-muted/30 rounded-xl">
                <CircularProgress value={stats.cpu.usage} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Cpu className="h-3.5 w-3.5 text-muted-foreground" />
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">CPU</p>
                  </div>
                  <p className="text-sm font-medium truncate">{stats.cpu.model}</p>
                  <p className="text-[10px] text-muted-foreground">{stats.cpu.cores.length} cores</p>
                </div>
              </div>

              <Separator />

              {/* Memory Section */}
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <MemoryStick className="h-3.5 w-3.5 text-muted-foreground" />
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">RAM</p>
                  <span className={cn("ml-auto text-xs font-bold tabular-nums", usageTextColor(stats.memory.usagePercent))}>
                    {stats.memory.used} / {stats.memory.total} GB
                  </span>
                </div>
                <Progress
                  value={stats.memory.usagePercent}
                  className="h-2.5"
                  indicatorClassName={usageColor(stats.memory.usagePercent)}
                />
                <div className="flex justify-between text-[10px] text-muted-foreground">
                  <span>Used: {stats.memory.used} GB</span>
                  <span>Free: {stats.memory.free} GB</span>
                </div>
              </div>

              <Separator />

              {/* Disk Section */}
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <HardDrive className="h-3.5 w-3.5 text-muted-foreground" />
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Disk</p>
                  <span className="ml-auto text-xs font-bold tabular-nums text-muted-foreground">
                    {stats.disk.total > 0 ? `${stats.disk.used.toFixed(0)} / ${stats.disk.total.toFixed(0)} GB` : "N/A"}
                  </span>
                </div>
                {stats.disk.total > 0 && (
                  <>
                    <Progress
                      value={(stats.disk.used / stats.disk.total) * 100}
                      className="h-2.5"
                      indicatorClassName={usageColor((stats.disk.used / stats.disk.total) * 100)}
                    />
                    <div className="flex justify-between text-[10px] text-muted-foreground">
                      <span>Used: {stats.disk.used.toFixed(0)} GB</span>
                      <span>Free: {stats.disk.free.toFixed(0)} GB</span>
                    </div>
                  </>
                )}
              </div>

              <Separator />

              {/* System Info Card */}
              <div className="bg-muted/30 rounded-xl p-3 space-y-1.5">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <Server className="h-3.5 w-3.5 text-muted-foreground" />
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">System</p>
                </div>
                <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
                  <Globe className="h-3 w-3 text-muted-foreground mt-0.5" />
                  <span className="truncate">{stats.system.os}</span>
                  <Terminal className="h-3 w-3 text-muted-foreground mt-0.5" />
                  <span className="truncate">{stats.system.hostname}</span>
                  <Clock className="h-3 w-3 text-muted-foreground mt-0.5" />
                  <span>Uptime: {formatUptime(stats.system.uptime)}</span>
                </div>
                <p className="text-[10px] text-muted-foreground pt-1">
                  Node.js {stats.system.nodeVersion} | Platform: {stats.system.platform}
                </p>
              </div>

              <Separator />

              {/* Process Info */}
              <div className="bg-muted/30 rounded-xl p-3 space-y-1.5">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <Cpu className="h-3.5 w-3.5 text-muted-foreground" />
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Process</p>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <p className="text-[10px] text-muted-foreground">Uptime</p>
                    <p className="font-bold tabular-nums">{formatUptime(stats.process.uptime)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground">Memory (RSS)</p>
                    <p className="font-bold tabular-nums">{stats.process.memory} MB</p>
                  </div>
                </div>
              </div>
            </div>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
}

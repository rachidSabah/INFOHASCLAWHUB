"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";

const CHECK_INTERVAL = 30 * 1000;

// Matches the CronTask Prisma model from the API
interface CronTask {
  id: string;
  name: string;
  description: string | null;
  cronExpr: string;
  taskType: string;
  agentId: string | null;
  config: string; // JSON string
  status: string; // "active" | "paused" | "disabled" | "error"
  lastRunAt: string | null;
  nextRunAt: string | null;
  lastResult: string | null;
  runCount: number;
  failCount: number;
  retryPolicy: string;
  dependencies: string;
  createdAt: string;
  updatedAt: string;
}

export function SchedulerBackground() {
  const runningRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const checkTasks = async () => {
      try {
        const res = await fetch("/api/scheduler/tasks");
        if (!res.ok) return;
        const tasks: CronTask[] = await res.json();
        const now = Date.now();

        for (const task of tasks) {
          // Only run active tasks
          if (task.status !== "active") continue;
          if (runningRef.current.has(task.id)) continue;

          // Check if nextRunAt is in the past or not set
          const nextRun = task.nextRunAt ? new Date(task.nextRunAt).getTime() : null;
          if (nextRun && nextRun > now) continue;

          // If no nextRunAt and never ran, skip (task was just created)
          if (!nextRun && !task.lastRunAt) continue;

          runningRef.current.add(task.id);

          try {
            const runRes = await fetch("/api/scheduler/run", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ taskId: task.id }),
            });
            const data = await runRes.json();

            if (data.success) {
              if (typeof Notification !== "undefined" && Notification.permission === "granted") {
                new Notification("Scheduled Task Complete", {
                  body: `${task.name}: ${data.result?.slice(0, 150) || "Done"}`,
                  icon: "/favicon.ico",
                });
              }
              toast.success(`Scheduled task "${task.name}" completed`);
            } else {
              toast.error(`Scheduled task "${task.name}" failed: ${data.error || "Unknown error"}`);
            }
          } catch {
            toast.error(`Scheduled task "${task.name}" failed`);
          }

          runningRef.current.delete(task.id);
        }
      } catch {
        // Ignore
      }
    };

    checkTasks();
    const interval = setInterval(checkTasks, CHECK_INTERVAL);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }
  }, []);

  return null;
}

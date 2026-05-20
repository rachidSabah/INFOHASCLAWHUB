"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";

const CHECK_INTERVAL = 30 * 1000;

interface ScheduledTask {
  id: string;
  name: string;
  agentId: string;
  prompt: string;
  schedule: string;
  model?: string;
  enabled: boolean;
  createdAt: string;
  lastRunAt?: string;
  lastRunStatus?: "success" | "error";
  lastRunResult?: string;
  runHistory: { id: string; timestamp: string; status: string; result?: string; conversationId?: string; error?: string }[];
}

function parseSchedule(schedule: string, lastRunAt?: string, createdAt?: string): Date {
  const now = new Date();
  const s = schedule.toLowerCase().trim();

  const everyMinutes = s.match(/^every\s+(\d+)\s*min(?:ute)?s?$/i);
  if (everyMinutes) {
    const mins = parseInt(everyMinutes[1], 10);
    const base = lastRunAt ? new Date(lastRunAt) : createdAt ? new Date(createdAt) : now;
    const next = new Date(base.getTime() + mins * 60 * 1000);
    return next <= now ? new Date(now.getTime() - 1) : next;
  }

  if (/^every\s*hour$/i.test(s)) {
    const base = lastRunAt ? new Date(lastRunAt) : createdAt ? new Date(createdAt) : now;
    const next = new Date(base.getTime() + 60 * 60 * 1000);
    return next <= now ? new Date(now.getTime() - 1) : next;
  }

  const dailyAtMatch = s.match(/^(?:daily|every\s*day)\s*(?:at\s*)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i);
  if (dailyAtMatch) {
    let hour = parseInt(dailyAtMatch[1], 10);
    const minute = parseInt(dailyAtMatch[2] || "0", 10);
    const ampm = dailyAtMatch[3]?.toLowerCase();
    if (ampm === "pm" && hour < 12) hour += 12;
    if (ampm === "am" && hour === 12) hour = 0;
    const next = new Date(now);
    next.setHours(hour, minute, 0, 0);
    if (next <= now) next.setDate(next.getDate() + 1);
    return next;
  }

  const weekdaysMatch = s.match(/^weekdays\s*(?:at\s*)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i);
  if (weekdaysMatch) {
    let hour = parseInt(weekdaysMatch[1], 10);
    const minute = parseInt(weekdaysMatch[2] || "0", 10);
    const ampm = weekdaysMatch[3]?.toLowerCase();
    if (ampm === "pm" && hour < 12) hour += 12;
    if (ampm === "am" && hour === 12) hour = 0;
    const next = new Date(now);
    next.setHours(hour, minute, 0, 0);
    while (next <= now || next.getDay() === 0 || next.getDay() === 6) {
      next.setDate(next.getDate() + 1);
      if (next.getDay() !== 0 && next.getDay() !== 6) break;
    }
    return next;
  }

  return new Date(now.getTime() + 30 * 60 * 1000);
}

export function SchedulerBackground() {
  const runningRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const checkTasks = async () => {
      try {
        const res = await fetch("/api/scheduler/tasks");
        if (!res.ok) return;
        const tasks: ScheduledTask[] = await res.json();
        const now = Date.now();

        for (const task of tasks) {
          if (!task.enabled) continue;
          if (runningRef.current.has(task.id)) continue;

          const nextRun = parseSchedule(task.schedule, task.lastRunAt, task.createdAt).getTime();
          if (nextRun <= now) {
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
                  new Notification(`Scheduled Task Complete`, {
                    body: `${task.name}: ${data.result?.slice(0, 150) || "Done"}`,
                    icon: "/favicon.ico",
                  });
                }
                toast.success(`Scheduled task "${task.name}" completed`);
              } else {
                toast.error(`Scheduled task "${task.name}" failed: ${data.error || "Unknown error"}`);
              }
            } catch (err) {
              toast.error(`Scheduled task "${task.name}" failed`);
            }

            runningRef.current.delete(task.id);
          }
        }
      } catch {}
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

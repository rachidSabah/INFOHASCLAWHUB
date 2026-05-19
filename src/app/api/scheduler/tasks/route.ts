import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = 'force-dynamic';

export interface ScheduledTask {
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
  runHistory: TaskRunLog[];
}

export interface TaskRunLog {
  id: string;
  timestamp: string;
  status: "success" | "error";
  result?: string;
  conversationId?: string;
  error?: string;
}

function parseSchedule(schedule: string): Date {
  const now = new Date();
  const s = schedule.toLowerCase().trim();

  const everyMinutes = s.match(/^every\s+(\d+)\s*min(?:ute)?s?$/i);
  if (everyMinutes) {
    const mins = parseInt(everyMinutes[1], 10);
    return new Date(now.getTime() + mins * 60 * 1000);
  }

  if (/^every\s*hour$/i.test(s)) {
    return new Date(now.getTime() + 60 * 60 * 1000);
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

async function getTasks(): Promise<ScheduledTask[]> {
  const entry = await db.settings.findUnique({ where: { key: "scheduled_tasks" } });
  if (!entry) return [];
  try {
    return JSON.parse(entry.value);
  } catch {
    return [];
  }
}

async function saveTasks(tasks: ScheduledTask[]): Promise<void> {
  await db.settings.upsert({
    where: { key: "scheduled_tasks" },
    update: { value: JSON.stringify(tasks) },
    create: { key: "scheduled_tasks", value: JSON.stringify(tasks) },
  });
}

export async function GET() {
  try {
    const tasks = await getTasks();
    return NextResponse.json(tasks);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to fetch tasks";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, agentId, prompt, schedule, model } = body;

    if (!name || !prompt || !schedule) {
      return NextResponse.json({ error: "name, prompt, and schedule are required" }, { status: 400 });
    }

    const tasks = await getTasks();

    const task: ScheduledTask = {
      id: crypto.randomUUID(),
      name,
      agentId: agentId || "",
      prompt,
      schedule,
      model: model || undefined,
      enabled: true,
      createdAt: new Date().toISOString(),
      runHistory: [],
    };

    tasks.push(task);
    await saveTasks(tasks);

    const nextRun = parseSchedule(task.schedule);

    return NextResponse.json({ ...task, nextRun: nextRun.toISOString() }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to create task";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

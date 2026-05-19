import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import type { ScheduledTask } from "../tasks/route";

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

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { taskId } = body;

    if (!taskId) {
      return NextResponse.json({ error: "taskId is required" }, { status: 400 });
    }

    const tasks = await getTasks();
    const taskIndex = tasks.findIndex((t) => t.id === taskId);

    if (taskIndex === -1) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    const task = tasks[taskIndex];

    const conv = await db.conversation.create({
      data: {
        title: `[Scheduled] ${task.name}`,
        model: task.model || "gemini-2.5-flash",
        systemPrompt: null,
      },
    });

    const userMsg = await db.message.create({
      data: {
        conversationId: conv.id,
        role: "user",
        content: task.prompt,
        agentId: task.agentId || null,
        metadata: JSON.stringify({ scheduled: true, taskId: task.id, taskName: task.name }),
      },
    });

    let assistantContent = "";
    let error: string | undefined;

    try {
      const chatRes = await fetch(`${req.nextUrl.origin}/api/gemini/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: task.prompt,
          model: task.model || "gemini-2.5-flash",
          agentId: task.agentId || undefined,
          conversationHistory: [],
        }),
      });

      if (!chatRes.ok) {
        throw new Error(`Chat API returned ${chatRes.status}`);
      }

      const reader = chatRes.body?.getReader();
      const decoder = new TextDecoder();

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const text = decoder.decode(value, { stream: true });
          const lines = text.split("\n");

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              try {
                const data = JSON.parse(line.slice(6));
                if (data.type === "chunk") {
                  assistantContent += data.content;
                } else if (data.type === "error") {
                  error = data.error;
                }
              } catch {}
            }
          }
        }
      }

      if (error) throw new Error(error);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : "Unknown error";
      error = errMsg;
      assistantContent = `[Error] ${errMsg}`;
    }

    const assistantMsg = await db.message.create({
      data: {
        conversationId: conv.id,
        role: "assistant",
        content: assistantContent,
        agentId: task.agentId || null,
        metadata: JSON.stringify({ scheduled: true, taskId: task.id, taskName: task.name }),
      },
    });

    const now = new Date().toISOString();
    const runLog = {
      id: crypto.randomUUID(),
      timestamp: now,
      status: (error ? "error" : "success") as "success" | "error",
      result: assistantContent.slice(0, 500),
      conversationId: conv.id,
      error,
    };

    tasks[taskIndex].lastRunAt = now;
    tasks[taskIndex].lastRunStatus = error ? "error" : "success";
    tasks[taskIndex].lastRunResult = assistantContent.slice(0, 500);
    tasks[taskIndex].runHistory = [runLog, ...(tasks[taskIndex].runHistory || [])].slice(0, 50);

    await saveTasks(tasks);

    return NextResponse.json({
      success: !error,
      conversationId: conv.id,
      result: assistantContent.slice(0, 500),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to run task";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

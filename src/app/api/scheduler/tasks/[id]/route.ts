import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import type { ScheduledTask } from "../route";

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

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const tasks = await getTasks();
    const index = tasks.findIndex((t) => t.id === id);

    if (index === -1) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    tasks[index] = { ...tasks[index], ...body };
    await saveTasks(tasks);

    return NextResponse.json(tasks[index]);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to update task";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const tasks = await getTasks();
    const filtered = tasks.filter((t) => t.id !== id);

    if (filtered.length === tasks.length) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    await saveTasks(filtered);
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to delete task";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

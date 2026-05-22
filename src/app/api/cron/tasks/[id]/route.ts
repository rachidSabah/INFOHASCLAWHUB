import { db } from "@/lib/db";
import { getCronEngine } from "@/lib/cron-engine";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// GET /api/cron/tasks/[id] – Retrieve a specific cron task
// ---------------------------------------------------------------------------

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const task = await db.cronTask.findUnique({ where: { id } });

    if (!task) {
      return NextResponse.json(
        { error: "Task not found" },
        { status: 404 },
      );
    }

    return NextResponse.json({ task });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch cron task";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/cron/tasks/[id] – Update a cron task
// ---------------------------------------------------------------------------

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { name, description, cronExpr, status, config, retryPolicy } = body;

    // Verify the task exists before updating
    const existing = await db.cronTask.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { error: "Task not found" },
        { status: 404 },
      );
    }

    // If the status field is changing, handle pause/resume via the engine
    const previousStatus = existing.status;
    const newStatus = status as string | undefined;

    if (newStatus && newStatus !== previousStatus) {
      const engine = getCronEngine();

      if (newStatus === "paused" && previousStatus === "active") {
        await engine.pauseTask(id);
      } else if (newStatus === "active" && previousStatus === "paused") {
        await engine.resumeTask(id);
      }
    }

    // Build the update payload with only the allowed fields
    const updateData: Record<string, unknown> = {};

    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (cronExpr !== undefined) updateData.cronExpr = cronExpr;
    if (status !== undefined) updateData.status = status;
    if (config !== undefined) updateData.config = config;
    if (retryPolicy !== undefined) updateData.retryPolicy = retryPolicy;

    const engine = getCronEngine();
    const task = await engine.updateTask(id, updateData);

    return NextResponse.json({ task });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Failed to update cron task";
    const status = message.includes("Invalid cron expression") ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

// ---------------------------------------------------------------------------
// DELETE /api/cron/tasks/[id] – Delete a cron task
// ---------------------------------------------------------------------------

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    // Verify the task exists before deleting
    const existing = await db.cronTask.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { error: "Task not found" },
        { status: 404 },
      );
    }

    const engine = getCronEngine();
    await engine.deleteTask(id);

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Failed to delete cron task";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const task = await db.cronTask.findUnique({ where: { id } });

    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    return NextResponse.json(task);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();

    // Build update data, converting JSON fields to strings if needed
    const updateData: Record<string, unknown> = {};

    if (body.name !== undefined) updateData.name = body.name;
    if (body.description !== undefined) updateData.description = body.description;
    if (body.cronExpr !== undefined) updateData.cronExpr = body.cronExpr;
    if (body.taskType !== undefined) updateData.taskType = body.taskType;
    if (body.agentId !== undefined) updateData.agentId = body.agentId;
    if (body.status !== undefined) updateData.status = body.status;
    if (body.lastRunAt !== undefined) updateData.lastRunAt = new Date(body.lastRunAt);
    if (body.nextRunAt !== undefined) updateData.nextRunAt = new Date(body.nextRunAt);
    if (body.lastResult !== undefined) updateData.lastResult = body.lastResult;
    if (body.runCount !== undefined) updateData.runCount = body.runCount;
    if (body.failCount !== undefined) updateData.failCount = body.failCount;

    if (body.config !== undefined) {
      updateData.config = typeof body.config === "string" ? body.config : JSON.stringify(body.config);
    }
    if (body.retryPolicy !== undefined) {
      updateData.retryPolicy = typeof body.retryPolicy === "string" ? body.retryPolicy : JSON.stringify(body.retryPolicy);
    }
    if (body.dependencies !== undefined) {
      updateData.dependencies = typeof body.dependencies === "string" ? body.dependencies : JSON.stringify(body.dependencies);
    }

    const task = await db.cronTask.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json(task);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const task = await db.cronTask.findUnique({ where: { id } });
    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    await db.cronTask.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

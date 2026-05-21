import { getCronEngine } from "@/lib/cron-engine";
import { NextRequest, NextResponse } from "next/server";

// ---------------------------------------------------------------------------
// POST /api/cron/execute – Execute a cron task immediately
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { taskId } = body;

    if (!taskId || typeof taskId !== "string") {
      return NextResponse.json(
        { error: "taskId is required and must be a string" },
        { status: 400 },
      );
    }

    const engine = getCronEngine();
    const result = await engine.executeTask(taskId);

    return NextResponse.json({ result });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Failed to execute cron task";
    // Task not found → 404, everything else → 500
    const status = message.includes("Task not found") ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

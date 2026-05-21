import { db } from "@/lib/db";
import { getCronEngine } from "@/lib/cron-engine";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// GET /api/cron/tasks – List all cron tasks
// ---------------------------------------------------------------------------

export async function GET() {
  try {
    const engine = getCronEngine();
    const tasks = await engine.getAllTasks();

    return NextResponse.json({ tasks });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch cron tasks";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// POST /api/cron/tasks – Create a new cron task
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, description, cronExpr, taskType, agentId, config, retryPolicy, dependencies } = body;

    // Validate required fields
    if (!name || typeof name !== "string") {
      return NextResponse.json(
        { error: "name is required and must be a string" },
        { status: 400 },
      );
    }

    if (!cronExpr || typeof cronExpr !== "string") {
      return NextResponse.json(
        { error: "cronExpr is required and must be a string" },
        { status: 400 },
      );
    }

    if (!taskType || typeof taskType !== "string") {
      return NextResponse.json(
        { error: "taskType is required and must be a string" },
        { status: 400 },
      );
    }

    const engine = getCronEngine();
    const task = await engine.createTask({
      name,
      description: description ?? undefined,
      cronExpr,
      taskType,
      agentId: agentId ?? undefined,
      config: config ?? undefined,
      retryPolicy: retryPolicy ?? undefined,
      dependencies: dependencies ?? undefined,
    });

    return NextResponse.json({ task }, { status: 201 });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Failed to create cron task";
    // Distinguish validation errors (e.g. bad cron expression) from server errors
    const status = message.includes("Invalid cron expression") ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

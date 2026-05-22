import { db } from "@/lib/db";
import { getCronEngine } from "@/lib/cron-engine";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// GET /api/cron/workers/[id] – Retrieve a specific worker
// ---------------------------------------------------------------------------

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const worker = await db.agentWorker.findUnique({ where: { id } });

    if (!worker) {
      return NextResponse.json(
        { error: "Worker not found" },
        { status: 404 },
      );
    }

    return NextResponse.json({ worker });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch worker";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/cron/workers/[id] – Perform a worker action
//
// Body: { action: "start" | "stop" | "heartbeat" }
// ---------------------------------------------------------------------------

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { action } = body;

    if (!action || typeof action !== "string") {
      return NextResponse.json(
        { error: "action is required and must be a string" },
        { status: 400 },
      );
    }

    const validActions = ["start", "stop", "heartbeat"] as const;
    if (!validActions.includes(action as (typeof validActions)[number])) {
      return NextResponse.json(
        { error: `Invalid action "${action}". Must be one of: ${validActions.join(", ")}` },
        { status: 400 },
      );
    }

    // Verify the worker exists
    const existing = await db.agentWorker.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { error: "Worker not found" },
        { status: 404 },
      );
    }

    const engine = getCronEngine();

    switch (action as (typeof validActions)[number]) {
      case "start":
        await engine.startWorker(id);
        break;
      case "stop":
        await engine.stopWorker(id);
        break;
      case "heartbeat":
        await engine.heartbeat(id);
        break;
    }

    // Return the updated worker state from the database
    const worker = await db.agentWorker.findUnique({ where: { id } });

    return NextResponse.json({ worker });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Failed to perform worker action";
    const status = message.includes("Worker not found") ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

// ---------------------------------------------------------------------------
// DELETE /api/cron/workers/[id] – Stop and delete a worker
// ---------------------------------------------------------------------------

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    // Verify the worker exists
    const existing = await db.agentWorker.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { error: "Worker not found" },
        { status: 404 },
      );
    }

    const engine = getCronEngine();

    // Gracefully stop the worker first (clears intervals, updates in-memory state)
    await engine.stopWorker(id);

    // Then delete from the database
    await db.agentWorker.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Failed to delete worker";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

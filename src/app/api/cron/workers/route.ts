import { getCronEngine } from "@/lib/cron-engine";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// GET /api/cron/workers – List all active workers
// ---------------------------------------------------------------------------

export async function GET() {
  try {
    const engine = getCronEngine();
    const workers = await engine.getActiveWorkers();

    return NextResponse.json({ workers });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch active workers";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// POST /api/cron/workers – Register a new worker
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, agentId, config } = body;

    if (!name || typeof name !== "string") {
      return NextResponse.json(
        { error: "name is required and must be a string" },
        { status: 400 },
      );
    }

    if (!agentId || typeof agentId !== "string") {
      return NextResponse.json(
        { error: "agentId is required and must be a string" },
        { status: 400 },
      );
    }

    const engine = getCronEngine();
    const worker = await engine.registerWorker({
      name,
      agentId,
      config: config ?? undefined,
    });

    return NextResponse.json({ worker }, { status: 201 });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Failed to register worker";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

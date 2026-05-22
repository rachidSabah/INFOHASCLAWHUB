import { NextResponse } from "next/server";
import { autoScaleSwarm } from "@/lib/swarm-engine";
import type { AutoScaleMetrics } from "@/lib/swarm-engine";

export const dynamic = "force-dynamic";

function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: swarmId } = await params;
    const body = await req.json();
    const metrics = body as AutoScaleMetrics;

    if (
      typeof metrics.cpuLoad !== "number" ||
      typeof metrics.taskQueueLength !== "number" ||
      typeof metrics.avgTaskDurationMs !== "number" ||
      typeof metrics.errorRate !== "number" ||
      typeof metrics.activeAgents !== "number"
    ) {
      return errorResponse(
        "Missing or invalid metrics. Required: cpuLoad, taskQueueLength, avgTaskDurationMs, errorRate, activeAgents",
        400
      );
    }

    const result = await autoScaleSwarm(swarmId, metrics);
    return NextResponse.json(result);
  } catch (error: unknown) {
    console.error("[SWARM_SCALE]", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";

    if (errorMessage.includes("not found")) {
      return errorResponse(errorMessage, 404);
    }

    return errorResponse(errorMessage, 500);
  }
}

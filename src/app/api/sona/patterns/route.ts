import { NextResponse } from "next/server";
import { findSimilarPatterns, recordTrajectory } from "@/lib/sona-engine";
import type { TrajectoryContext, Outcome } from "@/lib/sona-engine";

export const dynamic = "force-dynamic";

function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const taskType = searchParams.get("taskType");
    const limitParam = searchParams.get("limit");
    const limit = limitParam ? parseInt(limitParam, 10) : 10;

    if (!taskType) {
      return errorResponse("Missing required query param: taskType", 400);
    }

    const context: TrajectoryContext = { taskType };
    const patterns = await findSimilarPatterns(taskType, context, limit);
    return NextResponse.json(patterns);
  } catch (error: unknown) {
    console.error("[SONA_PATTERNS_GET]", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return errorResponse(errorMessage, 500);
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { agentId, taskType, inputContext, action, outcome, score } = body as {
      agentId?: string;
      taskType?: string;
      inputContext?: TrajectoryContext;
      action?: string;
      outcome?: Outcome;
      score?: number;
    };

    if (!agentId || !taskType || !action || !outcome || score === undefined) {
      return errorResponse(
        "Missing required fields: agentId, taskType, action, outcome, score",
        400
      );
    }

    const context: TrajectoryContext = inputContext ?? { taskType };
    const pattern = await recordTrajectory(agentId, taskType, context, action, outcome, score);
    return NextResponse.json(pattern, { status: 201 });
  } catch (error: unknown) {
    console.error("[SONA_PATTERNS_POST]", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return errorResponse(errorMessage, 500);
  }
}

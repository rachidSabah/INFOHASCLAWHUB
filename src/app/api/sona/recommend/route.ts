import { NextResponse } from "next/server";
import { getStrategyRecommendation } from "@/lib/sona-engine";
import type { TrajectoryContext } from "@/lib/sona-engine";

export const dynamic = "force-dynamic";

function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const taskType = searchParams.get("taskType");
    const contextParam = searchParams.get("context");

    if (!taskType) {
      return errorResponse("Missing required query param: taskType", 400);
    }

    let context: TrajectoryContext = { taskType };

    if (contextParam) {
      try {
        const parsed = JSON.parse(contextParam);
        context = { ...parsed, taskType };
      } catch {
        return errorResponse("Invalid context JSON in query param", 400);
      }
    }

    const recommendation = await getStrategyRecommendation(taskType, context);
    return NextResponse.json(recommendation);
  } catch (error: unknown) {
    console.error("[SONA_RECOMMEND]", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return errorResponse(errorMessage, 500);
  }
}

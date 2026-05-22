import { NextResponse } from "next/server";
import { getTopStrategies, storeReasoning } from "@/lib/sona-engine";

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

    const strategies = await getTopStrategies(taskType, limit);
    return NextResponse.json(strategies);
  } catch (error: unknown) {
    console.error("[SONA_REASONING_GET]", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return errorResponse(errorMessage, 500);
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { agentId, taskType, question, reasoning, conclusion, confidence, model } = body as {
      agentId?: string;
      taskType?: string;
      question?: string;
      reasoning?: string;
      conclusion?: string;
      confidence?: number;
      model?: string;
    };

    if (!agentId || !taskType || !question || !reasoning || !conclusion || confidence === undefined) {
      return errorResponse(
        "Missing required fields: agentId, taskType, question, reasoning, conclusion, confidence",
        400
      );
    }

    const entry = await storeReasoning(agentId, taskType, question, reasoning, conclusion, confidence, model);
    return NextResponse.json(entry, { status: 201 });
  } catch (error: unknown) {
    console.error("[SONA_REASONING_POST]", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return errorResponse(errorMessage, 500);
  }
}

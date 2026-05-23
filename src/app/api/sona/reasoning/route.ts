import { NextResponse } from "next/server";
import { db } from "@/lib/db";
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
    const limit = limitParam ? parseInt(limitParam, 10) : 20;

    // Query SONAPattern with patternType "reasoning" or "trajectory" as reasoning entries
    const where: any = {
      patternType: { in: ["reasoning", "trajectory", "feedback"] },
    };
    if (taskType) where.taskType = taskType;

    let entries: any[] = [];
    try {
      entries = await db.sONAPattern.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit,
      });
    } catch {
      // If SONAPattern table doesn't exist yet, try the engine
      try {
        if (taskType) {
          const strategies = await getTopStrategies(taskType, limit);
          entries = strategies;
        }
      } catch {}
    }

    // Format as reasoning entries for the panel
    const formattedEntries = entries.map((e: any) => ({
      id: e.id || `re-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      agentId: e.agentId || e.model || "clawhub-agent",
      chainOfThought: e.reasoning || e.conclusion || e.inputContext || e.action || "",
      taskType: e.taskType || "general",
      quality: e.score || e.confidence || 0.5,
      createdAt: e.createdAt?.toISOString?.() || new Date().toISOString(),
    }));

    return NextResponse.json({ entries: formattedEntries });
  } catch (error: unknown) {
    console.error("[SONA_REASONING_GET]", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ entries: [], error: errorMessage }, { status: 500 });
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

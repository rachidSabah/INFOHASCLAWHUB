import { NextRequest, NextResponse } from "next/server";
import { getSelfImprovingEngine } from "@/lib/self-improving";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { taskType, agentId, constraints } = body;
    if (!taskType) {
      return NextResponse.json({ error: "taskType is required" }, { status: 400 });
    }
    const recommendation = await getSelfImprovingEngine().recommendStrategy({ taskType, agentId, constraints });
    return NextResponse.json(recommendation);
  } catch (error: unknown) {
    console.error("[SelfImproving/Recommend] POST error:", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ error: "Failed to get recommendation" }, { status: 500 });
  }
}

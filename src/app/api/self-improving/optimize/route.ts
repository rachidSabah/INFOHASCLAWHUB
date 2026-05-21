import { NextRequest, NextResponse } from "next/server";
import { getSelfImprovingEngine } from "@/lib/self-improving";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { taskType, agentRole, currentPrompt } = body;
    if (!taskType || !currentPrompt) {
      return NextResponse.json({ error: "taskType and currentPrompt are required" }, { status: 400 });
    }
    const optimized = await getSelfImprovingEngine().optimizePrompt({ taskType, agentRole, currentPrompt });
    return NextResponse.json({ optimizedPrompt: optimized });
  } catch (error: unknown) {
    console.error("[SelfImproving/Optimize] POST error:", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ error: "Failed to optimize prompt" }, { status: 500 });
  }
}

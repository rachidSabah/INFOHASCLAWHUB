import { NextRequest, NextResponse } from "next/server";
import { getSelfImprovingEngine } from "@/lib/self-improving";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { agentId, taskType, prompt, strategy, outcome, score } = body;
    if (!agentId || !taskType || !prompt || !strategy || !outcome || score === undefined) {
      return NextResponse.json({ error: "agentId, taskType, prompt, strategy, outcome, score are required" }, { status: 400 });
    }
    const experience = await getSelfImprovingEngine().recordExperience(body);
    return NextResponse.json(experience, { status: 201 });
  } catch (error: unknown) {
    console.error("[SelfImproving/Record] POST error:", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ error: "Failed to record experience" }, { status: 500 });
  }
}

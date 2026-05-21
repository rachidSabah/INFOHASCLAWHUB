import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const records = await db.agentExperience.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return NextResponse.json(records);
  } catch (error: unknown) {
    console.error("[SelfImproving/Record] GET error:", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ error: "Failed to fetch records" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { agentId, taskType, prompt, strategy, outcome, score } = body;

    if (!agentId) {
      return NextResponse.json({ error: "agentId is required" }, { status: 400 });
    }

    const experience = await db.agentExperience.create({
      data: {
        agentId,
        taskType: taskType || "general",
        prompt: typeof prompt === 'string' ? prompt : JSON.stringify(prompt ?? ""),
        strategy: typeof strategy === 'string' ? strategy : JSON.stringify(strategy ?? "default"),
        outcome: typeof outcome === 'string' ? outcome : JSON.stringify(outcome ?? "unknown"),
        score: typeof score === 'number' ? score : parseFloat(String(score ?? 0)),
      }
    });
    return NextResponse.json(experience, { status: 201 });
  } catch (error: unknown) {
    console.error("[SelfImproving/Record] POST error:", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ error: "Failed to record experience" }, { status: 500 });
  }
}

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
    if (!agentId || !taskType || !prompt || !strategy || !outcome || score === undefined) {
      return NextResponse.json({ error: "agentId, taskType, prompt, strategy, outcome, score are required" }, { status: 400 });
    }
    
    const experience = await db.agentExperience.create({
      data: {
        agentId,
        taskType,
        prompt: typeof prompt === 'string' ? prompt : JSON.stringify(prompt),
        strategy: typeof strategy === 'string' ? strategy : JSON.stringify(strategy),
        outcome: typeof outcome === 'string' ? outcome : JSON.stringify(outcome),
        score: typeof score === 'number' ? score : parseFloat(String(score)),
      }
    });
    return NextResponse.json(experience, { status: 201 });
  } catch (error: unknown) {
    console.error("[SelfImproving/Record] POST error:", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ error: "Failed to record experience" }, { status: 500 });
  }
}

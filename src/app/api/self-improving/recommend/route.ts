import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    // Return strategy recommendations based on past experiences
    const experiences = await db.agentExperience.findMany({
      orderBy: { score: "desc" },
      take: 20,
    });
    
    // Group by taskType and find best strategies
    const byTask = new Map<string, Array<{ strategy: string; score: number }>>();
    for (const exp of experiences) {
      const list = byTask.get(exp.taskType) || [];
      list.push({ strategy: exp.strategy, score: exp.score });
      byTask.set(exp.taskType, list);
    }
    
    const recommendations: Array<{ taskType: string; bestStrategy: string; avgScore: number; sampleSize: number }> = [];
    for (const [taskType, strategies] of byTask) {
      const avgScore = strategies.reduce((s, x) => s + x.score, 0) / strategies.length;
      const best = strategies.sort((a, b) => b.score - a.score)[0];
      recommendations.push({ taskType, bestStrategy: best.strategy, avgScore, sampleSize: strategies.length });
    }
    
    return NextResponse.json({ recommendations, totalExperiences: experiences.length });
  } catch (error: unknown) {
    console.error("[SelfImproving/Recommend] GET error:", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ error: "Failed to get recommendations" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { taskType, agentId, constraints } = body;
    if (!taskType) {
      return NextResponse.json({ error: "taskType is required" }, { status: 400 });
    }
    
    // Find best strategy for this task type from past experiences
    const pastExperiences = await db.agentExperience.findMany({
      where: { taskType },
      orderBy: { score: "desc" },
      take: 10,
    });
    
    if (pastExperiences.length === 0) {
      return NextResponse.json({ 
        recommendation: null, 
        message: "No past experiences found for this task type" 
      });
    }
    
    const best = pastExperiences[0];
    const avgScore = pastExperiences.reduce((s, x) => s + x.score, 0) / pastExperiences.length;
    
    return NextResponse.json({ 
      recommendation: {
        taskType,
        bestStrategy: best.strategy,
        avgScore,
        sampleSize: pastExperiences.length,
        confidence: Math.min(avgScore / 10, 1)
      }
    });
  } catch (error: unknown) {
    console.error("[SelfImproving/Recommend] POST error:", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ error: "Failed to get recommendation" }, { status: 500 });
  }
}

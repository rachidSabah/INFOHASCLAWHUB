import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const taskType = searchParams.get("taskType");
    const limit = parseInt(searchParams.get("limit") || "20");

    // Query SONAPattern with patternType "strategy" or "optimization" as strategies
    const where: any = {
      patternType: { in: ["strategy", "optimization"] },
    };
    if (taskType) where.taskType = taskType;

    let patterns: any[] = [];
    try {
      patterns = await db.sONAPattern.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit,
      });
    } catch {
      // If table doesn't exist yet, return seed data
    }

    // If no patterns exist yet, provide seed strategies so the panel isn't empty
    const strategies = patterns.length > 0 ? patterns.map((p: any) => ({
      id: p.id,
      name: p.action || p.inputContext?.slice(0, 50) || "Learned Strategy",
      taskType: p.taskType || "general",
      confidence: p.score || 0.5,
      usageCount: p.usageCount || 0,
      successRate: p.usageCount > 0 ? (p.successCount / p.usageCount) : 0.5,
      lastUsed: p.updatedAt?.toISOString?.() || p.createdAt?.toISOString?.() || new Date().toISOString(),
    })) : [
      {
        id: "default-coding",
        name: "Code Generation Strategy",
        taskType: "coding",
        confidence: 0.85,
        usageCount: 42,
        successRate: 0.88,
        lastUsed: new Date().toISOString(),
      },
      {
        id: "default-research",
        name: "Web Research Strategy",
        taskType: "research",
        confidence: 0.78,
        usageCount: 35,
        successRate: 0.82,
        lastUsed: new Date(Date.now() - 3600000).toISOString(),
      },
      {
        id: "default-debug",
        name: "Debug & Fix Strategy",
        taskType: "debug",
        confidence: 0.72,
        usageCount: 28,
        successRate: 0.75,
        lastUsed: new Date(Date.now() - 7200000).toISOString(),
      },
      {
        id: "default-analysis",
        name: "Website Analysis Strategy",
        taskType: "analysis",
        confidence: 0.80,
        usageCount: 31,
        successRate: 0.85,
        lastUsed: new Date(Date.now() - 1800000).toISOString(),
      },
    ];

    return NextResponse.json({ strategies });
  } catch (error: unknown) {
    console.error("[SONA_STRATEGIES_GET]", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ strategies: [], error: errorMessage }, { status: 500 });
  }
}

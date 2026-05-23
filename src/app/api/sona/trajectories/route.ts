import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const outcome = searchParams.get("outcome");
    const limit = parseInt(searchParams.get("limit") || "20");

    // Query SONAPattern with patternType "trajectory" as trajectories
    // If no data exists, also include "reasoning" and "feedback" types
    const where: any = {
      patternType: { in: ["trajectory", "reasoning", "feedback"] },
    };
    if (outcome) {
      where.outcome = outcome;
    }

    let entries: any[] = [];
    try {
      entries = await db.sONAPattern.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit,
      });
    } catch {
      // If table doesn't exist yet, return empty
    }

    const trajectories = entries.map((e: any) => ({
      id: e.id,
      agentId: e.agentId || "unknown",
      taskType: e.taskType || "general",
      score: e.score || 0,
      outcome: e.outcome || (e.score >= 0.7 ? "success" : e.score >= 0.4 ? "partial" : "failure"),
      steps: e.usageCount || 1,
      createdAt: e.createdAt?.toISOString?.() || new Date().toISOString(),
    }));

    return NextResponse.json({ trajectories });
  } catch (error: unknown) {
    console.error("[SONA_TRAJECTORIES_GET]", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ trajectories: [], error: errorMessage }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { getAgentEvaluationEngine } from "@/lib/agent-evaluation";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const engine = getAgentEvaluationEngine();
    const leaderboard = await engine.getLeaderboard();

    return NextResponse.json(leaderboard);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to get leaderboard";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

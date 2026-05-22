import { NextRequest, NextResponse } from "next/server";
import { getHybridProviderRouter } from "@/lib/provider-router";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const taskType = req.nextUrl.searchParams.get("taskType") || undefined;
    const scores = await getHybridProviderRouter().getScores(taskType);
    return NextResponse.json({ scores, count: scores.length });
  } catch (error: unknown) {
    console.error("[ProviderRouter] GET error:", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ error: "Failed to get provider scores" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { taskType, prompt, preferences } = body;
    if (!taskType || !prompt) {
      return NextResponse.json({ error: "taskType and prompt are required" }, { status: 400 });
    }
    const decision = await getHybridProviderRouter().route({ taskType, prompt, preferences });
    return NextResponse.json(decision);
  } catch (error: unknown) {
    console.error("[ProviderRouter] POST error:", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ error: "Failed to route request" }, { status: 500 });
  }
}

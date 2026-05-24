import { NextRequest, NextResponse } from "next/server";
import { getAgentEvaluationEngine } from "@/lib/agent-evaluation";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const benchmarks = await db.evaluationBenchmark.findMany({
      where: { isActive: true },
      orderBy: { category: "asc" },
    });

    return NextResponse.json(benchmarks);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to list benchmarks";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as { action?: string };

    if (body.action !== "seed") {
      return NextResponse.json({ error: "Invalid action. Use 'seed'" }, { status: 400 });
    }

    const engine = getAgentEvaluationEngine();
    const result = await engine.seedBenchmarks();

    return NextResponse.json(result, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to seed benchmarks";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

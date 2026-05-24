import { NextRequest, NextResponse } from "next/server";
import { getAgentEvaluationEngine } from "@/lib/agent-evaluation";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const agentId = searchParams.get("agentId") ?? undefined;
    const category = searchParams.get("category") ?? undefined;
    const limit = parseInt(searchParams.get("limit") ?? "50");

    const where: Record<string, unknown> = {};
    if (agentId) where.agentId = agentId;
    if (category) where.testCategory = category;

    const evaluations = await db.agentEvaluation.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    return NextResponse.json(evaluations);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to list evaluations";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      agentId: string;
      benchmarkId?: string;
      model?: string;
    };

    if (!body.agentId) {
      return NextResponse.json({ error: "agentId is required" }, { status: 400 });
    }

    const engine = getAgentEvaluationEngine();

    // If no benchmark specified, use the first available
    let benchmarkId = body.benchmarkId;
    if (!benchmarkId) {
      const first = await db.evaluationBenchmark.findFirst({ where: { isActive: true } });
      if (!first) {
        return NextResponse.json({ error: "No active benchmarks found. Seed benchmarks first." }, { status: 400 });
      }
      benchmarkId = first.id;
    }

    const result = await engine.runBenchmark(body.agentId, benchmarkId, body.model);

    return NextResponse.json(result, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to run evaluation";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

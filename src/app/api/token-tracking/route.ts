import { NextRequest, NextResponse } from "next/server";
import { getContextManager } from "@/lib/context-manager";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const conversationId = searchParams.get("conversationId");

    if (!conversationId) {
      return NextResponse.json({ error: "conversationId is required" }, { status: 400 });
    }

    // Get context usage from the context manager
    const ctx = getContextManager();
    const usage = await ctx.getContextUsage(conversationId);

    // Get token usage records for this conversation
    const records = await db.tokenUsageRecord.findMany({
      where: { conversationId },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    const totalTokens = records.reduce((sum, r) => sum + r.totalTokens, 0);
    const totalCost = records.reduce((sum, r) => sum + r.costUsd, 0);
    const byModel: Record<string, { tokens: number; cost: number; count: number }> = {};
    for (const r of records) {
      if (!byModel[r.model]) byModel[r.model] = { tokens: 0, cost: 0, count: 0 };
      byModel[r.model].tokens += r.totalTokens;
      byModel[r.model].cost += r.costUsd;
      byModel[r.model].count += 1;
    }

    return NextResponse.json({
      conversationId,
      contextUsage: usage,
      totalTokens,
      totalCost: Math.round(totalCost * 10000) / 10000,
      recordCount: records.length,
      byModel,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to get token usage";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      conversationId: string;
      chunk: string;
      model: string;
    };

    if (!body.conversationId || !body.chunk || !body.model) {
      return NextResponse.json(
        { error: "conversationId, chunk, and model are required" },
        { status: 400 }
      );
    }

    const ctx = getContextManager();
    const tokens = await ctx.trackStreamingTokens(body.conversationId, body.chunk, body.model);

    return NextResponse.json({ tracked: true, tokens });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to track tokens";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

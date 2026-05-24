import { NextRequest, NextResponse } from "next/server";
import { getContextManager } from "@/lib/context-manager";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const conversationId = searchParams.get("conversationId");
    const action = searchParams.get("action") || "usage";

    if (!conversationId) {
      return NextResponse.json({ error: "conversationId is required" }, { status: 400 });
    }

    const ctx = getContextManager();

    if (action === "optimized") {
      // Get optimized context config with adaptive token management
      const model = searchParams.get("model") || "gemini-2.0-flash";
      const taskType = searchParams.get("taskType") || "conversation";
      const config = await ctx.getOptimizedContextConfig(conversationId, model, taskType);
      return NextResponse.json(config);
    }

    if (action === "budget") {
      // Get just the adaptive budget allocation
      const model = searchParams.get("model") || "gemini-2.0-flash";
      const taskType = searchParams.get("taskType") || "conversation";
      const messageCount = parseInt(searchParams.get("messageCount") || "0");
      const hasTools = searchParams.get("hasTools") === "true";
      const budget = ctx.getAdaptiveTokenBudget(model, taskType, messageCount, hasTools);
      return NextResponse.json(budget);
    }

    if (action === "cost") {
      // Get conversation cost breakdown
      const breakdown = await ctx.getConversationCostBreakdown(conversationId);
      return NextResponse.json(breakdown);
    }

    // Default: return context usage
    const usage = await ctx.getContextUsage(conversationId);
    return NextResponse.json(usage);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to get context usage";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      conversationId: string;
      messages: Array<{ id: string; role: string; content: string }>;
      action?: string;
      maxTokens?: number;
    };

    if (!body.conversationId) {
      return NextResponse.json({ error: "conversationId is required" }, { status: 400 });
    }

    const ctx = getContextManager();

    if (body.action === "setMaxTokens" && body.maxTokens) {
      await ctx.setMaxTokens(body.conversationId, body.maxTokens);
      return NextResponse.json({ success: true, maxTokens: body.maxTokens });
    }

    if (body.action === "pin" && body.messages?.[0]?.id) {
      await ctx.pinMessage(body.conversationId, body.messages[0].id);
      return NextResponse.json({ success: true });
    }

    if (body.action === "unpin" && body.messages?.[0]?.id) {
      await ctx.unpinMessage(body.conversationId, body.messages[0].id);
      return NextResponse.json({ success: true });
    }

    // Default: auto-compress
    if (!body.messages) {
      return NextResponse.json({ error: "messages are required for compression" }, { status: 400 });
    }

    const result = await ctx.autoCompress(body.conversationId, body.messages);
    return NextResponse.json(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to process context manager request";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

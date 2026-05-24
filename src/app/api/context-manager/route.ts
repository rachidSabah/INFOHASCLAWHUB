import { NextRequest, NextResponse } from "next/server";
import { getContextManager } from "@/lib/context-manager";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const conversationId = searchParams.get("conversationId");

    if (!conversationId) {
      return NextResponse.json({ error: "conversationId is required" }, { status: 400 });
    }

    const ctx = getContextManager();
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
    };

    if (!body.conversationId || !body.messages) {
      return NextResponse.json({ error: "conversationId and messages are required" }, { status: 400 });
    }

    const ctx = getContextManager();
    const result = await ctx.autoCompress(body.conversationId, body.messages);

    return NextResponse.json(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to compress context";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

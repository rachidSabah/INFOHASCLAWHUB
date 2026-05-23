import { NextRequest, NextResponse } from "next/server";
import { getContextManager } from "@/lib/context-manager";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      conversationId: string;
      messageId: string;
      action: "pin" | "unpin";
    };

    if (!body.conversationId || !body.messageId || !body.action) {
      return NextResponse.json(
        { error: "conversationId, messageId, and action are required" },
        { status: 400 }
      );
    }

    const ctx = getContextManager();

    if (body.action === "pin") {
      await ctx.pinMessage(body.conversationId, body.messageId);
    } else {
      await ctx.unpinMessage(body.conversationId, body.messageId);
    }

    return NextResponse.json({ success: true, action: body.action, messageId: body.messageId });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to update pin status";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

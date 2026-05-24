import { NextRequest, NextResponse } from "next/server";
import { getLastActiveConversation, recoverConversation, getRecentConversations } from "@/lib/conversation-recovery";

export async function GET() {
  try {
    const [lastActive, recent] = await Promise.all([
      getLastActiveConversation(),
      getRecentConversations(10),
    ]);
    return NextResponse.json({ lastActive, recent });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { action, conversationId } = await req.json();
    
    switch (action) {
      case "recover": {
        if (!conversationId) return NextResponse.json({ error: "conversationId is required" }, { status: 400 });
        const result = await recoverConversation(conversationId);
        return NextResponse.json({ recovered: !!result, state: result });
      }
      default:
        return NextResponse.json({ error: "Invalid action. Use: recover" }, { status: 400 });
    }
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

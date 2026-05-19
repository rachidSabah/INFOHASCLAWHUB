import { NextRequest, NextResponse } from "next/server";
import { whatsAppService } from "@/lib/whatsapp";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const { jid, text } = await req.json();
    if (!jid || !text) {
      return NextResponse.json({ error: "jid and text are required" }, { status: 400 });
    }
    await whatsAppService.sendMessage(jid, text);
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to send message";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

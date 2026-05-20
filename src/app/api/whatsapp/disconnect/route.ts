import { NextResponse } from "next/server";
import { whatsAppService } from "@/lib/whatsapp";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    await whatsAppService.disconnect();
    return NextResponse.json({ success: true, message: "Disconnected. Auth session cleared — next connect will generate a fresh QR code." });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to disconnect";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

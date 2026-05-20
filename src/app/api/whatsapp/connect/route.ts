import { NextResponse } from "next/server";
import { whatsAppService } from "@/lib/whatsapp";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const qr = await whatsAppService.connect();
    return NextResponse.json({ qr: qr || null });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to connect";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

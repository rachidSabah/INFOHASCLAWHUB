import { NextResponse } from "next/server";
import { whatsAppService } from "@/lib/whatsapp";

export async function GET() {
  return NextResponse.json(whatsAppService.getBotConfig());
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { enabled, model, systemPrompt } = body;

    whatsAppService.setBotConfig({ model, systemPrompt });
    
    if (typeof enabled === "boolean") {
      whatsAppService.setBotEnabled(enabled);
    }

    return NextResponse.json({ success: true, config: whatsAppService.getBotConfig() });
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
  }
}

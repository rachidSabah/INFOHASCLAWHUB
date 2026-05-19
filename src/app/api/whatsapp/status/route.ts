import { NextResponse } from "next/server";
import { whatsAppService } from "@/lib/whatsapp";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(whatsAppService.getStatus());
}

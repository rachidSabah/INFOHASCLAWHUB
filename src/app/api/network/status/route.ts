import { NextResponse } from "next/server";
import { getNetworkInfo } from "@/lib/network";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const info = getNetworkInfo();
    return NextResponse.json({
      ...info,
      status: info.localIP ? "lan_available" : "localhost_only",
      timestamp: new Date().toISOString(),
    });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    );
  }
}

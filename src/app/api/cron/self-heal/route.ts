import { getCronEngine } from "@/lib/cron-engine";
import { NextRequest, NextResponse } from "next/server";

// ---------------------------------------------------------------------------
// POST /api/cron/self-heal – Run a self-heal check
// ---------------------------------------------------------------------------

export async function POST(_req: NextRequest) {
  try {
    const engine = getCronEngine();
    const result = await engine.selfHealCheck();

    return NextResponse.json(result);
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Failed to run self-heal check";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

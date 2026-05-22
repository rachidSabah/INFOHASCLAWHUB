import { NextResponse } from "next/server";
import { getUniversalMemory } from "@/lib/universal-memory";

export const dynamic = "force-dynamic";

// ── GET /api/memory/context/stats ──────────────────────────────────────────────
// Retrieve memory statistics.

export async function GET() {
  try {
    const memory = getUniversalMemory();
    const stats = await memory.getStats();

    return NextResponse.json(stats);
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Failed to retrieve memory stats";
    console.error("[MEMORY_CONTEXT_STATS_GET]", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

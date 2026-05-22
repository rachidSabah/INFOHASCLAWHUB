import { NextResponse } from "next/server";
import { getUniversalMemory } from "@/lib/universal-memory";

// ── POST /api/memory/context/prune ────────────────────────────────────────────
// Prune expired memories. Deletes all memories where expiresAt < now.

export async function POST() {
  try {
    const memory = getUniversalMemory();
    const prunedCount = await memory.prune();

    return NextResponse.json({
      pruned: prunedCount,
      message:
        prunedCount > 0
          ? `Successfully pruned ${prunedCount} expired ${prunedCount === 1 ? "memory" : "memories"}`
          : "No expired memories to prune",
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Failed to prune memories";
    console.error("[MEMORY_CONTEXT_PRUNE_POST]", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

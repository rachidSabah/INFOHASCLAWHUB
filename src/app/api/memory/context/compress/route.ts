import { NextRequest, NextResponse } from "next/server";
import { getUniversalMemory } from "@/lib/universal-memory";

// ── POST /api/memory/context/compress ─────────────────────────────────────────
// Compress old memories by summarizing and deduplicating.
// Body: { olderThanDays?, minAccessCount?, dryRun? }

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { olderThanDays, minAccessCount, dryRun } = body;

    // ── Validation ──
    if (olderThanDays !== undefined && typeof olderThanDays !== "number") {
      return NextResponse.json(
        { error: "Field 'olderThanDays' must be a number" },
        { status: 400 }
      );
    }

    if (olderThanDays !== undefined && olderThanDays < 1) {
      return NextResponse.json(
        { error: "Field 'olderThanDays' must be at least 1" },
        { status: 400 }
      );
    }

    if (minAccessCount !== undefined && typeof minAccessCount !== "number") {
      return NextResponse.json(
        { error: "Field 'minAccessCount' must be a number" },
        { status: 400 }
      );
    }

    if (minAccessCount !== undefined && minAccessCount < 0) {
      return NextResponse.json(
        { error: "Field 'minAccessCount' must be non-negative" },
        { status: 400 }
      );
    }

    if (dryRun !== undefined && typeof dryRun !== "boolean") {
      return NextResponse.json(
        { error: "Field 'dryRun' must be a boolean" },
        { status: 400 }
      );
    }

    // ── Compress ──
    const memory = getUniversalMemory();
    const result = await memory.compress({
      olderThanDays: olderThanDays ?? 30,
      minAccessCount: minAccessCount ?? 0,
      dryRun: dryRun ?? false,
    });

    return NextResponse.json({
      compressed: result.compressed,
      deduplicated: result.deduplicated,
      freedBytes: result.freedBytes,
      dryRun: dryRun ?? false,
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Failed to compress memories";
    console.error("[MEMORY_CONTEXT_COMPRESS_POST]", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

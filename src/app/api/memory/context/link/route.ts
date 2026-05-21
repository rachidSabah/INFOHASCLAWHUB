import { NextRequest, NextResponse } from "next/server";
import { getUniversalMemory } from "@/lib/universal-memory";

// ── POST /api/memory/context/link ─────────────────────────────────────────────
// Link two memories together with a relation type and optional strength.
// Body: { sourceId, targetId, relationType, strength? }

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { sourceId, targetId, relationType, strength } = body;

    // ── Validation ──
    if (!sourceId || typeof sourceId !== "string") {
      return NextResponse.json(
        { error: "Field 'sourceId' is required and must be a string" },
        { status: 400 }
      );
    }

    if (!targetId || typeof targetId !== "string") {
      return NextResponse.json(
        { error: "Field 'targetId' is required and must be a string" },
        { status: 400 }
      );
    }

    if (sourceId === targetId) {
      return NextResponse.json(
        { error: "sourceId and targetId must be different" },
        { status: 400 }
      );
    }

    if (!relationType || typeof relationType !== "string") {
      return NextResponse.json(
        { error: "Field 'relationType' is required and must be a string" },
        { status: 400 }
      );
    }

    if (strength !== undefined && typeof strength !== "number") {
      return NextResponse.json(
        { error: "Field 'strength' must be a number" },
        { status: 400 }
      );
    }

    if (strength !== undefined && (strength < 0 || strength > 1)) {
      return NextResponse.json(
        { error: "Field 'strength' must be between 0 and 1" },
        { status: 400 }
      );
    }

    // ── Create Link ──
    const memory = getUniversalMemory();
    const link = await memory.link(sourceId, targetId, relationType, strength ?? 1.0);

    return NextResponse.json(link, { status: 201 });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Failed to link memories";
    console.error("[MEMORY_CONTEXT_LINK_POST]", error);

    // Distinguish between "not found" errors and internal errors
    if (message.includes("not found")) {
      return NextResponse.json({ error: message }, { status: 404 });
    }

    return NextResponse.json({ error: message }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// ── GET /api/memory/context/[id] ───────────────────────────────────────────────
// Retrieve a specific ContextMemory by ID.

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const memory = await db.contextMemory.findUnique({
      where: { id },
    });

    if (!memory) {
      return NextResponse.json(
        { error: "Memory not found" },
        { status: 404 }
      );
    }

    // Fetch related links (source and target) — no Prisma relation defined,
    // so we query MemoryLink directly.
    const [outgoingLinks, incomingLinks] = await Promise.all([
      db.memoryLink.findMany({
        where: { sourceId: id },
        select: { id: true, targetId: true, relationType: true, strength: true },
      }),
      db.memoryLink.findMany({
        where: { targetId: id },
        select: { id: true, sourceId: true, relationType: true, strength: true },
      }),
    ]);

    // Parse tags JSON string for convenience
    const parsedMemory = {
      ...memory,
      tags: JSON.parse(memory.tags),
      outgoingLinks,
      incomingLinks,
    };

    return NextResponse.json(parsedMemory);
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch memory";
    console.error("[MEMORY_CONTEXT_GET_ID]", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ── PATCH /api/memory/context/[id] ────────────────────────────────────────────
// Update a ContextMemory (content, summary, tags, priority).

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const existing = await db.contextMemory.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { error: "Memory not found" },
        { status: 404 }
      );
    }

    const body = await req.json();
    const { content, summary, tags, priority } = body;

    // Build update data — only include provided fields
    const data: Record<string, unknown> = {};

    if (content !== undefined) {
      if (typeof content !== "string" || content.trim().length === 0) {
        return NextResponse.json(
          { error: "Field 'content' must be a non-empty string" },
          { status: 400 }
        );
      }
      data.content = content;
    }

    if (summary !== undefined) {
      if (typeof summary !== "string") {
        return NextResponse.json(
          { error: "Field 'summary' must be a string" },
          { status: 400 }
        );
      }
      data.summary = summary;
    }

    if (tags !== undefined) {
      if (!Array.isArray(tags) || tags.some((t: unknown) => typeof t !== "string")) {
        return NextResponse.json(
          { error: "Field 'tags' must be an array of strings" },
          { status: 400 }
        );
      }
      data.tags = JSON.stringify(tags);
    }

    if (priority !== undefined) {
      if (typeof priority !== "number") {
        return NextResponse.json(
          { error: "Field 'priority' must be a number" },
          { status: 400 }
        );
      }
      data.priority = priority;
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json(
        { error: "No valid fields to update. Provide at least one of: content, summary, tags, priority" },
        { status: 400 }
      );
    }

    const updated = await db.contextMemory.update({
      where: { id },
      data,
    });

    return NextResponse.json({
      ...updated,
      tags: JSON.parse(updated.tags),
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Failed to update memory";
    console.error("[MEMORY_CONTEXT_PATCH_ID]", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ── DELETE /api/memory/context/[id] ───────────────────────────────────────────
// Delete a ContextMemory by ID, including related links.

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const existing = await db.contextMemory.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { error: "Memory not found" },
        { status: 404 }
      );
    }

    // Delete related links first (source or target references)
    await db.memoryLink.deleteMany({
      where: {
        OR: [{ sourceId: id }, { targetId: id }],
      },
    });

    // Delete the memory itself
    await db.contextMemory.delete({ where: { id } });

    return NextResponse.json({
      success: true,
      deletedId: id,
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Failed to delete memory";
    console.error("[MEMORY_CONTEXT_DELETE_ID]", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

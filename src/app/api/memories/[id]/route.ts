import { NextResponse } from "next/server";
import { db } from "@/lib/db";

function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { content, key } = body;

    const existing = await db.memory.findUnique({ where: { id } });
    if (!existing) {
      return errorResponse("Memory not found", 404);
    }

    const data: Record<string, string> = {};
    if (content !== undefined) data.content = content;
    if (key !== undefined) data.key = key;

    if (Object.keys(data).length === 0) {
      return errorResponse("Nothing to update", 400);
    }

    const memory = await db.memory.update({
      where: { id },
      data,
    });

    return NextResponse.json(memory);
  } catch (error) {
    console.error("[MEMORY_PATCH]", error);
    const errorMessage = error instanceof Error ? error.message : "Failed to update memory";
    return errorResponse(errorMessage, 500);
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const existing = await db.memory.findUnique({ where: { id } });
    if (!existing) {
      return errorResponse("Memory not found", 404);
    }

    await db.memory.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[MEMORY_DELETE]", error);
    const errorMessage = error instanceof Error ? error.message : "Failed to delete memory";
    return errorResponse(errorMessage, 500);
  }
}

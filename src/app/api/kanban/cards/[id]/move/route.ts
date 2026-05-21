import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { targetColumnId } = await req.json();

    if (!targetColumnId) {
      return NextResponse.json({ error: "targetColumnId is required" }, { status: 400 });
    }

    await db.kanbanCard.update({
      where: { id },
      data: { columnId: targetColumnId },
    });
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

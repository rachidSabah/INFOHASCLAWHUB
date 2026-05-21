import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { targetColumnId } = await req.json();
    await (db as any).$executeRawUnsafe("UPDATE KanbanCard SET columnId = ?, updatedAt = datetime('now') WHERE id = ?", targetColumnId, id);
    return NextResponse.json({ success: true });
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}

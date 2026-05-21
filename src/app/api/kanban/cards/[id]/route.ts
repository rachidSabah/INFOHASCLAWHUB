import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const sets: string[] = [];
    const vals: any[] = [];
    for (const f of ["title", "description", "priority", "labels", "assignee", "status", "gitBranch", "prLink", "subtasks", "tokenUsage"]) {
      if (body[f] !== undefined) { sets.push(`"${f}" = ?`); vals.push(typeof body[f] === "object" ? JSON.stringify(body[f]) : body[f]); }
    }
    if (sets.length === 0) return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    sets.push("updatedAt = datetime('now')");
    vals.push(id);
    await (db as any).$executeRawUnsafe(`UPDATE KanbanCard SET ${sets.join(", ")} WHERE id = ?`, ...vals);
    const card = await (db as any).$queryRawUnsafe("SELECT * FROM KanbanCard WHERE id = ?", id);
    return NextResponse.json(card[0]);
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await (db as any).$executeRawUnsafe("DELETE FROM KanbanCard WHERE id = ?", id);
    return NextResponse.json({ success: true });
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}

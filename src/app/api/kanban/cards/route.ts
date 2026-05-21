import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const columnId = searchParams.get("columnId");
    if (!columnId) return NextResponse.json({ error: "columnId required" }, { status: 400 });
    const cards = await (db as any).$queryRawUnsafe("SELECT * FROM KanbanCard WHERE columnId = ? ORDER BY \"order\" ASC", columnId);
    return NextResponse.json(cards);
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const id = crypto.randomUUID();
    const mx = await (db as any).$queryRawUnsafe("SELECT COALESCE(MAX(\"order\"), -1)+1 as nx FROM KanbanCard WHERE columnId = ?", body.columnId);
    await (db as any).$executeRawUnsafe("INSERT INTO KanbanCard (id, columnId, title, description, priority, labels, assignee, status, subtasks, \"order\", createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))", id, body.columnId, body.title || "", body.description || "", body.priority || "medium", body.labels || "[]", body.assignee || "", body.status || "backlog", body.subtasks || "[]", mx[0]?.nx || 0);
    return NextResponse.json({ id }, { status: 201 });
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}

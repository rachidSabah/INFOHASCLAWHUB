import { NextResponse } from "next/server";
import path from "path";
function getDb() { const Database = require("better-sqlite3"); return new Database(path.join(process.cwd(), "prisma", "db", "app.db")); }

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const db = getDb();
  try {
    const { id } = await params;
    const p = db.prepare("SELECT * FROM AgentPipeline WHERE id = ?").get(id);
    if (!p) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(p);
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }); }
  finally { db.close(); }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const db = getDb();
  try {
    const { id } = await params;
    const body = await req.json();
    if (body.name) db.prepare("UPDATE AgentPipeline SET name = ?, updatedAt = datetime('now') WHERE id = ?").run(body.name, id);
    if (body.description) db.prepare("UPDATE AgentPipeline SET description = ?, updatedAt = datetime('now') WHERE id = ?").run(body.description, id);
    if (body.steps) db.prepare("UPDATE AgentPipeline SET steps = ?, updatedAt = datetime('now') WHERE id = ?").run(body.steps, id);
    return NextResponse.json(db.prepare("SELECT * FROM AgentPipeline WHERE id = ?").get(id));
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }); }
  finally { db.close(); }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const db = getDb();
  try {
    const { id } = await params;
    db.prepare("DELETE FROM AgentPipeline WHERE id = ?").run(id);
    return NextResponse.json({ success: true });
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }); }
  finally { db.close(); }
}

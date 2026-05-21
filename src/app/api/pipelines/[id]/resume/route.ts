import { NextResponse } from "next/server";
import path from "path";
function getDb() { const Database = require("better-sqlite3"); return new Database(path.join(process.cwd(), "prisma", "db", "app.db")); }

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const db = getDb();
  try {
    const { id } = await params;
    db.prepare("UPDATE AgentPipeline SET status = 'running', updatedAt = datetime('now') WHERE id = ?").run(id);
    return NextResponse.json(db.prepare("SELECT * FROM AgentPipeline WHERE id = ?").get(id));
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }); }
  finally { db.close(); }
}

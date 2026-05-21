import { NextResponse } from "next/server";
import path from "path";

function getDb() { const Database = require("better-sqlite3"); return new Database(path.join(process.cwd(), "prisma", "db", "app.db")); }

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const db = getDb();
  try {
    const { id } = await params;
    const pipeline = db.prepare("SELECT * FROM AgentPipeline WHERE id = ?").get(id) as any;
    if (!pipeline) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (pipeline.status !== "draft" && pipeline.status !== "paused") {
      return NextResponse.json({ error: `Cannot run in '${pipeline.status}' status` }, { status: 400 });
    }
    db.prepare("UPDATE AgentPipeline SET status = 'running', currentStep = 0, updatedAt = datetime('now') WHERE id = ?").run(id);
    return NextResponse.json(db.prepare("SELECT * FROM AgentPipeline WHERE id = ?").get(id));
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }); }
  finally { db.close(); }
}

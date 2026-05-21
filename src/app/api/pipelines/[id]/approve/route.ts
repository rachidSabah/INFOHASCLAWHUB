import { NextResponse } from "next/server";
import path from "path";
function getDb() { const Database = require("better-sqlite3"); return new Database(path.join(process.cwd(), "prisma", "db", "app.db")); }

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const db = getDb();
  try {
    const { id } = await params;
    const body = await _req.json().catch(() => ({}));
    const pipeline = db.prepare("SELECT * FROM AgentPipeline WHERE id = ?").get(id) as any;
    if (!pipeline) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const steps = JSON.parse(pipeline.steps || "[]");
    if (pipeline.currentStep < steps.length) {
      steps[pipeline.currentStep].status = "approved";
      db.prepare("UPDATE AgentPipeline SET steps = ?, currentStep = currentStep + 1, updatedAt = datetime('now') WHERE id = ?")
        .run(JSON.stringify(steps), id);
    }
    return NextResponse.json(db.prepare("SELECT * FROM AgentPipeline WHERE id = ?").get(id));
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }); }
  finally { db.close(); }
}

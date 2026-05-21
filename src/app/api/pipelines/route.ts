import { NextRequest, NextResponse } from 'next/server';
import Database from "better-sqlite3";
import path from "path";

function getDb() {
  const dbPath = path.join(process.cwd(), "prisma", "db", "app.db");
  return new Database(dbPath);
}

export async function GET() {
  const db = getDb();
  try {
    const pipelines = db.prepare("SELECT * FROM AgentPipeline ORDER BY createdAt DESC LIMIT 50").all();
    return NextResponse.json(pipelines);
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
  } finally { db.close(); }
}

export async function POST(request: NextRequest) {
  const db = getDb();
  try {
    const body = await request.json();
    const id = body.id || crypto.randomUUID();
    db.prepare(
      "INSERT INTO AgentPipeline (id, name, description, steps, status, currentStep, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))"
    ).run(id, body.name, body.description || "", body.steps || "[]", body.status || "draft", body.currentStep || 0);
    const pipeline = db.prepare("SELECT * FROM AgentPipeline WHERE id = ?").get(id);
    return NextResponse.json(pipeline);
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
  } finally { db.close(); }
}

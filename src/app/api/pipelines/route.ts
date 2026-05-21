import { db } from "@/lib/db";
import { NextRequest, NextResponse } from 'next/server';




export async function GET() {
  try {
    const pipelines = await (db as any).$queryRawUnsafe("SELECT * FROM AgentPipeline ORDER BY createdAt DESC LIMIT 50");
    return NextResponse.json(pipelines);
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const id = body.id || crypto.randomUUID();
    await (db as any).$executeRawUnsafe(
      `INSERT INTO AgentPipeline (id, name, description, steps, status, currentStep, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
      id, body.name, body.description || "", body.steps || "[]", body.status || "draft", body.currentStep || 0
    );
    const pipeline = await (db as any).$queryRawUnsafe("SELECT * FROM AgentPipeline WHERE id = ?", id);
    return NextResponse.json(pipeline[0]);
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
  }
}

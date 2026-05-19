import { db } from "@/lib/db";
import { NextRequest, NextResponse } from 'next/server';




export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const pipeline = await db.agentPipeline.findUnique({ where: { id } });
    if (!pipeline) {
      return NextResponse.json({ error: 'Pipeline not found' }, { status: 404 });
    }
    if (pipeline.status !== 'running') {
      return NextResponse.json({ error: 'Pipeline is not running' }, { status: 400 });
    }
    const updated = await db.agentPipeline.update({
      where: { id },
      data: { status: 'paused' },
    });
    return NextResponse.json(updated);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

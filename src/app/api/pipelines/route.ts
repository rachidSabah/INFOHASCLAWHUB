import { db } from "@/lib/db";
import { NextRequest, NextResponse } from 'next/server';




export async function GET() {
  try {
    const pipelines = await db.agentPipeline.findMany({ orderBy: { createdAt: 'desc' } });
    return NextResponse.json(pipelines);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const pipeline = await db.agentPipeline.create({ data: body });
    return NextResponse.json(pipeline);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

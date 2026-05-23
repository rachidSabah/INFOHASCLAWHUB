import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET() {
  try {
    const pipelines = await db.agentPipeline.findMany();
    // Serialize DateTime fields to ISO strings for consistent response format
    const serialized = pipelines.map(p => ({
      ...p,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
    }));
    return NextResponse.json(serialized);
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const pipeline = await db.agentPipeline.create({
      data: {
        name: body.name,
        description: body.description || "",
        steps: typeof body.steps === 'string' ? body.steps : JSON.stringify(body.steps || []),
        status: body.status || "draft",
        currentStep: body.currentStep || 0,
        results: body.results ?? null,
        parallelGroups: body.parallelGroups ?? null,
      },
    });
    return NextResponse.json({
      ...pipeline,
      createdAt: pipeline.createdAt.toISOString(),
      updatedAt: pipeline.updatedAt.toISOString(),
    });
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
  }
}

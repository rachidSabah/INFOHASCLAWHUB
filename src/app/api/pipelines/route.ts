import { NextRequest, NextResponse } from 'next/server';
import { pipelineStore } from '@/lib/pipeline-store';

export async function GET() {
  try {
    return NextResponse.json(pipelineStore.getAll());
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const id = body.id || crypto.randomUUID();
    pipelineStore.set(id, { id, name: body.name, description: body.description || "", steps: body.steps || "[]", status: body.status || "draft", currentStep: body.currentStep || 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    return NextResponse.json(pipelineStore.get(id));
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
  }
}

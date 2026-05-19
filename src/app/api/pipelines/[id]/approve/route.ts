import { db } from "@/lib/db";
import { NextRequest, NextResponse } from 'next/server';




export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const pipeline = await db.agentPipeline.findUnique({ where: { id } });
    if (!pipeline) {
      return NextResponse.json({ error: 'Pipeline not found' }, { status: 404 });
    }
    const currentStep = body.step ?? pipeline.currentStep;
    const results = pipeline.results ? JSON.parse(pipeline.results) : [];
    results.push({ step: currentStep, approved: true, timestamp: new Date().toISOString() });
    const nextStep = currentStep + 1;
    const updated = await db.agentPipeline.update({
      where: { id },
      data: {
        currentStep: nextStep,
        results: JSON.stringify(results),
      },
    });
    return NextResponse.json(updated);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

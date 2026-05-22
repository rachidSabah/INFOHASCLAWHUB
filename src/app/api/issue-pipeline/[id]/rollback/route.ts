import { NextRequest, NextResponse } from 'next/server';
import { getIssuePipelineEngine } from '@/lib/issue-pipeline';

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const engine = getIssuePipelineEngine();
    await engine.rollback(id);
    return NextResponse.json({ success: true, id });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

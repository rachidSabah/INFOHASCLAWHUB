import { NextRequest, NextResponse } from 'next/server';
import { getIssuePipelineEngine } from '@/lib/issue-pipeline';

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const engine = getIssuePipelineEngine();

    // Run the full pipeline in the background (non-blocking)
    engine.runFullPipeline(id).catch((err: unknown) => {
      console.error(
        '[IssuePipeline API] runFullPipeline error:',
        err instanceof Error ? err.message : err
      );
    });

    return NextResponse.json({
      message: 'Pipeline execution started',
      id,
    });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

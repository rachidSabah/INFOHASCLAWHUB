import { NextRequest, NextResponse } from 'next/server';
import { getResearchEngine } from '@/lib/research-engine';

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const engine = getResearchEngine();
    const result = await engine.detectHallucinations(id);
    return NextResponse.json(result);
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

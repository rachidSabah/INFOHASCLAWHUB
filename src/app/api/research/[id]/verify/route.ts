import { NextRequest, NextResponse } from 'next/server';
import { getResearchEngine } from '@/lib/research-engine';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { citationId } = body as { citationId: string };

    if (!citationId) {
      return NextResponse.json(
        { error: 'citationId is required' },
        { status: 400 }
      );
    }

    const engine = getResearchEngine();
    const result = await engine.verifyCitation(citationId);
    return NextResponse.json(result);
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

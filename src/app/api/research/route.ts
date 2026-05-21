import { NextRequest, NextResponse } from 'next/server';
import { getResearchEngine } from '@/lib/research-engine';

export async function GET() {
  try {
    const engine = getResearchEngine();
    const sessions = await engine.getAllSessions();
    return NextResponse.json(sessions);
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { query, depth, model } = body as {
      query: string;
      depth?: 'quick' | 'standard' | 'deep';
      model?: string;
    };

    if (!query) {
      return NextResponse.json(
        { error: 'query is required' },
        { status: 400 }
      );
    }

    const engine = getResearchEngine();
    const result = await engine.research({ query, depth, model });
    return NextResponse.json(result);
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

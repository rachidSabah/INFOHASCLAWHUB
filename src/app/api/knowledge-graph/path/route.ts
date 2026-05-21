import { findPath } from '@/lib/knowledge-graph-engine';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { fromId, toId, maxDepth } = body as {
      fromId: string;
      toId: string;
      maxDepth?: number;
    };

    if (!fromId || !toId) {
      return NextResponse.json(
        { error: 'fromId and toId are required' },
        { status: 400 }
      );
    }

    const result = await findPath(fromId, toId, maxDepth);
    return NextResponse.json(result);
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

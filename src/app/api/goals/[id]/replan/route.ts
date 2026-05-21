import { replan } from '@/lib/goal-planner-engine';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { newState } = body as { newState: Record<string, unknown> };

    if (!newState) {
      return NextResponse.json(
        { error: 'newState is required' },
        { status: 400 }
      );
    }

    const result = await replan(id, newState);
    return NextResponse.json(result);
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

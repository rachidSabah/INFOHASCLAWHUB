import { listGoals, createGoal } from '@/lib/goal-planner-engine';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');

    const filter: Record<string, unknown> = {};
    if (status) filter.status = status;

    const goals = await listGoals(filter);
    return NextResponse.json(goals);
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
    const { title, description, goalState, strategy } = body as {
      title: string;
      description: string;
      goalState: Record<string, unknown>;
      strategy?: string;
    };

    if (!title || !description || !goalState) {
      return NextResponse.json(
        { error: 'title, description, and goalState are required' },
        { status: 400 }
      );
    }

    const goal = await createGoal(
      title,
      description,
      goalState,
      (strategy as 'astar' | 'bfs' | 'dfs' | 'greedy') ?? undefined
    );
    return NextResponse.json(goal, { status: 201 });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

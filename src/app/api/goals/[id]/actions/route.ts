import { addAction } from '@/lib/goal-planner-engine';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { name, description, preconditions, effects, cost, assignedAgent, toolMapping } = body as {
      name: string;
      description?: string;
      preconditions: Array<{ key: string; value: unknown; operator?: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'exists' | 'not_exists' }>;
      effects: Array<{ key: string; value: unknown; operation?: 'set' | 'increment' | 'decrement' | 'delete' | 'push' | 'merge' }>;
      cost?: number;
      assignedAgent?: string;
      toolMapping?: { serverName: string; toolName: string; arguments?: Record<string, unknown> };
    };

    if (!name || !preconditions || !effects) {
      return NextResponse.json(
        { error: 'name, preconditions, and effects are required' },
        { status: 400 }
      );
    }

    const action = await addAction(id, {
      name,
      description,
      preconditions,
      effects,
      cost,
      assignedAgent,
      toolMapping,
    });
    return NextResponse.json(action, { status: 201 });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

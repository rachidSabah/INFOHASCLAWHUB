import { listBudgets, createBudget } from '@/lib/cost-tracker-engine';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const scope = searchParams.get('scope');
    const isEnabled = searchParams.get('isEnabled');

    const filter: Record<string, unknown> = {};
    if (scope) filter.scope = scope;
    if (isEnabled !== null) filter.isEnabled = isEnabled === 'true';

    const budgets = await listBudgets(filter);
    return NextResponse.json(budgets);
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
    const { name, scope, scopeId, period, tokenLimit, costLimit, alertThreshold } = body as {
      name: string;
      scope: string;
      scopeId?: string;
      period?: string;
      tokenLimit?: number;
      costLimit?: number;
      alertThreshold?: number;
    };

    if (!name || !scope) {
      return NextResponse.json(
        { error: 'name and scope are required' },
        { status: 400 }
      );
    }

    const budget = await createBudget(
      name,
      scope as 'global' | 'provider' | 'agent' | 'project' | 'user',
      scopeId,
      {
        tokenLimit,
        costLimit,
        alertThreshold,
      }
    );
    return NextResponse.json(budget, { status: 201 });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

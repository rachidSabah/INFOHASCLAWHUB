import { checkBudget } from '@/lib/cost-tracker-engine';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { scope, scopeId } = body as {
      scope: string;
      scopeId?: string;
    };

    if (!scope) {
      return NextResponse.json(
        { error: 'scope is required' },
        { status: 400 }
      );
    }

    const result = await checkBudget(
      scope as 'global' | 'provider' | 'agent' | 'project' | 'user',
      scopeId
    );
    return NextResponse.json(result);
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

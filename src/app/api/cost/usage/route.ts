import { recordUsage } from '@/lib/cost-tracker-engine';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { scope, scopeId, tokens, cost, model, provider } = body as {
      scope: string;
      scopeId?: string;
      tokens: number;
      cost: number;
      model?: string;
      provider?: string;
    };

    if (!scope || tokens === undefined || cost === undefined) {
      return NextResponse.json(
        { error: 'scope, tokens, and cost are required' },
        { status: 400 }
      );
    }

    const result = await recordUsage(
      scope as 'global' | 'provider' | 'agent' | 'project' | 'user',
      scopeId,
      tokens,
      cost,
      model,
      provider
    );
    return NextResponse.json(result);
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

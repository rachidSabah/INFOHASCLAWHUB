import { getSpendingAnalytics } from '@/lib/cost-tracker-engine';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const period = searchParams.get('period') as 'daily' | 'weekly' | 'monthly' | null;
    const scope = searchParams.get('scope') as 'global' | 'provider' | 'agent' | 'project' | 'user' | null;
    const scopeId = searchParams.get('scopeId');

    const analytics = await getSpendingAnalytics(
      period ?? undefined,
      scope ?? undefined,
      scopeId ?? undefined
    );
    return NextResponse.json(analytics);
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

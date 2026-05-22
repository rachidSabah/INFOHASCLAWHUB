import { getAlerts, markAlertRead } from '@/lib/cost-tracker-engine';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const isRead = searchParams.get('isRead');

    const filter: Record<string, unknown> = {};
    if (isRead !== null) filter.isRead = isRead === 'true';

    const alerts = await getAlerts(filter);
    return NextResponse.json(alerts);
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
    const { alertId } = body as { alertId: string };

    if (!alertId) {
      return NextResponse.json(
        { error: 'alertId is required' },
        { status: 400 }
      );
    }

    const alert = await markAlertRead(alertId);
    return NextResponse.json(alert);
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

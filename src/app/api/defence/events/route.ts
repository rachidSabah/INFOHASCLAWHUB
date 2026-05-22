import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const eventType = searchParams.get('eventType');
    const severity = searchParams.get('severity');
    const isResolved = searchParams.get('isResolved');

    const where: Record<string, unknown> = {};
    if (eventType) where.eventType = eventType;
    if (severity) where.severity = severity;
    if (isResolved !== null) where.isResolved = isResolved === 'true';

    const events = await db.aIDefenceEvent.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    return NextResponse.json(events);
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
    const { eventId, isFalsePositive } = body as {
      eventId: string;
      isFalsePositive?: boolean;
    };

    if (!eventId) {
      return NextResponse.json(
        { error: 'eventId is required' },
        { status: 400 }
      );
    }

    const event = await db.aIDefenceEvent.update({
      where: { id: eventId },
      data: { isResolved: true },
    });

    // If marked as false positive, update the related rules' false positive counts
    if (isFalsePositive && event.ruleId) {
      const ruleIds = event.ruleId.split(',');
      for (const ruleId of ruleIds) {
        if (!ruleId.startsWith('builtin_')) {
          try {
            await db.defenceRule.update({
              where: { id: ruleId.trim() },
              data: { falsePositives: { increment: 1 } },
            });
          } catch {
            // Rule may have been deleted
          }
        }
      }
    }

    return NextResponse.json({ resolved: true, event });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

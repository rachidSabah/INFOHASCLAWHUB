import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const actor = searchParams.get('actor');
    const action = searchParams.get('action');
    const risk = searchParams.get('risk');
    const limit = parseInt(searchParams.get('limit') || '50');

    const where: Record<string, unknown> = {};
    if (actor) where.actor = actor;
    if (action) where.action = action;
    if (risk) where.risk = risk;

    const logs = await db.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return NextResponse.json(logs);
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
    const { actor, action, resource, result, risk, details, ipAddress, sessionId } = body as {
      actor: string;
      action: string;
      resource: string;
      result: string;
      risk?: string;
      details?: string;
      ipAddress?: string;
      sessionId?: string;
    };

    if (!actor || !action || !resource || !result) {
      return NextResponse.json(
        { error: 'actor, action, resource, and result are required' },
        { status: 400 }
      );
    }

    const log = await db.auditLog.create({
      data: {
        actor,
        action,
        resource,
        result,
        risk: risk || 'low',
        details,
        ipAddress,
        sessionId,
      },
    });

    return NextResponse.json(log, { status: 201 });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

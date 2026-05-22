import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const hostId = searchParams.get('hostId');

    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (hostId) where.hostId = hostId;

    const sessions = await db.collabSession.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json(sessions);
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
    const { name, hostId, peers, sharedAgent } = body as {
      name?: string;
      hostId?: string;
      peers?: Array<{ id: string; name: string; cursor: unknown; color: string }>;
      sharedAgent?: string;
    };

    const sessionName = name || "New Session";
    const host = hostId || "host-" + Date.now();

    const session = await db.collabSession.create({
      data: {
        name: sessionName,
        hostId: host,
        peers: JSON.stringify(peers || [{ id: host, name: 'Host', cursor: null, color: '#3b82f6' }]),
        status: 'active',
        sharedAgent: sharedAgent || null,
      },
    });

    return NextResponse.json(session, { status: 201 });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

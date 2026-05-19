import { db } from "@/lib/db";
import { NextRequest, NextResponse } from 'next/server';




export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const eventType = searchParams.get('eventType');
    const model = searchParams.get('model');
    const limit = parseInt(searchParams.get('limit') || '100');
    const from = searchParams.get('from');
    const to = searchParams.get('to');

    const where: any = {};
    if (eventType) where.eventType = eventType;
    if (model) where.model = model;
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(from);
      if (to) where.createdAt.lte = new Date(to);
    }

    const events = await db.analyticsEvent.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return NextResponse.json(events);
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const event = await db.analyticsEvent.create({ data: body });
    return NextResponse.json(event);
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
  }
}

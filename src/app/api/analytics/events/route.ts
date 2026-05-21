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

    const where: Record<string, unknown> = {};
    if (eventType) where.eventType = eventType;
    if (model) where.model = model;
    if (from || to) {
      where.createdAt = {
        ...(from ? { gte: new Date(from) } : {}),
        ...(to ? { lte: new Date(to) } : {}),
      };
    }

    const events = await db.analyticsEvent.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
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
    const { eventType, model, agentId, tokensUsed, cost, duration, success, metadata } = body as {
      eventType: string;
      model?: string;
      agentId?: string;
      tokensUsed?: number;
      cost?: number;
      duration?: number;
      success?: boolean;
      metadata?: string;
    };

    if (!eventType) {
      return NextResponse.json(
        { error: 'eventType is required' },
        { status: 400 }
      );
    }

    const event = await db.analyticsEvent.create({
      data: {
        eventType,
        ...(model ? { model } : {}),
        ...(agentId ? { agentId } : {}),
        ...(tokensUsed !== undefined ? { tokensUsed } : {}),
        ...(cost !== undefined ? { cost } : {}),
        ...(duration !== undefined ? { duration } : {}),
        ...(success !== undefined ? { success } : {}),
        ...(metadata ? { metadata } : {}),
      },
    });
    return NextResponse.json(event, { status: 201 });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

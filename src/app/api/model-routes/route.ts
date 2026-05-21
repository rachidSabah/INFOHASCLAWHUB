import { db } from "@/lib/db";
import { NextRequest, NextResponse } from 'next/server';

export async function GET() {
  try {
    const routes = await db.modelRoute.findMany({
      orderBy: { priority: 'desc' },
    });
    return NextResponse.json(routes);
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
    const { name, taskType, modelId, priority, fallbackIds, costPerToken, avgLatency, successRate, isEnabled } = body as {
      name: string;
      taskType: string;
      modelId: string;
      priority?: number;
      fallbackIds?: string;
      costPerToken?: number;
      avgLatency?: number;
      successRate?: number;
      isEnabled?: boolean;
    };

    if (!name || !taskType || !modelId) {
      return NextResponse.json(
        { error: 'name, taskType, and modelId are required' },
        { status: 400 }
      );
    }

    const route = await db.modelRoute.create({
      data: {
        name,
        taskType,
        modelId,
        ...(priority !== undefined ? { priority } : {}),
        ...(fallbackIds ? { fallbackIds } : {}),
        ...(costPerToken !== undefined ? { costPerToken } : {}),
        ...(avgLatency !== undefined ? { avgLatency } : {}),
        ...(successRate !== undefined ? { successRate } : {}),
        ...(isEnabled !== undefined ? { isEnabled } : {}),
      },
    });
    return NextResponse.json(route, { status: 201 });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

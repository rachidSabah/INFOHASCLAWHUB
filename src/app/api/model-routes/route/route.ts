import { db } from "@/lib/db";
import { NextRequest, NextResponse } from 'next/server';




export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { taskType } = body;

    if (!taskType) {
      return NextResponse.json({ error: 'taskType is required' }, { status: 400 });
    }

    // Find the best matching route for this task type
    const routes = await db.modelRoute.findMany({
      where: { taskType, isEnabled: true },
      orderBy: { priority: 'desc' },
    });

    if (routes.length === 0) {
      // Return a default model recommendation
      return NextResponse.json({
        modelId: 'default',
        taskType,
        fallbackIds: [],
        confidence: 0,
        message: 'No configured route found for this task type',
      });
    }

    const bestRoute = routes[0];
    const fallbackIds = bestRoute.fallbackIds ? JSON.parse(bestRoute.fallbackIds) : [];

    return NextResponse.json({
      modelId: bestRoute.modelId,
      routeId: bestRoute.id,
      routeName: bestRoute.name,
      taskType: bestRoute.taskType,
      fallbackIds,
      priority: bestRoute.priority,
      costPerToken: bestRoute.costPerToken,
      avgLatency: bestRoute.avgLatency,
      successRate: bestRoute.successRate,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

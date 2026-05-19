import { db } from "@/lib/db";
import { NextRequest, NextResponse } from 'next/server';




export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { environmentId } = body;

    if (!environmentId) {
      return NextResponse.json({ error: 'environmentId is required' }, { status: 400 });
    }

    const environment = await db.deployEnvironment.findUnique({ where: { id: environmentId } });
    if (!environment) {
      return NextResponse.json({ error: 'Deploy environment not found' }, { status: 404 });
    }

    // Simulate rollback
    const updated = await db.deployEnvironment.update({
      where: { id: environmentId },
      data: {
        status: 'idle',
        deployCount: Math.max(0, environment.deployCount - 1),
      },
    });

    return NextResponse.json({
      success: true,
      environmentId,
      deployCount: updated.deployCount,
      status: updated.status,
      message: `Rolled back deployment for ${updated.name}`,
      timestamp: new Date().toISOString(),
    });
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
  }
}

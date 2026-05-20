import { db } from "@/lib/db";
import { NextRequest, NextResponse } from 'next/server';




export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { environmentId } = body;

    if (!environmentId) {
      return NextResponse.json({ error: 'environmentId is required' }, { status: 400 });
    }

    const environment = await (db as any).deployEnvironment.findUnique({ where: { id: environmentId } });
    if (!environment) {
      return NextResponse.json({ error: 'Deploy environment not found' }, { status: 404 });
    }

    if (environment.status === 'deploying') {
      return NextResponse.json({ error: 'Deployment already in progress' }, { status: 400 });
    }

    // Simulate deployment start
    const updated = await (db as any).deployEnvironment.update({
      where: { id: environmentId },
      data: {
        status: 'deploying',
        deployCount: environment.deployCount + 1,
      },
    });

    return NextResponse.json({
      success: true,
      environmentId,
      deployCount: updated.deployCount,
      status: updated.status,
      message: `Deployment #${updated.deployCount} started for ${updated.name}`,
      timestamp: new Date().toISOString(),
    });
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
  }
}

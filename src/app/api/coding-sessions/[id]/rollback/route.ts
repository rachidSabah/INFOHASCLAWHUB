import { db } from "@/lib/db";
import { NextRequest, NextResponse } from 'next/server';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const checkpointId = body.checkpointId;

    const session = await db.codingSession.findUnique({ where: { id } });
    if (!session) {
      return NextResponse.json({ error: 'Coding session not found' }, { status: 404 });
    }

    const checkpoints = session.checkpoints ? JSON.parse(session.checkpoints) : [];

    // If no checkpoints exist at all, return a helpful error
    if (checkpoints.length === 0) {
      return NextResponse.json(
        { error: 'No checkpoints available. Iterate on the session first before rolling back.' },
        { status: 400 }
      );
    }

    // If no checkpointId provided, rollback to the latest checkpoint
    if (!checkpointId) {
      const latestCheckpoint = checkpoints[checkpoints.length - 1];
      const updated = await db.codingSession.update({
        where: { id },
        data: {
          iterations: checkpoints.length,
          status: 'coding',
          checkpoints: JSON.stringify(checkpoints),
        },
      });
      return NextResponse.json({
        ...updated,
        message: `Rolled back to latest checkpoint: ${latestCheckpoint.id}`,
      });
    }

    const targetIndex = checkpoints.findIndex((cp: { id: string }) => cp.id === checkpointId);
    if (targetIndex === -1) {
      return NextResponse.json(
        { error: `Checkpoint '${checkpointId}' not found. Available checkpoints: ${checkpoints.map((cp: { id: string }) => cp.id).join(', ')}` },
        { status: 404 }
      );
    }

    const rollbackIterations = targetIndex + 1;
    const updated = await db.codingSession.update({
      where: { id },
      data: {
        iterations: rollbackIterations,
        status: 'coding',
        checkpoints: JSON.stringify(checkpoints.slice(0, targetIndex + 1)),
      },
    });

    return NextResponse.json(updated);
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Rollback failed';
    console.error('[Coding Session Rollback] Error:', errorMessage);
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}

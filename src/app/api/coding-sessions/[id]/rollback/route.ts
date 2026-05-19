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
    const targetIndex = checkpoints.findIndex((cp: any) => cp.id === checkpointId);
    if (targetIndex === -1) {
      return NextResponse.json({ error: 'Checkpoint not found' }, { status: 404 });
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
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

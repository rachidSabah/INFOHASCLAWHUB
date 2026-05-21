import { db } from "@/lib/db";
import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await db.codingSession.findUnique({ where: { id } });
    if (!session) {
      return NextResponse.json({ error: 'Coding session not found' }, { status: 404 });
    }
    return NextResponse.json(session);
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const updateData: Record<string, unknown> = {};
    if (body.title !== undefined) updateData.title = body.title;
    if (body.workspacePath !== undefined) updateData.workspacePath = body.workspacePath;
    if (body.task !== undefined) updateData.task = body.task;
    if (body.status !== undefined) updateData.status = body.status;
    if (body.approvalMode !== undefined) updateData.approvalMode = body.approvalMode;
    if (body.iterations !== undefined) updateData.iterations = body.iterations;
    if (body.maxIterations !== undefined) updateData.maxIterations = body.maxIterations;
    if (body.plan !== undefined) updateData.plan = body.plan;
    if (body.checkpoints !== undefined) updateData.checkpoints = body.checkpoints;
    if (body.diffLog !== undefined) updateData.diffLog = body.diffLog;
    if (body.testResults !== undefined) updateData.testResults = body.testResults;
    if (body.result !== undefined) updateData.result = body.result;

    const session = await db.codingSession.update({ where: { id }, data: updateData });
    return NextResponse.json(session);
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await db.codingSession.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
  }
}

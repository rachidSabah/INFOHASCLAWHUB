import { db } from "@/lib/db";
import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const route = await db.modelRoute.findUnique({ where: { id } });
    if (!route) {
      return NextResponse.json({ error: 'Model route not found' }, { status: 404 });
    }
    return NextResponse.json(route);
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
    if (body.name !== undefined) updateData.name = body.name;
    if (body.taskType !== undefined) updateData.taskType = body.taskType;
    if (body.modelId !== undefined) updateData.modelId = body.modelId;
    if (body.priority !== undefined) updateData.priority = body.priority;
    if (body.fallbackIds !== undefined) updateData.fallbackIds = body.fallbackIds;
    if (body.costPerToken !== undefined) updateData.costPerToken = body.costPerToken;
    if (body.avgLatency !== undefined) updateData.avgLatency = body.avgLatency;
    if (body.successRate !== undefined) updateData.successRate = body.successRate;
    if (body.isEnabled !== undefined) updateData.isEnabled = body.isEnabled;

    const route = await db.modelRoute.update({ where: { id }, data: updateData });
    return NextResponse.json(route);
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
    await db.modelRoute.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
  }
}

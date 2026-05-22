import { updateEntity, deleteEntity } from '@/lib/knowledge-graph-engine';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { name, entityType, description, properties, confidence } = body as {
      name?: string;
      entityType?: string;
      description?: string;
      properties?: Record<string, unknown>;
      confidence?: number;
    };

    const updates: Record<string, unknown> = {};
    if (name !== undefined) updates.name = name;
    if (entityType !== undefined) updates.entityType = entityType;
    if (description !== undefined) updates.description = description;
    if (properties !== undefined) updates.properties = properties;
    if (confidence !== undefined) updates.confidence = confidence;

    const entity = await updateEntity(id, updates);
    return NextResponse.json(entity);
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const result = await deleteEntity(id);
    return NextResponse.json(result);
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

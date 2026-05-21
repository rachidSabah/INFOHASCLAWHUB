import { listRelations, createRelation } from '@/lib/knowledge-graph-engine';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const relationType = searchParams.get('relationType');
    const sourceId = searchParams.get('sourceId');
    const targetId = searchParams.get('targetId');

    const filter: Record<string, unknown> = {};
    if (relationType) filter.relationType = relationType;
    if (sourceId) filter.sourceId = sourceId;
    if (targetId) filter.targetId = targetId;

    const relations = await listRelations(filter);
    return NextResponse.json(relations);
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
    const { sourceId, targetId, relationType, weight, bidirectional, properties } = body as {
      sourceId: string;
      targetId: string;
      relationType: string;
      weight?: number;
      bidirectional?: boolean;
      properties?: Record<string, unknown>;
    };

    if (!sourceId || !targetId || !relationType) {
      return NextResponse.json(
        { error: 'sourceId, targetId, and relationType are required' },
        { status: 400 }
      );
    }

    const relation = await createRelation(
      sourceId,
      targetId,
      relationType as 'depends_on' | 'related_to' | 'part_of' | 'owns' | 'uses' | 'produces' | 'blocks' | 'supports',
      weight,
      bidirectional,
      properties
    );
    return NextResponse.json(relation, { status: 201 });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

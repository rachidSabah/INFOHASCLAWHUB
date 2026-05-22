import { listEntities, createEntity } from '@/lib/knowledge-graph-engine';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const entityType = searchParams.get('entityType');
    const search = searchParams.get('search');

    const filter: Record<string, unknown> = {};
    if (entityType) filter.entityType = entityType;
    if (search) filter.search = search;

    const entities = await listEntities(filter);
    return NextResponse.json(entities);
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
    const { name, entityType, description, properties, sourceId, sourceType } = body as {
      name: string;
      entityType: string;
      description?: string;
      properties?: Record<string, unknown>;
      sourceId?: string;
      sourceType?: string;
    };

    if (!name || !entityType) {
      return NextResponse.json(
        { error: 'name and entityType are required' },
        { status: 400 }
      );
    }

    const entity = await createEntity(
      name,
      entityType as 'concept' | 'person' | 'project' | 'technology' | 'domain' | 'resource' | 'event',
      description,
      properties,
      sourceId,
      sourceType
    );
    return NextResponse.json(entity, { status: 201 });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
